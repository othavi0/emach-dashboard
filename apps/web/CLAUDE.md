# apps/web — Convenções

Dashboard Next 16 / React 19. Regras gerais (auth invariantes, anti-patterns, gotchas) na raiz.

## Server actions

- Sempre `"use server"` no topo + `await requireCapability(cap)` (ou `requireCurrentSession()`) no início.
- Padrão de retorno: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.
- Validação com Zod `safeParse`. Em catch: `logger.error({ err })` + retornar `{ ok: false, error: "mensagem" }`. Não logar com `console`.
- **Erro de banco no catch:** o drizzle põe o erro real do Postgres em `e.cause` (o `e.message` é só `"Failed query: …"`). **Nunca** detectar por `e.message.includes("foreign key"/"unique"/…)` — não casa e vaza SQL cru no toast. Usar `getPgError(e)` (`src/lib/db-error.ts`) → `{code, message, constraint}`, mapear SQLSTATE (`23503`/`23505`/`P0001`) p/ mensagem amigável; fallback loga + genérica. Detalhe em `packages/db/CLAUDE.md`.
- `revalidatePath` ou `revalidateTag` após mutações.

## Capabilities (`src/lib/permissions.ts`)

**⚠️ Desligado em 2026-05-27 (ADR-0012).** Funções `requireCapability`, `requireCapabilityOrRedirect`, `requireCapabilityWithContext`, `requireCapabilityWithContextOrRedirect`, `can` são **no-op** — validam só sessão + `status='active'`. Matriz original preservada em `src/lib/permissions.disabled.ts` (não-importada).

**O padrão obrigatório em server actions continua sendo `await requireCapability(cap)` ou `requireCapabilityWithContext(cap, ctx)`** — assim, quando religar, todos os endpoints já estão cobertos sem varredura. **Nunca remover essas chamadas; novos endpoints precisam delas.**

Guard-rails mantidos dentro dos no-ops:

- `ensureActive(session)` — bloqueia `pending` / `suspended` (defesa-em-profundidade).
- Self-action guard em `users.suspend` / `users.delete` / `users.update_role`.
- Last super_admin guard — `assertNotLastActiveSuperAdmin` bloqueia rebaixar/suspender/deletar o último `super_admin` `active`.

`requireRole` em `src/lib/session.ts` também é no-op (mesma validação). `ROLE_WEIGHT` permanece (usado em `<RoleBadge>` e formulários).

