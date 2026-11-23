# Spec 002 - Refresh token rotativo e familias de sessao

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração com MongoDB em memória.

## Contexto
Access tokens de curta duração exigem renovação. Se o refresh token for reutilizável, um vazamento permite manter acesso indefinidamente. Sem agrupar os tokens em famílias, não há como encerrar todas as sessões derivadas de um mesmo login quando há suspeita de reuso.

## Objetivo
Renovar o par de tokens com rotação atômica e detectar reuso, revogando a família inteira de sessões.

## Fora de escopo
- Blacklist de access tokens já emitidos.
- Rate limit específico para o endpoint de refresh, além do limite global por IP.
- Sincronização de famílias entre réplicas além do que o MongoDB já garante com update condicional.
- Dispositivos confiáveis e "lembrar-me".

## Requisitos funcionais
- RF1: `POST /api/v1/auth/refresh` recebe `{ refreshToken }` e devolve um novo par com status 200.
- RF2: Refresh token é opaco, gerado com 48 bytes aleatórios em base64url, e armazenado apenas como hash SHA-256.
- RF3: Cada rotação revoga o token usado, preenche `replacedByHash` com o hash do novo token e mantém o mesmo `familyId`.
- RF4: Reutilizar um token revogado retorna 401 `REFRESH_TOKEN_REUSED` e revoga todos os tokens ativos da família.
- RF5: Tentativa concorrente de rotação é resolvida por `updateOne` condicional. Se outro processo já revogou o token, a família é encerrada e a requisição retorna 401 `REFRESH_TOKEN_REUSED`.
- RF6: Refresh expirado retorna 401 `REFRESH_TOKEN_EXPIRED`. Token inexistente retorna 401 `INVALID_REFRESH_TOKEN`.
- RF7: Se o usuário não existe ou está inativo, a família é revogada e a resposta é 401 `INVALID_REFRESH_TOKEN`.
- RF8: `POST /api/v1/auth/logout` recebe `{ refreshToken }`, revoga a família correspondente e retorna 204.
- RF9: Logout com token desconhecido também retorna 204, para não revelar quais tokens existem.
- RF10: Um access token não é aceito como refresh, porque o refresh é opaco e não é assinado como JWT.

## Requisitos nao funcionais
- RNF1: Hash SHA-256 determinístico para cada token, usado tanto na gravação quanto na busca.
- RNF2: Índice TTL em `expiresAt` remove tokens expirados automaticamente.
- RNF3: Índice único em `tokenHash` e índice em `familyId` para busca e revogação em lote.
- RNF4: Metadados de IP e user-agent são gravados a cada token emitido.
- RNF5: A rotação usa uma única atualização condicional no documento antigo, evitando janela de corrida entre leitura e escrita.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| POST | /api/v1/auth/refresh | Rotaciona o par de tokens | refresh no corpo | 200 |
| POST | /api/v1/auth/logout | Revoga a família de sessões | refresh no corpo | 204 |

## Fluxo
### Refresh
1. Zod valida `body.refreshToken` não vazio.
2. Calcula hash SHA-256 e busca o documento.
3. Se não existe, 401 `INVALID_REFRESH_TOKEN`.
4. Se `revokedAt` está preenchido, revoga a família e retorna 401 `REFRESH_TOKEN_REUSED`.
5. Se expirou, retorna 401 `REFRESH_TOKEN_EXPIRED`.
6. Busca o usuário. Se ausente ou inativo, revoga a família e retorna 401.
7. Cria novo par com o mesmo `familyId`.
8. Atualiza o token antigo com `revokedAt` e `replacedByHash` somente se ainda estiver ativo.
9. Se a atualização não afetou um documento, revoga a família e retorna 401 `REFRESH_TOKEN_REUSED`.

### Logout
1. Zod valida `body.refreshToken`.
2. Busca o hash. Se existe, preenche `revokedAt` em todos os tokens ativos da família.
3. Responde 204 independentemente da existência do token.

## Regras de negocio
- Refresh é rotativo: cada uso devolve par novo e invalida o anterior.
- Tokens da mesma família compartilham ciclo de vida. Um reuso encerra todos.
- Reuso é tratado como incidente, não como erro comum.
- Logout é idempotente e não revela existência de token.

## Modelo de dados
- `RefreshToken` (coleção `tokens_renovacao`): `user`, `tokenHash` único, `familyId` indexado, `expiresAt` com TTL, `revokedAt`, `replacedByHash`, `createdByIp`, `userAgent`.
- Nenhum token é gravado em texto puro.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Validade do refresh token |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade do access token emitido junto |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | VALIDATION_ERROR | `refreshToken` ausente ou vazio |
| 401 | INVALID_REFRESH_TOKEN | Token inexistente, usuário inativo ou inexistente |
| 401 | REFRESH_TOKEN_EXPIRED | Token fora da validade |
| 401 | REFRESH_TOKEN_REUSED | Token revogado ou rotação concorrente perdida |

## Testes esperados
### Unitarios
- `hashToken` gera sempre o mesmo SHA-256 para a mesma entrada.
- Tokens gerados em sequência são diferentes.

### Integracao
- Refresh devolve token novo diferente do anterior.
- Reuso do token antigo retorna 401 `REFRESH_TOKEN_REUSED`.
- Depois do reuso, o token novo da família também é recusado.
- Logout retorna 204 e invalida o token da família.
- Logout com token desconhecido retorna 204.

### CI
- `npm ci` e `npm test`, sem dependência de MongoDB externo.

## Criterios de aceite
- [x] Rotação devolve novo par e mantém a família.
- [x] Hash SHA-256 substitui o token em texto puro.
- [x] Reuso encerra a família inteira.
- [x] Rotação concorrente é tratada com atualização condicional.
- [x] Logout revoga a família e é idempotente.
- [x] TTL do MongoDB remove tokens expirados.

## Limitacoes e riscos
- Access tokens já emitidos continuam válidos até expirar, mesmo após logout ou reuso.
- A revogação por família depende da disponibilidade do MongoDB no momento da rotação.
- O detecta reuso não distingue ataque legítimo de cliente com relógio ou retry duplicado.

## Decisoes
- Refresh opaco em vez de JWT: permite revogação sem esperar expiração e reduz superfície de claims expostas.
- Família de sessões em vez de token isolado: permite encerrar todas as sessões derivadas com uma única atualização.
- `updateOne` condicional em vez de transação: resolve a corrida sem exigir replica set.
