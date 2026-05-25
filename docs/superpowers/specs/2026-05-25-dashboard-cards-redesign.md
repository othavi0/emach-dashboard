# Dashboard Cards Redesign

**Data:** 2026-05-25
**Contexto:** Extensão do redesign do ToolCard para as demais superfícies do dashboard — Estoque por Filial, Filiais e Usuários. Todas devem compartilhar a mesma linguagem visual estabelecida pelo ToolCard.

## Problema

Três superfícies têm problemas visuais e de consistência:

1. **BranchStockCard** (`stock/_components/branch-stock-card.tsx`): `font-serif` no nome da ferramenta (P0 ban), imagem dentro de `div` com borda interna extra (não edge-to-edge), número de quantidade a 26px dominante demais, sem click-to-navigate no card.
2. **BranchesTable** (`branches/_components/branches-table.tsx`): tabela pura sem hierarquia visual, sem identidade por filial, dados de saúde de estoque pouco visíveis.
3. **UsersCardGrid** (`users/_components/users-card-grid.tsx`): usa `EntityCard` genérico que não diferencia roles nem dá destaque ao status do usuário.

## Superfície 1 — BranchStockCard

### Arquivo afetado
| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` | Reescrever |

### Design

Espelha o ToolCard exatamente:

**Imagem**
- Edge-to-edge `aspect-[16/9] object-cover` — remove o `div` wrapper com borda interna.
- `group-hover:brightness-110` via CSS filter.
- Badge de categoria: `bottom-2 left-2`, `variant="secondary"` + `backdrop-blur-sm shadow-sm`.
- Badge de status: `top-2 right-2`, colorido por urgência:
  - `quantity <= minQty && minQty > 0` → `variant="destructive"` "Crítico"
  - `quantity <= reorderPoint && quantity > minQty && reorderPoint > 0` → `variant="warning"` "Repor"
  - Caso contrário → `variant="success"` "OK" (só exibido quando status é positivo; omitido se ambos os thresholds são 0)

**Body** (`px-4 pt-3 pb-4`)
- Nome da ferramenta: `font-sans font-semibold text-[14px] leading-[1.3]` — **remove `font-serif`**.
- Meta: `SKU {sku}{voltage ? ` · ${voltage}` : ""}`, `text-xs text-muted-foreground line-clamp-1`.

**Footer**
- `"Qtd: N"` — mesmo padrão de `"Estoque: N"` do ToolCard. `quantity === 0` → `text-destructive`.
- Botão "Ajustar" à direita (já existente via `StockAdjustButton`).
- Threshold como texto muted abaixo: `"Mín: {minQty} · Reposição: {reorderPoint}"` — omitido se `minQty === 0 && reorderPoint === 0`.

**Navegação**
- `"use client"` + `useRouter`.
- Card div: `onClick={() => router.push(`/dashboard/tools/${row.toolId}`)}` + `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space).
- `stopPropagation` no wrapper dos botões (Ver + Ajustar).

---

## Superfície 2 — BranchCard (substituindo BranchesTable)

### Arquivos afetados
| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/branches/_components/branch-card.tsx` | Criar |
| `apps/web/src/app/dashboard/branches/_components/branch-card-grid.tsx` | Criar |
| `apps/web/src/app/dashboard/branches/_components/branches-table.tsx` | Remover (substituído) |
| `apps/web/src/app/dashboard/branches/page.tsx` | Modificar (trocar `BranchesTable` → `BranchCardGrid`) |

### Interface de dados (sem alteração em `BranchTableRow`)
```ts
interface BranchTableRow {
  activeSkus: number;
  address: string | null;
  createdAt: Date;
  id: string;
  lowStock: number;
  name: string;
  teamCount: number;
}
```

### Design do BranchCard

**Estrutura (`"use client"` + `useRouter`)**

```
┌─────────────────────────────────────────┐
│  [SP]  Filial São Paulo          [···]  │  ← monograma + nome + dropdown ações
│        Av. Paulista, 1000               │  ← endereço muted
│        ● Estoque OK                     │  ← status tag
├─────────────────────────────────────────┤
│   12        284         0               │  ← KPI grid 3 colunas
│  Equipe  SKUs ativos  Abaixo mín.       │
└─────────────────────────────────────────┘
```

**Monograma**
- 48px `rounded-[10px]`, iniciais das 2 primeiras palavras do nome (ex: "Filial São Paulo" → "FS").
- Cor por saúde: `lowStock === 0` → verde (`bg-green-950 text-green-400`); `lowStock > 0` → âmbar (`bg-amber-950 text-amber-400`).

**Header**
- Nome: `font-semibold text-[15px] text-foreground`.
- Endereço: `text-xs text-muted-foreground` — omitido se null.
- Status tag inline: `lowStock === 0` → `"● Estoque OK"` verde; `lowStock > 0` → `"⚠ {lowStock} abaixo do mín."` âmbar.
- `DropdownMenu` com `MoreHorizontal` no canto superior direito (ações: Estoque, Editar, Excluir).

**KPI grid**
- 3 colunas separadas por `border-r border-border`.
- Valores: `text-[20px] font-bold tabular-nums`.
- `lowStock > 0` → valor "Abaixo mín." em `text-destructive`.
- Labels: `text-[10px] text-muted-foreground uppercase tracking-wider`.

**Navegação**
- Click no card (fora do dropdown) → `router.push(`/dashboard/branches/${branch.id}`)`.
- `stopPropagation` no wrapper do `DropdownMenu`.

### BranchCardGrid
- Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
- Paginação infinita via `useInfiniteList` (mesmo hook de `BranchesTable`).
- Empty state com ícone `Building2`.

---

## Superfície 3 — UserCard

### Arquivos afetados
| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/users/_components/user-card.tsx` | Criar |
| `apps/web/src/app/dashboard/users/_components/users-card-grid.tsx` | Modificar (trocar `EntityCard` → `UserCard`) |

