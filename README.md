# Sistema de Autenticação

[![CI](https://github.com/EliasCamposDEV/sistema-autenticacao/actions/workflows/ci.yml/badge.svg)](https://github.com/EliasCamposDEV/sistema-autenticacao/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/EliasCamposDEV/sistema-autenticacao)](LICENSE)

Autenticação com JWT de curta duração e refresh token opaco rotativo, com detecção de reúso e revogação por família. Node.js 22, Express 5, MongoDB, Mongoose.

## Rodar

```bash
npm.cmd install
npm.cmd run dev
```

Com `MONGODB_URI` vazio e `NODE_ENV` diferente de `production`, sobe um MongoDB em memória. A API fica em http://localhost:3000.

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

API em http://127.0.0.1:3001; o MongoDB fica só na rede interna. Para inspecionar: `docker compose exec mongo mongosh autenticacao`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ENV` | development | `production` exige `MONGODB_URI` e segredo forte |
| `PORT` | 3000 | Porta HTTP |
| `MONGODB_URI` | vazio | URI do MongoDB; vazio = banco em memória em dev/test |
| `TRUST_PROXY` | 0 | Desligado por padrão; use `1` atrás de um proxy, ou uma lista de IPs/redes |
| `JWT_ACCESS_SECRET` | segredo de dev | Obrigatório em produção, mínimo 32 caracteres |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | 7 | Validade do refresh token |
| `BCRYPT_ROUNDS` | 12 (4 em teste) | Custo do bcrypt |
| `CORS_ORIGIN` | * | Origens permitidas, separadas por vírgula |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Janela do rate limit |
| `RATE_LIMIT_MAX` | 20 | Máximo de requisições por janela |
| `EMAIL_FROM` | vazio | Remetente do e-mail de redefinição |
| `SMTP_HOST` | vazio | Host SMTP; vazio desativa o envio real |
| `SMTP_PORT` | 587 | Porta SMTP |
| `SMTP_SECURE` | false | `true` usa TLS direto na porta |
| `SMTP_USER` | vazio | Usuário SMTP |
| `SMTP_PASS` | vazio | Senha SMTP |
| `PASSWORD_RESET_URL` | vazio | URL base opcional para o link de redefinição |

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

Códigos de erro: `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REUSED`, `ACCOUNT_DISABLED`, `EMAIL_ALREADY_EXISTS`, `INVALID_RESET_TOKEN`, `RESET_TOKEN_USED`, `RESET_TOKEN_EXPIRED`, `RATE_LIMITED`, `ROUTE_NOT_FOUND` e `INTERNAL_ERROR`.

## Testes

```bash
npm.cmd test
```

26 testes de integração e de unidade cobrem cadastro, e-mail duplicado, validação, login, conta inativa, rota protegida, access token expirado ou do tipo errado, rotação, expiração e reutilização de refresh, rotação concorrente, logout, 404, JSON inválido, corpo acima de 10 KB, rate limit atrás de proxy, CORS, health check com o banco fora, redefinição de senha, revogação das sessões antigas, consumo único do token sob concorrência, ausência de `resetToken` em produção e template de e-mail com link opcional.

## Notas

- O refresh token é opaco, não é JWT, e fica armazenado apenas como hash SHA-256.
- Rotação com família de tokens permite detectar reúso e encerrar todas as sessões relacionadas.
- Um índice TTL remove tokens expirados automaticamente.
- `TRUST_PROXY` deve ser configurado quando a API estiver atrás de um proxy. Com o valor errado, o rate limit e o IP registrado nas sessões podem usar o endereço do proxy. `TRUST_PROXY=true` é recusado na subida porque permite burlar o rate limit por IP; informe o número de saltos ou a lista de proxies.
- `CORS_ORIGIN` deve incluir a URL do frontend em produção.
- Sem SMTP configurado, o token aparece no log em desenvolvimento; em produção, o e-mail não é enviado e o token fica só no banco.

## Documentação

- [specs/](specs/): specs numeradas (001 registro e login, 002 refresh token e famílias, 003 proteção de rotas, 004 redefinição de senha, 005 operação e segurança periférica).
