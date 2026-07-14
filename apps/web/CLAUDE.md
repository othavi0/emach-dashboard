# apps/web — Convenções

Dashboard Next 16 / React 19. Regras gerais (auth invariantes, anti-patterns, gotchas) na raiz.

## Server actions

- Sempre `"use server"` no topo + `await requireCapability(cap)` (ou `requireCurrentSession()`) no início.
- Padrão de retorno: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.
- Validação com Zod `safeParse`. Em catch: `logger.error({ err })` + retornar `{ ok: false, error: "mensagem" }`. Não logar com `console`.
- **Erro de banco no catch:** o drizzle põe o erro real do Postgres em `e.cause` (o `e.message` é só `"Failed query: …"`). **Nunca** detectar por `e.message.includes("foreign key"/"unique"/…)` — não casa e vaza SQL cru no toast. Usar `getPgError(e)` (`src/lib/db-error.ts`) → `{code, message, constraint}`, mapear SQLSTATE (`23503`/`23505`/`P0001`) p/ mensagem amigável; fallback loga + genérica. Detalhe em `packages/db/CLAUDE.md`.
- `revalidatePath` ou `revalidateTag` após mutações.

## Capabilities (`src/lib/permissions.ts`)

**Religado em 2026-06-15 (ADR-0016, substitui 0012).** `requireCapability`, `requireCapabilityOrRedirect`, `requireCapabilityWithContext`, `requireCapabilityWithContextOrRedirect`, `can` **enforçam** a matriz de 3 níveis (`super_admin`/`admin`/`user`). `requireCapabilityWithContext` valida tb `targetBranchIds ⊆ escopo` (Branch-scoping). Snapshot da matriz antiga (4 níveis, incluía `manager`) em `src/lib/permissions.disabled.ts` (não-importada, `@ts-nocheck`, só histórico). O valor `manager` foi removido do enum DB e de todo o código vivo em 2026-06-16 (era alias de admin — ver ADR-0016).

**O padrão obrigatório em server actions continua sendo `await requireCapability(cap)` ou `requireCapabilityWithContext(cap, ctx)`** — assim, quando religar, todos os endpoints já estão cobertos sem varredura. **Nunca remover essas chamadas; novos endpoints precisam delas.**

**Inclui as READ actions** (`fetch*`/`list*`/`get*` exportadas de um `actions.ts`): são endpoints POST chamáveis por qualquer sessão, **não só as mutations**. O audit de 2026-06 achou ~15 reads sem guard (branches/suppliers/stock/categories) e adicionou `<recurso>.read`. **Exceção:** funções em `data.ts`/`*-data.ts` são `server-only` (não-endpoints, guardadas pelo caller) — não precisam de guard próprio. Ver ADR-0018.

Guard-rails mantidos dentro dos no-ops:

- `ensureActive(session)` — bloqueia `pending` / `suspended` (defesa-em-profundidade).
- Self-action guard em `users.suspend` / `users.delete` / `users.update_role`.
- Last super_admin guard — `assertNotLastActiveSuperAdmin` bloqueia rebaixar/suspender/deletar o último `super_admin` `active`.

`requireRole` em `src/lib/session.ts` enforça via `ROLE_WEIGHT` (super_admin:3 > admin:2 > user:1). `getUserBranchScope` em `src/lib/branch-scope.ts` retorna o escopo real (`{kind:"all"}` p/ super_admin; `{kind:"scoped",branchIds,includeUnassigned}` p/ admin/user — `includeUnassigned` = ver Pedido na triagem, só admin). **Fail-closed**: sem `user_branch` → vê nada.

