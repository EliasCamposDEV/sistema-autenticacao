# Sistema de Autenticação

Sistema de autenticação com **Node.js 22**, **Express 5**, **MongoDB** e **JWT**, com refresh tokens rotativos, detecção de reutilização, hash de senhas, rate limiting e validação de entrada.

Projeto do portfólio baseado no item **“Sistema de Autenticação | JavaScript, Node.js, MongoDB”** do currículo.

## Funcionalidades

- Cadastro com senha protegida por **bcrypt**
- Login com **JWT de acesso** de curta duração (15 min por padrão)
- **Refresh token opaco** (não é JWT), armazenado apenas como hash SHA-256
- **Rotação de refresh token** a cada renovação
- **Detecção de reutilização**: se um token rotacionado for reapresentado, toda a família de sessões é revogada
- Logout que encerra a família de tokens
- Rota protegida `GET /me`
- Validação de payload com **Zod** e mensagens em português
- Rate limiting nas rotas de autenticação
- Headers de segurança com **Helmet** e CORS configurável
- Tratamento centralizado de erros, sem vazar detalhes internos
- MongoDB em memória em desenvolvimento/teste (sem instalar banco)
- Testes de integração com `node:test`, Supertest e MongoDB Memory Server
- Docker e Docker Compose

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 (ESM) |
| Framework | Express 5 |
| Banco | MongoDB 8 + Mongoose 9 |
| Autenticação | jsonwebtoken, bcryptjs, refresh token opaco |
| Validação | Zod 4 |
| Segurança | Helmet, CORS, express-rate-limit |
| Testes | node:test, Supertest, mongodb-memory-server |
| Infra | Docker, Docker Compose |

## Estrutura

```text
sistema-autenticacao/
├── src/
│   ├── config.js                 # Configuracao e validacao de ambiente
│   ├── db.js                     # Conexao Mongo (real ou em memoria)
│   ├── errors.js                 # AppError
│   ├── app.js                    # Express app (sem listen)
│   ├── server.js                 # Bootstrap + graceful shutdown
│   ├── controllers/auth.controller.js
│   ├── middleware/
│   │   ├── auth.js               # Verificacao do access token
│   │   ├── validate.js           # Validacao Zod
│   │   ├── error-handler.js
│   │   └── not-found.js
│   ├── models/
│   │   ├── user.js
│   │   └── refresh-token.js
│   ├── routes/auth.routes.js
│   ├── services/
│   │   ├── auth.service.js       # Regras de cadastro/login/refresh/logout
│   │   └── token.service.js      # Assinatura/verificacao JWT e hash
│   └── validation/auth.schema.js
└── test/auth.test.js
```

## Como rodar

### Pré-requisitos

- Node.js 22+
- npm 10+

```bash
npm install
npm run dev
```

> No Windows, se o PowerShell bloquear `npm.ps1`, use `npm.cmd install` e `npm.cmd run dev`.

Com `MONGODB_URI` vazio e `NODE_ENV` diferente de `production`, o projeto inicia um **MongoDB em memória** automaticamente. A API fica em `http://localhost:3000`.

### Com MongoDB real

```bash
# Linux/macOS
MONGODB_URI="mongodb://localhost:27018/autenticacao" \
JWT_ACCESS_SECRET="um-segredo-aleatorio-com-pelo-menos-32-caracteres" \
npm start
```

```powershell
# PowerShell
$env:MONGODB_URI="mongodb://localhost:27018/autenticacao"
$env:JWT_ACCESS_SECRET="um-segredo-aleatorio-com-pelo-menos-32-caracteres"
npm start
```

Copie `.env.example` para `.env` para configurar portas, TTLs e limites.

### Docker Compose

O compose roda em modo `production` e exige segredo JWT e origem CORS explícitos:

```bash
cp .env.example .env
# edite .env: defina JWT_ACCESS_SECRET (32+ caracteres) e CORS_ORIGIN
docker compose up --build
```

No PowerShell, use `Copy-Item .env.example .env` no lugar de `cp`.