### Design do UserCard

**Estrutura**

```
┌──────────────────────────────────────────┐
│  [OQ]  Othavio Quiliao  ♛        [Ativo] │  ← avatar + nome + role icon + status badge
│        othavio@emach.com.br              │  ← email muted
│        [Filial SP]  [Filial RJ]          │  ← chips de filiais
│  ─────────────────────────────────────── │
│  Login há 2h                             │  ← último login muted
└──────────────────────────────────────────┘
```

**Avatar**
- 52px `rounded-[10px]` (quadrado-arredondado, não círculo).
- Com foto: `<img>` com `rounded-[10px] object-cover`.
- Sem foto: iniciais (2 chars) com fundo colorido por role:
  - `super_admin` → `bg-amber-950 text-amber-400`
  - `admin` → `bg-blue-950 text-blue-400`
  - `manager` → `bg-green-950 text-green-400`
  - `user` → `bg-muted text-muted-foreground`

**Header**
- Nome: `font-semibold text-[14px] text-foreground`.
- Role icon Lucide ao lado do nome (inline, `size-3.5`):
  - `super_admin` → `Crown` (âmbar)
  - `admin` → `ShieldCheck` (azul)
  - `manager` → `Shield` (verde)
  - `user` → `UserRound` (muted)
- Status badge no canto superior direito do card (absolute não — via flexbox justify-between no header row):
  - `active` → `variant="success"` "Ativo"
  - `pending` → `variant="warning"` "Pendente"
  - `suspended` → `variant="destructive"` "Suspenso"

**Body**
- Email: `text-xs text-muted-foreground line-clamp-1`.
- Chips de filiais: `branchNames.slice(0, 3)` como spans `rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground`; overflow `+N`.
- Sem filial: texto `"Sem filial"` muted.

**Footer** (separado por divider)
- Último login relativo: `"Login {formatRelative(lastLoginAt)}"` ou `"Nunca logou"`. `text-xs text-muted-foreground`.
- Card inteiro clicável → `router.push(`/dashboard/users/${user.id}`)`.

**`EntityCard`** — permanece inalterado (outros consumidores não são afetados).

---

## O que não muda

- `ToolCard` — já redesenhado (commit separado).
- `EntityCard` — genérico, sem alteração.
- Interfaces de dados (`BranchTableRow`, `UserListRow`) — sem alteração.
- Paginação infinita (`useInfiniteList`) — reutilizada em todos.
- KPIs da página de branches (`EntityKpisRow`) — inalterado.
- `BranchStockThresholdInputs` — reutilizado no rodapé do BranchStockCard.
- `StockAdjustButton` — reutilizado.
- `DeleteBranchDialog` — reutilizado nas ações do BranchCard.

## Critérios de aceitação

- [ ] BranchStockCard sem `font-serif`, imagem edge-to-edge, badge de categoria/status sobrepostos.
- [ ] BranchStockCard clicável → tool detail; botões Ver e Ajustar não disparam navegação.
- [ ] BranchCard substitui tabela com grid de cards; monograma colorido por saúde.
- [ ] BranchCard clicável → branch detail; dropdown de ações com stopPropagation.
- [ ] UserCard com avatar quadrado-arredondado colorido por role, role icon Lucide inline.
- [ ] Nenhum emoji nos cards — só ícones Lucide.
- [ ] Grid uniforme em altura em todas as superfícies.
- [ ] Sem regressão em `EntityCard` (outros consumidores intactos).
