# Redesign de UI/UX — Categorias (criar / editar / árvore)

> Spec de design. Data: 2026-06-12. Aprovado via brainstorming (visual companion).
> Escopo: `apps/web/src/app/dashboard/categories/**` + `packages/db/src/.../category-tree` (cliente).

## Problema

As telas de categoria fogem do padrão do sistema e têm lacunas funcionais:

1. **Criar não tem Atributos**, mas Editar tem — parece incompleto/inconsistente.
2. **Layout do form** usa grid de 2 colunas com a coluna direita quase vazia (só "preview do caminho" + botão) → sensação de largura desperdiçada e tela quebrada. O padrão real do sistema (fornecedores/filiais) é **coluna única `max-w-2xl` com `<section>`**.
3. **Select de "Categoria pai"** indica nível com `"— ".repeat(depth)` (tracinhos) — feio e ambíguo.
4. **Contagem de produtos na árvore** mostra só o direto: categorias-pai aparecem com ~0 produtos (o produto costuma ter a folha como primária), o que confunde.
5. **Slug** é exibido ao usuário sem utilidade real para ele (é dev-only).

## Decisões (aprovadas)

### D1 — Fluxo de atributos no criar: "salvar → continuar editando"
- A tela de **criar** exibe a seção **Atributos em estado bloqueado** (empty-state: ícone + "Salve a categoria para definir atributos próprios" + botão "Novo atributo" desabilitado com tooltip).
- Ao **salvar com sucesso**, redireciona para `/{id}/edit` (em vez da listagem), onde os atributos já estão liberados.
- Justificativa: atributo guarda FK `categoryId` (só existe após a categoria); categorias filhas já **herdam** atributos do pai, então definir próprios na criação raramente é urgente. Resolve a inconsistência visual sem o custo/risco de uma transação "staged".

### D2 — Layout: coluna única, padrão do sistema
- Form vira **coluna única `max-w-2xl`** com `<section className="... rounded-md border border-border bg-card p-6">` e heading `<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">` (idêntico a `suppliers/_components/supplier-form.tsx`).
- **Remover** o grid 2-colunas, os componentes `Card*` e o **rail** de preview/submit.
- Ações = linha inline de botões no fim do form (`Criar categoria` / `Salvar alterações` + `Cancelar` ghost).
- Estrutura da página (criar e editar): `PageHeader` full-width, depois um container `max-w-2xl flex flex-col gap-6` com o form e, abaixo, a seção de atributos (placeholder bloqueado no criar; painel real no editar).

### D3 — Select de "Categoria pai": indentação em árvore
- Substituir `"— ".repeat(depth)` por **indentação real** (padding-left por `depth`) + guia de árvore sutil (conector `└`).
- Raízes (`depth 0`) em **negrito**; descendentes em peso normal e cor `muted`.
- **Trigger**: ao escolher um filho, exibir o **caminho de nomes** (`Ferramentas Elétricas › Furadeiras`) em vez do nome solto. Reusar `breadcrumbFromPath` (`_lib/category-tree.ts`) com um `Map<slug,name>` montado a partir de `categories`.

### D4 — Contagem de produtos: rollup recursivo (cliente)
- Regra por nó: **recolhido + com filhas** → mostra **total (rollup)** = direto do nó + soma dos rollups das descendentes, com rótulo `· com subcategorias` (só quando rollup ≠ direto). **Expandido + com filhas** → mostra o **direto** com rótulo `diretos`. **Folha** → `N produto(s)`.
- A conta sempre fecha: `direto(pai) + Σ rollup(filhas) = rollup(pai)`.
- Cálculo **no cliente**, sem query extra: `buildCategoryTree` passa a computar `rollupCount` (post-order). A query `listCategoriesForTree` continua devolvendo o **direto** (`productCount`).

### D5 — Slug escondido e congelado
- Slug **não é mais exibido** ao usuário em **nenhuma** das telas (criar e editar). Continua no schema/banco, auto-gerado a partir do nome.
- **Congelado na criação**: ao **renomear**, o slug **não muda** (logo URL e `path` das descendentes ficam estáveis — protege links/SEO da loja, que compartilha o banco). Renomear só altera o `name`.
- Mover a categoria (mudar `parentId`) recalcula `path` via trigger `prevent_category_cycle` — comportamento esperado e mantido.

