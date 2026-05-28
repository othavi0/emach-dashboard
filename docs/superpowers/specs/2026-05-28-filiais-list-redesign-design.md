# Filiais — Redesign da listagem (lista limpa, cards consistentes, endereço obrigatório)

**Data:** 2026-05-28
**Branch:** TBD (sugestão: `filiais-list-redesign`)
**Escopo:** `/dashboard/branches` (listagem) — não mexe na página de detalhe nem em `/branches/new` visualmente (só herda schema).

## Motivação

A listagem hoje (`/dashboard/branches`) tem 3 problemas:

1. **KPI row redundante.** Os 4 cards no topo (Filiais / Pedidos em aberto / SKUs abaixo do mín. / Valor em estoque) repetem info que é mais útil **por filial** do que agregada. "Valor em estoque" global de R$ 5,4M sem contexto de filial não decide nada; "Pedidos em aberto" e "SKUs abaixo" já vivem no dashboard inicial.

2. **Inconsistência visual dos cards — causa raiz: dado faltando + layout sem defesa.** No diagnóstico inicial, SP renderizava endereço e Campinas/RP não → alturas de header diferentes → "Estoque OK" e a linha de stats desalinhados. **Verificação no banco (2026-05-28): as 3 filiais já têm endereço completo** (Campinas e RP foram preenchidas), então o sintoma sumiu. Mas o layout continua frágil: qualquer filial sem endereço (ou com endereço que quebre em 2 linhas) reintroduz o desalinhamento. O fix é **preventivo**: tornar endereço obrigatório na fonte + dar ao card uma meta-line de altura fixa.

3. **Botões dos cards sem destaque.** Ícones estoque/editar usam `variant="ghost"` (sem background). Difícil notar com vários cards.

4. **Monograma desbalanceado.** `initials()` pega as 2 primeiras palavras: "São Paulo"→"SP", "Ribeirão Preto"→"RP", mas "Campinas"→"C" (1 letra só). O "C" sozinho fica visualmente fraco ao lado de monogramas de 2 letras.

## Decisões (confirmadas com o usuário)

| Tópico | Decisão |
|---|---|
| KPI row no topo | **Remove integralmente** os 4 cards |
| Stats grid do card | **3 colunas:** Equipe / SKUs ativos / **Valor estoque** (substitui "Abaixo mín.") |
| Indicador de baixo estoque | Mantém só no badge do header ("Estoque OK" / "X abaixo do mín.") |
| Botões dos cards | **Variante A:** `variant="secondary"` (token `bg-secondary` — cinza sutil) |
| Endereço | **CEP + rua + número + cidade + UF obrigatórios** no form |
| Endereço pendente (defesa) | Card mostra placeholder italic "Endereço pendente" no slot da meta — improvável agora, é rede de segurança |
| Monograma 1 palavra | "Campinas" → "CA" (2 primeiras letras quando há só 1 palavra) |

## Arquitetura

### 1. Page (`apps/web/src/app/dashboard/branches/page.tsx`)

Remove:
- Import de `EntityKpisRow` e `getBranchKpis`.
- Imports de ícones `Building2, PackageX, ShoppingCart, Warehouse`.
- A const `stockValueFormatted` e o bloco `<EntityKpisRow ... />` inteiro.
- Do `Promise.all([getBranchKpis(), fetchBranchesTablePage(...)])` sobra só `fetchBranchesTablePage` (sem array).

Mantém: `PageHeader` (com action "Nova filial"), `BranchesFilters`, `BranchCardGrid`.

### 2. Data layer (`apps/web/src/app/dashboard/branches/data.ts`)

- `BranchTableRow`: adiciona `stockValue: number`. Mantém os campos existentes (`lowStock` segue alimentando o badge do header).
- `getBranchTableAggregates(branchIds)`: **acrescentar o valor de estoque no `select` que já existe** (`stockRows`), não criar query separada. O select já agrupa `stockLevel` por `branchId`; adicionar `leftJoin(toolVariant)` + `sum(quantity * priceAmount)`. O `count(*) filter` não infla porque `toolVariant` é 1:1 com `stockLevel.variantId`.

  ```ts
  const stockRows = await db
    .select({
      branchId: stockLevel.branchId,
      active: sql<number>`count(*) filter (where ${stockLevel.quantity} > 0)::int`,
      low: sql<number>`count(*) filter (where ${stockLevel.quantity} <= coalesce(${stockLevel.minQty}, 0) and coalesce(${stockLevel.minQty}, 0) > 0)::int`,
      value: sql<number>`coalesce(sum(${stockLevel.quantity} * coalesce(${toolVariant.priceAmount}, 0)), 0)::float`,
    })
    .from(stockLevel)
    .leftJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
    .where(inArray(stockLevel.branchId, branchIds))
    .groupBy(stockLevel.branchId);
  ```

  Map de retorno passa a `{ teamCount, activeSkus, lowStock, stockValue }`. Import de `toolVariant` (já importado no arquivo) e `eq` (já importado).

- **Remover `getBranchKpis()` e a interface `BranchKpis`** (único use site eliminado, sem export externo).

### 3. Actions (`apps/web/src/app/dashboard/branches/actions.ts`)

`fetchBranchesTablePage`: incluir `stockValue: agg.stockValue` no objeto `BranchTableRow`. Default `0` no fallback do `agg`.

### 4. Card (`apps/web/src/app/dashboard/branches/_components/branch-card.tsx`)

**`initials()` — monograma 2 chars sempre:**
```ts
function initials(name: string): string {
  const words = name.split(" ").filter(Boolean);
  if (words.length === 1) {
    return (words[0]?.slice(0, 2) ?? "").toUpperCase();
  }
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}
```
"Campinas"→"CA", "São Paulo"→"SP", "Ribeirão Preto"→"RP".

