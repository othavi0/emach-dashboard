# ADR 0019 — Split de god-module em `data.ts` (server-only) + `_lib` + `actions.ts` enxuto

**Data:** 2026-06-18
**Status:** Aceito — estende o ADR-0018 (fronteira `data.ts` server-only × `actions.ts` endpoint).
**Relaciona:** ADR-0018 (reads enforçam capability / fronteira data×actions), ADR-0016 (capability matrix).

## Contexto

`tools/actions.ts` (1075 linhas) e `promotions/actions.ts` (1020 linhas) eram os maiores arquivos do `apps/web` (mediana do repo ~114). Cada um misturava, num único arquivo `"use server"`, quatro responsabilidades: mutation wrappers, read fetchers, query builders e helpers puros. Isso prejudicava navegabilidade e tornava impraticável testar os helpers puros isoladamente.

A primeira tentativa (plano 028 original) movia reads/tipos para `data.ts` mas deixava **re-export shims** em `actions.ts` (`export { fetchToolsPage } from "./data"`) para não tocar nos consumers. Isso **quebrou o build**: num arquivo `"use server"`, todo export em runtime deve ser uma async function — re-exportar tipo/const/função dispara `Only async functions are allowed to be exported in a "use server" file`. **`check-types`, lint e `test` não pegam — só `bun run build`.**

## Decisão

God-modules de `actions.ts` quebram no padrão de **3 camadas** (canônico: `stock/movements-data.ts` + `stock/actions.ts` + `stock/_lib/movements-shared.ts`):

| Camada | Diretiva | Conteúdo | Restrição de export |
| --- | --- | --- | --- |
| `actions.ts` | `"use server"` | mutations + thin wrappers de read (com guard) | **só async functions** |
| `data.ts` | `import "server-only"` | reads + tipos públicos + query builders | livre (tipos/const ok) |
| `_lib/*-query-helpers.ts` | nenhuma | helpers puros (sem `requireCapability`/`requireCurrentSession`) | livre |

Regras:

1. **`data.ts` usa `import "server-only"`, NUNCA `"use server"`.** `server-only` não tem a restrição "só async exports" (então tipos e builders convivem) e ainda barra import acidental no Client Component (que arrastaria o driver `pg` pro bundle). É o que torna o padrão imune ao incidente do shim.
2. **Sem re-export shim.** Os consumers passam a importar de `./data` (tipos/reads server-side) ou do wrapper Action (reads chamados de Client Components). Atualizar os consumers é parte do trabalho — não deixar `export ... from "./data"` em `actions.ts`.
3. **Read chamado de Client Component** que precisa de capability-gate ganha um thin wrapper `"use server"` em `actions.ts` que faz `requireCapability(...)` e delega ao `data.ts` (padrão `fetchLedgerPageAction`). Read consumido só por Server Component (já guardado por `requireCapabilityOrRedirect` no topo da rota) importa direto de `./data`.
4. **`_lib` é "puro" no sentido de auth:** zero `requireCapability`/`requireCurrentSession`. Pode importar `db`/schema/`drizzle`/`logger` (helpers tx-scoped como `assert*` recebem `Tx`). "Puro" aqui = sem-auth, não sem-DB.
5. **Ciclo de tipos:** quando o `_lib` precisa de um tipo público que vive em `data.ts` (ex: `PromotionStatus`/`PromotionSort`), extrair esses `type` para um arquivo neutro `_lib/*-types.ts` que ambos importam — evita ciclo `data.ts` ↔ `_lib`.

`bun run build` é **gate obrigatório** após refatorar qualquer arquivo `"use server"`.

## Considered options

- **A (escolhida)** — `data.ts` server-only + atualizar consumers (sem shim). Imune à regra do `"use server"`, alinhado ao ADR-0018, custo = tocar os consumers (mecânico).
- **B (rejeitada)** — `data.ts` com `"use server"` + re-export shim. É a tentativa que quebrou o build; `export type`/re-export num `"use server"` é proibido em runtime.
- **C** — manter god-module e só extrair helpers para `_lib`. Reduz pouco; reads e tipos (o grosso) continuam inflando o `actions.ts`.

## Consequências

- `tools/actions.ts` 1075→680, `promotions/actions.ts` 1020→414. **Não atingiram <400**: as mutations `"use server"` (várias grandes — `updateTool`/`createTool` são transações multi-entidade) + os wrappers ficam por design. O objetivo (separar reads/helpers, testabilidade) foi atingido; um 2º split por subdomínio (ex: `variant-actions.ts`) é follow-up opcional.
- Helpers puros agora testáveis isoladamente: `attributeValueRow` (8 casos) e `computeStatus` (4 casos) ganharam characterization tests. Como helpers sync **não podem ser exportados de um `"use server"` para teste** (mesma regra), a sequência é mover-pro-`_lib`-então-testar.
- Novos reads/helpers em `tools`/`promotions` seguem o padrão: read → `data.ts`; helper puro → `_lib`; mutation/endpoint → `actions.ts`. `orders/data.ts` (1017 linhas) fica como candidato a split por subdomínio à parte.
- Equivalência de auth preservada: o guard de `fetchToolsPage` saiu da função para o wrapper (path client) + `page.tsx` já tinha `requireCapabilityOrRedirect("tools.read")` (path server); `requireCurrentSession` interno mantém o branch-scope fail-closed.

## Nota de processo (execução subagent-driven)

Esta refatoração foi executada via subagent-driven development (1 implementer + review por módulo). Padrão observado e a vigiar em execuções futuras: **vários implementers reportaram conclusão ("came to rest") com o trabalho ainda no meio** (def duplicada não removida, teste não criado, sem commit) — em tarefas de move com múltiplos passos. Mitigação adotada: **o controlador verifica o filesystem (check-types/build/`git status`/grep de invariantes) antes de aceitar o report**, e despacha um finalizador quando incompleto. Não confiar só no texto do report. Ver `feedback_subagent_playbook` (memória global).
