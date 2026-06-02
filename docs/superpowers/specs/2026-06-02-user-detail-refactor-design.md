# Refatoração do detalhe de usuário — `/dashboard/users/[id]`

**Data:** 2026-06-02
**Branch:** `update-usuarios`
**Referência de ouro:** fluxo das filiais (`/dashboard/branches/[id]`)

## Objetivo

Alinhar a tela de detalhe de usuário ao padrão `entity detail` canônico (DESIGN.md §4 / `apps/web/CLAUDE.md`), hoje plenamente aplicado nas filiais e só parcialmente aqui. As abas estão visualmente pobres (Perfil liso, Segurança espaçada e feia, Filiais numa lista única, Atividade em tabela seca) e o header usa um menu de 3-pontinhos fixo em vez de ações contextuais por aba.

## Estado atual (resumo)

| Área | Hoje | Problema |
|---|---|---|
| Header | `Editar` + `⋮` (Suspender/Reativar), fixo em todas as abas | Padrão das filiais é header limpo com ação que **muda por aba** |
| Perfil | Card "Perfil" liso (6 campos) + Zona de perigo embutida | Filiais têm KPIs row + 2 cards densos; zona de perigo não pertence ao Perfil |
| Filiais | Lista única num card + botões inline de vincular | Filiais têm grid de cards ricos; vincular pertence ao header |
| Atividade | Subtabs (Feito com/por) + `EntityAuditLogTable` seca | Tabela sem hierarquia visual |
| Sessões | Card com lista + revogar individual | Aceitável; mantém |
| Segurança | 3 cards espaçados, botões full-width | "Muito ruim"; UI a refazer |

## Dados disponíveis (confirmado no banco)

Tabela `user`: `id, name, email, email_verified, image, role, created_at, updated_at, status, last_login_at`. Sem telefone/documento (esses só existem para clientes do e-commerce).

Métricas derivadas: filiais vinculadas (`user_branch`), sessões ativas (`session` com `expires_at > now`), atividade (`user_activity_log` por ator e por alvo), provedor de login (`account.provider_id`, ex.: `credential`).

## Decisões travadas (via brainstorming)

1. **Suspender/Reativar** saem do `⋮` e viram **card "Status de acesso" na aba Segurança** — usando as actions com guard-rails (motivo, revogação de sessões, proteção do último super_admin). Não há seletor de status no drawer.
2. **KPIs da Visão geral:** Filiais · Sessões ativas · Último login · Cadastrado em.
3. **Drawer "Editar Usuário":** Avatar (upload) + Nome + Cargo + toggle "e-mail verificado". E-mail **não** é editável (é o identificador de login no Better Auth).
4. **Card da aba Filiais:** estilo da listagem (`BranchCard`) com stats (Equipe / SKUs / Abaixo-mín), clicável para o detalhe da filial.

## Arquitetura da solução

### A. Header — ação contextual por aba

`page.tsx` (Server Component) decide a ação do header conforme `sp.tab`, espelhando `branches/[id]/page.tsx`:

- `profile` → **"Editar Usuário"** (abre drawer via `?edit=1`)
- `branches` → **"Vincular filial"** (Popover + Command no header)
- `activity` / `sessions` / `security` → **sem ação** (ações vivem nos cards)

`UserActionsMenu` (3-pontinhos) é **removido**. `user-identity.tsx` deixa de embutir o botão "Editar" fixo e passa a receber `actions` do Server Component (igual `BranchIdentity`).

> O `EntityTabs` já sincroniza `?tab=`; o Server Component lê `searchParams.tab` para escolher a ação — `page.tsx` precisa receber `searchParams` (hoje não recebe).

### B. Aba Perfil → Visão geral

`profile-tab.tsx` reescrito, espelhando `branches/[id]/_components/overview-tab.tsx`:

- **`EntityKpisRow`** (4 itens): Filiais (`linkedBranches`), Sessões ativas (`activeSessions`), Último login (relativo via `formatRelative`), Cadastrado em (data curta).
- **Grid `md:grid-cols-2`:**
  - **Card "Identidade & acesso":** e-mail + badge verificado/não, cargo (`RoleBadge`), status (`StatusBadge`), provedor de login. Footer **edge-to-edge** (`-mx-* border-t`, grid-2): Cadastrado em | Último login.
  - **Card "Vínculos & atividade":** filiais vinculadas como chips (ou empty state "sem filial vinculada") + última ação sofrida ("Foi aprovado · há 8 dias") com link "Ver atividade" → `?tab=activity`.
- Zona de perigo **removida** desta aba.

### C. Aba Filiais

`branches-tab.tsx` reescrito:

- Grid responsivo (`sm:2 lg:3 xl:4`) de cards estilo `BranchCard`: avatar (iniciais), nome, endereço (`formatBranchAddress`), footer grid-3 edge-to-edge com **Equipe / SKUs ativos / Abaixo-mín**.
- Card **clicável** → `/dashboard/branches/[id]`; ação **Desvincular** via `AlertDialog` com `stopPropagation` (espelha `TeamMemberCard`).
- **Empty state** quando sem filiais.
- Ação **"Vincular filial"** migra do corpo da aba para o **header** (Popover + Command, espelha `TeamLinkPanel`); filtra localmente as filiais ainda não vinculadas. Reusa `linkUserToBranch` / `unlinkUserFromBranch`.

### D. Aba Segurança — UI refeita

`security-tab.tsx` reescrito. Cards com botões de largura natural (não full-width), na ordem:

1. **Status de acesso** — Suspender (`DestructiveActionDialog`, motivo ≥10 chars) / Reativar (`reasonRequired={false}`), via `suspendUser` / `reactivateUser`. *(migrado do `⋮`)*
2. **E-mail & verificação** — mostra estado; toggle de verificação manual (chama `updateUser` com `emailVerified`).
3. **Reset de senha** — `triggerPasswordReset`.
4. **Sessões** — "Forçar logout em tudo" (`forceLogoutAllSessions`).
5. **Zona de perigo** — Excluir usuário (`DestructiveActionDialog`, `deleteUser`). *(migrado do Perfil; gating por `canDelete` preservado)*

### E. Aba Atividade — polida

`activity-tab.tsx` mantém subtabs **Feito com / Feito por** e o scroll infinito. A renderização troca a tabela por uma **timeline**: ícone por tipo de ação (aprovado=`CheckCircle2`, suspenso=`Pause`, reativado=`Play`, filial=`Building2`, sessão=`Monitor`, reset=`KeyRound`, excluído=`Trash2`, default=`Activity`), linha com ator/descrição + timestamp relativo, metadata expansível. Reusa os mesmos `fetchUserActivity*Page` e labels existentes.

### F. Drawer "Editar Usuário"

`user-edit-sheet.tsx` ampliado: **Avatar (upload via helper de Storage)** · Nome · Cargo · toggle **"e-mail verificado"**. `description` atualizada.

### G. Camada de dados / actions

**Novas queries (`users/data.ts`):**
- `getUserDetailKpis(userId)` → `{ linkedBranches, activeSessions, lastLoginAt, createdAt }`.
- `getUserLinkedBranchesWithStats(userId)` → filiais vinculadas com `{ id, name, address, teamCount, activeSkus, lowStock }`, reusando a lógica de stats de `branches/data.ts`.
- `getUserDetail` ganha `provider` — via **subquery/agg** em `account` (um user pode ter N accounts; um join direto multiplicaria linhas no `groupBy` existente). Ex.: `array_agg(account.provider_id)` ou subquery do primeiro provider.

**Schema (`users/schema.ts`):** `updateUserSchema` ganha `image?: string` e `emailVerified?: boolean`.

**Action (`updateUser`):** seta `image` e `emailVerified` quando presentes; registra em `user.updated` metadata. E-mail fora do escopo.

**Reuso sem mudança:** `linkUserToBranch`, `unlinkUserFromBranch`, `suspendUser`, `reactivateUser`, `deleteUser`, `triggerPasswordReset`, `forceLogoutAllSessions`, `revokeUserSession`.

## Invariantes & guard-rails (P0)

- Toda mutação sensível continua nas server actions existentes, que carregam `requireCapabilityWithContext` + guard-rails (status gate, self-action, last super_admin). **Nenhum atalho de status fora dessas actions.**
- Avatar de usuário renderiza com `<img>` + `biome-ignore` documentado (URL pública Supabase), como já feito em `TeamMemberCard`.
- IDs de usuário são alfanuméricos (Better Auth), não UUID — Zod usa `.string().min(1)`.

## Verificação

- `bun check-types` + `bun check` (ultracite) antes de commit.
- `check-types` não pega hook client em Server Component nem SQL inválido em template string → **smoke visual obrigatório** na porta **3006** (a 3007 é de outra branch): visitar as 5 abas + abrir o drawer + suspender/reativar/desvincular em dado de teste.

## Escopo (arquivos)

Reescritos: `profile-tab.tsx`, `branches-tab.tsx`, `security-tab.tsx`, `activity-tab.tsx` (+ views), `user-edit-sheet.tsx`, `user-identity.tsx`, `page.tsx`. Removido: `user-actions-menu.tsx`, `danger-zone.tsx` (conteúdo absorvido pela Segurança). Novos: card de filial do usuário, panel de vincular filial, card de status de acesso. Estendidos: `data.ts`, `actions.ts`, `schema.ts`.

## Fora de escopo (YAGNI)

- Edição de e-mail (identificador de login).
- Métricas que exijam varredura pesada (ex.: total histórico de ações como KPI).
- Mudanças nas server actions de mutação além de `updateUser`.
</content>
</invoke>