Bootstrap do primeiro `super_admin` via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`.

Reativar: ver `docs/adr/0012-disable-role-based-gates.md`.

## Imports

- `@/...` → `src/...`.
- **Permitido:** `@emach/db/schema/client` (admin lê dados de cliente — features `customers/`, `reviews/`).
- **Proibido P0:** `@emach/auth/ecommerce` daqui.

## Convenções de UX em forms

- **Slug escondido do usuário (categorias e atributos):** o slug é ruído pra quem usa o admin. **Não renderizar input de slug** em criar nem editar — gerado de `slugifyLabel()` (`dashboard/categories/_lib/attribute-schema.ts`) e **congelado na criação** (renomear NÃO regenera o slug). Protege URLs/path da loja (banco compartilhado): o trigger `prevent_category_cycle` só recalcula path em mudança de `parent_id`/`slug`, então slug congelado = path estável. Erro de validação de slug (nome atípico → slug vazio) é remapeado pro campo **Nome** (`category-form.tsx`).
- **Feedback de erro de validação (sem caixa no topo):** cada campo inválido recebe `aria-invalid={errors.x ? true : undefined}` no controle **+ `<FieldError>{errors.x}</FieldError>`** abaixo (`@/components/field-error` — NUNCA `<p>` cru: o `<FieldError>` marca `data-error="true"`, que é a âncora de scroll do `focusFirstError` quando o controle é custom e não repassa `aria-invalid`, ex: `CepInput`/`UfSelect`/`Select`/`MaskedInput` — esses precisam aceitar/repassar `aria-invalid` OU confiar no `data-error` do `<FieldError>`). No submit com falha, preferir o hook **`useFormErrors<T>()`** (`reportValidationError(zodError)` faz setErrors + toast + foco; `clearErrors()` ao abrir/resetar). Forms que não usam o hook chamam manualmente: `const fe = zodIssuesToFieldErrors<T>(error); setErrors(fe); notify.error(errorToastMessage(fe)); focusFirstError();`. Funções puras (`zodIssuesToFieldErrors`, `errorToastMessage`, `focusFirstError`, tipo `FieldErrorMap`) em `src/lib/form-errors.ts` (sem `"use client"`); o hook `useFormErrors` em `src/lib/use-form-errors.ts`. **`errorToastMessage` recebe o MAPA de erros** (conta as chaves, exclui a chave `_form`), não um número. Issues de `path` vazio (refine de raiz) caem na chave **`_form`** — se o schema tiver refine cross-field, renderizar `<FieldError>{errors._form}</FieldError>` em algum ponto do form. Campos aninhados/array (ex: `businessHours`, `cepRanges`) mostram o erro no nível do bloco (chave `path[0]`). NUNCA caixa de erros no topo nem `toast.error("Revise os campos")` genérico. O wizard de tools navega ao primeiro passo com erro via `firstStepWithError`/`getStepFieldErrors` (`tool-form-steps.ts`).
- **`<LabeledField>` (`@/components/labeled-field`):** encapsula `Label` + controle + `<FieldError>` numa unidade render-prop — é o jeito preferido de fiar campo em forms novos (piloto: suppliers, issue #154). API: `children` recebe `field = { id, "aria-invalid": true | undefined }` e faz o spread no controle, garantindo que `id`/`aria-invalid` cheguem sem o autor lembrar. **Não** passar `id` explícito no controle depois do `{...field}` (último prop vence e descasa do `htmlFor` do Label) — o `id` já vem do spread. Props: `required` (asterisco), `error` (dispara `aria-invalid` + `<FieldError>`), `help` (HelpTooltip ao lado do label, aplica `className="flex items-center gap-1.5"` no Label), `hint` (texto auxiliar abaixo do erro). Limitações: render-prop reduz mas não elimina esquecimento — o autor ainda pode não fazer `{...field}`; não substitui `<FieldError>{errors._form}</FieldError>` de refine cross-field nem cobre campos aninhados/array. Controles custom precisam repassar `aria-invalid` ao DOM, senão o foco do `focusFirstError` cai no fallback `data-error` (scroll). Já repassam (recebem `{...field}` direto): `CepInput`, `UfSelect`, `MaskedInput`, `MoneyInput`, `DiscountInput` (todos terminam num `<input>`), e `Select` via `SelectTrigger`. **Caveat:** `DatePicker` (`@emach/ui`) e o `ToolCombobox` inline de promotions aceitam `aria-invalid`, mas o aplicam num `<button>` de popover — marca o estado mas **não dá foco de texto**; o `focusFirstError` ainda rola até eles via `[aria-invalid="true"]`/`[data-error="true"]`. Switches (controle booleano com layout horizontal próprio) e blocos/listas (`businessHours`, `cepRanges`, `options`, `swatches`, galeria de imagens, `categoryIds`/`primaryCategoryId`) **não** usam `<LabeledField>` — mantêm `<FieldError>` no nível do grupo. Migração completa dos forms em #155.
- **Variantes (tools):** form exige ≥1 `tool_variant`, uma `isDefault` (radio group). Editor em `tools/_components/variants-editor.tsx`.
- **Specs dinâmicas:** `definitionsByCategory[primaryCategoryId]` (resolve cadeia ancestral). Trocar categoria primary com specs preenchidas → `updateTool` devolve `actionResult.warning = "orphan_attributes"`; form pede confirmação antes de deletar.
- **Mínimo de specs ao ativar (`MIN_SPECS_ACTIVE = 4`):** `toolFormSchema.superRefine` exige ≥4 specs **preenchidas** (não só vinculadas) quando `status === "active"` — espelha a regra das 3 imagens; rascunho fica livre. "Preenchida" = `countFilledSpecs` (`tool-schema.ts`): texto não-vazio, número/`valueNumericMax` definido, ou bool. Categorias com poucos atributos: anexar "extras" do catálogo. `spec-fields.tsx` mostra contador "X de 4 preenchidas". Nota: a obrigatoriedade **individual** por atributo (`isRequired` / `buildAttributeValuesSchema`) segue **desligada** (função órfã) — religar é decisão à parte.
- **Markdown na descrição de tool:** `tool.description` é Markdown puro. Render via `<ToolDescription>` (`react-markdown` + `rehype-sanitize` preset `defaultSchema`).
- **Ações destrutivas com reason:** padrão é `DestructiveActionDialog` (`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`). `reasonRequired=true` exige min 10 chars (suspend/delete); `reasonRequired=false` em ações benignas (reactivate). Caller deve usar `useTransition` + `submitting` prop pra cobrir double-submit. Reason persistido em `metadata.reason` via `logUserActivity`.
- **Ajuda contextual (`HelpTooltip`):** `apps/web/src/components/help-tooltip.tsx` — `ⓘ` dentro do `<Label>`/`<h3>` (via `className="flex items-center gap-1.5"`). Union: `text` (curto, desambiguação) ou `title+body+example` (rico, com exemplo). O rico usa `HoverCard`/`PreviewCard` do base-ui (fecha no Esc nativo — WCAG 1.4.13 ok). Converter `<p>` verboso em tooltip; **manter visível** caveat comportamental (ex: faixas de CEP "não restringem pedidos"). Em uso: tools (identity), branches, suppliers, categories/attributes.
- **Atributos órfãos ao trocar categoria principal (tools, modo create):** `toggleCategory` **não** reseta `attributeAssignments` ao mudar a principal — decisão consciente (#121/#122) pra não destruir trabalho do usuário. Atributos que deixaram de ser sugeridos viram badge `extra · não herdado` em `attribute-assignments-editor.tsx` (continuam marcados/submetidos, removíveis pelo `X`). **Não** re-adicionar `useEffect` de reset em create; o caminho destrutivo explícito existe só no edit (`updateTool` → `warning: "orphan_attributes"`).
- **Wizard ↔ edit de tool — fonte única:** `tool-sections.ts` (`TOOL_SECTION_COMPONENTS: ToolStepId → Component`) e `use-tool-submit.ts` (`useToolSubmit({ mode })`) são compartilhados por `ToolWizard` e `ToolEditView`. Adicionar campo/passo: mexer só no map + schema, nunca duplicar. Stepper-only state (`active`/`next`/`stepDone`) fica no wizard. `STEP_FIELDS` tem assert type-level de exaustividade — campo `required` novo no schema que não entre nele quebra o build.

## Entity detail / CRUD pattern (canônico: `DESIGN.md` §4)

Default ao construir detalhe de entidade (`/dashboard/<recurso>/[id]`) ou listagem de CRUD. Referência: filiais (`branches/[id]`). Adaptar ao domínio é permitido; o esqueleto é fixo. Novas entidades seguem; existentes migram aos poucos.

- **Detalhe:** `EntityIdentityHeader` + `EntityTabs` (sincroniza `?tab=`). A ação primária (Editar / Vincular / Adicionar) vive no `actions` do header e **muda conforme `sp.tab`** — o Server Component decide qual injetar. **Nunca** pôr essa ação no corpo da tab nem fixa em todas as abas.
- **Cards de listagem:** reusar um dos 4 arquétipos (stat / media / identity / entity — `DESIGN.md` §4), não inventar shell novo. Footer **edge-to-edge** (`border-t` até a borda; `-mx-4 px-4` quando o card tem padding `p-4`).
- **Mutação:** editar simples = drawer (`Sheet` via `?edit=1`); criar ou form complexo (muitos campos, ex: tool) = página (`/new`); destrutivo = `AlertDialog` controlado (`open` state, `e.preventDefault()` no action + fechar no sucesso, `stopPropagation` se dentro de card clicável). Botão destrutivo **nunca** `variant="default"` (coral) — usar `destructive`/`outline`/`ghost`.
- **Badge de contagem em tab:** `secondary` (`TabsCountBadge` no Tabs base; `secondary rounded-md` no `EntityTabs`). Preferir count vindo de KPI agregado (ex: `kpis.teamSize`) a carregar a coleção inteira só pra `.length` — assim a tab carrega lazy.
- **Cards de listagem não têm ação de editar inline.** Editar é sempre via detalhe da entidade (drawer `?edit=1`). Atalhos de navegação (ex: ver estoque) são permitidos como `<Link>` ícone `ghost` com `border border-border bg-muted`.
- **Scroll infinito (padrão do sistema):** toda listagem usa `useInfiniteList` + `<InfiniteSentinel>` (`src/components/infinite-sentinel.tsx`). Page size global `BATCH_SIZE = 20` (`src/lib/infinite.ts`), keyset cursor (`src/lib/cursor.ts`), auto-load 200px antes do fim. O sentinel **não** exibe "fim da lista" (retorna `null` quando `!hasMore`); loading mostra `skeleton` (prop opcional `ReactNode`) ou spinner discreto; botão "Tentar de novo" só em erro. Tabs internas de entidade que listam coleções (ex: Pedidos) seguem o mesmo padrão e carregam **lazy** (só quando `sp.tab` corresponde).
- **Verificação:** `check-types` NÃO pega import de hook client (`useRouter`/`useState`) em Server Component — quebra só em runtime. Smoke visual no browser após mexer em componente de página/tab.

## Imagens

Helper genérico Storage em `src/lib/storage.ts` (upload/delete/signedUrl para bucket público e privado). Upload de imagem de tool: `uploadToolImage()` em `tools/_components/image-actions.ts`. Anexos de pedido (bucket privado): `orders/_components/attachment-actions.ts` — reaproveitar pattern.

Thumbs Supabase: `<img>` puro **com `// biome-ignore lint/performance/noImgElement: Supabase public URL` documentado**. Demais: `<Image>` do Next.

