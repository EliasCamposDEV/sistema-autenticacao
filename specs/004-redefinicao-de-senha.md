# Spec 004 - Redefinicao de senha

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração com MongoDB em memória.

## Contexto
Um usuário que esqueceu a senha precisa recuperar o acesso sem intervenção do administrador. O fluxo não pode revelar se determinado e-mail está cadastrado, e precisa encerrar as sessões antigas para que uma redefinição não deixe tokens emitidos com a senha anterior ainda válidos.

## Objetivo
Solicitar e concluir a redefinição de senha com token de uso único, resposta genérica para e-mails desconhecidos e revogação de todas as sessões do usuário.

## Fora de escopo
- Envio real de e-mail. O token é gerado e gravado em todos os ambientes, mas só aparece na resposta com `NODE_ENV=test`. Em produção, a entrega precisa ser integrada a um provedor de e-mail.
- Link com token na URL do frontend.
- Limite de tentativas específico para o token de redefinição, além do limite global por IP.
- Perguntas de segurança.

## Requisitos funcionais
- RF1: `POST /api/v1/auth/forgot-password` recebe `{ email }` e, para e-mail válido, responde 200 com a mensagem genérica.
- RF2: A resposta nunca contém `resetToken` fora de `NODE_ENV=test`, independentemente de o e-mail existir.
- RF3: Com `NODE_ENV=test` e conta existente e ativa, a resposta contém `resetToken`, usado pelos testes para chamar a rota de redefinição.
- RF4: Ao solicitar um novo token, o token ativo anterior do mesmo usuário é substituído atomicamente, mantendo no máximo um token não usado por usuário.
- RF5: Token de redefinição é opaco, gerado com 32 bytes aleatórios em base64url e gravado apenas como hash SHA-256.
- RF6: Token expira em 1 hora.
- RF7: `POST /api/v1/auth/reset-password` recebe `{ token, password }` e valida a nova senha com as mesmas regras do cadastro.
- RF8: Token inexistente retorna 400 `INVALID_RESET_TOKEN`. Token já usado retorna 400 `RESET_TOKEN_USED`. Token expirado retorna 400 `RESET_TOKEN_EXPIRED`.
- RF9: Usuário inexistente ou inativo associado ao token retorna 400 `INVALID_RESET_TOKEN`.
- RF10: O token é consumido com update atômico antes da troca de senha: só uma requisição concorrente consegue marcar `usedAt`.
- RF11: Ao redefinir, todas as sessões ativas do usuário são revogadas.
- RF12: Depois da redefinição, a senha antiga deixa de autenticar e os refresh tokens anteriores são recusados.

## Requisitos nao funcionais
- RNF1: Hash SHA-256 para o token de redefinição, o mesmo utilitário usado no refresh token.
- RNF2: Índice único em `tokenHash`, índice TTL em `expiresAt` e índice único parcial em `{ user: 1 }` com `usedAt: null`.
- RNF3: Senha gravada com bcrypt, usando a mesma configuração de rounds do cadastro.
- RNF4: Mensagem idêntica para e-mail existente e inexistente, evitando enumeração de contas pela resposta.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| POST | /api/v1/auth/forgot-password | Solicita token de redefinição | publico | 200 |
| POST | /api/v1/auth/reset-password | Redefine a senha com o token | publico | 200 |

## Fluxo
### Solicitação
1. Zod valida e normaliza o e-mail.
2. Busca usuário ativo.
3. Se não existe, responde mensagem genérica sem gravar nada.
4. Gera token opaco e faz upsert do token ativo do usuário, substituindo hash e expiração.
5. Se o upsert colidir com outra requisição, repete o update no token criado pela concorrente.
6. Responde mensagem genérica. Com `NODE_ENV=test`, inclui `resetToken`; nos demais ambientes, não inclui.

