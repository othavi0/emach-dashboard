# Redesign — Detalhe de Categoria

> Spec de design. Status: aprovado no brainstorming (Opção A + atributos na Visão geral + divisórias edge-to-edge).
> Rota: `/dashboard/categories/[id]`. Data: 2026-06-13.

## Problema

A tela de detalhe de categoria não segue o padrão de entidade do sistema (`EntityIdentityHeader` + `EntityTabs` + `EntityKpisRow`) que tools, usuários e filiais já adotam (DESIGN.md §4). Hoje é um grid de 2 colunas com `Card`s shadcn crus. Problemas concretos:

1. **Métrica ambígua** — "Profundidade · Nível 0" no card Resumo não é acionável nem significa nada pro usuário.
2. **Ações duplicadas e mal dispostas** — "Editar" aparece no header **e** num card "Ações" lateral com 4 botões empilhados, misturando benignas (Nova subcategoria) e destrutivas (Excluir) no mesmo bloco.
3. **Fora do padrão** — layout próprio em vez do esqueleto canônico de entity-detail.
4. **Hierarquia espremida** — pai e filhos num card "Hierarquia" lateral, quando a relação de árvore é o que mais importa numa categoria.

## Solução — Opção A: Entity + Tabs

Adotar o padrão canônico de entity-detail, adaptado à natureza hierárquica da categoria.

### Estrutura da página (`page.tsx`, Server Component)

```
[ Breadcrumb: Início › Categorias › {ancestrais…} › {categoria atual} ]
[ EntityIdentityHeader: avatar · nome · path mono · badge status · ação contextual + menu ⋯ ]
[ EntityTabs: Visão geral · Produtos (N) · Subcategorias (N) ]
[ conteúdo da aba ativa ]
```

- Reusa `EntityIdentityHeader`, `EntityTabs`, `EntityKpisRow` de `@/components/entity/`.
- Reusa `Breadcrumb` de `@emach/ui/components/breadcrumb` (primeira adoção no app — justificada por ser a única entidade hierárquica).
- `export const dynamic = "force-dynamic"` mantido.

### Header (`category-detail-header.tsx`, novo)

- **Avatar:** ícone `FolderTree`/`Layers` (lucide) em avatar quadrado, fallback do `EntityIdentityHeader`.
- **Título:** `category.name`.
- **Subtitle:** `<code>{category.path}</code>` (só o path/slug — a hierarquia vai pro breadcrumb, sem o "· em {pai}" redundante).
- **Badge:** `Ativa` (success) / `Inativa` (outline), via `EntityIdentityHeader.badges`.
- **Ações** (slot `actions`): ação primária contextual (ver abaixo) + `CategoryActionsMenu` (⋯).

### Breadcrumb

- Cadeia completa de ancestrais, da raiz até o pai, todos clicáveis (`/dashboard/categories/{id}`); a categoria atual é o último item (não-link).
- Prefixo fixo: `Início` (`/dashboard`) › `Categorias` (`/dashboard/categories`).
- Requer nova query `getCategoryAncestors(id)` em `actions.ts` que sobe por `parentId` retornando `{ id, name }[]` da raiz ao pai. Barato (poucos níveis; mesma lógica que `loadAttributes` já percorre).

### Ações contextuais por tab

O Server Component lê `sp.tab` e injeta a ação primária no header:

| Tab ativa | Ação primária no header |
|---|---|
| Visão geral (default) | **Editar** (`<Link>` → `/dashboard/categories/{id}/edit`, `variant="default"`) |
| Subcategorias | **Nova subcategoria** (`<Link>` → `/dashboard/categories/new?parent={id}`, `variant="default"`) |
| Produtos | — (sem ação primária; menu ⋯ permanece) |

- O menu **⋯** (`CategoryActionsMenu`, novo) usa `DropdownMenu` e fica sempre visível ao lado da ação primária. Itens:
  - **Desativar / Ativar** (adapta `toggleCategoryActive` de `CategoryDetailActions`).
  - **Excluir** (abre `DeleteCategoryDialog`, `redirectTo="/dashboard/categories"`).
- `CategoryDetailActions` (card lateral atual) é removido; sua lógica migra pro menu.

### Aba "Visão geral" (`overview-tab.tsx`, novo)