### D6 — Polimentos (lente /impeccable)
- **P1** Header do **editar**: trocar `Caminho atual: /slug` (código) por **breadcrumb de nomes** (`Ferramentas Elétricas › Furadeiras`) na `description` do `PageHeader`.
- **P2** Form: trocar a pré-visualização de URL (`/slug/slug`) por **"Onde fica: A › B › [Nome digitado]"** (breadcrumb de nomes; atualiza ao digitar o nome e ao trocar o pai).
- **P3** Tabela de atributos: **remover o `def.slug`** em mono sob cada rótulo (Own e Inherited). Por consistência, esconder também o input de slug no `attribute-sheet`/`attribute-form` (criar: auto da label; editar: congelado, não exibido).
- **P4** Empty-states caprichados: criar (Atributos bloqueado) e editar sem atributos próprios (mensagem amigável + ação `Novo atributo` clara, no lugar do texto cinza atual).

## Arquivos afetados

| Arquivo | Mudança |
| --- | --- |
| `categories/_components/category-form.tsx` | Coluna única `max-w-2xl` + `<section>`; remover Card/rail/grid; remover input de slug (manter slug em state, auto no criar, congelado no editar); select de pai com indentação+guia+caminho no trigger; "Onde fica" breadcrumb; redirect pro `/{id}/edit` no sucesso do criar; botões inline. |
| `categories/new/page.tsx` | Wrapper `max-w-2xl`; renderizar seção **Atributos bloqueada** abaixo do form. |
| `categories/[id]/edit/page.tsx` | Wrapper `max-w-2xl`; `PageHeader` com **breadcrumb de nomes**; manter `CategoryAttributesPanel`. |
| `categories/_components/category-attributes-panel.tsx` | Empty-state melhor no "Atributos próprios" (editar). Possível componente reutilizável de empty/locked. |
| `categories/_components/attributes-table.tsx` | Remover `def.slug` (mono) nas duas tabelas. |
| `categories/_components/categories-tree.tsx` | Exibição da contagem por estado (rollup/direto + rótulos). |
| `categories/_lib/category-tree.ts` | `CategoryTreeNode.rollupCount`; computar post-order em `buildCategoryTree`. |
| `categories/_components/attribute-sheet.tsx` / `_lib/attribute-schema.ts` | (P3) esconder slug do atributo no sheet, mantendo auto-gen/congelado. |
| (novo) `categories/_components/attributes-locked.tsx` | Empty-state bloqueado de Atributos para o criar. |

> `actions.ts`, `schema.ts` e os triggers do banco **não mudam** — slug continua persistido; `createCategory`/`updateCategory` seguem enviando slug (auto no criar, inalterado no editar).

## Critérios de aceite

1. **Criar** mostra Nome, Descrição, Categoria pai (indentado), "Onde fica", switch Ativa e a seção **Atributos bloqueada** — **sem** campo de slug, **sem** rail, em coluna única.
2. Salvar uma nova categoria redireciona para a tela de **editar** dela, com a seção de Atributos funcional.
3. **Editar** não mostra slug; header é breadcrumb de nomes; tabela de atributos sem o slug em mono.
4. Select de pai: itens indentados por nível com guia `└`, raízes em negrito; ao escolher um filho o trigger mostra o caminho de nomes.
5. Árvore: pai recolhido mostra o total (`· com subcategorias`); expandido mostra o direto (`diretos`) e a soma fecha; folha mostra `N produto(s)`.
6. Renomear uma categoria **não** altera o slug/URL; mover (trocar pai) recalcula o path normalmente.
7. `bun check-types` e `bun check` (ultracite) limpos; smoke visual em criar/editar/árvore na porta de dev.

## Edge cases / notas

- **Slug inválido por nome atípico** (ex.: nome só com símbolos → slug vazio): como o campo está oculto, mapear o erro de slug do `safeParse` para uma mensagem ligada ao **Nome** no `FormErrorPanel` ("O nome não gera um identificador válido — ajuste o nome").
- **Categoria raiz** no "Onde fica": exibir `Raiz › [Nome]` (ou só `[Nome]`) quando `parentId` é nulo.
- **Atributos do editar salvam de forma independente** (server actions por linha / sheet) — o botão "Salvar alterações" do form cobre só básico+hierarquia. A separação visual (seção própria com ação `Novo atributo`) deixa isso claro; manter.
- Verificação obrigatória pós-mudança de SSR/queries: `bun dev:web` + visitar rotas (CLAUDE.md).