### Redefinição
1. Zod valida `token` e a força da nova senha.
2. Busca token pelo hash para diferenciar inexistente, usado e expirado.
3. Consome o token com `findOneAndUpdate` filtrando por `tokenHash`, `usedAt: null` e `expiresAt` futuro.
4. Se outra requisição consumiu primeiro, retorna `RESET_TOKEN_USED`.
5. Busca usuário ativo associado.
6. Gera novo hash de senha e salva.
7. Revoga todos os refresh tokens ativos do usuário.
8. Responde mensagem de sucesso.

## Regras de negocio
- Um usuário tem no máximo um token de redefinição não usado por vez.
- Token é de uso único.
- Redefinição encerra todas as sessões do usuário, não apenas a que originou o pedido.
- A resposta de solicitação não distingue e-mail existente de inexistente em nenhum ambiente.
- O token só é exposto na resposta em teste; em produção, a entrega depende de integração de e-mail.

## Modelo de dados
- `PasswordResetToken` (coleção `tokens_redefinicao`): `user`, `tokenHash` único, `expiresAt` com TTL, `usedAt`.
- Índice único parcial em `{ user: 1 }` com `usedAt: null` impede dois tokens ativos para o mesmo usuário.
- `User.passwordHash` é atualizado com `select: false` explícito na busca usada pela redefinição.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do novo hash de senha |
| `NODE_ENV` | development | Só em `test` o `resetToken` aparece na resposta; nos demais ambientes ele fica apenas no banco |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | VALIDATION_ERROR | E-mail inválido ou nova senha fraca |
| 400 | INVALID_RESET_TOKEN | Token inexistente ou usuário inativo |
| 400 | RESET_TOKEN_USED | Token já utilizado |
| 400 | RESET_TOKEN_EXPIRED | Token fora da validade de 1 hora |

## Testes implementados
### Integracao
- E-mail desconhecido responde 200 sem `resetToken`.
- E-mail cadastrado responde 200 com `resetToken` em teste.
- Redefinição com token válido retorna 200.
- Login com senha antiga falha e com a nova funciona.
- Refresh token anterior é recusado depois da redefinição.
- Token inválido, usado, expirado e senha fraca retornam os códigos esperados.
- Com `NODE_ENV=production`, a resposta de e-mail cadastrado e desconhecido é idêntica e sem `resetToken`.
- Duas redefinições concorrentes com o mesmo token produzem um sucesso e um `RESET_TOKEN_USED`.
- Dois pedidos concorrentes de token mantêm apenas um token ativo e invalidam o token substituído.

### Unitarios (planejados)
- Tokens gerados em sequência são diferentes.
- Hash do token é estável para a mesma entrada.

### CI
- `npm ci` e `npm test` com MongoDB em memória, acionados pelo workflow publicado.

## Criterios de aceite
- [x] Solicitação não revela se o e-mail existe.
- [x] `resetToken` só aparece na resposta com `NODE_ENV=test`.
- [x] Token expira em 1 hora e é de uso único, inclusive sob concorrência.
- [x] No máximo um token ativo por usuário, garantido por índice único parcial.
- [x] Nova senha é validada pelas mesmas regras do cadastro.
- [x] Redefinição revoga todas as sessões do usuário.
- [x] Token inválido, usado e expirado têm códigos distintos.

## Limitacoes e riscos
- O envio de e-mail não está implementado. Em produção o token é gerado e gravado, mas não chega ao usuário sem integrar um provedor.
- Não há limite de requisições específico para `forgot-password`, apenas o limite global por IP.
- Access tokens emitidos antes da redefinição continuam válidos até expirar, pois não há `tokenVersion` no JWT.
- Se um banco existente tiver mais de um token ativo para o mesmo usuário, o índice único parcial falha na criação e exige limpeza prévia.

## Decisoes
- Resposta genérica em `forgot-password`: evita enumeração de contas.
- Token opaco em vez de JWT: revogação simples pelo documento no banco.
- Upsert do token ativo em vez de `deleteMany` seguido de `create`: evita duplicidade sob concorrência.
- Consumo atômico antes da troca de senha: garante uso único mesmo com requisições simultâneas.
- Revogar todas as sessões na redefinição: prioriza segurança sobre conveniência do usuário.
