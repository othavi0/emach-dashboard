# Architecture Decision Records

Decisões de arquitetura do dashboard. Cada ADR registra **uma** decisão não-óbvia, seu contexto e consequências. ADRs são registro histórico: não se reescreve uma decisão antiga — quando ela muda, cria-se um novo ADR e marca-se o antigo como `Superseded por ADR-XXXX`.

> Convenção: `Status` é `Aceito` ou `Superseded por ADR-XXXX`. Decisões que estendem (não substituem) outra trazem `estende o ADR-XXXX` no Status.

## Índice

| #    | Decisão                                                              | Data       | Status                          |
| ---- | ------------------------------------------------------------------- | ---------- | ------------------------------- |
| [0001](0001-orders-criados-pelo-ecommerce.md)            | Orders são criados apenas pelo site e-commerce       | 2026-05-17 | Aceito                          |
| [0002](0002-descontos-de-promotion-nao-empilham.md)      | Descontos de Promotion nunca empilham                | 2026-05-17 | Aceito                          |
| [0003](0003-lead-nao-e-conceito-do-dominio.md)           | Lead não é um conceito do domínio                    | 2026-05-17 | Aceito                          |
| [0004](0004-integracao-ecommerce-e-so-db-compartilhada.md) | Integração com o e-commerce é só DB compartilhada  | 2026-05-17 | Aceito                          |
| [0005](0005-order-tem-eixo-unico-de-status.md)           | Order tem um eixo único de status                    | 2026-05-17 | Aceito                          |
| [0006](0006-db-workflow-push-only.md)                    | DB workflow é push-only até produção                 | 2026-05-17 | Aceito                          |
| [0007](0007-estoque-debita-no-pagamento.md)              | Débito de estoque ocorre na transição para `paid`    | 2026-05-18 | Aceito                          |
| [0008](0008-documentos-asaas-via-db.md)                  | Documentos do Asaas chegam pelo banco de dados       | 2026-05-18 | Aceito                          |
| [0009](0009-sync-schema-via-ci.md)                       | Schema do ecommerce sincroniza via CI (PR automático) | 2026-05-18 | Aceito                          |
| [0010](0010-signup-publico-com-aprovacao-manual.md)      | Signup público de staff com aprovação manual         | 2026-05-26 | ⚠️ Superseded por [0013](0013-auth-convite-only.md) |
| [0011](0011-audit-log-de-user-sobrevive-ao-delete.md)    | Audit log de user sobrevive ao delete                | 2026-05-26 | Aceito                          |
| [0012](0012-disable-role-based-gates.md)                 | Desligar bloqueios role-based mantendo roles         | 2026-05-27 | ⚠️ Superseded por [0016](0016-religacao-gates-3-niveis-filial.md) |
| [0013](0013-auth-convite-only.md)                        | Auth de staff é convite-only                         | 2026-06-05 | Aceito — substitui 0010         |
| [0014](0014-rls-deny-all-postgrest.md)                   | RLS deny-all nas tabelas public via PostgREST        | 2026-06-11 | Aceito                          |
| [0015](0015-fornecedor-na-entrada-de-estoque.md)         | Proveniência de Fornecedor vive na entrada de estoque | 2026-06-14 | Aceito                          |
| [0016](0016-religacao-gates-3-niveis-filial.md)          | Religar gates com 3 níveis e escopo de filial        | 2026-06-15 | Aceito — substitui 0012         |
| [0017](0017-permissoes-por-usuario.md)                   | Permissões por usuário (overrides de capability)     | 2026-06-15 | Aceito — estende 0016           |
| [0018](0018-read-actions-enforçam-capability.md)         | Read server actions enforçam capability              | 2026-06-17 | Aceito — estende 0016           |
| [0019](0019-split-god-module-data-lib.md)                | Split de god-module em `data.ts` + `_lib` + `actions.ts` | 2026-06-18 | Aceito — estende 0018       |
| [0020](0020-cookie-cache-sessao-dashboard.md)           | `cookieCache` na sessão do dashboard (staleness aceita) | 2026-06-18 | ⚠️ Superseded por [0021](0021-remocao-cookie-cache-sessao-dashboard.md) |
| [0021](0021-remocao-cookie-cache-sessao-dashboard.md)   | Remoção do `cookieCache` da sessão do dashboard      | 2026-06-18 | Aceito — substitui 0020         |
| [0022](0022-nao-adotar-cache-components-ppr.md)         | Não adotar Cache Components (PPR) no dashboard        | 2026-06-19 | Aceito                          |
| [0023](0023-statetimes-router-cache-navegacao.md)       | `staleTimes` no Router Cache para reaproveitar navegação | 2026-06-29 | Aceito                          |

## Cadeias de decisão

Alguns ADRs formam linha evolutiva — ler na ordem dá o estado atual:

- **Auth de staff:** [0010](0010-signup-publico-com-aprovacao-manual.md) (signup público, superseded) → **[0013](0013-auth-convite-only.md)** (convite-only, vigente).
- **Autorização / gates:** [0012](0012-disable-role-based-gates.md) (gates desligados, superseded) → **[0016](0016-religacao-gates-3-niveis-filial.md)** (religados, 3 níveis + filial) → [0017](0017-permissoes-por-usuario.md) (overrides por usuário) → [0018](0018-read-actions-enforçam-capability.md) (reads também enforçam) → [0019](0019-split-god-module-data-lib.md) (fronteira `data.ts` × `actions.ts`).
- **Integração com o e-commerce:** [0004](0004-integracao-ecommerce-e-so-db-compartilhada.md) (só DB, sem API) fundamenta [0008](0008-documentos-asaas-via-db.md) (Asaas via DB) e [0009](0009-sync-schema-via-ci.md) (sync de schema via CI).
- **Schema workflow:** [0006](0006-db-workflow-push-only.md) (push-only) sustenta o modo de aplicar mudanças em [0005](0005-order-tem-eixo-unico-de-status.md), [0009](0009-sync-schema-via-ci.md), [0014](0014-rls-deny-all-postgrest.md), [0015](0015-fornecedor-na-entrada-de-estoque.md).
- **Sessão / `cookieCache`:** [0020](0020-cookie-cache-sessao-dashboard.md) (cookieCache habilitado, superseded) → **[0021](0021-remocao-cookie-cache-sessao-dashboard.md)** (removido — a medição de prod do #223 mostrou que não entregava no caminho SSR).
- **Navegação / first-paint:** #222 (freeze + barra de progresso, remove `loading.tsx`) → 006-B tentou PPR (`cacheComponents`) para a casca estática → **[0022](0022-nao-adotar-cache-components-ppr.md)** (PPR é incompatível com o freeze; revertido, mantém o #222) → **[0023](0023-statetimes-router-cache-navegacao.md)** (`staleTimes` reaproveita a navegação no Router Cache — ataca o custo de revisita que o #223 não pegou).

## Como adicionar um ADR

1. Próximo número sequencial, nome `00XX-slug-kebab.md`.
2. Cabeçalho: `# ADR 00XX — Título`, depois `**Data:**`, `**Status:**` e, quando aplicável, `**Substitui:**` / `**Relaciona:**`.
3. Seções em PT: `## Contexto`, `## Decisão`, `## Opções consideradas`, `## Consequências`.
4. Se substitui outro ADR, atualize o `Status` do antigo para `Superseded por ADR-00XX` e adicione a linha aqui no índice.
