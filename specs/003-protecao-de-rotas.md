# Spec 003 - Protecao de rotas com access token

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração com MongoDB em memória.

## Contexto
Depois de autenticar, o cliente precisa de um mecanismo para provar identidade nas rotas protegidas. Sem verificação do token e do usuário no banco, um token assinado para uma conta desativada continuaria válido até expirar.

## Objetivo
Proteger `GET /api/v1/auth/me` com bearer token, validando assinatura, tipo, expiração e situação ativa do usuário.

## Fora de escopo
- RBAC com papéis e rotas exclusivas de admin. O campo `role` já existe no usuário e no token, mas ainda não há rota que exija `admin`.
- Refresh de access token via cookie HttpOnly.
- Revogação imediata de access tokens emitidos.

## Requisitos funcionais
- RF1: `GET /api/v1/auth/me` exige cabeçalho `Authorization: Bearer <token>`.
- RF2: Cabeçalho ausente, esquema diferente de `Bearer` ou token vazio retorna 401 `UNAUTHORIZED`.
- RF3: Token expirado retorna 401 `TOKEN_EXPIRED`. Assinatura inválida, issuer ou audience incorretos retornam 401 `INVALID_TOKEN`.
- RF4: Token com claim `type` diferente de `access` retorna 401 `INVALID_TOKEN`. Isso impede que um refresh JWT fosse usado como access, embora o refresh desta API seja opaco.
- RF5: Usuário inexistente ou inativo retorna 401 `INVALID_TOKEN`, mesmo com token assinado corretamente.
- RF6: Sucesso retorna 200 com `{ user }`, usando a mesma serialização que remove `passwordHash` e troca `_id` por `id`.
- RF7: Rotas inexistentes retornam 404 `ROUTE_NOT_FOUND`.

## Requisitos nao funcionais
- RNF1: JWT HS256 com issuer `sistema-autenticacao` e audience `sistema-autenticacao-api`, verificados em toda requisição.
- RNF2: Algoritmo fixo na verificação, sem aceitar `none` ou outros algoritmos.
- RNF3: Subject do token é o `_id` do usuário, não o e-mail, para não quebrar consultas quando o e-mail mudar.
- RNF4: `helmet` e `express.json` com limite de 10 kb aplicados a todas as rotas.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| GET | /api/v1/auth/me | Retorna o usuario autenticado | Bearer access | 200 |

## Fluxo
1. Lê o cabeçalho `authorization` e separa esquema e token.
2. Se o esquema não é `Bearer` ou não há token, 401 `UNAUTHORIZED`.
3. Verifica assinatura, algoritmo, issuer, audience e expiração.
4. Se expirou, 401 `TOKEN_EXPIRED`. Qualquer outra falha, 401 `INVALID_TOKEN`.
5. Confere `payload.type === 'access'`.
6. Busca o usuário por `payload.sub`. Se ausente ou inativo, 401 `INVALID_TOKEN`.
7. Anexa o usuário a `req.user` e segue para o controlador.

## Regras de negocio
- Somente tokens do tipo access autorizam rotas protegidas.
- A existência do usuário é checada a cada requisição, não apenas na emissão.
- Usuário inativo perde acesso imediatamente para novas requisições.
- Erros de autenticação não revelam qual etapa falhou além do código já documentado.

## Modelo de dados
- `User`: consulta por `_id`, com `active` verificado em memória.
- Access JWT: claims `sub`, `role`, `type=access`, `iss`, `aud`, `iat` e `exp`.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `JWT_ACCESS_SECRET` | segredo de dev | Verificação da assinatura |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade aceita do token |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 401 | UNAUTHORIZED | Token ausente ou esquema inválido |
| 401 | TOKEN_EXPIRED | Token expirado |
| 401 | INVALID_TOKEN | Assinatura, tipo ou usuário inválidos |
| 404 | ROUTE_NOT_FOUND | Rota inexistente |

## Testes implementados
### Integracao
- `/me` sem token retorna 401 `UNAUTHORIZED`.
- `/me` com token válido retorna os dados do usuário.
- `/me` com token inválido retorna 401 `INVALID_TOKEN`.
- `/me` com token expirado retorna 401 `TOKEN_EXPIRED`.
- `/me` com token de tipo diferente de access retorna 401 `INVALID_TOKEN`.
- `/me` com token de usuário inativo retorna 401 `INVALID_TOKEN`.
- Rota inexistente retorna 404 `ROUTE_NOT_FOUND`.

### Unitarios (planejados)
- `verifyAccessToken` recusa algoritmo, issuer e audience divergentes.

### CI
- `npm ci` e `npm test` com `NODE_ENV=test`.

## Criterios de aceite
- [x] Rota protegida exige bearer token.
- [x] Token expirado e inválido têm códigos distintos.
- [x] Token de tipo diferente de access é recusado.
- [x] Usuário inativo é recusado mesmo com token válido.
- [x] Resposta não expõe hash da senha.

## Limitacoes e riscos
- A checagem de `active` a cada requisição custa uma consulta ao banco por chamada.
- Não há checagem de `tokenVersion`, então mudança de senha não revoga access tokens já emitidos.
- O campo `role` viaja no token, mas ainda não é usado em decisões de autorização.

## Decisoes
- Verificar o usuário no banco a cada requisição: desativação passa a valer na hora, ao custo de uma consulta por chamada.
- `sub` com `_id` em vez de e-mail: evita acoplamento com dado que pode mudar.
- `requireAuth` como middleware isolado: permite reutilizar em futuras rotas protegidas.
