# Design — Generalizar tabs client-side para as 8 páginas de detalhe restantes

**Data:** 2026-06-29
**Status:** Aprovado (pendente review do spec)
**Issue:** #261 (épico)
**Relaciona:** ADR-0024 (piloto `tools/[id]` — PR #259), ADR-0023 (`staleTimes`), ADR-0022 (freeze de navegação #222), ADR-0016 (gate status/role). Entity detail pattern (`DESIGN.md` §4, `apps/web/CLAUDE.md`).

## Problema

O PR #259 (ADR-0024) pilotou **tabs client-side** no detalhe da ferramenta: trocar de tab é 100% cliente (`history.replaceState`, sem tocar o servidor), header reativo via Context, tabs eager + lazy. As outras **8 páginas de detalhe** seguem o `EntityTabs` compartilhado (server-nav), onde cada troca de tab dispara uma navegação por `?tab=` (via `router.replace`) que re-renderiza o Server Component da página: re-auth + re-fetch do `detail` + query da tab.

O objetivo é **generalizar o padrão do piloto** num shell compartilhado e migrar as 8 páginas, página a página, eliminando o round-trip por troca de tab.

### Evidência empírica (medição no browser, dev :3007, super_admin)

| Ação | Página | Requests ao servidor |
| --- | --- | --- |
| Trocar entre 3 tabs **eager** (visão-geral→variantes→estoque) | `tools/[id]` (piloto) | **0** (só assets; URL via `history.replaceState`) |
| Abrir tab **lazy** (atividade) | `tools/[id]` | **1 server action POST** (2× no log = StrictMode dev) |
| Trocar 1 tab (overview→pedidos) | `branches/[id]` (server-nav) | **1 RSC GET** (`?tab=orders&_rsc=…`) — re-auth + re-fetch do `detail` |

Confirmado também in loco: ação de header reativa (some/aparece por tab via `useActiveTab`), deep-link `?tab=`, e a pendência do ADR (atalho in-content `Ver aba →` ainda usa `<Link>` server-nav).

## Decisão

Promover o shell do piloto a uma **fundação compartilhada** e migrar as 8 páginas para client-side, da mais simples à mais complexa. **Sem alternativa B** (cache server-side) para nenhuma página — um padrão canônico único supera a economia marginal de poupar o refactor de uma página de baixo tráfego, e permite **remover** o `EntityTabs` server-nav ao fim.

## Arquitetura — Fundação compartilhada

Três peças novas em `apps/web/src/components/entity/`, extraídas do piloto:

### 1. `EntityClientTabs` (shell client)

Promoção generalizada do `tool-detail-tabs.tsx`. API:

```ts
export interface EntityClientTab {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
  lazy?: boolean;
}

interface Props {
  tabs: EntityClientTab[];
  defaultValue: string;
  initialTab: string;          // clampado no server (set de tabs varia por página)
  header: ReactNode;           // renderizado DENTRO do provider → useActiveTab alcança a ação
  paramName?: string;          // default "tab"
  clearParams?: string[];      // params a remover ao trocar de tab (piloto: ["variant"])
}

export function useActiveTab(): string; // Context exportado
```

Responsabilidades (idênticas ao piloto): estado `active` (init de `initialTab`); `window.history.replaceState` no `onValueChange` (**nunca** `router.replace` — dispararia RSC); listener `popstate` sincroniza a tab no voltar/avançar; set `activated` monta tabs lazy só após a 1ª ativação e mantém montadas (`keepMounted`); `TabActiveContext` provê a tab ativa ao header. Generaliza sobre o piloto: `paramName` e `clearParams` configuráveis.

### 2. `useLazyTab(load)` + `<LazyTab>`

Encapsula o ciclo load/error/retry/skeleton das ~20 tabs lazy, com **status discriminado** (`"loading" | "error" | "ready"`, **não** `null`-sentinela — para não colidir com action que retorna `null`). O `load` é guardado em ref (dispara em montagem + retry, sem re-loop por identidade do thunk).

```tsx
<LazyTab load={() => fetchSupplierStockInitAction(id, q)}>
  {(data) => <EstoqueTabClient {...data} />}
</LazyTab>
```

Cada tab lazy cai de ~50 para ~5 linhas. O `requireCapability` **continua na `"use server"` action de cada página** — invariante P0 intacto, auth fresca por abertura.

### 3. `tab-url.ts` compartilhado

`buildTabHref(pathname, params, tab, defaultValue, paramName, clearParams)` — promoção do helper do piloto, com `clearParams` parametrizável.

### Fase 0 — Fundação + refactor do piloto

Extrair as 3 peças e **migrar `tools/[id]` para consumi-las** (o `tool-detail-tabs.tsx`, `activity-tab-loader.tsx` e `reviews-tab-loader.tsx` locais somem). Prova que o genérico é equivalente ao piloto antes de qualquer outra página migrar. 1 PR. Gate: 0 requests entre tabs eager (medição já estabelecida), `bun run build`, `bun verify`.

## Playbook de migração (por página)

Passos mecânicos repetidos em cada página:

1. Trocar `EntityTabs` → `EntityClientTabs` no `page.tsx`.
2. Mover o header (`<XIdentity>`/`EntityIdentityHeader`) para **dentro** do shell (prop `header`).
3. Classificar cada tab:
   - **Eager**: deriva do fetch único → RSC renderizado 1×, passado como `content` (sem `sp.tab===X ? :null`).
   - **Lazy**: par `(a)` `"use server"` `fetchXInitAction(id, …)` com `requireCapability` envolvendo o data-fetch existente + `(b)` loader client via `<LazyTab>`.
4. Converter a ação contextual do header: de decisão server-side por `sp.tab` → client lendo `useActiveTab()` (componente de ação vira `"use client"`).
5. Clampar `initialTab` no server (set de tabs conhecidas, respeitando tabs condicionais).
6. Atalhos in-content que linkam outra tab (`Ver aba →`) passam pelo switcher client, não `<Link>`.
7. Remover leitura de `searchParams` que existia só para o server decidir a tab — **manter** os que filtram conteúdo (ver variações).

### Variações por página (do mapa das 8)

| Página | Eager | Lazy → action | Header | Cuidado específico |
| --- | --- | --- | --- | --- |
| `promotions/[id]` | overview, tools | — | varia (2) | "Gerenciar ferramentas" é link p/ `/edit` (outra rota, fica `<Link>`); ambas as tabs derivam de `getPromotion` |
| `orders/[id]` | **todas (6)** | — | **sem slot de ação** | Hoje NÃO lê `searchParams`; migrar adiciona deep-link `?tab=` + popstate e mata o `router.replace` inútil; tab `reembolso` condicional (só se há `refundRequests`); ações ficam no `OrderActionColumn` (não muda) |
| `suppliers/[id]` | overview | estoque, history | só overview | `history` era fetch **serial** → vira action lazy; `?q=` (busca do estoque) vira estado client + refetch |
| `shipping/carriers/[id]` | sobretaxas | zonas, preview | **não varia** | Ação sempre `EditCarrierButton` (não precisa de `useActiveTab`, mas o shell ainda é client); `?edit=1` (sheet) é ortogonal, permanece |
| `categories/[id]` | visão-geral | produtos, subcategorias | varia (3) | `getCategoryAttributes` (lazy da overview hoje) entra no payload eager da visão-geral; links de header vão p/ outras rotas |
| `users/[id]` | profile, branches, security | activity, sessions, permissões | varia (2) | `availableBranches` (painel de vincular) busca na abertura do painel (como suppliers do estoque no piloto); `permissões` é tab condicional (`targetManageable`) |
| `customers/[id]` | perfil | endereços, pedidos, avaliações, consentimento, sessões, auditoria | varia (2) | maior volume de lazy, mas todas no molde; `auditoria` tem filtro `?auditAction=` → estado client |
| `branches/[id]` | overview | team, orders, stock, activity | varia (3) | **Maior desvio do molde:** stock/activity têm **filtros internos server-driven** (categoria, busca, sort, status, período, tipo, toolId) que hoje vivem em `searchParams` e disparam RSC. Migração: esses filtros viram estado client + refetch via action (parte já client via infinite scroll — confirmar no plano). **Sub-issue maior, por último.** |

## Faseamento

- **Fase 0** — Fundação + refactor do piloto. 1 PR.
- **Fases 1–8** — uma página por PR, complexidade crescente:
  1. `promotions` (trivial — tudo de `getPromotion`)
  2. `orders` (todas eager, sem header contextual; adiciona deep-link)
  3. `carriers` (header não varia)
  4. `suppliers` (2 lazy, 1 filtro)
  5. `categories` (3 estados de header)
  6. `users` (tab condicional, painel lazy)
  7. `customers` (6 lazy)
  8. `branches` (filtros server-driven internos)
- **Sub-issues** — uma por página linkada ao épico #261. **O roteiro e a abertura ficam a cargo do writing-plans** (decisão do usuário); não abrir agora.
- **Virar o canônico** — após a Fase 5 (5/8 migradas), atualizar `DESIGN.md §4` + `apps/web/CLAUDE.md` + nota de superação no ADR-0024: de "server-nav default" → "client-side default". **Remover** o `EntityTabs` server-nav na **Fase 8** (gate: `grep` sem usos).

## Raio de impacto

**Criar (Fase 0):**
- `components/entity/entity-client-tabs.tsx` (shell client + `useActiveTab`)
- `components/entity/use-lazy-tab.ts` + `components/entity/lazy-tab.tsx`
- `components/entity/tab-url.ts` (helper compartilhado)

**Alterar (Fase 0):**
- `tools/[id]/page.tsx` e componentes do piloto → consumir os compartilhados; remover os locais (`tool-detail-tabs.tsx`, `activity-tab-loader.tsx`, `reviews-tab-loader.tsx`, `_lib/tab-url.ts`).

**Alterar (Fases 1–8):** cada `page.tsx` + componentes de tab + header de ação + novas `"use server"` actions lazy por página.

**Remover (Fase 8):**
- `components/entity/entity-tabs.tsx` (server-nav) quando sem usos.

## Trade-offs

- A 1ª carga de cada página renderiza o markup das tabs eager de uma vez — barato (mesmo fetch, sem queries extras), só mais HTML.
- Tab lazy mostra skeleton breve na 1ª abertura (inclusive deep-link) — aceito (simplicidade > evitar o flash).
- Mais peças que o modelo server, mas a fundação compartilhada amortiza o boilerplate (loaders de ~50 → ~5 linhas).
- `branches` concentra o risco real (filtros internos) — isolada por último como sub-issue maior.
- Estado dual e consciente durante a transição: páginas migradas são client-side; as restantes seguem server-nav até sua vez (ADR/DESIGN documentam ambos até a Fase 8).

## Restrições técnicas (do projeto)

- `"use server"`: actions são async functions; **não** re-exportar não-async de arquivo `"use server"` (quebra o build — não pego por `check-types`/lint). Gate: `bun run build`.
- React Compiler ativo — sem `useMemo`/`useCallback` manuais.
- Client Component não importa fn de módulo `server-only`/`@emach/db` — dados lazy vêm via `"use server"` action; tipos via `import type`.
- Invariante P0: `requireCapability` em toda action lazy nova.

## Verificação (gate por página)

- `bun verify` (check-types + check + test) **e** `bun run build`.
- Smoke no browser (dev :3007): trocar entre tabs eager = **0 requests** (network/Resource Timing); tab lazy = 1 action na 1ª abertura, 0 ao reabrir; deep-link `?tab=` abre a tab certa; voltar/avançar (popstate) sincroniza; ação de header alterna; mutações revalidam.

## Fora de escopo

- Alternativa B do ADR-0024 (cache server-side via `unstable_cache`/`cacheTag`) — registrada como fallback se alguma migração se mostrar cara na prática; não adotada.
- Mudanças de layout/visual das tabs além do necessário para a migração.
