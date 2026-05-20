# Design: Users, Branches & Suppliers CRUDs

**Data:** 2026-05-20
**Status:** Aprovado (aguarda implementation plan)
**Escopo:** 3 fases independentes, cada uma vira PR próprio. Ordem: Users → Branches → Suppliers.

---

## Contexto

Hoje as três seções (`/dashboard/users`, `/branches`, `/suppliers`) estão em estados muito diferentes de maturidade comparadas aos CRUDs ricos do dashboard (`tools`, `categories`, `customers`, `orders`):

- **Users** é o mais cru: `<table>` HTML nativo (sem shadcn), sem `PageHeader`, sem busca, sem filtro de role, sem página de detalhe, sem paginação, sem audit log, sem avatar exibido na lista, edição via sheet com layout pouco polido, `resetUserPassword` ainda aceita senha plaintext do admin.
- **Branches** tem CRUD básico mas sem busca, e não tem página de detalhe própria — a rota `/branches/[id]/stock` é a única sub-rota e a filial em si nunca "tem voz" (sem KPIs, sem equipe vinculada visível, sem pedidos).
- **Suppliers** é o mais completo dos três (tem busca, detalhe, edit, delete) mas o detalhe é pobre, sem audit, sem KPIs, e o form perde campos úteis (website, CNPJ).

A meta é elevar as três ao patamar de `customers`/`orders`: header de identidade, KPIs row, tabs, sheet edit padronizada, audit log, polish visual seguindo `DESIGN.md`.

## Não-objetivos

- Não criar usuários por convite (manter self-signup + aprovação atual).
- Não refazer fluxo de aprovação — só refinar UI.
- Não tocar em `customers`/`orders`/`tools`/`categories`.
- Não criar i18n agora — strings em PT-BR diretas.
- Não adicionar 2FA (futuro).
- Não fazer export CSV de users/branches/suppliers nessa fase.

## Decisões já fechadas

| Decisão | Escolha | Razão |
|---|---|---|
| Ordem de execução | Users → Branches → Suppliers, 1 PR por fase | Users é o pior; branches depende de userBranch; suppliers já está ok |
| Padrão de detalhe | **Tabs** (estilo `customer-tabs`) para as 3 | Uniformidade; users tem muito sub-conteúdo |
| Padrão de edição | **Sheet lateral** via `?edit=1` | Não perde contexto; rápido para edições pontuais |
| Padrão de lista | **Full rich** (KPIs + pending/activity onde fizer sentido) | Coerência com `customers`/`orders` |
| Tab Atividade (user) | **Ações DO user** (não SOBRE) | Decisão do usuário; cria `userActivityLog` |
| Audit branches | **Não cria tabela própria** | Cai em `userActivityLog` (YAGNI) |
| Audit suppliers | **Cria `supplierAuditLog`** | Histórico de mudanças no fornecedor é útil |
| Criação de user | **Mantém self-signup + aprovação** | Sem rota `/users/new` |
| Reset de senha | **Email com token** (Better Auth), não plaintext | Correção de segurança |

## Restrições de polish (enforced no impeccable audit)

Todas vindas do `DESIGN.md` do projeto:

1. **Depth via surface contrast**, não bordas. Cards = `oklch(0.20 0.005 70)` sobre fundo `oklch(0.16 0.005 70)`. Sem `border` em cada KPI card ou pending panel — diferenciação é por surface.
2. **Hairline `oklch(0.36 0.008 70)` 1px** somente em: divisor sob PageHeader, top de Table, separador de tab content. Não nas laterais de cards.
3. **`lucide-react` icons**, nunca emoji em UI (Search, AlertCircle, CheckCircle2, Clock, Ban, Building2, Factory, etc.).
4. **Status = ícone + label + cor** (nunca só cor). Ex: `<Badge><CheckCircle2 className="size-3" /> Ativo</Badge>`.
5. **Pending panel sem borda lateral colorida** — diferenciação por badge count + ícone, não por accent-bar mostarda.
6. **`font-medium` (500)** default em títulos de card. `font-semibold` (600) só em `PageHeader` e h2 de seção.
7. **Empty states** = ícone Lucide grande `opacity-40` + label + sub-text + CTA.
8. **Skill `impeccable`** invocada em sub-tasks `audit` e `polish` antes de mergear cada fase.

---

## Arquitetura compartilhada

### Primitives novos em `apps/web/src/components/entity/`

