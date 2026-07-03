# Permissões de UI para o role `user` + fechamento de escopo de filial

> Data: 2026-07-03 · Origem: relato do usuário (estoquista via `user` enxerga e "consegue" ações administrativas na sidebar e na própria página) · Modelo de auth: ADR-0016.

## Contexto

Um `user` (estoquista, trabalho de dia a dia) reportou ver **Filiais** na sidebar e, na própria página de perfil, controles de vincular/desvincular filial e edição de usuário — ações que só `admin`/`super_admin` deveriam ter.

Auditoria (4 leitores paralelos + varredura completa dos guards de server) estabeleceu:

- **O servidor é fail-closed para as ações de UI reclamadas.** Toda mutação (vincular/desvincular filial, editar usuário, reset de senha de terceiros, forçar logout, criar/editar filial) já exige capability `SA`/`S` e é bloqueada para um `user`. Não há brecha de dados nessas ações — é **vazamento de UI**: os controles aparecem, o clique termina em erro.
- **A varredura achou, além do relatado, um P0 de dados real e independente:** as leituras de **Pedidos** e **Atividade** do detalhe de filial não checam escopo de filial.

Este spec cobre três correções decididas em conjunto com o usuário.

### Regra do usuário (norteia o design)

> "Se ele não tem permissão, não tem por que ver." → **esconder**, não desabilitar.
> "Editar usuário" no self-view vira **editar os próprios dados básicos**.

## Achados (com evidência)

### Fix 1 — "Filiais" vaza na sidebar

`apps/web/src/app/dashboard/_components/nav-config.ts:129-133` — o item "Filiais" não declara `capability`. O filtro em `app-sidebar.tsx:39-41` mostra todo item sem `capability`, então aparece para qualquer role. Vizinhos no mesmo grupo ("Frete" → `shipping.read`, "Configurações" → `site.update_settings`) têm gate e somem para o `user`.

### Fix 2 — a página do próprio usuário abre a shell administrativa

Rota: o rodapé da sidebar (`sidebar-footer-user.tsx:152-158` e `:113`) tem link "Ver meu perfil" → `/dashboard/users/${user.id}`, para qualquer role. `requireUserDetailAccessOrRedirect` (`permissions.ts:168-183`) libera auto-acesso (`session.user.id === targetUserId`). O `user` cai na shell administrativa de usuário.

Controles renderizados **incondicionalmente** (sem prop de capability), todos bloqueados no servidor mas visíveis:

| Controle | Arquivo | Guard de server |
| --- | --- | --- |
| "Vincular filial" | `user-detail-actions.tsx:20-24` → `user-branch-link-panel.tsx` | `users.update_branches` (SA) |
| "Desvincular" (por card) | `user-branch-card.tsx:58-99` | `users.update_branches` (SA) |
| "Editar usuário" | `user-detail-actions.tsx:25-27` → `EditUserButton` | `users.manage` (SA) |
| "Enviar e-mail de reset" | `security-tab.tsx:110-119` | `users.reset_password` (SA) + `SELF_RESTRICTED` |
| "Forçar logout em tudo" | `security-tab.tsx:128-139` | `users.revoke_sessions` (SA) + `SELF_RESTRICTED` |

Já corretamente gated (o padrão a seguir): aba **Permissões** (`page.tsx:125`, prop `targetManageable`) e botão **Excluir usuário** (`security-tab.tsx:149`, prop `canDelete`).

Nota estrutural: os dois botões de Segurança estão em `SELF_RESTRICTED` (`permissions.ts:88-98`) — inúteis em **qualquer** self-view, mesmo de `super_admin`. Gate por capability não basta; é preciso também excluir `isSelf`.

### Fix 3 — P0: leitura de filial fora de escopo (brecha de dados real)

`branches/[id]/page.tsx:41` guarda só com `requireCapabilityOrRedirect("branches.read")` (SAU), sem checar escopo. As leituras das abas:

