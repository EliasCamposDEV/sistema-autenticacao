# Sistema de Autenticação

[![CI](https://github.com/EliasCamposDEV/sistema-autenticacao/actions/workflows/ci.yml/badge.svg)](https://github.com/EliasCamposDEV/sistema-autenticacao/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/EliasCamposDEV/sistema-autenticacao)](LICENSE)

Autenticação com JWT de curta duração e refresh token opaco rotativo, com detecção de reuso e revogação por família. Node.js 22, Express 5, MongoDB, Mongoose.

## Rodar

```bash
npm.cmd install
npm.cmd run dev
```

Com `MONGODB_URI` vazio e `NODE_ENV` diferente de `production`, sobe um MongoDB em memória. API em http://localhost:3000.

Com MongoDB real:

```powershell
$env:MONGODB_URI="mongodb://localhost:27018/autenticacao"
$env:JWT_ACCESS_SECRET="um-segredo-aleatorio-com-pelo-menos-32-caracteres"
npm.cmd start
```

Copie `.env.example` para `.env` para ajustar portas, TTLs e limites. Em produção, `MONGODB_URI` e `JWT_ACCESS_SECRET` (32+ caracteres) são obrigatórios.

## Docker

```bash
docker compose up --build
```

API em http://127.0.0.1:3001, MongoDB apenas na rede interna. Para inspecionar: `docker compose exec mongo mongosh autenticacao`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | development | `production` exige `MONGODB_URI` e segredo forte |
| `PORT` | 3000 | Porta HTTP |
| `MONGODB_URI` | vazio | URI do MongoDB; vazio = banco em memória em dev/test |
| `JWT_ACCESS_SECRET` | segredo de dev | Obrigatório em produção, mínimo 32 caracteres |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Validade do refresh token |
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do bcrypt |
| `CORS_ORIGIN` | * | Origens permitidas, separadas por vírgula |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Janela do rate limit |
| `RATE_LIMIT_MAX` | 20 | Máximo de requisições por janela |

## Endpoints

Base: `/api/v1/auth`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/register` | não | Cria conta e retorna tokens |
| POST | `/login` | não | Autentica e retorna tokens |
| POST | `/refresh` | refresh token | Rotaciona o par de tokens |
| POST | `/logout` | refresh token | Revoga a família de sessões |
| POST | `/forgot-password` | não | Solicita token de redefinição de senha |
| POST | `/reset-password` | não | Redefine a senha com o token |
| GET | `/me` | bearer | Retorna o usuário autenticado |

Health check: `GET /health` retorna `200` com o banco conectado e `503` quando o MongoDB está fora.

Exemplo:

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria Silva","email":"maria@email.com","password":"SenhaSegura123"}'
```

Códigos de erro: `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `RATE_LIMITED`, `ROUTE_NOT_FOUND`, `INTERNAL_ERROR`.

## Testes

```bash
npm.cmd test
```

10 testes de integração cobrem cadastro, e-mail duplicado, validação, login, rota protegida, rotação e reutilização de refresh token, logout, 404, JSON inválido e health check com o banco fora.

## Notas

- Refresh token é opaco (não é JWT) e armazenado apenas como hash SHA-256.
- Rotação + família de tokens permite detectar reuso de refresh token e encerrar todas as sessões relacionadas.
- Índice TTL remove tokens expirados automaticamente.
- `CORS_ORIGIN` deve incluir a URL do frontend em produção.