| Componente | Props (resumo) | Inspirado em |
|---|---|---|
| `entity-kpis-row.tsx` | `items: { label, value, tone?, icon?, href? }[]` | `OrderKpisRow`, `CustomerKpisHeader` |
| `entity-identity-header.tsx` | `avatar`, `title`, `subtitle`, `badges`, `actions` (slot) | `CustomerHeader` |
| `entity-tabs.tsx` | wrapper de shadcn `Tabs` com `defaultValue` lido de `searchParams.tab`, sticky no scroll | `CustomerTabs` |
| `entity-pending-panel.tsx` | `title`, `count`, `items: { id, primary, secondary, href }[]`, `ctaHref` | `PendingPanel` de customers |
| `entity-activity-feed.tsx` | `events: { id, actor, action, target, at }[]`, `emptyLabel` | `ActivityFeed` de customers |
| `entity-edit-sheet.tsx` | `open`, `onOpenChange`, `title`, `description`, `form` (slot), `submitting` | `EditSheet` atual de users (refinado) |
| `entity-audit-log-table.tsx` | `entries: { id, at, actor, action, before?, after? }[]` com expand row | `customer-audit-table` |

Todos seguem as restrições de polish acima — testar visualmente cada um isolado em rota de `storybook`-like (criar `/dashboard/_dev/entity-preview` rota dev-only, gated por env).

### Novas tabelas em `packages/db/src/schema/`

**1. `user-activity.ts` — `userActivityLog`**

```ts
export const userActivityLog = pgTable("user_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  action: text("action").notNull(),                    // "tool.created", "branch.updated", "user.approved", ...
  targetType: text("target_type"),                     // "tool", "user", "branch", "supplier", "category", ...
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (t) => ({
  actorIdx: index("user_activity_actor_idx").on(t.actorUserId, t.createdAt.desc()),
  targetIdx: index("user_activity_target_idx").on(t.targetType, t.targetId),
}));
```

**Helper:** `apps/web/src/lib/activity.ts`

```ts
export async function logUserActivity(input: {
  actorUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

**Instrumentação nesta fase (apenas):** server actions de `tools`, `categories`, `suppliers`, `branches`, `users`. Não orders/customers/reviews — escopo cresce demais. Próxima leva.

**2. `supplier-audit.ts` — `supplierAuditLog`**

Espelha `clientAuditLog` (`packages/db/src/schema/client-audit.ts`). Colunas: `id`, `supplierId` (FK), `actorType` (`actor_type` enum), `actorId`, `action` (enum: `created`, `profile_updated`, `deleted`, `restored`), `before` (jsonb), `after` (jsonb), `createdAt`. Mesmo CHECK de coerência ator do `clientAuditLog`.

### Mudanças em tabelas existentes

| Tabela | Mudança | Razão |
|---|---|---|
| `user` | Adicionar `lastLoginAt` timestamp nullable | Exibir na lista e detalhe. Atualizado em hook `session.afterCreate` do Better Auth |
| `branch` | Adicionar `phone` text nullable, `responsibleUserId` text nullable FK→user | "Responsável da filial" útil no detalhe |
| `supplier` | Adicionar `website` text nullable, `cnpj` text nullable + unique partial index `WHERE cnpj IS NOT NULL` | Campos pedidos pelo negócio |

Workflow push-only (`bun db:sync`) cobre as 3 mudanças.

### Capabilities atualizadas (`apps/web/src/lib/permissions.ts`)

Adicionar/garantir:

```
users.list, users.read       → manager+
users.write                  → admin+
users.approve                → admin+
users.security               → admin+   (reset senha, revogar sessão, forçar logout)
users.delete                 → super_admin

branches.list, branches.read → manager+
branches.write               → admin+
branches.delete              → super_admin

suppliers.list, suppliers.read → manager+
suppliers.write               → admin+
suppliers.delete              → admin+
```

Branch-scoping (`requireCapabilityWithContext(cap, { branchId })`) já existe via `userBranch` — managers veem só suas filiais nas tabs onde fizer sentido (a definir caso a caso na implementação).

---

## Fase 1 — Users

### Rotas

```
/dashboard/users                       → lista refeita
/dashboard/users/[id]                  → detalhe novo (5 tabs)
/dashboard/users/[id]?tab=...&edit=1   → tab ativa + sheet edit por cima
```

### Lista (`apps/web/src/app/dashboard/users/page.tsx`)

```
<PageHeader title="Usuários" description="Equipe interna do Emach" />   // sem CTA (self-signup)
<EntityKpisRow items={[
  { label: "Ativos",         value: countActive,  icon: CheckCircle2 },
  { label: "Pendentes",      value: countPending, tone: countPending > 0 ? "warning" : "default", icon: Clock, href: "?status=pending" },
  { label: "Suspensos",      value: countSuspended, icon: Ban },
  { label: "Filiais cobertas", value: branchesCovered, icon: Building2 },
]} />
<div className="grid grid-cols-2 gap-4">
  <EntityPendingPanel ... />        // pending users — clica → ?status=pending
  <EntityActivityFeed events={...} /> // últimos 8 de userActivityLog WHERE action LIKE 'user.%'