**Header (meta line) — altura fixa + placeholder defensivo:**
- Sempre renderiza o `<p>` da meta (não condicional). Classes garantem altura estável (`line-clamp-1`, já presente).
- Com endereço → string de `formatBranchAddress(branch)`.
- Sem endereço (caso de borda) → `<p className="line-clamp-1 text-xs italic text-muted-foreground/60">Endereço pendente</p>`.

**Stats grid (bottom row) — 3ª coluna vira Valor estoque:**
```ts
const stockValueFormatted = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
}).format(branch.stockValue);
```
- Resultado tipo `"R$ 5,4 mi"` / `"R$ 320 mil"` — cabe na coluna estreita. Detalhe da filial mostra o valor completo (`overview-tab` já faz isso, sem compact).
- Label: `Valor estoque`.
- Remover a lógica condicional `branch.lowStock > 0 ? "text-amber-500"` dessa coluna (lowStock não vive mais aqui).

**Botões (action group):**
- Trocar `buttonVariants({ size: "icon-sm", variant: "ghost" })` por `variant: "secondary"` nos dois `<Link>` (Boxes e Pencil). Nada mais muda.

### 5. Schema (`apps/web/src/app/dashboard/branches/_components/branch-schema.ts`)

Tornar **CEP + rua + número + cidade + UF obrigatórios**. Bairro, complemento, telefone, responsável seguem opcionais.

```ts
cep: z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => cepDigitsRegex.test(v), "CEP obrigatório (8 dígitos)"),
street: z.string().trim().min(1, "Rua obrigatória").max(200, "Rua muito longa"),
streetNumber: z.string().trim().min(1, "Número obrigatório").max(20, "Número muito longo"),
city: z.string().trim().min(1, "Cidade obrigatória").max(120, "Cidade muito longa"),
state: z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "UF obrigatória")
  .refine((v) => ufRegex.test(v), "UF inválido (use 2 letras)"),
```

**Remover o `.refine()` final** (validava "se CEP preenchido então endereço" — agora tudo é obrigatório direto, fica redundante).

`normalizePayload` em `actions.ts` não muda (`?? null` defensivo segue ok — pós-Zod nunca será null nesses campos).

> Nota: "s/n" é valor válido pra `streetNumber` (min(1) aceita texto livre) — cobre endereços sem número.

### 6. Form fields (`apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`)

Hoje só "Nome" tem `*`. Adicionar `<span className="text-destructive">*</span>` nos labels de **CEP, Rua, Nº, Cidade, UF**. Bairro e Complemento ficam sem `*`.

Painel de erros no topo (convenção `apps/web/CLAUDE.md`) já lista os issues do Zod — sem mudança ali.

> O form é compartilhado entre `create` e `edit`. A obrigatoriedade vale pros dois. As 3 filiais existentes já têm endereço completo (verificado no banco), então editar qualquer uma e salvar não dispara erro.

## Trade-offs

| Decisão | Trade-off |
|---|---|
| Remover KPI row global | Perde visão agregada rápida. **Aceito:** dado é mais útil por filial; KPIs globais relevantes vivem em `/dashboard`. |
| `notation: "compact"` no valor | "R$ 5,4 mi" perde precisão exata mas cabe. **Aceito:** detalhe mostra valor completo. |
| Placeholder italic defensivo | Caso de borda improvável (form agora exige endereço). **Aceito:** rede de segurança barata. |
| CEP obrigatório | User não cria/edita filial sem CEP. **Aceito:** é a forma natural de preencher (CepInput resolve o resto via API). |
| Remover `getBranchKpis()` | Função inteira fora. Single use site. **Aceito:** dead code. |
| Monograma "CA" pra Campinas | Muda o visual de 1 card existente. **Aceito:** uniformiza com SP/RP. |

## Não inclui

- Página de detalhe `/branches/[id]` — mantém `EntityKpisRow` + `getBranchDetailKpis`.
- `/branches/new` visual — só herda o schema.
- Backfill de endereço — desnecessário, as 3 filiais já têm.
- Filtros (`BranchesFilters`) — fora de escopo.
- Outras páginas do dashboard (suppliers/users têm KPI row parecida — rounds futuros, sob demanda).

## Verificação visual (smoke run-time obrigatório)

1. `bun check-types` — sem erros.
2. `bun dev:web` (já rodando) — recarregar `/dashboard/branches`.
3. No Brave Notbook (claude-in-chrome) confirmar:
   - 4 KPI cards do topo sumiram.
   - 3 cards alinhados; monograma "CA" em Campinas.
   - Stats: Equipe / SKUs ativos / Valor estoque (compact BRL).
   - Botões Boxes/Pencil com background cinza sutil, visíveis.
4. `/branches/new` → criar sem CEP/endereço → erros Zod no painel do topo. Com tudo preenchido → cria.
5. Editar SP sem mexer em nada → salva sem erro.

## Arquivos tocados

```
apps/web/src/app/dashboard/branches/page.tsx                            (- KPI row, - getBranchKpis)
apps/web/src/app/dashboard/branches/data.ts                             (+ stockValue no stockRows, - getBranchKpis/BranchKpis)
apps/web/src/app/dashboard/branches/actions.ts                          (+ stockValue na projection)
apps/web/src/app/dashboard/branches/_components/branch-card.tsx         (initials 2-char, meta fixa, stats c/ Valor, botões secondary)
apps/web/src/app/dashboard/branches/_components/branch-schema.ts        (cep/street/number/city/state required, - refine)
apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx  (* em CEP/Rua/Nº/Cidade/UF)
```

6 arquivos. Mudança coesa, um único PR.
