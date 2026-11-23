# Template de spec

## Status
Rascunho, em revisao ou aprovada. Inclua a data da ultima revisao.

## Contexto
Descreva o problema ou a necessidade que motiva a feature.

## Objetivo
Uma frase: o que esta feature entrega.

## Fora de escopo
- O que nao sera feito nesta entrega, para evitar expectativa errada.

## Requisitos funcionais
- RF1: ...
- RF2: ...

## Requisitos nao funcionais
- RNF1: seguranca, performance, observabilidade, etc.

## Endpoints
| Metodo | Rota | Descricao | Auth | Sucesso |
|--------|------|-----------|------|---------|
| POST   | /auth/... | ... | publico | 204 |

## Fluxo
1. Passo a passo do caminho feliz.
2. Inclua a ordem de filtros, validacao, rate limit e persistencia quando importar.

## Regras de negocio
- Regra 1: ...
- Regra 2: ...

## Modelo de dados
- Entidade/campos novos ou alterados.
- Indices, migracao e compatibilidade.

## Configuracao
| Propriedade | Padrao | Uso |
|-------------|--------|-----|
| `app....` | ... | ... |

## Erros esperados
| Status | Codigo | Quando |
|--------|--------|--------|
| 400 | ... | ... |

## Testes esperados
### Unitarios
- Cenario 1: ...

### Integracao
- Cenario 2: ...

### CI
- Comando e ambiente esperados.

## Criterios de aceite
- [ ] ...
- [ ] ...

## Limitacoes e riscos
- O que fica em aberto e por que.

## Decisoes
- Decisao tomada e justificativa curta.
