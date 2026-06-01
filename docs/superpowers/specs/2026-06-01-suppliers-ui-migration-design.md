# Migração Fornecedores → padrão de interface de Filiais

> Spec de design. Status: aprovado para implementação (2026-06-01).
> Origem: análise comparativa do fluxo de Filiais (padrão canônico do sistema, `DESIGN.md` §4 Entity/CRUD pattern) vs Fornecedores (implementação anterior à consolidação do pattern).

## Contexto e objetivo

Filiais (`/dashboard/branches`) é a **referência canônica** do Entity/CRUD pattern do sistema (`EntityIdentityHeader` + `EntityTabs` com ação de header contextual por `?tab=`, catálogo de 4 arquétipos de card, tríade de mutação, lazy tabs, scroll infinito). Fornecedores (`/dashboard/suppliers`) foi construído antes dessa consolidação e diverge em UI/UX, além de carregar três bugs reais.

Objetivo: migrar Fornecedores para o padrão de Filiais, **adaptando ao domínio** (fornecedor tem menos campos, não tem estoque, a coleção é "ferramentas vinculadas"). O esqueleto é fixo; os campos variam.

### Fora de escopo (projeto separado)

A evolução do modelo de dados — **N:N `tool ↔ supplier`** (uma ferramenta com vários fornecedores) + **`supplierId` na entrada de estoque** (`stockMovement`) para registrar proveniência — é uma mudança de modelagem de domínio com implicações em schema, form de ferramenta e movimentação. **Não faz parte desta migração.** O redesenho de UI aqui funciona igual em 1:N ou N:N (só muda a query por baixo), então é desacoplável. Tratar em brainstorming/spec próprio depois.

## Setup atual (fatos do schema, para fundamentar decisões)

- `tool.supplierId` é FK única com `onDelete: "set null"` (`packages/db/src/schema/tools.ts:70`). Relação **1:N**: uma ferramenta tem no máximo um fornecedor.
- `stockMovement` (`packages/db/src/schema/stock-movements.ts`) **não** tem `supplierId`. A entrada de estoque (`reason: 'entrada_compra'`) não registra de qual fornecedor veio.
- `supplier` (`tools.ts:26`) **não** tem coluna `status` hoje.

Consequência: deletar fornecedor não quebra integridade (`set null`), mas causa **perda silenciosa de proveniência** ("de quem comprávamos a ferramenta X" some, sem audit trail). Por isso a decisão é **soft-delete via status**, não hard-delete — preserva proveniência e é à prova do N:N futuro, consistente com a filosofia de Filiais (que inativa, nunca deleta).

## Decisões (aprovadas)

| Decisão | Escolha |
|---|---|
| Tab "Ferramentas" | Card-grid (entity-card) + scroll infinito |
| Escopo | Migração completa + correção dos 3 bugs |
| Remoção de fornecedor | Soft-delete via status "Arquivar" (nova coluna `status`) |
| Evolução N:N | Projeto separado, depois desta migração |
| Listagem: arquivados | Aparecem esmaecidos (`opacity` + badge "Arquivado"), padrão Filial — **sem** filtro de status novo |

## Já alinhado (não tocar)

Listagem (header serif + CTA coral), filtros (`FiltersBar`), `EntityKpisRow` na overview, edição via drawer (`EntityEditSheet`), tab Histórico (`EntityAuditLogTable`), redirect `/[id]/edit → ?edit=1`.

---

## Frentes de trabalho

### Frente 1 — Schema

- Adicionar `status` enum (`active` | `archived`, default `active`) em `supplier` (`packages/db/src/schema/tools.ts`) + index para filtro/ordenação.
- Aplicar com `bun db:sync`.
- **Coordenação ecommerce:** `supplier` está na superfície de sync CI (`tools.ts`) → o workflow `sync-db-schema.yml` abre PR no repo ecommerce. Mudança é **aditiva** e o ecommerce **não lê `supplier`** (admin-only), então é seguro. Registrar na descrição do PR.

### Frente 2 — Bug fixes

1. **Paridade create/edit.** Causa raiz: campos duplicados manualmente em `SupplierForm` (página de criar — só Nome/Email/Telefone/Observações) e `SupplierEditSheet` (drawer — tem Website/CNPJ). O `supplierSchema` tem Website e CNPJ, mas o create os ignora. Fix: extrair `SupplierFormFields` (Nome/Email/Telefone/**Website**/**CNPJ**/Observações) compartilhado, espelhando `BranchFormFields`. Ambos (página e drawer) consomem o mesmo componente.
2. **Lazy tabs.** `[id]/page.tsx` roda `getSupplierTools` + `getSupplierAuditLog` no `Promise.all` incondicional, mesmo na tab overview. Fix: carregar por `sp.tab` (como branches: `sp.tab === "tools" ? <ToolsTab/> : null`).
3. **Dead code.** Remover `listSuppliers`, `getSupplier`/`LinkedTool` e o `SupplierDetail` duplicado em `actions.ts` (data.ts:10 é a definição viva) — após confirmar não-uso por `rg`.

### Frente 3 — Ciclo de vida (soft-delete)

