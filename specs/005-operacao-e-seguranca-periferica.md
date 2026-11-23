# Spec 005 - Operacao e seguranca periferica

Status: implementada em 2026-11-23. Critérios de aceite validados por testes de integração, pelo workflow de CI e por verificação manual da configuração e do Docker Compose.

## Contexto
Além das regras de autenticação, a API precisa de uma base operacional previsível: configuração validada na subida, health check para orquestradores, limites de requisição, CORS configurável, respostas de erro uniformes e um jeito simples de rodar local e em container.

## Objetivo
Definir a camada de operação e segurança periférica compartilhada por todas as rotas, incluindo configuração, health, rate limit, CORS, tratamento de erros, Docker e CI.

## Fora de escopo
- Métricas e tracing distribuído.
- Persistência do rate limit entre instâncias.
- Deploy automático em nuvem. O repositório tem `Dockerfile` e `docker-compose.yml`, mas nenhum provedor configurado.
- Configuração do proxy reverso e certificados TLS. A API apenas consome os cabeçalhos do proxy quando `TRUST_PROXY` é definido.

## Requisitos funcionais
- RF1: `GET /health` responde 200 com `status: ok` e `database: up` quando o MongoDB está conectado.
- RF2: Com o banco fora, `/health` responde 503 com `status: degraded` e `database: down`.
- RF3: Em ambiente diferente de teste, todas as rotas de `/api/v1/auth` passam por rate limit de 20 requisições por 15 minutos por IP. Em teste o limitador é desligado.
- RF4: Com `TRUST_PROXY` configurado, o rate limit usa o IP de `X-Forwarded-For` em vez do IP do proxy. `TRUST_PROXY=true` é recusado na subida.
- RF5: Ao exceder o limite, a resposta é 429 `RATE_LIMITED` com `timestamp`, sem cabeçalhos legados.
- RF6: CORS usa `*` por padrão. `CORS_ORIGIN` aceita uma lista separada por vírgula.
- RF7: JSON inválido retorna 400 `INVALID_JSON`. Corpo acima de 10 kb retorna 413 `PAYLOAD_TOO_LARGE`. Rota inexistente retorna 404 `ROUTE_NOT_FOUND`. Erro não previsto retorna 500 `INTERNAL_ERROR`.
- RF8: Em desenvolvimento, erros 500 incluem `debug` com a mensagem original. Em produção, esse campo é omitido.
- RF9: `NODE_ENV=production` exige `MONGODB_URI` e `JWT_ACCESS_SECRET` com pelo menos 32 caracteres. A API não sobe sem eles.
- RF10: Variáveis numéricas inválidas ou não positivas abortam a subida com mensagem clara.
- RF11: `.env` é carregado sem sobrescrever variáveis já definidas no ambiente.
- RF12: Com `MONGODB_URI` vazio fora de produção, a API usa MongoDB em memória.
- RF13: O Docker Compose define a API em 3001 e o MongoDB apenas na rede interna.

## Requisitos nao funcionais
- RNF1: `helmet` aplica cabeçalhos de segurança e `x-powered-by` é desligado.
- RNF2: Corpo JSON limitado a 10 kb, com 413 `PAYLOAD_TOO_LARGE` acima do limite.
- RNF3: Todas as respostas de erro seguem `{ code, message, timestamp }`, com `details` quando aplicável.
- RNF4: O rate limit usa `express-rate-limit` com cabeçalhos `standardHeaders: draft-8` e `req.ip` calculado conforme `TRUST_PROXY`.
- RNF5: CI roda `npm ci` e `npm test` em Node 22, com checkout e setup-node em v7.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| GET | /health | Estado da API e do banco | publico | 200 |

## Fluxo
### Subida
1. `config.js` carrega `.env` sem sobrescrever o ambiente.
2. Valida segredo JWT, portas, TTLs e limites numéricos.
3. Em produção, exige `MONGODB_URI` e segredo forte.
4. `createApp` monta helmet, CORS, JSON, health, rate limit, rotas, 404 e tratador de erros.
5. `db.js` conecta ao MongoDB real ou sobe instância em memória em dev/test.

### Requisição
1. Helmet e CORS respondem primeiro.
2. JSON é limitado a 10 kb; acima disso, o tratador responde 413.
3. Rotas de auth passam pelo limitador, exceto em teste, usando o IP resolvido por `TRUST_PROXY`.
4. Validadores Zod rodam antes dos controladores.
5. Erros `AppError`, de JSON, de corpo grande, de validação Mongoose e de índice duplicado são traduzidos para respostas uniformes.

