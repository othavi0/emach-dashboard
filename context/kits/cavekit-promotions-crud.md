---
created: "2026-04-15"
last_edited: "2026-04-15"
---

# Cavekit: Promotions CRUD

## Scope

Full create/read/update/delete interface for promotions under `/dashboard/(inventory)/promotions`. Covers two types — promoções automáticas (`type='promotion'`) e códigos promocionais (`type='promocode'`) — modelados com uma coluna discriminadora na tabela `promotion`. O alvo de cada promoção é N:N via join table `promotion_tool` (substituindo a antiga FK 1:1 `promotion.toolId` que era schema-only sem dados de produção). Admin-only mutations via `requireRole('admin')`. A aba "Promoções" no `InventoryTabs` é habilitada e um novo item "Promoções" é adicionado ao grupo "Estoque" na sidebar. Nenhum arquivo em `packages/ui/src/components/*` é modificado.

**Prerequisites:**
- `cavekit-data-model.md` R3 (promotions schema base) deve existir antes que o delta de schema aqui seja aplicado.
- `cavekit-auth-access.md` R2, R4 (`requireRole` helper e admin guard) devem estar completos.
- `cavekit-navigation-shell.md` R2 (sidebar nav tree) deve estar completo.
- `cavekit-inventory-tools.md` R1 (tools list, para alimentar o combobox de seleção de ferramentas) deve estar completo.

---

## Requirements

### R1: Schema Delta — Join Table, Discriminator Column e Limpeza da FK Antiga
**Description:** O schema de `promotion` em `packages/db/src/schema/promotions.ts` recebe: (1) coluna discriminadora `type`, (2) coluna `code` para promocodes, (3) remoção da coluna `toolId` (era schema-only, sem dados de produção — safe to drop via `db:push`), e (4) uma nova join table `promotionTool` com chave primária composta e FKs com cascade. O arquivo de schema é o único artefato modificado neste requirement — sem mudanças em actions, routes, ou outros arquivos.
**Acceptance Criteria:**
- [ ] `packages/db/src/schema/promotions.ts` exporta `promotion` como `pgTable` com as colunas: `id`, `title`, `description`, `type`, `code`, `discountPct`, `active`, `startsAt`, `endsAt`, `createdAt` — e sem a coluna `toolId`
- [ ] `promotion.type` é `text('type').notNull().default('promotion')`
- [ ] `promotion.code` é `text('code')` nullable (sem `.notNull()`, sem `defaultNow()`)
- [ ] `promotion.discountPct` usa `numeric('discount_pct', { precision: 5, scale: 2 }).notNull()`
- [ ] `promotion.active` é `boolean('active').default(false).notNull()`
- [ ] `packages/db/src/schema/promotions.ts` exporta `promotionTool` como `pgTable` com colunas `promotionId` (text, FK → `promotion.id`, onDelete cascade) e `toolId` (text, FK → `tool.id`, onDelete cascade)
- [ ] `promotionTool` tem chave primária composta `(promotionId, toolId)` usando `primaryKey()` do Drizzle
- [ ] `promotionTool.promotionId` declara `references(() => promotion.id, { onDelete: 'cascade' })`
- [ ] `promotionTool.toolId` declara `references(() => tool.id, { onDelete: 'cascade' })`
- [ ] `packages/db/src/schema/promotions.ts` exporta `promotionToolRelations` com: `promotion` (one) e `tool` (one)
- [ ] `packages/db/src/schema/promotions.ts` exporta `promotionRelations` atualizado com `many(promotionTool)` no lugar de `one(tool)` — sem relação direta com `tool`
- [ ] O arquivo de schema re-exportado em `packages/db/src/schema/index.ts` inclui o novo export `promotionTool` (pode ser adicionado junto com `promotion` na re-exportação existente de `./promotions`)
- [ ] `bun --cwd packages/db run db:push` executa sem erros após as mudanças — a tabela `promotion_tool` aparece no schema público do banco local
- [ ] A coluna `tool_id` NÃO existe na tabela `promotion` após o push
- [ ] A coluna `type` existe na tabela `promotion` após o push com valor default `'promotion'`
- [ ] A coluna `code` existe na tabela `promotion` após o push como nullable
- [ ] `promotion.code` declara `.unique()` na definição Drizzle do campo
- [ ] O objeto `schema` passado para `drizzle(pool, { schema })` em `packages/db/src/index.ts` inclui `promotionTool` além das tabelas já presentes; `promotion` permanece no objeto (schema atualizado, não removido)
**Dependencies:** `cavekit-data-model.md` R3, R6, R7