1. **`EntityKpisRow`** — 4 KPIs: Produtos · Subcategorias · Atributos · Status (`tone="success"` quando Ativa). **"Profundidade/Nível" eliminado.**
2. **Card Descrição** — `category.description` ou "Sem descrição.".
3. **Card Atributos técnicos** — lista própria/herdados (move `loadAttributes` do page atual). Cada linha: label + tipo/unidade + badge de origem (`Próprio` coral / `↑ {nome do pai}` secondary). Rodapé com link "Editar atributos na página de edição →" (`text-info`).

**Todos os cards seguem divisórias edge-to-edge** (DESIGN.md §4 "Footer edge-to-edge"): container `overflow-hidden` sem padding; header e linhas com `px-4` próprio; `border-t` pertence à linha inteira (corre de ponta a ponta); rodapé "Editar" com `bg-muted` + `border-t` encostando nas três bordas. **Nunca** divisória recuada "flutuando" no meio do padding.

### Aba "Produtos" (`products-tab.tsx`, novo)

- Lista linkada (cada item → `/dashboard/tools/{id}`): thumb (primeira imagem do tool) + nome (`text-primary`) + SKU (mono, à direita). Divisórias edge-to-edge.
- `getCategoryProducts` ganha a primeira imagem via `leftJoin` em `toolImage` (fallback: ícone placeholder).
- Mantém o limite atual (`limit=8`) + link "Ver todos os N produtos →" para `/dashboard/tools?category={id}` quando `productCount > products.length`.
- Empty state: "Nenhum produto nesta categoria.".

### Aba "Subcategorias" (`subcategories-tab.tsx`, novo)

- Lista linkada de `detail.children` (cada item → `/dashboard/categories/{id}`): ícone pasta + nome (`text-primary`) + contagem de produtos (à direita). Divisórias edge-to-edge.
- Empty state: "Sem subcategorias." + dica de usar "Nova subcategoria" (ação no header).

## Decisões de escopo (YAGNI)

- **Sem scroll infinito** nas abas Produtos/Subcategorias nesta entrega — mantém o limite + link "ver todos" já existente. O padrão `useInfiniteList` para coleções aninhadas fica como melhoria futura se a contagem crescer.
- **Atributos na Visão geral**, não em aba própria (decisão aprovada). São poucos e read-only; aba dedicada só se chegarem a 10-15 herdados.
- **Sem mudança de dados/schema** além das duas queries de leitura (`getCategoryAncestors`, thumb em `getCategoryProducts`).

## Arquivos

**Novos:**
- `categories/[id]/_components/category-detail-header.tsx`
- `categories/[id]/_components/category-actions-menu.tsx`
- `categories/[id]/_components/overview-tab.tsx`
- `categories/[id]/_components/products-tab.tsx`
- `categories/[id]/_components/subcategories-tab.tsx`

**Editados:**
- `categories/[id]/page.tsx` — reescrita para o padrão entity (header + tabs + ação contextual).
- `categories/actions.ts` — `getCategoryAncestors(id)`; thumb em `getCategoryProducts`.

**Removidos/migrados:**
- Uso de `CategoryDetailActions` no detalhe (lógica migra pro menu ⋯). O componente pode ser deletado se não usado em outro lugar.
- `loadAttributes` migra do `page.tsx` para `actions.ts` como `getCategoryAttributes(id)`. O `page.tsx` carrega `detail`, `attributes`, `ancestors` (e `products` quando a aba Produtos está ativa) e passa via props. As abas são Server Components renderizados **lazy** (só quando `sp.tab` corresponde), igual a `branches/[id]` e `tools/[id]`.

**Reusados (sem alteração):** `EntityIdentityHeader`, `EntityTabs`, `EntityKpisRow`, `Breadcrumb`, `DropdownMenu`, `DeleteCategoryDialog`, `Badge`.

## Verificação

- `bun check-types` + `ultracite check` nos arquivos tocados.
- Smoke visual obrigatório (mudança de UI): `localhost:3001` → abrir uma categoria com subcategorias e produtos (ex: "Ferramentas Elétricas"/"Acessórios") → conferir as 3 abas, ações contextuais, breadcrumb navegável, divisórias edge-to-edge, e clicar num produto/subcategoria.
- Conferir categoria-folha (sem subcategorias) e categoria sem produtos → empty states corretos.
```