| Aba | Guard hoje | Checa escopo? |
| --- | --- | --- |
| Estoque | `requireCapabilityWithContext("stock.adjust", {targetBranchIds})` (`tab-actions.ts:70`) | **sim** ✓ (padrão correto) |
| Pedidos | `requireCapability("orders.read")` (`branches/actions.ts:171`) | não ✗ |
| Atividade | `requireCapability("stock.read")` (`activity-data.ts:203`, `:277`) | não ✗ |
| Overview (KPIs) | `getBranchDetail`/`getBranchDetailKpis` (`data.ts:67`, `:104`) — sem scope | não ✗ |

Impacto: um `user`/`admin` escopado à Filial A abre `/dashboard/branches/{id-da-Filial-B}` e vê pedidos (número, cliente, status), movimentações de estoque (SKU, delta, fornecedor) e atividade de equipe da Filial B. Viola o branch-scoping de Vendas/Inventory do ADR-0016. `isServerSecure: false`.

## Não-objetivos

- Reescrever o modelo de capabilities ou a shell de detalhe de entidade.
- Mexer nas ações administrativas de gestão de terceiros (já corretas).
- Rota nova de conta (`/dashboard/conta`) — o usuário optou por **blindar a shell atual**.
- Scoping da **listagem** de filiais (mostrar só as do escopo) — considerar em follow-up; fora do P0, cujo dado sensível está nas abas do detalhe.

## Design

### Fix 1 — Filiais vira admin-only

1. `apps/web/src/lib/capabilities.ts`: `branches.read.defaultRoles` de `SAU` → `SA`.
2. `apps/web/src/app/dashboard/_components/nav-config.ts`: item "Filiais" ganha `capability: "branches.read"`.

Efeito: o item some da sidebar (filtro por capability) **e** a lista/detalhe redireciona um `user` que digite a URL (as pages já guardam com `requireCapabilityOrRedirect("branches.read")`). `admin` ∈ SA mantém acesso.

**Segurança da mudança:** nenhum recurso user-facing depende de `branches.read` para o `user`. As features que precisam de filial (dropdowns de estoque em tools, etc.) usam `getScopedActiveBranches`/`getActiveBranches` de `branches/data.ts` (server-only, guardado pela capability do próprio caller — `stock.adjust`/`tools.read`), não por `branches.read`. Verificado por varredura de callsites.

**Testes a atualizar:** `branches/__tests__/guards.test.ts` e qualquer asserção que assuma `branches.read = SAU`.

### Fix 2 — Shell de usuário honesta + "minha conta" self-service

Introduzir `isSelf = actorSession.user.id === user.id` em `users/[id]/page.tsx` e propagar como gate. Dois modos coexistem na mesma shell:

- **admin-gerencia-outro** (não-self, viewer com capability): comportamento atual, intacto.
- **self-view** (`isSelf`): versão enxuta, self-service.

Mudanças por controle:

- **Vincular/Desvincular filial:** só renderiza quando `can("users.update_branches")` **e** `!isSelf`. No self-view a aba **Filiais** fica read-only (cards sem botão "Desvincular", header sem "Vincular"). Threading: `user-detail-actions.tsx`, `branches-tab.tsx`, `user-branch-card.tsx` recebem `canManageBranches`/`isSelf`.
- **Editar usuário → Editar meus dados:** no self-view, o botão abre um sheet de auto-edição (campos: **nome, foto, e-mail**), não o sheet administrativo. Fora do self-view, segue o `EditUserButton` admin gated por `users.manage`.
- **Segurança (reset / forçar logout):** escondidos quando `isSelf` (inúteis por `SELF_RESTRICTED`) ou sem a capability. No self-view, a aba passa a oferecer **"Trocar minha senha"** (self-service).
- Cargo e filiais vinculadas: leitura no self-view.

Novos endpoints self-scoped (operam só sobre `session.user.id`, sem exigir capability administrativa):