Bootstrap do primeiro `super_admin` via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`.

Modelo completo: `docs/adr/0016-religacao-gates-3-niveis-filial.md` + `docs/superpowers/specs/2026-06-15-niveis-autorizacao-design.md`. **Pré-produção:** popular `user_branch` (todo admin/user precisa de ≥1 filial) + smoke multi-role.

### Overrides por usuário (ADR-0017)

Catálogo em **`src/lib/capabilities.ts`** (metadata `group/resource/action/defaultRoles`; a contagem cresce — não citar número fixo em docs). Nova feature = 1 entrada → aparece na UI e nasce deny-by-default para roles fora de `defaultRoles`. `Capability` type derivado das keys (sem pgEnum).

- **`can(session, cap)`** — **async**, resolve role ± overrides via `getUserCapabilities(session)` (request-cache, `cache()` do React, mesmo padrão de `getUserBranchScope`). Todos os callsites foram migrados para `await can(...)`.
- **`roleHasCapability(role, cap)`** — sync, apenas o default do role (sem overrides); usar quando override não é relevante (ex: UI que exibe o default do role como sugestão).
- Overrides persistidos em `user_capability_override` (tabela nova; tabela vazia = no-op = comportamento idêntico ao role puro).
- **`setUserCapability`** (`dashboard/users/[id]/permissions/actions.ts`) — teto: `permissions.manage` + hierarquia + branch-scope do alvo + anti-escalada só em `grant` (ator não concede cap que não possui; `revoke`/`inherit` livres — apenas reduzem/resetam acesso de alvo gerenciável). Self-management bloqueado (`permissions.manage` ∈ `SELF_RESTRICTED`). Toda operação auditada em `userActivityLog`.
- UI: aba "Permissões" em `users/[id]` (grid tri-state Herdar/Conceder/Revogar), gated por `permissions.manage`.

## Imports

- `@/...` → `src/...`.
- **Permitido:** `@emach/db/schema/client` (admin lê dados de cliente — features `customers/`, `reviews/`).
- **Proibido P0:** `@emach/auth/ecommerce` daqui.
- **Client Component nunca importa fn de módulo `server-only`/`@emach/db`.** Importar uma função de data-fetching `server-only` (que puxa `@emach/db`) num `"use client"` arrasta o driver pg pro bundle do browser → build quebra com `Module not found: Can't resolve 'net'/'tls'`. `check-types` **não pega** (só o build). Padrão: client chama uma **server action** (`"use server"`) que envolve a query; **tipos** podem vir do módulo server-only via `import type` (apagado no compile). Canônico: `stock/movements/actions.ts` (`fetchLedgerPageAction`) envolvendo `movements-data.ts`. Incidente do ledger (ADR-0015).

## Convenções de UX em forms