### R2: Zod Validation Schema para Promotions
**Description:** Um schema Zod de validação de input cobre ambos os tipos de promoção com todas as regras de negócio — via union discriminada em `type`. Todas as mensagens de erro são em pt-BR. O schema é fonte única de verdade, usado tanto no client (form) quanto no server (actions).
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/_components/promotion-schema.ts` existe e exporta um schema Zod nomeado `promotionSchema`
- [ ] O schema valida `title`: string, mínimo 2 chars, máximo 120 chars, trimmed — mensagem de erro mínimo: `"Título deve ter no mínimo 2 caracteres"`, mensagem vazio: `"Título obrigatório"`
- [ ] O schema valida `description`: string opcional, máximo 1000 chars — mensagem erro: `"Descrição não pode ultrapassar 1000 caracteres"`
- [ ] O schema valida `discountPct`: número, exclusivo de 0 (> 0), inclusivo de 100 (≤ 100) — mensagem erro fora do range: `"Desconto deve ser entre 0,01% e 100%"`
- [ ] O schema valida `active`: boolean, obrigatório
- [ ] O schema valida `startsAt`: Date ou null, opcional
- [ ] O schema valida `endsAt`: Date ou null, opcional
- [ ] O schema possui um `.refine` cross-field: quando `startsAt` e `endsAt` ambos definidos, `endsAt > startsAt` — mensagem: `"Data de fim deve ser posterior à data de início"`
- [ ] O schema valida `toolIds`: array de strings, mínimo 1 elemento — mensagem: `"Selecione ao menos uma ferramenta"`
- [ ] O schema valida `type`: union de literais `'promotion' | 'promocode'`
- [ ] Quando `type === 'promocode'`, `code` é string obrigatória, 1–50 chars, ASCII printable — mensagem ausente: `"Código obrigatório para promocode"`, mensagem muito longo: `"Código não pode ultrapassar 50 caracteres"`
- [ ] Quando `type === 'promotion'`, `code` deve ser null ou undefined — mensagem quando presente: `"Promoções automáticas não aceitam código"`
- [ ] A validação de `startsAt >= now` no CREATE é um refine separado (não embutido no schema base) que o formulário de criação aplica — o schema de edição OMITE esse refine para não quebrar registros com `startsAt` passado
- [ ] O arquivo `promotion-schema.ts` NÃO importa de `packages/ui/src/components/*`
**Dependencies:** R1

### R3: Promotions Server Actions
**Description:** Funções server-side de query e mutação expõem operações list/get/create/update/delete para promoções. Todas as mutations requerem role admin. `createPromotion` e `updatePromotion` sincronizam a join table `promotion_tool` dentro de uma transação de banco de dados. Uma guarda de stacking rejeita promoções automáticas conflitantes. Unicidade de `title` é verificada por `type`. Unicidade de `code` é verificada server-side — a verificação server-side é uma camada UX (mensagem amigável em pt-BR antes que a constraint de banco dispare) que coexiste com a constraint `unique()` do banco definida em R1; ambas existem, nenhuma substitui a outra.
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/actions.ts` existe e exporta funções async: `listPromotions`, `getPromotion(id)`, `createPromotion(input)`, `updatePromotion(id, input)`, `deletePromotion(id)`
- [ ] `createPromotion`, `updatePromotion`, `deletePromotion` chamam `requireRole('admin')` como primeira operação
- [ ] `listPromotions` aceita parâmetro opcional `{ type?: 'all' | 'promotion' | 'promocode', search?: string }` e aplica os filtros via Drizzle — `type` filtra pela coluna `promotion.type` (quando `'all'` ou ausente, retorna tudo); `search` faz match parcial case-insensitive em `title`
- [ ] `listPromotions` retorna resultados ordenados por `createdAt DESC`, com `id ASC` como desempate secundário — ordenação determinística para paginação futura
- [ ] `listPromotions` inclui no resultado o array de tools associados (via join em `promotion_tool` → `tool`) para cada promoção, incluindo ao menos `id` e `name` de cada tool
- [ ] `getPromotion(id)` retorna `null` para ids inexistentes — NÃO lança exceção
- [ ] `getPromotion(id)` inclui o array de tools associados (via join) e os campos completos da promoção
- [ ] `createPromotion` e `updatePromotion` validam input contra `promotionSchema` (R2) antes de tocar o banco
- [ ] `createPromotion` executa dentro de `db.transaction()`: insere a row em `promotion`, depois insere todas as rows em `promotion_tool` para os `toolIds` fornecidos
- [ ] `updatePromotion` executa dentro de `db.transaction()`: atualiza a row em `promotion`, depois deleta TODAS as rows existentes em `promotion_tool` para aquele `promotion.id` e re-insere as novas (sync completo dos toolIds)
- [ ] `createPromotion` verifica unicidade de `title` por `type` antes do insert: se já existe uma row com o mesmo `title` e o mesmo `type`, retorna `{ ok: false, error: "Já existe uma promoção com este título" }`
- [ ] `updatePromotion` verifica unicidade de `title` por `type` excluindo o próprio id: se já existe outra row com o mesmo `title` e o mesmo `type`, retorna `{ ok: false, error: "Já existe uma promoção com este título" }`
- [ ] Quando `type === 'promocode'`, `createPromotion` verifica unicidade de `code` (case-sensitive): se já existe uma row com o mesmo `code`, retorna `{ ok: false, error: "Este código já está em uso" }`
- [ ] Quando `type === 'promocode'`, `updatePromotion` verifica unicidade de `code` excluindo o próprio id
- [ ] **Stacking guard** — A guarda de stacking de `createPromotion` e `updatePromotion` define "ativa" como: `type = 'promotion'` AND `active = true` AND (`startsAt IS NULL` OR `startsAt <= now()`) AND (`endsAt IS NULL` OR `endsAt >= now()`). Para cada `toolId` no input, a guarda rejeita se existe qualquer outra linha de `promotion` que satisfaça essa definição de "ativa" E compartilhe aquele `toolId` via `promotion_tool`. Em `updatePromotion`, a própria promoção sendo editada é excluída da checagem (match por id). Em caso de conflito, retorna `{ ok: false, error: "Já existe promoção ativa para a ferramenta {nome}" }` onde `{nome}` é o `name` da primeira tool conflitante encontrada
- [ ] Promoções do tipo `'promocode'` ignoram o stacking guard — podem coexistir livremente com outras promoções
- [ ] `deletePromotion` deleta a row de `promotion`; as rows de `promotion_tool` são removidas automaticamente pela FK cascade. Chama `revalidatePath('/dashboard/promotions')` após deleção bem-sucedida
- [ ] `createPromotion` e `updatePromotion` chamam `revalidatePath('/dashboard/promotions')` após sucesso
- [ ] Todas as mutations retornam `{ ok: true, data? }` ou `{ ok: false, error: string }` — sem throw para o client exceto pelas falhas de `requireRole`
**Dependencies:** R1, R2, `cavekit-auth-access.md` R2

### R4: Promotions List Page
**Description:** Uma dashboard page server-rendered lista todas as promoções em uma tabela com as colunas especificadas, filtros via URL, e empty state.
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/page.tsx` existe como async Server Component (sem `'use client'`)
- [ ] A page lê `searchParams` para `type` (`all|promotion|promocode`, default `all`) e `search` (string livre), e passa esses valores para `listPromotions()`
- [ ] A tabela renderiza as colunas: Tipo (badge), Título, Código, Desconto, Ativa, Janela, Ferramentas (contagem), Ações
- [ ] Coluna **Tipo**: badge "Promoção" quando `type === 'promotion'`, badge "Código" quando `type === 'promocode'`. Os badges seguem as convenções de cores da DESIGN.md seção 4 "Cards & Containers" e "Buttons" — badge "Promoção" usa Warm Sand (secondary), badge "Código" usa Dark Charcoal — implementação visual exata delegada ao DESIGN.md seção 4
- [ ] Coluna **Código**: exibe `promotion.code` quando `type === 'promocode'`; exibe em dash (`—`) quando `type === 'promotion'`
- [ ] Coluna **Desconto**: formatado como `XX,XX%` (locale pt-BR, vírgula decimal)
- [ ] Coluna **Ativa**: badge "Ativa" quando `active = true` E (`startsAt` null OU `startsAt <= now`) E (`endsAt` null OU `endsAt > now`); badge "Inativa" caso contrário. Mesma lógica do stacking guard
- [ ] Coluna **Janela**: `dd/MM/yyyy – dd/MM/yyyy` quando ambos `startsAt` e `endsAt` definidos; `dd/MM/yyyy –` quando só `startsAt`; `– dd/MM/yyyy` quando só `endsAt`; em dash (`—`) quando ambos null
- [ ] Coluna **Ferramentas**: número de tools associadas (contagem do array retornado por `listPromotions`)
- [ ] Coluna **Ações**: botões "Editar" e "Deletar" renderizados APENAS quando `session.data?.user?.role === 'admin'` — para não-admins esses itens DEVEM estar ausentes do DOM (não apenas disabled)
- [ ] Um botão "Nova promoção" no header da page navega para `/dashboard/promotions/new` — renderizado APENAS quando `session.data?.user?.role === 'admin'`
- [ ] Controles de filtro: um `Select` para `type` com opções "Todos", "Promoções", "Códigos"; um input de texto para `search`. Ambos atualizam a URL via router (Client Component para o filtro)
- [ ] Quando `listPromotions` retorna array vazio, a tabela é substituída por empty state com mensagem `"Nenhuma promoção cadastrada"` — quando vazio por filtro ativo: `"Nenhuma promoção encontrada para os filtros aplicados"` com link/botão "Limpar filtros"
- [ ] A page herda automaticamente `InventoryTabs` por estar dentro de `apps/web/src/app/dashboard/(inventory)/` — nenhum layout adicional específico de promotions é criado
**Dependencies:** R3, `cavekit-navigation-shell.md` R6, R7, `cavekit-auth-access.md` R2

### R5: Create Promotion Page e Shared Form Component
**Description:** Uma form page cria nova promoção. O form component compartilhado `promotion-form.tsx` encapsula todos os campos: RadioGroup para tipo, campos base, campo de código condicional, multi-select de ferramentas, date range picker e switch de ativa.
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/new/page.tsx` existe
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/_components/promotion-form.tsx` existe como Client Component (`'use client'`)
- [ ] `promotion-form.tsx` aceita prop `mode: 'create' | 'edit'`
- [ ] Em `mode='create'`, o form renderiza um `RadioGroup` no topo com duas opções: "Promoção automática" (value `'promotion'`) e "Código promocional" (value `'promocode'`). O RadioGroup usa o shadcn `RadioGroup` / `RadioGroupItem` de `@emach/ui`
- [ ] Em `mode='edit'`, o campo `type` é exibido como texto estático read-only (não como RadioGroup editável) — ex.: `<p>Promoção automática</p>` ou equivalente. O campo não é um input e não é submetido no form de edição
- [ ] Campo **Título**: input de texto obrigatório com label "Título"
- [ ] Campo **Descrição**: textarea opcional com label "Descrição"
- [ ] Campo **Desconto (%)**: input numérico com label "Desconto (%)" — aceita valores decimais com vírgula ou ponto
- [ ] Campo **Ativa**: shadcn `Switch` com label "Ativa"
- [ ] Campos **Início** e **Fim**: dois inputs de data (date picker ou date inputs nativos) com labels "Início" e "Fim" — ambos opcionais
- [ ] Campo **Código**: input de texto (1–50 chars) com label "Código" e helper text `"Código usado no checkout para aplicar este desconto"`. Este campo é renderizado APENAS quando `type === 'promocode'`; está ausente do DOM quando `type === 'promotion'`
- [ ] Campo **Ferramentas**: combobox com busca e chips de remoção. Usa shadcn `Popover` + `Command` de `@emach/ui` para o dropdown de seleção. As ferramentas selecionadas aparecem como chips abaixo do combobox com botão de remoção individual. Busca é client-side sobre a lista de tools recebida como prop. As ferramentas disponíveis são passadas como prop `availableTools: { id: string; name: string }[]` pelo server component da page, que obtém a lista via `listTools()` ou query Drizzle direta
- [ ] Ao submeter, `createPromotion(input)` é chamado; em sucesso, o usuário é redirecionado para `/dashboard/promotions` com toast de sucesso: `"Promoção criada com sucesso"`
- [ ] Erros de validação do schema (R2) são exibidos inline abaixo de cada campo em pt-BR
- [ ] Erros retornados pelo server action (R3) — ex. conflito de título, conflito de código, stacking guard — são exibidos como mensagem de erro no topo do form ou via toast de erro
- [ ] Um botão "Cancelar" retorna a `/dashboard/promotions` sem submeter
- [ ] O botão de submit usa label "Criar promoção" em `mode='create'`
- [ ] O form respeita as convenções visuais da DESIGN.md seção 4 "Inputs & Forms" (border warm, focus blue ring, radius 12px) e seção 4 "Buttons" para os botões de submit e cancelar
**Dependencies:** R2, R3, `cavekit-inventory-tools.md` R1

### R6: Edit Promotion Page
**Description:** A form page pré-populada com os dados de uma promoção existente permite atualizá-la. Usa o mesmo `promotion-form.tsx` com `mode='edit'`. O campo `type` é read-only após criação. A validação de `startsAt >= now` é omitida no edit.
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/[id]/edit/page.tsx` existe como async Server Component
- [ ] A page chama `getPromotion(id)` (R3); se retornar `null`, chama `notFound()` do Next.js
- [ ] A page passa `mode='edit'` para `promotion-form.tsx`
- [ ] Todos os campos do form são pré-populados com os valores do registro existente: `title`, `description`, `discountPct`, `active`, `startsAt`, `endsAt`, `code`, `toolIds` (ids das tools associadas)
- [ ] O campo `type` é exibido como texto estático — nenhum `RadioGroup` ou input editável para `type` aparece no DOM em modo edit
- [ ] O schema usado no submit de edição NÃO possui o refine de `startsAt >= now` — uma promoção com `startsAt` já no passado pode ser salva sem erro de validação nesse campo
- [ ] Ao submeter, `updatePromotion(id, input)` é chamado; em sucesso, o usuário é redirecionado para `/dashboard/promotions` com toast de sucesso: `"Promoção atualizada com sucesso"`
- [ ] A page exibe o título da promoção em seu header/title
- [ ] O botão de submit usa label "Salvar alterações" em `mode='edit'`
**Dependencies:** R3, R5

### R7: Delete Promotion Confirmation Dialog
**Description:** A ação de deletar uma promoção exige confirmação explícita via dialog. O padrão segue `delete-branch-dialog.tsx` de `cavekit-branches-crud.md` R6. A FK cascade remove as rows de `promotion_tool` automaticamente.
**Acceptance Criteria:**
- [ ] Arquivo `apps/web/src/app/dashboard/(inventory)/promotions/_components/delete-promotion-dialog.tsx` existe
- [ ] O componente renderiza um shadcn `AlertDialog` com título que inclui o nome da promoção: ex. `"Deletar '{title}'?"`
- [ ] O body do dialog avisa: `"Esta ação não pode ser desfeita."`
- [ ] Botões: "Cancelar" (fecha o dialog) e "Deletar" (chama `deletePromotion(id)` e fecha o dialog)
- [ ] Em sucesso, exibe toast: `"Promoção removida"`
- [ ] Em erro, o dialog exibe a mensagem de erro e permanece aberto
- [ ] O AlertDialog usa shadcn `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction` de `@emach/ui/components/alert-dialog`
- [ ] Os botões seguem as convenções visuais da DESIGN.md seção 4 "Buttons": "Cancelar" usa Warm Sand (secondary), "Deletar" usa Dark Charcoal ou variante de destructive
**Dependencies:** R3

### R8: Inventory Tab Promoções Enabled
**Description:** A aba "Promoções" no `InventoryTabs` (atualmente disabled em `inventory-tabs.tsx:38-46`) é habilitada como link navegável para `/dashboard/promotions`.
**Acceptance Criteria:**
- [ ] Em `apps/web/src/app/dashboard/_components/inventory-tabs.tsx`, o `<TabsTrigger>` de value `"promotions"` NÃO possui mais os atributos `disabled`, `aria-disabled="true"`, `tabIndex={-1}`
- [ ] O `<TabsTrigger>` de value `"promotions"` é renderizado com `nativeButton={false}` e `render={<Link href={PROMOTIONS_HREF}>Promoções</Link>}` — mesmo padrão dos tabs "Ferramentas" e "Estoque" já existentes
- [ ] `const PROMOTIONS_HREF = "/dashboard/promotions" as Route` é definida no topo do arquivo junto com `TOOLS_HREF` e `STOCK_HREF`
- [ ] A função `resolveActiveTab` já retorna `"promotions"` quando `pathname.startsWith("/dashboard/promotions")` (linhas 15-17 do arquivo atual) — nenhuma mudança é necessária nessa função
- [ ] Após a mudança, clicar na aba "Promoções" navega para `/dashboard/promotions` sem redirect ou 404
- [ ] `bun x ultracite check` passa após a modificação do arquivo
**Dependencies:** R4, `cavekit-navigation-shell.md` R6, R7

### R9: Sidebar Nav — Promoções Item Added
**Description:** Um novo item de navegação "Promoções" é adicionado ao grupo "Estoque" na sidebar, posicionado após "Estoque por Filial". Este é um item novo — não existe placeholder disabled para "Promoções" na sidebar atual (diferente do padrão de branches-crud R7 que apenas removeu `disabled: true`).
**Acceptance Criteria:**
- [ ] Em `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, o array `items` do grupo `"Estoque"` em `NAV_GROUPS` contém um novo objeto `{ label: "Promoções", href: "/dashboard/promotions" as Route }` sem a propriedade `disabled`
- [ ] O novo item é posicionado APÓS o item `{ label: "Estoque por Filial", href: "/dashboard/stock" as Route }` no array — terceiro item do grupo "Estoque"
- [ ] O item NÃO possui a propriedade `disabled` — é renderizado como `SidebarMenuButton` ativo (via o branch `else` do render condicional existente em `app-sidebar.tsx`)
- [ ] O label é `"Promoções"` (pt-BR, com acento)
- [ ] A função `isActive` existente em `app-sidebar.tsx` já lida corretamente com o href `/dashboard/promotions` (retorna `true` quando `pathname.startsWith('/dashboard/promotions')`) — nenhuma mudança à função `isActive` é necessária
- [ ] Nenhum novo grupo de sidebar é criado; nenhum outro item de nav é modificado
- [ ] `bun x ultracite check` passa após a modificação do arquivo
**Dependencies:** R4

### R10: All Visible Text in pt-BR
**Description:** Todo texto visível ao usuário nas páginas, dialogs e formulários de promotions está em Português Brasileiro. Nenhum vazamento de inglês nos arquivos de rota.
**Acceptance Criteria:**
- [ ] Labels de form, botões, cabeçalhos de coluna, empty states, mensagens de erro e toasts estão todos em pt-BR
- [ ] Grep por termos de UI em inglês comuns (`"Create"`, `"Save"`, `"Delete"`, `"Name"`, `"Title"`, `"Code"`, `"Active"`, `"Start"`, `"End"`, `"Type"`, `"Discount"`) nos arquivos da rota `apps/web/src/app/dashboard/(inventory)/promotions/` e no arquivo `apps/web/src/app/dashboard/_components/inventory-tabs.tsx` retorna zero matches como texto literal visível (strings em JSX/labels) — identificadores de variáveis e comentários de código podem permanecer em inglês
- [ ] Os badges de tipo usam "Promoção" e "Código" (pt-BR), não "Promotion" e "Promo code"
- [ ] O helper text do campo código exibe exatamente: `"Código usado no checkout para aplicar este desconto"`
- [ ] Os toasts de sucesso estão em pt-BR: `"Promoção criada com sucesso"`, `"Promoção atualizada com sucesso"`, `"Promoção removida"`
- [ ] Tokens visuais (cores, fontes, espaçamentos) dos elementos novos seguem a DESIGN.md seção 3 "Typography Rules" (Anthropic Sans para texto de UI, sem serifa em labels e botões) e seção 4 "Inputs & Forms" (padding, radius, focus ring) — nenhum estilo hardcoded fora dos tokens CSS definidos em `globals.css`
**Dependencies:** R4, R5, R6, R7, R8, R9

### R11: Validation Gate Clean
**Description:** Após a implementação completa, os comandos de validação padrão do projeto passam sem erros.
**Acceptance Criteria:**
- [ ] `bun x ultracite check` sai com código 0
- [ ] `bun --filter=web run build` sai com código 0 com as novas rotas de promotions registradas
- [ ] `bun --cwd packages/db run db:push` sai com código 0 contra o Supabase local rodando
**Dependencies:** R1 – R10

---

## Out of Scope

- Display público de promoção (badge de desconto ou preço riscado em tool list/detail)
- Aplicação do promocode no checkout (kit futuro)
- Usage limits e tracking (max usos, contagem de resgates)
- Customer segmentation (promoção por cliente ou grupo de clientes)
- Bulk import/export de promoções
- Soft delete / archive de promoções
- Alteração de `type` após criação
- Analytics e métricas de promoções
- Auto-geração de strings de código
- Notificações por email na ativação de promoção
- Índice CHECK constraint no banco para enforcement de `type` (enforcement é somente via Zod na aplicação)

---

## Cross-References

- See also: `cavekit-data-model.md` R3 — schema base de `promotion` que é estendido por R1 deste kit; R6 e R7 daquele kit (schema index e createDb) devem incluir o novo `promotionTool`
- See also: `cavekit-auth-access.md` R2, R4 — `requireRole('admin')` usado em R3 (server actions) e R6 (edit page guard)
- See also: `cavekit-navigation-shell.md` R2 — padrão da sidebar estendido por R9; R6 e R7 — `(inventory)` route group e `InventoryTabs` modificados em R8
- See also: `cavekit-inventory-tools.md` R1 — lista de tools (id, name) alimenta o combobox de seleção em R5 e R6
- See also: `DESIGN.md` seção 4 "Buttons" — estilos de badge e botões (Warm Sand secondary, Dark Charcoal, Brand Terracotta para CTAs primários)
- See also: `DESIGN.md` seção 4 "Inputs & Forms" — border warm, focus blue ring (#3898ec), radius 12px para inputs
- See also: `DESIGN.md` seção 4 "Cards & Containers" — radius, borders e shadow conventions para cards e dialogs
- See also: `DESIGN.md` seção 3 "Typography Rules" — Anthropic Sans para UI labels, Anthropic Serif reservado para headlines

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-15 | Initial draft |
| 2026-04-15 | Review-loop iter 2: (a) R1 adiciona AC de schema-object `createDb()` para `promotionTool` e AC de `unique()` DB-level em `promotion.code`; (b) R3 descrição adiciona nota de camada UX sobre verificação server-side de unicidade de `code` coexistindo com constraint DB; (c) R3 stacking guard AC reescrito com definição completa e explícita de "ativa" (window-aware, query única); (d) R3 `listPromotions` ganha AC de ordenação determinística `createdAt DESC, id ASC`; (e) R4 deps adiciona `cavekit-navigation-shell.md` R7 |

---

## Source Traceability Notes

- R1 ACs de push derivam de `cavekit-data-model.md` R9 (padrão de db:push clean) e das decisões de design #2 e #3.
- R2 refines de `startsAt >= now` apenas no CREATE derivam da decisão de design #7 (startsAt past-skip on edit).
- R3 stacking guard lógica de "ativa" deriva da decisão de design #1 (flag + window combinados).
- R8 file path e linha exata (`inventory-tabs.tsx:38-46`) confirmados via leitura direta do arquivo; `resolveActiveTab` já cobre `promotions` nas linhas 15-17.
- R9 "novo item" (não flip de disabled) confirmado via leitura de `app-sidebar.tsx` — `NAV_GROUPS` "Estoque" contém apenas "Ferramentas" e "Estoque por Filial", sem placeholder para "Promoções".