</div>
<UsersFilters />                    // search + role select + branch select
<Tabs defaultValue={status}>
  <TabsList>
    <TabsTrigger value="active">Ativos ({countActive})</TabsTrigger>
    <TabsTrigger value="pending">Pendentes <Badge>{countPending}</Badge></TabsTrigger>
    <TabsTrigger value="suspended">Suspensos ({countSuspended})</TabsTrigger>
  </TabsList>
</Tabs>
<UsersTable />                      // shadcn Table, cursor-based pagination
```

`UsersTable` colunas:

| Coluna | Conteúdo | Sort |
|---|---|---|
| Identidade | Avatar (image ou inicial) + nome + email subtle | name |
| Role | Badge com ícone + label | role |
| Status | Badge com ícone + label | — (já está nas tabs) |
| Filiais | Chips (limit 2) + overflow `+N` em tooltip | — |
| Criado | Data relativa | createdAt |
| Último login | Data relativa, "Nunca" se null | lastLoginAt |
| ⋯ | DropdownMenu: ver detalhe, editar, reset senha, suspender/reativar, deletar (gated) | — |

Linha clicável → `/users/[id]`. Cursor-based pagination espelhando `fetchCustomersPage`.

### Detalhe (`apps/web/src/app/dashboard/users/[id]/page.tsx`)

```
<EntityIdentityHeader
  avatar={user.image ?? initial}
  title={user.name}
  subtitle={user.email}
  badges={[<RoleBadge />, <StatusBadge />]}
  actions={<>
    <Button onClick={openEdit}>Editar</Button>
    <Button variant="outline" onClick={resetPassword}>Reset senha</Button>
    {status === "active"
      ? <Button variant="outline" onClick={suspend}>Suspender</Button>
      : <Button variant="outline" onClick={reactivate}>Reativar</Button>}
    <DropdownMenu>...Deletar (super_admin only)...</DropdownMenu>
  </>}
/>
<EntityTabs defaultValue={searchParams.tab ?? "profile"}>
  Perfil   — dados (nome, email, role, status, criado, último login, image) + card resumido "Filiais"
  Filiais  — gestão completa: lista vinculadas + combobox vincular + ação desvincular (com confirmação se for último admin da filial)
  Atividade — paginado, filtros (action type, range data); userActivityLog WHERE actorUserId = id
  Sessões  — Better Auth sessions ativas + revogar (padrão de customers)
  Segurança — botão "Enviar email de reset", "Forçar logout em todas as sessões", email verified status
</EntityTabs>