- `updateOwnBasicProfile({ name?, image? })` — `"use server"`, `requireCurrentSession()` + `ensureActive`, atualiza só `name`/`image` do próprio usuário. **Nunca** `role`/`status`/`emailVerified`. Auditar em `userActivityLog` (`actorUserId = self`, `action: "user.self_updated"`).
- **Trocar senha:** `authClient.changePassword` (já disponível — `emailAndPassword.enabled`). Sem novo endpoint.
- **Trocar e-mail (peça de maior risco — ver Riscos):** exige habilitar `changeEmail` no pacote de auth compartilhado. Fluxo com verificação (link para o **novo** endereço; e-mail só troca ao confirmar).

### Fix 3 — Fechar o P0 de escopo de filial

1. **Guard de escopo no page** (`branches/[id]/page.tsx`): após `requireCapabilityOrRedirect("branches.read")`, para não-`super_admin` computar `scope = getUserBranchScope(session)` e `notFound()` se `!inScope(scope, id)` (404 não revela que a filial existe; preferível a redirect). Fecha overview + todas as abas de uma vez (defesa-em-profundidade de página).
2. **Guards por-action** (endpoints são POST diretamente chamáveis — precisam do próprio gate):
   - `fetchBranchOrdersPage` (`branches/actions.ts:164`): `requireCapability("orders.read")` → `requireCapabilityWithContext("orders.read", { targetBranchIds: [branchId] })`.
   - `fetchBranchActivityPage` wrapper (`branches/actions.ts:29`) e `fetchBranchActivityToolsAction` (`tab-actions.ts:32`): trocar `requireCapability("branches.read"/"stock.read")` por `requireCapabilityWithContext(cap, { targetBranchIds: [branchId] })`.

Fecha a espiada entre filiais inclusive para `admin` escopado (que mantém `branches.read` após a Fix 1).

## Alterações de dados / auth

- Sem mudança de schema para Fix 1/Fix 3.
- Fix 2 e-mail: habilitar `changeEmail` em `packages/auth/src/dashboard.ts` (`user.changeEmail.enabled` + `sendChangeEmailVerification`), novo template em `@emach/email`, e a env/URL de callback. **Território P0 de invariantes de auth (raiz CLAUDE.md)** — revisar isolado.

## Testes

- **Fix 1:** unit no registry (`branches.read` agora SA); atualizar `branches/__tests__/guards.test.ts`; smoke: logar como `user` → sem "Filiais" na sidebar e `/dashboard/branches` redireciona.
- **Fix 2:** unit do `updateOwnBasicProfile` (recusa alterar role/status; só age sobre self); teste de gating (self-view não renderiza os 4 controles); smoke: `user` na própria página edita nome/foto e troca senha, sem controles administrativos.
- **Fix 3:** teste de guard — `user`/`admin` fora de escopo recebe redirect no page e erro nas actions de Pedidos/Atividade; `super_admin` e in-scope passam. Espelhar o estilo de `stock/__tests__/guards.test.ts`.
- `bun verify` (check-types + check + test) antes de PR; smoke multi-role no browser (a shell de usuário quebra só em runtime — `check-types` não pega hook client em Server Component).

## Riscos e ordem de entrega

Ordem sugerida por risco/valor:

1. **Fix 3 (P0)** primeiro — brecha de dados real, correção barata e contida.
2. **Fix 1** — 2 linhas + testes; remove a maior parte do vazamento de UI para o `user`.
3. **Fix 2 sem e-mail** — gating dos 4 controles + `updateOwnBasicProfile` (nome/foto) + trocar senha.
4. **Fix 2 e-mail** — habilitar `changeEmail` no pacote de auth compartilhado + template + verificação. **Maior risco:** toca `@emach/auth/dashboard` (invariantes P0), depende de infra de e-mail e fluxo de verificação. Se o setup se mostrar pesado no planejamento, entregar 1-3 e destacar o e-mail como sub-entrega revisada à parte — sem bloquear o resto.

**Escolhas do usuário registradas:** blindar a shell atual (não rota nova); dados básicos = nome + foto + e-mail; corrigir o P0 nesta leva.