## Datas de exibição

Formatar timestamps **sempre** via `src/lib/format/datetime.ts` (`formatDate`, `formatDateTime`, `formatTime`, `formatDayTime`, `isSameDay`, …) — fuso fixo `America/Sao_Paulo`. **Nunca** `new Intl.DateTimeFormat`/`toLocale*`/`date-fns format` cru em componente: sem `timeZone` fixo, server (Vercel UTC) e client (BR) divergem → hydration mismatch perto da meia-noite (issue #137). Idem `Date.toDateString()` pra comparar dia → usar `isSameDay`. Exceções: moeda/número (`toLocaleString` ok) e colunas date-only (`::date` → `localDate`, ver `packages/db/CLAUDE.md`).

## Auditoria de mutações DB

Ao inserir em `stockMovement`, `orderStatusHistory`, `clientAuditLog`, `supplierAuditLog`, `userActivityLog`:
- Admin user → `actorType: "user"` + a FK do ator = `session.user.id`. **Atenção ao nome da coluna:** `stockMovement` usa `actorId`; **todas as outras** (`orderStatusHistory`, `clientAuditLog`, `supplierAuditLog`, `userActivityLog`) usam `actorUserId`.
- Seed/script/mutação automática (inclui escritas do app e-commerce) → `actorType: "system"` (default), FK do ator `null`.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

`stockMovement.variantId` (não mais `toolId`) — toda movimentação por variante. Pra revalidar paths do tool-pai após `adjustStock`: `SELECT toolId FROM tool_variant WHERE id = $variantId` antes de `revalidatePath`.

## Orders — branch-scoping fail-safe

Mutações de pedido (status, anexos) passam por `lockOrderAndAuthorize(tx, cap, orderId)` em `dashboard/orders/actions.ts`: `SELECT ... FOR UPDATE` **e** capability check no mesmo lock — non-`super_admin` só age sobre pedidos da própria filial. Toda transição escreve em `orderStatusHistory`; `canceled`/`refunded`/`returned` exigem `reason`, `preparing` exige `branchId`.

## Cron jobs (Vercel Cron)

Route handlers em `src/app/api/cron/*` autenticam via header `Authorization: Bearer ${env.CRON_SECRET}`. Vercel injeta automaticamente quando o cron declarado em `apps/web/vercel.json` dispara. `CRON_SECRET` é env obrigatória (32+ chars) validada em `packages/env/src/server.ts`.

**Convenções:**

- `export const dynamic = "force-dynamic"` + `runtime = "nodejs"` no topo do handler.
- Authorize ANTES de qualquer query: `if (authHeader !== \`Bearer \${env.CRON_SECRET}\`) return 401`.
- Processar item-a-item em transações separadas com `FOR UPDATE` + re-check de estado (idempotência contra disparo concorrente + race com ecommerce).
- `actorType: 'system'`, `actorUserId: null` em writes — CHECK `actor_coherence` no DB exige.
- Logar erros por item via `logger.error("jobName", { id, err })` sem abortar o batch.

**Gerar secret:** `openssl rand -hex 32`. Em produção: configurar em **Vercel > Project Settings > Environment Variables (Production)**. Vercel Cron só dispara em deploys de produção (não preview).

**Job ativo:** `/api/cron/cancel-stale-orders` — diário 04:00 UTC; cancela `pending_payment` com `createdAt < now() - 72h`.

## Cache (Next 16)

`cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

**Dedup request-scoped sem Cache Components:** fetcher chamado em mais de um lugar no mesmo render (ex: `fetchDashboardCounts` no `layout.tsx` para badges **e** na `page.tsx` para o painel) → envolver em `cache()` do `react`. Dedupa a query no mesmo request sem precisar ligar `use cache`/Cache Components. Só funciona para a **mesma** função com os mesmos args; queries diferentes que contam o mesmo dado não deduplicam (ver issue de extrair counts num único fetch).

## Listas drag-reorder (dnd-kit)

`@dnd-kit/core` v6 gera os ids dos elementos de a11y (`aria-describedby="DndDescribedBy-N"`) com um **contador não-determinístico** → diverge entre SSR e cliente e quebra a hidratação (mostra como "1 Issue" no overlay do Next; pode remontar os handlers de drag logo após o load e deixar o primeiro reorder instável). **Sempre passar um `id` estável em cada `<DndContext>`** (derivado de dado, ex: `id={\`cat-sortable-${parentId ?? "root"}\`}`). Canônico: `dashboard/categories/_components/categories-tree.tsx`.

## Smoke run-time

`tsc` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema ou queries SSR: `bun dev:web` + visitar rotas afetadas. Stack trace via `nextjs_call <port> get_errors` (MCP `next-devtools`).

## Testes

`bun --cwd apps/web test` (vitest, `environment: node`). Suíte verde (30 arquivos / 183 testes em 2026-06-07).

- **`server-only` em testes:** módulos que importam `server-only` (boundary do Next, ex: `src/lib/activity.ts`) são testáveis porque `vitest.config.ts` faz `resolve.alias['server-only'] → src/__mocks__/server-only.ts` (stub vazio). Ao adicionar teste para código que importa `server-only`, não precisa de `vi.mock` — o alias já resolve.
- Mock de `@emach/db` por `vi.hoisted` + `vi.mock` (ver `__tests__/activity.test.ts` como referência de como mockar o query builder do Drizzle).