{searchParams.edit && <UserEditSheet user={user} />}
```

### Sheet de edit

`UserEditSheet`:

```
Form fields: name, role (select), branches (multi-combobox), status (select)
Painel vermelho no topo lista TODOS issues do Zod safeParse (nunca toast.error genérico)
Botões: [Cancelar] [Salvar] — disable enquanto submitting
Mudanças sensíveis (mudar role do próprio user para super_admin, etc) precisam confirmação extra via AlertDialog
```

### Mudanças em server actions

| Action | Mudança |
|---|---|
| `approveUser` | Adicionar `logUserActivity({action:"user.approved", targetType:"user", targetId})` |
| `rejectUser` | Idem (`user.rejected`) |
| `updateUser` | Idem (`user.updated`, metadata com diff) |
| `suspendUser` | Idem (`user.suspended`) |
| `reactivateUser` | Idem (`user.reactivated`) |
| `resetUserPassword` | **Substituir por `triggerPasswordReset({userId})`**: chama Better Auth `requestPasswordReset(email)` que envia email com token. Admin não vê senha. Log `user.password_reset_triggered`. |
| `deleteUser` | Idem + adicionar guard "não pode deletar último super_admin" |

Também adicionar:
- `listUsers({ status, role, branchId, search, cursor, sort, limit })` — server action cursor-based.
- `forceLogoutAllSessions({userId})` — revoga todas sessões via Better Auth.
- `linkUserToBranch({userId, branchId})` / `unlinkUserFromBranch({userId, branchId})` — para tab Filiais.

### Better Auth — `lastLoginAt`

Hook no Better Auth dashboard config:

```ts
hooks: {
  after: [{
    matcher: (ctx) => ctx.path === "/sign-in/email",
    handler: async (ctx) => {
      if (ctx.context.newSession?.user) {
        await db.update(user)
          .set({ lastLoginAt: new Date() })
          .where(eq(user.id, ctx.context.newSession.user.id));
      }
    }
  }]
}
```

(Adaptar para o shape exato do hook conforme docs do Better Auth — checar via `find-docs` durante implementação.)

---

## Fase 2 — Branches

### Rotas

```
/dashboard/branches                       → lista refinada
/dashboard/branches/[id]                  → detalhe novo (4 tabs)
/dashboard/branches/[id]?tab=stock        → equivalente ao /branches/[id]/stock antigo
/dashboard/branches/[id]?edit=1           → sheet edit
/dashboard/branches/[id]/stock            → REDIRECT 301 para /branches/[id]?tab=stock
```

### Lista

```
<PageHeader title="Filiais" description="..." cta={<Button>+ Nova filial</Button>} />   // gated admin
<EntityKpisRow items={[
  { label: "Total",                value: total,            icon: Building2 },
  { label: "SKUs abaixo do mín.",  value: lowStockCount,    tone: lowStockCount > 0 ? "warning" : "default", icon: AlertCircle },
  { label: "Valor de estoque",     value: formatBRL(total), icon: DollarSign },
  { label: "Pedidos em andamento", value: openOrders,       icon: Package },
]} />
<BranchesFilters />            // search nome/endereço, sort
<BranchesTable />              // shadcn Table
```

`BranchesTable` colunas: Nome (+badge Padrão), Endereço (truncated), Equipe (count → tooltip), SKUs ativos, Abaixo do mínimo (âmbar), ⋯ menu.

### Detalhe

```
<EntityIdentityHeader
  avatar={<Building2 />}
  title={branch.name}
  subtitle={branch.address}
  badges={branch.isDefault ? [<Badge>Padrão ecommerce</Badge>] : []}
  actions={<>
    <Button onClick={openEdit}>Editar</Button>
    {!branch.isDefault && <Button variant="outline" onClick={setDefault}>Tornar padrão</Button>}
    <DropdownMenu>...Deletar...</DropdownMenu>
  </>}
/>
<EntityTabs>
  Visão geral — info + KpisRow secundária (SKUs ativos, Valor, Equipe, Pedidos 30d)
  Equipe     — users via userBranch + combobox vincular + desvincular (guard: último admin)
  Estoque    — embuti conteúdo de /branches/[id]/stock (stockLevel por variante + ajustar)
  Pedidos    — orders WHERE branchId = esse, status filter
</EntityTabs>
```

### Sheet de edit

Form: name, address, phone (novo), responsibleUserId (combobox de users — novo), isDefault (switch + AlertDialog confirma se trocar).

### Server actions adicionar/modificar

- `setDefaultBranch` já existe — adicionar `logUserActivity`.
- `deleteBranch` — bloquear se `stockLevel.quantity > 0` ou existem orders ativas; mensagem clara com counts; log activity.
- `linkUserToBranch` / `unlinkUserFromBranch` — compartilhada com fase 1; logar activity nas duas pontas.
- `listBranches({ search, sort, cursor, limit })` — cursor-based.

---

## Fase 3 — Suppliers

### Rotas

```
/dashboard/suppliers                       → lista enriquecida
/dashboard/suppliers/[id]                  → detalhe reescrito (3 tabs)
/dashboard/suppliers/[id]?edit=1           → sheet edit
/dashboard/suppliers/[id]/edit             → REDIRECT 301 para /suppliers/[id]?edit=1
/dashboard/suppliers/new                   → mantém rota (form curto)
```

### Lista

```
<PageHeader title="Fornecedores" cta={<Button>+ Novo</Button>} />     // gated admin
<EntityKpisRow items={[
  { label: "Total",                       value: total,        icon: Factory },
  { label: "Com ferramentas ativas",      value: withActive,   icon: CheckCircle2 },
  { label: "Sem ferramentas",             value: empty,        tone: empty > 0 ? "warning" : "default", icon: AlertCircle },
  { label: "Adicionados em 30 dias",      value: recent,       icon: Plus },
]} />
<SuppliersFilters />            // search já existe; adicionar sort (nome, criado, nº tools)
<SuppliersTable />
```

Colunas: Nome (link), Email, Telefone, Ferramentas (count + badge ativas), Adicionado em, ⋯.

### Detalhe

```
<EntityIdentityHeader
  avatar={<Factory />}
  title={supplier.name}
  subtitle={supplier.email}
  badges={supplier.website ? [<Badge variant="outline">website</Badge>] : []}
  actions={<>
    <Button onClick={openEdit}>Editar</Button>
    <Button onClick={() => navigate(`/tools/new?supplierId=${id}`)}>+ Nova ferramenta</Button>
    <DropdownMenu>...Deletar (guard: tem tools)...</DropdownMenu>
  </>}