A API do Compose fica em `http://127.0.0.1:3001` e o MongoDB apenas na rede interna, sem publicar porta no host. Assim o Compose pode rodar junto com a API local (`3000`) e com o MongoDB local (`27018`) sem conflito.

Para inspecionar o banco do container: `docker compose exec mongo mongosh autenticacao`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | `development` | `production` exige `MONGODB_URI` e segredo forte |
| `PORT` | `3000` | Porta HTTP |
| `MONGODB_URI` | vazio | URI do MongoDB; vazio = banco em memória em dev/test |
| `JWT_ACCESS_SECRET` | segredo de dev | Obrigatório em produção, mínimo 32 caracteres |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Validade do refresh token |
| `BCRYPT_ROUNDS` | `12` (`4` em teste) | Custo do bcrypt |
| `CORS_ORIGIN` | `*` | Origens permitidas, separadas por vírgula. O compose exige valor explícito |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Janela do rate limit |
| `RATE_LIMIT_MAX` | `20` | Máximo de requisições por janela |

## Endpoints

Base: `/api/v1/auth`

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/register` | Não | Cria conta e retorna tokens |
| `POST` | `/login` | Não | Autentica e retorna tokens |
| `POST` | `/refresh` | Refresh token | Rotaciona o par de tokens |
| `POST` | `/logout` | Refresh token | Revoga a família de sessões |
| `GET` | `/me` | Bearer token | Retorna o usuário autenticado |

Health check: `GET /health` retorna `200` com o banco conectado e `503` quando o MongoDB está fora.

### Cadastro

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maria Silva",
    "email": "maria@email.com",
    "password": "SenhaSegura123"
  }'
```

`201 Created`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "3f9c...opaco...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "665f...",
    "name": "Maria Silva",
    "email": "maria@email.com",
    "role": "user",
    "active": true,
    "lastLoginAt": null,
    "createdAt": "2026-11-07T18:00:00.000Z",
    "updatedAt": "2026-11-07T18:00:00.000Z"
  }
}
```

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maria@email.com","password":"SenhaSegura123"}'
```

### Rota protegida

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

### Renovar tokens

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"SEU_REFRESH_TOKEN"}'
```

O refresh token antigo é invalidado. Reutilizá-lo retorna `401 REFRESH_TOKEN_REUSED` e revoga toda a família.

### Logout

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"SEU_REFRESH_TOKEN"}'
```

### Erros

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Dados invalidos",
  "details": [
    { "field": "password", "message": "A senha deve conter uma letra maiuscula" }
  ],
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

Códigos: `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `RATE_LIMITED`, `ROUTE_NOT_FOUND`, `INTERNAL_ERROR`.

## Testes

```bash
npm test
```

10 testes de integração cobrem cadastro, e-mail duplicado, validação, login, rota protegida, rotação/reutilização de refresh token, logout, 404, JSON inválido e health check com o banco fora.

## Decisões de segurança

- **Senhas nunca são retornadas**: `passwordHash` tem `select: false` e é removido do `toJSON`.
- **Bcrypt com custo configurável**: 12 rounds em produção.
- **Access token curto**: reduz o impacto de um token vazado.
- **Refresh token opaco**: não carrega dados legíveis e só existe em texto puro no cliente; no servidor fica o hash SHA-256.
- **Rotação + família de tokens**: permite detectar roubo/reuso de refresh token e encerrar todas as sessões relacionadas.
- **Índice TTL**: tokens expirados são removidos automaticamente pelo MongoDB.
- **Rate limiting**: mitiga força bruta nas rotas de autenticação.
- **Mensagem genérica no login**: não revela se o e-mail existe; o bcrypt é executado mesmo para e-mails inexistentes para reduzir diferenças de tempo.

## Próximos passos sugeridos

- Enviar refresh token em cookie `httpOnly`/`Secure` para clientes web
- Recuperação de senha por e-mail com token de uso único
- Verificação de e-mail
- Papéis e autorização por rota (`admin`)
- CI com GitHub Actions e cobertura de testes