- **Slug escondido do usuário (categorias e atributos):** o slug é ruído pra quem usa o admin. **Não renderizar input de slug** em criar nem editar — gerado de `slugifyLabel()` (`dashboard/categories/_lib/attribute-schema.ts`) e **congelado na criação** (renomear NÃO regenera o slug). Protege URLs/path da loja (banco compartilhado): o trigger `prevent_category_cycle` só recalcula path em mudança de `parent_id`/`slug`, então slug congelado = path estável. Erro de validação de slug (nome atípico → slug vazio) é remapeado pro campo **Nome** (`category-form.tsx`).
- **Feedback de erro de validação (sem caixa no topo):** cada campo inválido recebe `aria-invalid={errors.x ? true : undefined}` no controle **+ `<FieldError>{errors.x}</FieldError>`** abaixo (`@/components/field-error` — NUNCA `<p>` cru: o `<FieldError>` marca `data-error="true"`, que é a âncora de scroll do `focusFirstError` quando o controle é custom e não repassa `aria-invalid`, ex: `CepInput`/`UfSelect`/`Select`/`MaskedInput` — esses precisam aceitar/repassar `aria-invalid` OU confiar no `data-error` do `<FieldError>`). No submit com falha, preferir o hook **`useFormErrors<T>()`** (`reportValidationError(zodError)` faz setErrors + toast + foco; `clearErrors()` ao abrir/resetar). Forms que não usam o hook chamam manualmente: `const fe = zodIssuesToFieldErrors<T>(error); setErrors(fe); notify.error(errorToastMessage(fe)); focusFirstError();`. Funções puras (`zodIssuesToFieldErrors`, `errorToastMessage`, `focusFirstError`, tipo `FieldErrorMap`) em `src/lib/form-errors.ts` (sem `"use client"`); o hook `useFormErrors` em `src/lib/use-form-errors.ts`. **`errorToastMessage` recebe o MAPA de erros** (conta as chaves, exclui a chave `_form`), não um número. Issues de `path` vazio (refine de raiz) caem na chave **`_form`** — se o schema tiver refine cross-field, renderizar `<FieldError>{errors._form}</FieldError>` em algum ponto do form. Campos aninhados/array (ex: `businessHours`, `cepRanges`) mostram o erro no nível do bloco (chave `path[0]`). NUNCA caixa de erros no topo nem `toast.error("Revise os campos")` genérico. O wizard de tools navega ao primeiro passo com erro via `firstStepWithError`/`getStepFieldErrors` (`tool-form-steps.ts`). **Enforcement no CI:** a regra ast-grep `raw-validation-error` (`tooling/ast-grep/rules/`) falha o CI se um `{errors.X}` for renderizado num `<p|span|div text-destructive>` cru fora de `<FieldError>` (workflow `ci.yml`; roda local com `bun guard:forms`). Exceção legítima pontual: comentário `// ast-grep-ignore: raw-validation-error <motivo>` na linha.
- **`<LabeledField>` (`@/components/labeled-field`):** encapsula `Label` + controle + `<FieldError>` numa unidade render-prop — é o jeito preferido de fiar campo em forms novos (piloto: suppliers, issue #154). API: `children` recebe `field = { id, "aria-invalid": true | undefined }` e faz o spread no controle, garantindo que `id`/`aria-invalid` cheguem sem o autor lembrar. **Não** passar `id` explícito no controle depois do `{...field}` (último prop vence e descasa do `htmlFor` do Label) — o `id` já vem do spread. Props: `required` (asterisco), `error` (dispara `aria-invalid` + `<FieldError>`), `help` (HelpTooltip ao lado do label, aplica `className="flex items-center gap-1.5"` no Label), `hint` (texto auxiliar abaixo do erro). Limitações: render-prop reduz mas não elimina esquecimento — o autor ainda pode não fazer `{...field}`; não substitui `<FieldError>{errors._form}</FieldError>` de refine cross-field nem cobre campos aninhados/array. Controles custom precisam repassar `aria-invalid` ao DOM, senão o foco do `focusFirstError` cai no fallback `data-error` (scroll). Já repassam (recebem `{...field}` direto): `CepInput`, `UfSelect`, `MaskedInput`, `MoneyInput`, `DiscountInput` (todos terminam num `<input>`), e `Select` via `SelectTrigger`. **Caveat:** `DatePicker` (`@emach/ui`) e o `ToolCombobox` inline de promotions aceitam `aria-invalid`, mas o aplicam num `<button>` de popover — marca o estado mas **não dá foco de texto**; o `focusFirstError` ainda rola até eles via `[aria-invalid="true"]`/`[data-error="true"]`. Switches (controle booleano com layout horizontal próprio) e blocos/listas (`businessHours`, `cepRanges`, `options`, `swatches`, galeria de imagens, `categoryIds`/`primaryCategoryId`) **não** usam `<LabeledField>` — mantêm `<FieldError>` no nível do grupo. Migração completa dos forms em #155.
- **Variantes (tools):** form exige ≥1 `tool_variant`, uma `isDefault` (radio group). Editor em `tools/_components/variants-editor.tsx`.
- **Specs dinâmicas:** `definitionsByCategory[primaryCategoryId]` (resolve cadeia ancestral). Trocar categoria primary com specs preenchidas → `updateTool` devolve `actionResult.warning = "orphan_attributes"`; form pede confirmação antes de deletar.
- **Régua de ativação transicional (`MIN_SPECS_ACTIVE = 4`, `MIN_IMAGES_ACTIVE = 3`, NCM) — #290:** os requisitos de ativação (≥4 specs preenchidas, ≥3 imagens, NCM) **não** vivem mais no `superRefine` incondicional. Foram extraídos para `activationRequirementIssues(data)` (`tool-schema.ts`) e valem **só na transição para `active`** — `shouldEnforceActivation(currentStatus, initialStatus)` = `current==='active' && initial!=='active'`. Editar um tool **já-active** NÃO re-valida a régua (não aprisiona edição não relacionada). Aplicação: client via `parseToolForm(values, {enforceActivation})` (`use-tool-submit.ts` computa por modo; wizard usa `initialStatus="draft"`); server como backstop autoritativo em `createTool` (`status==='active'`) e `updateTool` (`prev.status!=='active' && status==='active'`, lê `prev.status` fresco do DB). O `superRefine` mantém só invariantes **estruturais** (vídeo+poster, primary∈categorias, 1 default, barcodes únicos, values⊆assignments) — esses sempre validam. "Preenchida" = `countFilledSpecs` (texto não-vazio, número/`valueNumericMax` definido, ou bool). `spec-fields.tsx` mostra contador soft "X de 4"; o aviso de categoria incompleta (`identity-fields.tsx`) é informativo e **não** carrega `data-error`. Seed: todo tool `active` nasce dentro da régua e `packages/db/scripts/seed/verify.ts` falha se algum violar. Obrigatoriedade **individual** por atributo (`isRequired`) segue **desligada** (função órfã) — religar é decisão à parte.
- **Markdown na descrição de tool:** `tool.description` é Markdown puro. Render via `<ToolDescription>` (`react-markdown` + `rehype-sanitize` preset `defaultSchema`).
- **Ações destrutivas com reason:** padrão é `DestructiveActionDialog` (`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`). `reasonRequired=true` exige min 10 chars (suspend/delete); `reasonRequired=false` em ações benignas (reactivate). Caller deve usar `useTransition` + `submitting` prop pra cobrir double-submit. Reason persistido em `metadata.reason` via `logUserActivity`.
- **Ajuda contextual (`HelpTooltip`):** `apps/web/src/components/help-tooltip.tsx` — `ⓘ` dentro do `<Label>`/`<h3>` (via `className="flex items-center gap-1.5"`). Union: `text` (curto, desambiguação) ou `title+body+example` (rico, com exemplo). O rico usa `HoverCard`/`PreviewCard` do base-ui (fecha no Esc nativo — WCAG 1.4.13 ok). Converter `<p>` verboso em tooltip; **manter visível** caveat comportamental (ex: faixas de CEP "não restringem pedidos"). Em uso: tools (identity), branches, suppliers, categories/attributes.
- **Atributos órfãos ao trocar categoria principal (tools, modo create):** `toggleCategory` **não** reseta `attributeAssignments` ao mudar a principal — decisão consciente (#121/#122) pra não destruir trabalho do usuário. Atributos que deixaram de ser sugeridos viram badge `extra · não herdado` em `attribute-assignments-editor.tsx` (continuam marcados/submetidos, removíveis pelo `X`). **Não** re-adicionar `useEffect` de reset em create; o caminho destrutivo explícito existe só no edit (`updateTool` → `warning: "orphan_attributes"`).
- **Wizard ↔ edit de tool — fonte única:** `tool-sections.ts` (`TOOL_SECTION_COMPONENTS: ToolStepId → Component`) e `use-tool-submit.ts` (`useToolSubmit({ mode })`) são compartilhados por `ToolWizard` e `ToolEditView`. Adicionar campo/passo: mexer só no map + schema, nunca duplicar. Stepper-only state (`active`/`next`/`stepDone`) fica no wizard. `STEP_FIELDS` tem assert type-level de exaustividade — campo `required` novo no schema que não entre nele quebra o build.

## Entity detail / CRUD pattern (canônico: `DESIGN.md` §4)

Default ao construir detalhe de entidade (`/dashboard/<recurso>/[id]`) ou listagem de CRUD. Referência: filiais (`branches/[id]`). Adaptar ao domínio é permitido; o esqueleto é fixo. Novas entidades seguem; existentes migram aos poucos.

- **Detalhe:** `EntityIdentityHeader` + `EntityClientTabs` (padrão canônico das 9 páginas de detalhe — tools, promotions, suppliers, categories, shipping/carriers, orders, branches, users, customers; PR #259 piloto, #264 shell compartilhado, #275 fundação, ADR-0024). Troca de tab é **100% client-side** (`window.history.replaceState`, **nunca** `router.replace` — não toca o servidor); `initialTab` clampado no server e resincronizado a partir da URL no mount/`popstate`. Contrato eager/lazy: **eager** = dado que já vem do `detail` (renderiza uma vez como Server Component, prop pro shell); **lazy** = dado pesado que não vem no detail, buscado sob demanda via `"use server"` action + `requireCapability` própria na 1ª ativação, via `LazyTab` (skeleton + error/retry). A ação primária do header (Editar / Vincular / Adicionar) é reativa no cliente via `useActiveTab` — **nunca** decidida por `sp.tab` no detalhe. **Nunca** pôr essa ação no corpo da tab nem fixa em todas as abas. `EntityTabs` (server-nav, sincroniza `?tab=` via `router.replace`) só para páginas **não-detalhe** com tabs (`shipping/page.tsx`, `site/settings/page.tsx`) e tabs de navegação com `href`.
- **Cards de listagem:** reusar um dos 4 arquétipos (stat / media / identity / entity — `DESIGN.md` §4), não inventar shell novo. Footer **edge-to-edge** (`border-t` até a borda; `-mx-4 px-4` quando o card tem padding `p-4`).
- **Mutação:** editar simples = drawer (`Sheet` via `?edit=1`); criar ou form complexo (muitos campos, ex: tool) = página (`/new`); destrutivo = `AlertDialog` controlado (`open` state, `e.preventDefault()` no action + fechar no sucesso, `stopPropagation` se dentro de card clicável). Botão destrutivo **nunca** `variant="default"` (coral) — usar `destructive`/`outline`/`ghost`.
- **Badge de contagem em tab:** `secondary` (`TabsCountBadge` no Tabs base; `secondary rounded-md` no `EntityClientTabs`/`EntityTabs`). Preferir count vindo de KPI agregado (ex: `kpis.teamSize`) a carregar a coleção inteira só pra `.length` — assim a tab carrega lazy.
- **Cards de listagem não têm ação de editar inline.** Editar é sempre via detalhe da entidade (drawer `?edit=1`). Atalhos de navegação (ex: ver estoque) são permitidos como `<Link>` ícone `ghost` com `border border-border bg-muted`.
- **Scroll infinito (padrão do sistema):** toda listagem usa `useInfiniteList` + `<InfiniteSentinel>` (`src/components/infinite-sentinel.tsx`). Page size global `BATCH_SIZE = 20` (`src/lib/infinite.ts`), keyset cursor (`src/lib/cursor.ts`), auto-load 200px antes do fim. O sentinel **não** exibe "fim da lista" (retorna `null` quando `!hasMore`); loading mostra `skeleton` (prop opcional `ReactNode`) ou spinner discreto; botão "Tentar de novo" só em erro. Tabs internas de entidade que listam coleções (ex: Pedidos) seguem o mesmo padrão e, quando o dado é pesado/não vem no detail, carregam **lazy** via `LazyTab`/`"use server"` action (não mais gated por `sp.tab`).
- **Gotcha herdado — `router.refresh()` dentro de tab lazy não re-busca a própria tab:** uma mutação disparada de dentro de uma tab lazy (`LazyTab`) que chama `router.refresh()` atualiza as props vindas do servidor (ex: `detail` das tabs eager), mas **não** re-dispara o fetch da tab lazy já ativada — o `useEffect` do loader depende só de `[attempt]` (retry manual), não das props. Não é regressão da generalização, é comportamento do `LazyTab` desde o piloto (ver ADR-0024).
- **Verificação:** `check-types` NÃO pega import de hook client (`useRouter`/`useState`) em Server Component — quebra só em runtime. Smoke visual no browser após mexer em componente de página/tab.

## Imagens

Helper genérico Storage em `src/lib/storage.ts` (upload/delete/signedUrl para bucket público e privado). Upload de imagem de tool: `uploadToolImage()` em `tools/_components/image-actions.ts`. Anexos de pedido (bucket privado): `orders/_components/attachment-actions.ts` — reaproveitar pattern.

Thumbs Supabase: `<img>` puro **com `// biome-ignore lint/performance/noImgElement: Supabase public URL` documentado**. Demais: `<Image>` do Next.

## Datas de exibição

Formatar timestamps **sempre** via `src/lib/format/datetime.ts` (`formatDate`, `formatDateTime`, `formatTime`, `formatDayTime`, `isSameDay`, …) — fuso fixo `America/Sao_Paulo`. **Nunca** `new Intl.DateTimeFormat`/`toLocale*`/`date-fns format` cru em componente: sem `timeZone` fixo, server (Vercel UTC) e client (BR) divergem → hydration mismatch perto da meia-noite (issue #137). Idem `Date.toDateString()` pra comparar dia → usar `isSameDay`. Exceções: moeda/número (`toLocaleString` ok) e colunas date-only (`::date` → `localDate`, ver `packages/db/CLAUDE.md`).

## Medidas numéricas (peso, dimensões)

**Nunca renderizar a string crua de coluna `numeric` do Postgres em UI pt-BR.** Drizzle devolve `numeric` como string no padrão US (ponto decimal): `weightKg` 5 vira `"5.000"`. Em pt-BR o ponto é separador de **milhar**, então `"5.000 kg"` (5 kg) é lido como **cinco mil kg** — parece bug de "conversão ×1000", mas o dado está certo; o erro é de locale na exibição. Formatar **sempre** via `formatMeasure()` (`src/lib/format/number.ts`): converte pra número e aplica `toLocaleString("pt-BR")` (vírgula decimal, sem zeros supérfluos) → `"5 kg"`, `"28 × 15 × 4 cm"`. O form de edição (`MaskedInput` + `decimalMask`) já usa vírgula; specs numéricas de atributo passam por `Number()` antes. O ponto a vigiar é qualquer JSX novo que interpole `tool.weightKg`/`*Cm` direto.

## Auditoria de mutações DB

Ao inserir em `stockMovement`, `orderStatusHistory`, `clientAuditLog`, `supplierAuditLog`, `userActivityLog`:
- Admin user → `actorType: "user"` + a FK do ator = `session.user.id`. **Atenção ao nome da coluna:** `stockMovement` usa `actorId`; **todas as outras** (`orderStatusHistory`, `clientAuditLog`, `supplierAuditLog`, `userActivityLog`) usam `actorUserId`.
- Seed/script/mutação automática (inclui escritas do app e-commerce) → `actorType: "system"` (default), FK do ator `null`.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

`stockMovement.variantId` (não mais `toolId`) — toda movimentação por variante. Pra revalidar paths do tool-pai após `adjustStock`: `SELECT toolId FROM tool_variant WHERE id = $variantId` antes de `revalidatePath`.

## Orders — filter-builder único (redesign 2026-07-10)

O WHERE da listagem de pedidos vive SÓ em `dashboard/orders/_lib/orders-where.ts` (`buildOrdersListConditions` + `resolveTab` + `ordersTabSort` + `foldTabCounts`) — consumido por `fetchOrdersPage`, export CSV e resumo de produto. **Não reintroduzir cópias inline de filtro** (já existiram 3; uma delas deixava `?tab=` sem a condição de lateness no export). Gotchas do módulo: é **server-tainted** (drizzle + branch-scope) — client component NUNCA importa dele por valor; constantes client-safe (ex.: `CARRIER_NONE`) moram em `status-meta.ts` (fonte canônica) e `orders-where` importa de lá. Tab `late` é computada (não é status): `paid`/`preparing` ≥72h desde `COALESCE(paid_at, created_at)`. É **overlay** (spec 2026-07-13): o pedido atrasado também segue nas tabs do próprio status, e a sub-aba `?lateStatus=paid|preparing` estreita a listagem dentro de `late`. Mexeu na regra, mexa em `_lib/lateness.ts` (48/72h) e no `foldTabCounts` juntos (`late_paid`/`late_preparing` alimentam os pills).

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

**Jobs ativos:** `/api/cron/cancel-stale-orders` — diário 04:00 UTC; cancela `pending_payment` com `createdAt < now() - 72h`. `/api/cron/prune-cart-events` — diário 04:30 UTC. `/api/cron/stock-alerts` — dias úteis 07:00 UTC; alerta de reorder point por filial com cooldown de 7 dias (tabela `stock_alert_sent`).

## Cache (Next 16)

- **NÃO habilitar `cacheComponents` (PPR) — ADR-0022.** Foi tentado (006-B) e revertido: o PPR mostra a casca estática da rota nova **na hora** na navegação → força skeleton ou tela preta, **incompatível com o freeze de navegação do #222** (segura a página atual + barra de progresso). Ganho marginal num dashboard autenticado. Corolário: navegação **não usa `loading.tsx`** (o freeze depende da ausência dele). Comportamento de nav sob/sem PPR **só é confiável em `next build` + `next start`** — o `next dev` não prerenderiza a casca e engana.

`cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

- **Next 16 exige o 2º arg `revalidateTag(tag, profile)`** — a forma de 1 arg está **deprecada** e quebra o build (`check-types` aceita, build NÃO). Usar `revalidateTag(tag, "max")` (profile recomendado, stale-while-revalidate). Canônico: `site/banners/actions.ts`.

**Dedup request-scoped sem Cache Components:** fetcher chamado em mais de um lugar no mesmo render (ex: `fetchDashboardCounts` no `layout.tsx` para badges **e** na `page.tsx` para o painel) → envolver em `cache()` do `react`. Dedupa a query no mesmo request sem precisar ligar `use cache`/Cache Components. Só funciona para a **mesma** função com os mesmos args; queries diferentes que contam o mesmo dado não deduplicam (ver issue de extrair counts num único fetch).

## Listas drag-reorder (dnd-kit)

`@dnd-kit/core` v6 gera os ids dos elementos de a11y (`aria-describedby="DndDescribedBy-N"`) com um **contador não-determinístico** → diverge entre SSR e cliente e quebra a hidratação (mostra como "1 Issue" no overlay do Next; pode remontar os handlers de drag logo após o load e deixar o primeiro reorder instável). **Sempre passar um `id` estável em cada `<DndContext>`** (derivado de dado, ex: `id={\`cat-sortable-${parentId ?? "root"}\`}`). Canônico: `dashboard/categories/_components/categories-tree.tsx`.

## Smoke run-time

`tsc` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema ou queries SSR: `bun dev:web` + visitar rotas afetadas. Stack trace via `nextjs_call <port> get_errors` (MCP `next-devtools`).

**`bun run build` é gate obrigatório após refatorar arquivo `"use server"`.** Re-exportar de um `"use server"` qualquer coisa que **não seja async function** (tipo, const) quebra o build com `Only async functions are allowed to be exported in a "use server" file` — `check-types`/lint/test **não pegam** (regra só do build). Ao mover reads/tipos de um `actions.ts` pra `data.ts`/`_lib`, **atualize os consumers** a importarem de lá; **não** deixe re-export shim no `actions.ts`. (Incidente: split de god-module bloqueado, 2026-06; resolvido no plano 028 re-do.)

**Padrão canônico de split de god-module `actions.ts` (ADR-0019):** 3 camadas — `data.ts` (`import "server-only"`, reads+tipos+builders) + `_lib/*-query-helpers.ts` (helpers puros, sem auth) + `actions.ts` (`"use server"`, só mutations + thin wrappers de read com guard). Read chamado de Client Component ganha wrapper `"use server"` que faz `requireCapability` e delega ao `data.ts` (padrão `fetchToolsPageAction`/`fetchLedgerPageAction`); read só-server importa direto de `data.ts`. Helper sync **não pode ser exportado de `"use server"` pra teste** (mesma regra) → mover-pro-`_lib`-então-testar. Exemplares: `tools/`, `promotions/`, `stock/`.

## React Compiler (`reactCompiler: true`) — padrões anti-bailout (2026-07-13)

O compiler **baila** (componente inteiro perde memoização) em: (a) `try` com `finally` — qualquer um, mesmo `try/catch/finally`; (b) `throw` dentro do **corpo do try** (rethrow dentro do `catch` é suportado). Detecção: `npx react-doctor@latest` (regra `react-hooks-js/todo`).

- Handler async com busy-flag: cleanup no **fim do try** + duplicado no `catch (err) { cleanup(); throw err; }` — nunca `finally`. Fluxos com early-return + notify: extrair `const fail = (msg) => { notify.error(msg); setStatus(null); }` (canônico: `tools/_components/tool-video-field.tsx`).
- `setState` síncrono em `useEffect` (reset de sheet ao abrir, re-sync de input controlado) força re-render extra → padrão in-render "adjusting state when a prop changes": `const [lastReset, setLastReset] = useState({...}); if (mudou) { setLastReset(...); reset(); }` durante o render (canônicos: `users/_components/user-edit-sheet.tsx`, `components/entity/lazy-tab.tsx`). **Exceção legítima:** hydrate de `localStorage` pós-mount (`use-tool-draft.ts`) — em SSR precisa de effect.
- `Date.now()`/`new Date()` no corpo do render é impuro → congelar por instância: `const [now] = useState(() => Date.now())`.
- Scanner: config em `doctor.config.ts` na raiz — `server-auth-actions` e `no-impure-state-updater` estão **off** por falso positivo comprovado (rationale no próprio config; não religar sem reauditar). CI advisory em `.github/workflows/react-doctor.yml`.

## Testes

`bun --cwd apps/web test` (vitest, `environment: node`). Suíte verde (96 arquivos / 694 testes em 2026-07-13).

- **`server-only` em testes:** módulos que importam `server-only` (boundary do Next, ex: `src/lib/activity.ts`) são testáveis porque `vitest.config.ts` faz `resolve.alias['server-only'] → src/__mocks__/server-only.ts` (stub vazio). Ao adicionar teste para código que importa `server-only`, não precisa de `vi.mock` — o alias já resolve.
- Mock de `@emach/db` por `vi.hoisted` + `vi.mock` (ver `__tests__/activity.test.ts` como referência de como mockar o query builder do Drizzle).
- **No CI a suíte precisa de env dummy:** importar `@emach/db` dispara a validação de `@emach/env` no load. O step `Tests` do `ci.yml` provê valores **dummy** (não-secrets) que satisfazem o schema Zod; local o `.env` cobre. Sem env → `Invalid environment variables` no CI (mesmo com o DB mockado). Adicionar var nova obrigatória em `packages/env/src/server.ts` exige atualizar o bloco `env:` do CI.
