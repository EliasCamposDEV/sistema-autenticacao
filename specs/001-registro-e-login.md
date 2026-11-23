# Spec 001 - Registro e login

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração com MongoDB em memória.

## Contexto
A API precisa criar contas e autenticar usuários para liberar o restante dos endpoints. Sem isso, todas as rotas ficariam expostas ou dependeriam de credenciais compartilhadas. O cadastro também precisa devolver uma sessão pronta para uso, sem exigir um segundo pedido de login.

## Objetivo
Registrar usuários e autenticar credenciais, devolvendo um par de tokens (access JWT e refresh opaco) já no cadastro e no login.

## Fora de escopo
- OAuth2, OIDC, SSO e MFA.
- Verificação de e-mail.
- Perfis, papéis administrativos e endpoints de gestão de usuários.
- Envio de e-mail de boas-vindas.

## Requisitos funcionais
- RF1: `POST /api/v1/auth/register` recebe `{ name, email, password }`, cria a conta e devolve uma sessão com status 201.
- RF2: `POST /api/v1/auth/login` recebe `{ email, password }` e devolve uma sessão com status 200.
- RF3: E-mail é normalizado com `trim` e `lowercase` antes da busca e da gravação. Cadastro com o mesmo e-mail normalizado retorna 409 `EMAIL_ALREADY_EXISTS`.
- RF4: O nome aceita de 2 a 120 caracteres após `trim`. O e-mail aceita até 160 caracteres e precisa ser válido. A senha aceita de 8 a 72 caracteres e exige minúscula, maiúscula e número.
- RF5: O hash da senha nunca aparece na resposta. A serialização do usuário transforma `_id` em `id` e remove `passwordHash`.
- RF6: Login com e-mail desconhecido ou senha errada retorna 401 `INVALID_CREDENTIALS`. O tempo de resposta é equiparado ao usar um hash fictício quando o e-mail não existe.
- RF7: Conta com `active: false` não autentica e retorna 403 `ACCOUNT_DISABLED`.
- RF8: Cada login bem-sucedido atualiza `lastLoginAt`.
- RF9: Cadastro e login registram IP e user-agent na sessão criada, para auditoria do refresh token.

## Requisitos nao funcionais
- RNF1: Senha armazenada com bcrypt, 12 rounds em produção e 4 em testes.
- RNF2: Corpo JSON limitado a 10 kb.
- RNF3: Validação de entrada com Zod antes de qualquer acesso ao banco.
- RNF4: Respostas de erro seguem o formato `{ code, message, timestamp }`, com `details` quando houver campos inválidos.
- RNF5: Concorrência de cadastro com o mesmo e-mail é tratada pelo índice único do MongoDB além da checagem prévia.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| POST | /api/v1/auth/register | Cria conta e emite sessão | publico | 201 |
| POST | /api/v1/auth/login | Autentica e emite sessão | publico | 200 |

## Fluxo
### Registro
1. Zod valida `body`.
2. Normaliza e-mail e verifica se já existe conta.
3. Gera hash bcrypt da senha.
4. Cria o usuário. Se o índice único acusar duplicata, traduz para 409.
5. Cria sessão com access token, refresh token e família nova.

### Login
1. Zod valida `body` com regras mais fracas para senha, já que a força foi validada no cadastro.
2. Busca usuário com `passwordHash` explícito, usando hash fictício se não existir.
3. Compara senha com bcrypt.
4. Verifica `active` e atualiza `lastLoginAt`.
5. Cria sessão com família nova.

## Regras de negocio
- E-mail é a identidade da conta, sempre normalizado.
- Cadastro e login sempre criam uma família de sessão nova.
- Nenhuma resposta devolve `passwordHash`.
- Usuário inativo não entra.

## Modelo de dados
- `User` (coleção `usuarios`): `name`, `email` único, `passwordHash` com `select: false`, `role` (`user` ou `admin`, padrão `user`), `active` (padrão `true`), `lastLoginAt`, `createdAt`, `updatedAt`.
- `RefreshToken` (coleção `tokens_renovacao`): um documento por refresh emitido, com `familyId`, `tokenHash`, `expiresAt`, `revokedAt`, `replacedByHash`, `createdByIp` e `userAgent`.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `JWT_ACCESS_SECRET` | segredo de dev | Segredo HS256, obrigatório em produção com 32+ caracteres |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Validade do refresh token |
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do bcrypt |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | VALIDATION_ERROR | Corpo inválido |
| 400 | INVALID_JSON | JSON malformado |
| 401 | INVALID_CREDENTIALS | E-mail ou senha incorretos |
| 403 | ACCOUNT_DISABLED | Conta desativada |
| 409 | EMAIL_ALREADY_EXISTS | E-mail já cadastrado |
| 429 | RATE_LIMITED | Limite de requisições excedido |

## Testes implementados
### Integracao
- Cadastro retorna 201, tokens e usuário sem hash.
- Hash gravado começa com `$2` e difere da senha original.
- E-mail duplicado com caixa diferente retorna 409.
- Corpo inválido retorna 400 com `details` para nome, e-mail e senha.
- Login válido retorna 200 e login inválido retorna 401 para senha errada e e-mail desconhecido.
- Conta inativa retorna 403 `ACCOUNT_DISABLED` no login.

### Unitarios (planejados)
- Normalização de e-mail com maiúsculas e espaços. O comportamento é coberto de forma integrada pelo teste de cadastro com e-mail em caixa alta.

### CI
- `npm ci` seguido de `npm test` com `NODE_ENV=test`, segredo de teste e MongoDB em memória.

## Criterios de aceite
- [x] Cadastro cria conta e devolve par de tokens.
- [x] Login autentica e devolve par de tokens.
- [x] Hash da senha nunca vaza na resposta.
- [x] E-mail duplicado é recusado com 409.
- [x] Campos inválidos são recusados com 400 e detalhes.
- [x] Usuário inativo não autentica.

## Limitacoes e riscos
- `forgot-password` só devolve o token na resposta com `NODE_ENV=test`. Em produção o envio por e-mail ainda precisa ser integrado.
- Não há verificação de e-mail nem bloqueio por tentativas de login por credencial. O limite existente é global por IP.

## Decisoes
- O cadastro já devolve sessão para evitar uma segunda chamada e reduzir atrito no cliente.
- Hash fictício no login iguala o tempo de resposta entre e-mail existente e inexistente.
- `passwordHash` com `select: false` evita que o campo seja incluído em consultas comuns por engano.
