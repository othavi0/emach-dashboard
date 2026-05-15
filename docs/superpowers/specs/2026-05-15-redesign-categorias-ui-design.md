# Redesign da UI de categorias — design

**Data:** 2026-05-15
**Escopo:** lista, ver, criar e editar categorias em `apps/web/src/app/dashboard/categories/`.

## Contexto

A UI de categorias hoje é tecnicamente moderna, mas a UX é "tudo é formulário":

- A lista é uma tabela achatada com indentação por `└` — não comunica a árvore.
- Não existe página de leitura. Clicar numa categoria cai direto no formulário de editar.
- Atributos só aparecem dentro do form de editar.
- A ordenação (`sortOrder`) é um campo numérico digitado à mão.
- O campo `imageUrl` existe no schema e no form, mas uma categoria de catálogo não precisa de imagem própria — ela só organiza produtos.

O objetivo é alinhar categorias ao padrão de detalhe rico já usado em `orders` (`/dashboard/orders/[id]`): grid `1.45fr / 0.95fr`, cards seccionados, sidebar de ações.

## Decisões

| Tema | Decisão |
| --- | --- |
| Ver × editar | Rota nova `[id]` = página de leitura rica. Edição permanece em `[id]/edit` como formulário. Ver é o destino padrão ao clicar numa categoria. |
| Layout da lista | Árvore expansível (chevrons de expandir/recolher), não tabela achatada. |
| Ordenação | Drag-and-drop reordena **apenas irmãos** (mesmo pai). Persiste `sortOrder` via server action. O campo numérico sai do formulário. |
| Reparent | Continua só no select "Categoria pai" do form de editar — onde já existe a confirmação de atributos órfãos. Drag **não** muda de pai. |
| `imageUrl` | Coluna `category.image_url` **dropada** do banco via migration versionada. Removida de `schema/categories.ts`, do Zod e do form. |

## Arquitetura

### 1. Lista — `/dashboard/categories`

- Árvore expansível. Cada nó: nome (indentado por `depth`), contagem de produtos, badge de status (ícone + label + cor).
- Chevron expande/recolhe. Estado de expansão client-side.
- Drag-and-drop reordena nós irmãos; ao soltar, chama a server action de reorder com a nova sequência de `sortOrder`.
- Clicar no nome navega para a página de detalhe `[id]`. Ação de editar inline disponível por linha.

### 2. Ver — `/dashboard/categories/[id]` (rota nova)

Server Component. Layout grid `xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]`.

- **Header:** breadcrumb derivado de `path`, nome, slug (`font-mono`), badge de status, botão Editar.
- **Coluna esquerda:**
  - Card **Sobre** — `description` (texto simples). Empty state quando vazia.
  - Card **Atributos técnicos** — próprios + herdados, somente leitura. Próprios marcados com pill copper; herdados indicam a categoria de origem.
  - Card **Produtos** — tools com esta categoria como **primária** (`tool_category.is_primary = true`). Lista resumida + link "Ver todas".
- **Sidebar:**
  - Card **Ações** — Editar, Ativar/Desativar, Nova subcategoria, Excluir.
  - Card **Resumo** — 4 stat-cards: produtos, subcategorias, atributos próprios, profundidade (`depth`).
  - Card **Hierarquia** — categoria-pai + filhas diretas, todas clicáveis.

Atributos aqui são **read-only**: o CRUD de definição de atributo acontece só no form de editar. Mantém "ver" como leitura pura e "editar" como único lugar de mutação.

### 3. Editar — `/dashboard/categories/[id]/edit`

Mesmo grid `1.45fr / 0.95fr`.

- **Coluna esquerda (cards):**
  - **Informações básicas** — `name`, `slug` (editável, com aviso de quebra de URL), `description`.
  - **Hierarquia** — select `parentId`, switch `isActive`. Sem campo de ordem (drag-and-drop na lista).
  - **Atributos próprios** — CRUD via Sheet lateral (mantém `attribute-sheet.tsx`) + herdados read-only com link para a origem.
- **Sidebar fixa:** card Salvar com pré-visualização do `path` em tempo real + Cancelar.
- Painel de erros Zod no topo preservado (lista vermelha de issues traduzidos + toast com contagem).

### 4. Novo — `/dashboard/categories/new`

Idêntico ao editar, **sem** o card de atributos próprios (categoria precisa existir antes de receber atributos) e com slug travado (auto-gerado de `name` via `slugifyLabel()`).

## Mudanças de dados

- **Migration versionada** removendo a coluna `image_url` de `category`. Migration aditiva-segura quanto a dados (a coluna é nullable e descartável).
- **Coordenação com o app ecomerce:** DB compartilhada. As queries owned-by-dashboard `getCategoryTree` / `getCategoryBySlug` (`packages/db/src/queries/catalog.ts`) não podem mais selecionar `image_url`; a cópia versionada do schema no ecomerce precisa ser sincronizada. Registrar em `docs/integration/admin-ecommerce.md`.
- Nova server action de reorder: recebe a lista ordenada de ids irmãos e atualiza `sortOrder` em transação.

## Documentação a atualizar

- `apps/web/CLAUDE.md` — seção "Painel de atributos por categoria" e UX de forms: descrever a rota de detalhe `[id]`, o drag-and-drop de ordenação e a ausência do campo de imagem.
- `.claude/CLAUDE.md` (root) — topologia: marcar `categories/` com a rota de detalhe.
- Remover qualquer referência a padrões legados/desatualizados de categorias nos docs (tabela achatada, campo de imagem, campo de ordem manual).

## Verificação

- `bun check-types` no workspace `apps/web` e `packages/db`.
- `bun fix` no escopo alterado.
- Smoke em `bun dev:web`: visitar lista (expandir/recolher, arrastar), `[id]` (detalhe), `[id]/edit` e `new`. `nextjs_call <port> get_errors` para stack trace de SSR.
- Confirmar que a migration de drop aplica em dev (`bun db:push` / `bun db:generate`).