- `deleteSupplier` (hoje bloqueia se há ferramentas vinculadas — contradiz schema `set null` e a copy do dialog) → substituir por `archiveSupplier(id)` + `restoreSupplier(id)`. Setam `status`. Audit actions `archived` / `restored` (o `history-tab` já tem o label "Restaurado" em `ACTION_LABELS`).
- `DeleteSupplierDialog` (órfão) → `ArchiveSupplierDialog`: `AlertDialog` controlado, copy "Arquivar fornecedor" / "Restaurar", botão `outline`/`ghost` (nunca coral). Religado no header contextual da overview.

### Frente 4 — Detalhe: header contextual + overview

- `SupplierIdentity`: remover `"use client"` e o botão "Editar" fixo. Vira componente "burro" que recebe `actions` (espelha `BranchIdentity`).
- `[id]/page.tsx` (Server Component) injeta a ação por `sp.tab`:

  | Tab ativa | Ação no header |
  |---|---|
  | overview (default) | Editar (`?edit=1`) + Arquivar/Restaurar |
  | tools | Nova ferramenta (`/dashboard/tools/new?supplierId=`) |
  | history | — |

  (Editar continua abrindo o `EntityEditSheet` via `?edit=1`. A ação Arquivar/Restaurar alterna conforme `detail.status`.)
- Badge de contagem da tab "Ferramentas": trocar o `rounded-full bg-muted` custom pelo padrão `EntityTabs` (`secondary rounded-md`). Preferir count vindo de KPI agregado (`detail.toolsTotal`) a carregar a coleção.
- `overview-tab`: re-layout para **grid 2-col** (`md:grid-cols-2`), status badge ("Ativo"/"Arquivado") no header do card de Contato, **footer edge-to-edge** (Criado em / Atualizado em, via `-mx-4 -mb-4 ... border-t`). KPIs row mantida. Adaptação de domínio: bloco "Sobre" (notes markdown) full-width acima; "Contato" no grid.

### Frente 5 — Tab Ferramentas (card-grid + scroll infinito)

- Reescrever `tools-tab.tsx` no molde de `branches/[id]/_components/orders-tab.tsx`:
  - Server async, lazy (renderizada só quando `sp.tab === "tools"`).
  - `fetchSupplierToolsPage({ supplierId, search, cursor })` — nova action paginada, cursor keyset `desc (createdAt, id)`, `BATCH_SIZE` (espelha `fetchBranchOrdersPage`). A `getSupplierTools` atual (`limit(100)`, sem cursor) é substituída.
  - Empty state (ícone `Wrench` + copy) ou `<SupplierToolsInfinite>` (client, `useInfiniteList` + `InfiniteSentinel`).
- `SupplierToolCard` (arquétipo entity-card): ícone `Wrench` em avatar quadrado, nome linkado para `/dashboard/tools/[id]`, SKU padrão como subtitle, **status badge com role correta** (`active → success`/jade, `draft → secondary`, `discontinued → outline`) — corrige o `variant="default"` coral atual, que viola `DESIGN.md` (status ativo = success). Footer: data de criação / categoria.
- Busca: server-side via `?q=` (a query `getSupplierTools` já filtra por nome/slug). Botão "Nova ferramenta" sai do corpo da tab → header contextual (Frente 4).

### Frente 6 — Card de listagem + new page

- `supplier-card.tsx`: **remover** o `Eye` (card já é clicável para o detalhe — redundante) e o `Pencil` de editar inline (proibido pelo pattern — editar é via detalhe). Card clicável → detalhe (mantido). Estado arquivado: `opacity-70` + badge `outline` "Arquivado" (como filial inativa). Opcional: atalho ghost "ver ferramentas" (`?tab=tools`) com `border border-border bg-muted`, espelhando o atalho de estoque da filial.
- `suppliers/new/page.tsx`: `<h1>` inline → `PageHeader` (consistência com `branches/new`).
- `getSupplierTableAggregates` / `SupplierTableRow`: incluir `status` para o card decidir o estado esmaecido.

## Verificação

- `bun check-types` (não pega import de hook client em Server Component nem SQL inválido — ver abaixo).
- Smoke visual no browser (porta dev atual) de cada tela alterada:
  - Listagem (card sem Eye/Pencil; arquivado esmaecido).
  - Detalhe × 3 tabs (header contextual muda por tab; badge secondary; overview 2-col).
  - Criar fornecedor (Website + CNPJ presentes).
  - Editar via drawer.
  - Arquivar → card esmaecido na listagem → Restaurar.
  - Tab Ferramentas: card-grid, status badge jade em "Ativa", scroll infinito, "Nova ferramenta" no header.

## Riscos / notas de implementação

- **RSC vs client boundary:** `check-types` não detecta import de `useRouter`/`useState` em Server Component — quebra só em runtime. Smoke visual obrigatório após mexer em `[id]/page.tsx`, `SupplierIdentity`, tabs.
- **Cursor keyset:** reusar `decodeCursor`/`encodeCursor` + `BATCH_SIZE` de `@/lib/infinite` e `@/lib/cursor`. Não inventar paginação nova.
- **Auditoria:** `archiveSupplier`/`restoreSupplier` escrevem `supplierAuditLog` (`actorType: "user"`, `actorUserId`) + `logUserActivity`, espelhando `updateSupplier`.
- **Status no detalhe:** `SupplierDetail` (data.ts) e `getSupplierDetailKpis` precisam expor `status`; o header decide Arquivar vs Restaurar por ele.