/>
<EntityTabs>
  Visão geral — card "Sobre" (notes em react-markdown + rehype-sanitize com defaultSchema) + KpisRow [Ativas, Inativas, Última adição, Categorias cobertas]
  Ferramentas — lista tools WHERE supplierId; busca local; sort; link p/ detalhe
  Histórico   — supplierAuditLog com diff visual (before → after expand row)
</EntityTabs>
```

### Sheet de edit

Form: name (required), email, phone, website (novo), cnpj (novo, com validação dígito verificador + normalização), notes (textarea com hint markdown).

### Server actions modificar

- `createSupplier`, `updateSupplier`, `deleteSupplier` — adicionar `supplierAuditLog` insert + `logUserActivity`.
- Adicionar guard em `deleteSupplier`: bloqueia se `tool` count > 0; mensagem "Mova as N ferramentas para outro fornecedor antes".
- `listSuppliers` — adicionar sort (nome, criado, nº tools).

### Validação CNPJ

Função em `apps/web/src/lib/validation/cnpj.ts`:

```ts
export function normalizeCnpj(input: string): string  // só dígitos
export function isValidCnpj(input: string): boolean   // dígito verificador
```

Zod refine no `supplierFormSchema`. Tool de form mostra com máscara `00.000.000/0000-00`, persiste só dígitos.

---

## Plano de verificação (por fase)

Para cada PR:

1. `bun check-types` no workspace alterado e em `apps/web`.
2. `bun fix` no escopo.
3. `bun --cwd packages/db db:apply-triggers` se schema mudou.
4. `bun db:sync` se schema mudou (push-only — ADR-0006).
5. `bun --cwd apps/web test` (`__tests__/permissions.test.ts` deve continuar verde + novos testes de capability).
6. `bun dev:web` smoke manual:
   - Lista renderiza com dados reais do seed-demo
   - KPIs row mostra números corretos
   - Pending panel + activity feed (fase 1) populam
   - Detalhe abre, tabs trocam via URL, edit sheet abre via `?edit=1`
   - Server actions logam em `userActivityLog` / `supplierAuditLog`
   - Audit log table renderiza no detalhe
7. Skill `impeccable` sub-task `audit` antes do merge — verificar enforcement das restrições de polish.
8. Skill `web-design-guidelines` review.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Refactor de `resetUserPassword` quebra fluxo existente | Validar Better Auth `requestPasswordReset` está configurado com mailer real antes de deploy; se não, fase 1 pode entregar action funcional mas UI gated por feature flag até o mailer existir |
| Redirect `/branches/[id]/stock` → `?tab=stock` quebra deep-links salvos | Redirect 301 server-side em `page.tsx` da rota antiga preserva URL |
| `userActivityLog` cresce ilimitado | Schema sem TTL nessa fase; adicionar índice já desde o início e considerar partition/cleanup em fase futura quando volume justificar |
| Branches deletion guard rejeita casos legítimos (filial desativada com saldo histórico) | Action retorna mensagem específica com counts; admin pode zerar estoque/realocar antes; super_admin pode forçar via flag (próxima fase, não agora) |
| Polish acaba inconsistente entre primitives | Criar rota dev-only `/dashboard/_dev/entity-preview` com cada primitive isolado; skill `impeccable` audit roda nessa rota antes de aplicar nas features |

## Open questions (resolver durante implementação)

Nenhuma bloqueante. Detalhes finos (espaçamentos exatos, tom de hover dos chips, etc) ficam para a skill `impeccable` resolver na audit/polish.
