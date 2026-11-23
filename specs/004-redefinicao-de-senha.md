# Spec 004 - Redefinicao de senha

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração com MongoDB em memória.

## Contexto
Um usuário que esqueceu a senha precisa recuperar o acesso sem intervenção do administrador. O fluxo não pode revelar se determinado e-mail está cadastrado, e precisa encerrar as sessões antigas para que uma redefinição não deixe tokens emitidos com a senha anterior ainda válidos.

## Objetivo
Solicitar e concluir a redefinição de senha com token de uso único, resposta genérica para e-mails desconhecidos e revogação de todas as sessões do usuário.

## Fora de escopo
- Envio real de e-mail. O token é devolvido na resposta da API e deve ser enviado por e-mail em produção.
- Link com token na URL do frontend.
- Limite de tentativas específico para o token de redefinição, além do limite global por IP.
- Perguntas de segurança.

## Requisitos funcionais
- RF1: `POST /api/v1/auth/forgot-password` recebe `{ email }` e sempre responde 200 com a mensagem genérica.
- RF2: Para e-mail inexistente ou conta inativa, a resposta não contém `resetToken`.
- RF3: Para conta existente e ativa, a resposta contém `resetToken`, usado pelo cliente para chamar a rota de redefinição.
- RF4: Ao solicitar um novo token, os tokens ainda não usados do mesmo usuário são removidos.
- RF5: Token de redefinição é opaco, gerado com 32 bytes aleatórios em base64url e gravado apenas como hash SHA-256.
- RF6: Token expira em 1 hora.
- RF7: `POST /api/v1/auth/reset-password` recebe `{ token, password }` e valida a nova senha com as mesmas regras do cadastro.
- RF8: Token inexistente retorna 400 `INVALID_RESET_TOKEN`. Token já usado retorna 400 `RESET_TOKEN_USED`. Token expirado retorna 400 `RESET_TOKEN_EXPIRED`.
- RF9: Usuário inexistente ou inativo associado ao token retorna 400 `INVALID_RESET_TOKEN`.
- RF10: Ao redefinir, o campo `usedAt` é preenchido e todas as sessões ativas do usuário são revogadas.
- RF11: Depois da redefinição, a senha antiga deixa de autenticar e os refresh tokens anteriores são recusados.

## Requisitos nao funcionais
- RNF1: Hash SHA-256 para o token de redefinição, o mesmo utilitário usado no refresh token.
- RNF2: Índice único em `tokenHash` e índice TTL em `expiresAt`.
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
4. Remove tokens não usados do usuário.
5. Gera token opaco, grava hash e expiração.
6. Responde mensagem genérica com `resetToken` para o cliente entregar ao usuário.

### Redefinição
1. Zod valida `token` e a força da nova senha.
2. Busca token pelo hash.
3. Verifica uso e expiração, com códigos distintos.
4. Busca usuário ativo associado.
5. Gera novo hash de senha e salva.
6. Marca `usedAt` no token.
7. Revoga todos os refresh tokens ativos do usuário.
8. Responde mensagem de sucesso.

## Regras de negocio
- Um usuário tem no máximo um token de redefinição não usado por vez.
- Token é de uso único.
- Redefinição encerra todas as sessões do usuário, não apenas a que originou o pedido.
- A resposta de solicitação não distingue e-mail existente de inexistente, além da presença do token para o cliente.

## Modelo de dados
- `PasswordResetToken` (coleção `tokens_redefinicao`): `user`, `tokenHash` único, `expiresAt` com TTL, `usedAt`.
- `User.passwordHash` é atualizado com `select: false` explícito na busca usada pela redefinição.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do novo hash de senha |
| `NODE_ENV` | development | Em produção, o token deve ser enviado por e-mail e não devolvido |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | VALIDATION_ERROR | E-mail inválido ou nova senha fraca |
| 400 | INVALID_RESET_TOKEN | Token inexistente ou usuário inativo |
| 400 | RESET_TOKEN_USED | Token já utilizado |
| 400 | RESET_TOKEN_EXPIRED | Token fora da validade de 1 hora |

## Testes esperados
### Unitarios
- Tokens gerados em sequência são diferentes.
- Hash do token é estável para a mesma entrada.

### Integracao
- E-mail desconhecido responde 200 sem `resetToken`.
- E-mail cadastrado responde 200 com `resetToken`.
- Redefinição com token válido retorna 200.
- Login com senha antiga falha e com a nova funciona.
- Refresh token anterior é recusado depois da redefinição.
- Token inválido, usado e com senha fraca retornam os códigos esperados.

### CI
- `npm ci` e `npm test` com MongoDB em memória.

## Criterios de aceite
- [x] Solicitação não revela se o e-mail existe.
- [x] Token expira em 1 hora e é de uso único.
- [x] Nova senha é validada pelas mesmas regras do cadastro.
- [x] Redefinição revoga todas as sessões do usuário.
- [x] Token inválido, usado e expirado têm códigos distintos.

## Limitacoes e riscos
- O token é devolvido no corpo da resposta. Isso é aceitável em desenvolvimento, mas em produção é preciso enviar por e-mail e remover o campo.
- Não há limite de requisições específico para `forgot-password`, apenas o limite global por IP.
- Access tokens emitidos antes da redefinição continuam válidos até expirar, pois não há `tokenVersion` no JWT.

## Decisoes
- Resposta genérica em `forgot-password`: evita enumeração de contas.
- Token opaco em vez de JWT: revogação simples pelo documento no banco.
- Revogar todas as sessões na redefinição: prioriza segurança sobre conveniência do usuário.