## Regras de negocio
- Configuração inválida impede a subida, em vez de usar defaults inseguros em produção.
- Health check reflete o estado real da conexão com o banco.
- Rate limit é por IP e compartilhado entre todas as rotas de autenticação.
- Erros internos não expõem detalhes em produção.

## Modelo de dados
- Nenhuma collection nova nesta spec. A configuração é imutável por congelamento profundo, incluindo os objetos aninhados.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `NODE_ENV` | development | `production` exige segredo e URI; `test` desliga rate limit |
| `PORT` | 3000 | Porta HTTP |
| `MONGODB_URI` | vazio | URI do MongoDB; vazio usa memória em dev/test |
| `TRUST_PROXY` | 0 | Desligado; use saltos confiáveis ou lista de IPs/redes atrás de proxy |
| `JWT_ACCESS_SECRET` | segredo de dev | HS256, obrigatório em produção com 32+ caracteres |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Validade do refresh token |
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do bcrypt |
| `CORS_ORIGIN` | * | Origens permitidas |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Janela do limitador |
| `RATE_LIMIT_MAX` | 20 | Máximo de requisições por janela |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | INVALID_JSON | Corpo não é JSON válido |
| 400 | VALIDATION_ERROR | Corpo falha na validação Zod |
| 404 | ROUTE_NOT_FOUND | Rota inexistente |
| 413 | PAYLOAD_TOO_LARGE | Corpo acima de 10 kb |
| 429 | RATE_LIMITED | Limite por IP excedido |
| 500 | INTERNAL_ERROR | Erro não previsto |

O health check com o banco fora responde 503 com `status: degraded` e `database: down`, fora do formato de erro das rotas de auth.

## Testes implementados
### Integracao
- Health responde 200 com banco conectado.
- Health responde 503 com banco desconectado.
- Rota inexistente responde 404 `ROUTE_NOT_FOUND`.
- JSON malformado responde 400 `INVALID_JSON`.
- Corpo acima de 10 kb responde 413 `PAYLOAD_TOO_LARGE`.
- Rate limit ativo fora de teste usa `X-Forwarded-For` quando `TRUST_PROXY` está configurado e mantém um balde por cliente.
- CORS reflete a origem configurada em `CORS_ORIGIN`.

### Verificacao manual
- Produção com segredo curto falha na subida.
- `TRUST_PROXY=true` falha na subida.
- `docker compose config` valida o arquivo com as variáveis obrigatórias.

### Unitarios (planejados)
- `numberFromEnv` recusa zero, negativo e texto.
- O congelamento profundo impede mutação de `config.accessToken` e `config.rateLimit`.

### CI
- `npm ci` e `npm test` em Node 22 no GitHub Actions, com checkout e setup-node em v7.

## Criterios de aceite
- [x] Health check distingue banco up e down.
- [x] Rate limit ativo fora de teste, com 429 estruturado.
- [x] Rate limit usa `X-Forwarded-For` quando `TRUST_PROXY` está configurado.
- [x] CORS configurável por variável de ambiente.
- [x] Erros têm formato uniforme, incluindo 413, e não vazam detalhes em produção.
- [x] Configuração inválida impede a subida.
- [x] Docker Compose definido e validado por `docker compose config`.

## Limitacoes e riscos
- Rate limit em memória, por instância. Múltiplas réplicas não compartilham contador.
- `CORS_ORIGIN` com `*` não deve ser usado em produção com credenciais.
- Não há deploy automático configurado no GitHub Actions.
- Se `TRUST_PROXY` não for configurado atrás de um proxy, todos os clientes compartilham o IP do proxy no rate limit e no registro das sessões.
- O corpo de erro 503 do health não segue o formato `{ code, message, timestamp }` usado pelas rotas de auth.
- A validação de `numberFromEnv` e do congelamento profundo ainda não tem teste unitário automatizado.

## Decisoes
- Validar configuração na subida: falha rápida é melhor que rodar com segredo fraco.
- Exigir `TRUST_PROXY` explícito em vez de assumir proxy: evita confiar em `X-Forwarded-For` fornecido pelo cliente.
- Recusar `TRUST_PROXY=true`: o valor permissivo permite burlar o rate limit por IP.
- Limitar rate limit a `/api/v1/auth`: health e rotas públicas leves não precisam do mesmo limite.
- Desligar o limitador em testes: evita flakiness sem exigir Redis.
- Responder 413 em vez de 500 para corpo grande: mantém a semântica HTTP e o formato uniforme de erro.
- Congelar a configuração profundamente: evita mutação acidental de limites e segredos em tempo de execução.
