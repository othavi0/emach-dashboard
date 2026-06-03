# Auth convite-only + email transacional (Resend)

> Spec de design. Data: 2026-06-03. **Revisa** `2026-06-03-login-auth-redesign-design.md` §7: a verificação de email é **removida** (redundante com convite-por-link), e o convite **substitui** o fluxo self-cadastro → pending → aprovação.

## 1. Motivação

Com Resend funcional (key + domínio `emachferramentas.com.br` verificado + `mise.toml` do issue #113), o auth ganha email real. Ao desenhar o fluxo, ficou claro que **verificação de email é redundante**: o convite é enviado ao email do usuário e o aceite só acontece clicando o link tokenizado que chegou lá — isso já prova posse do email. Então o fluxo passa a ser **convite-only**, e a verificação de email sai.

## 2. Decisões travadas (brainstorm)

| Tema | Decisão |
|---|---|
| Criação de usuário | **Convite é o único caminho.** Remove self-cadastro e o fluxo pending → aprovação. |
| Campos do convite | Admin define **email + role + filiais** (front-carrega o que a `ApprovalSheet` fazia). |
| Verificação de email | **Removida** — redundante com o convite-por-link. `requireEmailVerification` OFF. |
| Reset de senha | **Mantido e funcional** (forgot password). |
| Abordagem técnica | **A** — o convite cria o usuário já (`status='pending'` = "convidado"); o link define a senha. Reusa lista de usuários, status, token de reset, email. |
| Expiração do convite | 7 dias, single-use; admin pode **reenviar** (regenera token) e **revogar** (deleta o pending). |
| Aceite coleta | **Nome + senha** (sem CPF — isso é de cliente do ecommerce, não de usuário admin). |
| `/pending` | Mantida como safety (praticamente inalcançável: convidado não loga antes de aceitar). `/suspended` continua válida. |

## 3. Fluxo

### 3.1 Convidar (admin, `/dashboard/users`)
- Ação primária da página: botão **"Convidar usuário"** → `Dialog` com email + `RoleSelect` + `BranchesCombobox` (reusa componentes da `ApprovalSheet`).
- Server action `inviteUser(input)` (`ActionResult`):
  1. `safeParse` (email válido; role no conjunto permitido por `allowedApprovalRoles(actorRole)`; branchIds).
  2. `await requireCapabilityWithContext("users.invite", { targetBranchIds })` (capability nova; no-op hoje por ADR-0012, mas registrada).
  3. Valida email: se existe user `active`/`suspended` → erro "já existe conta"; se existe `pending` (convite aberto) → caminho de **reenvio** (regenera token + reenvia) em vez de duplicar.
  4. Cria o usuário via `auth.$context` internal adapter (ver §5): `ctx.internalAdapter.createUser({ email, name: "", emailVerified: true })`; depois `db.update(user).set({ role, status: 'pending' })`. **Sem** credential account ainda (sem senha até o aceite). Vincula `userBranch`.
  5. Gera **token de convite próprio** (random, 7d) — armazenado em colunas `inviteToken` + `inviteTokenExpiresAt` no `user` (push-only) **ou** na tabela `verification` com identifier `invite:<userId>`. Decidir no plano; inclinação: colunas no `user` (o convidado já É um user pending).
  6. `await sendInviteEmail({ to, inviterName, acceptUrl: <origin>/convite?token=... })`.
  7. `logUserActivity({ action: "user.invited", ... })`; `revalidatePath`.

### 3.2 Aceitar (`/convite?token=`)
- Server valida o token de convite (existe no `user` via `inviteToken`, não expirado, `status='pending'`). Token inválido → estado "Link expirado" (reusa o padrão de estado do `AuthShell`).
- `AuthShell` + `InviteAcceptForm` (client): **nome + senha + confirmar senha** (toggle mostrar/ocultar). Email exibido read-only (do convite).
- Submit → server action `acceptInvite({ token, name, password })`:
  1. Revalida token (não expirado, pending).
  2. `ctx.internalAdapter.createAccount({ accountId: user.id, providerId: "credential", userId: user.id, password: await ctx.password.hash(password) })`.
  3. `db.update(user).set({ name, status: 'active', inviteToken: null, inviteTokenExpiresAt: null })`.
  4. `auth.api.signInEmail({ body: { email, password }, headers })` — loga o convidado (cookie via `nextCookies`; `disableSignUp` não afeta sign-in). `logUserActivity({ action: "user.invite_accepted" })`.
  5. Redireciona `/dashboard`.

### 3.3 Reset de senha (forgot, agora funcional)
- `/esqueci-senha`: submit **ativado** → `authClient.requestPasswordReset({ email, redirectTo: <origin>/redefinir-senha })`. Resposta constante (não revela existência do email).
- `/redefinir-senha?token=`: `AuthShell` + form (nova senha + confirmar) → `authClient.resetPassword({ token, newPassword })` → sucesso → `/login`. Token inválido → estado "Link expirado".

## 4. Infra de email — `packages/email` (`@emach/email`)

Pacote novo espelhando o setup react/JSX do `@emach/ui`. Mantém o `@emach/auth` limpo (sem react).

- Deps: `resend`, `@react-email/components` (+ `@react-email/render` se necessário), `react` (catalog), `@emach/env`.
- Resend client singleton (`new Resend(env.RESEND_API_KEY)`).
- Templates React Email (Tailwind + `pixelBasedPreset`, **fundo claro**, marca EMACH: wordmark, acento coral, Inter): `InviteEmail` (nome do convidante + botão "Criar acesso"), `PasswordResetEmail` (botão "Redefinir senha"). Logo via URL absoluta (CDN/produção — confirmar host; em dev, fallback).
- Exporta `sendInviteEmail({ to, inviterName, acceptUrl })` e `sendPasswordResetEmail({ to, url })` — `from = env.EMAIL_FROM` (domínio verificado), `resend.emails.send({ react })`.
- `RESEND_API_KEY` + `EMAIL_FROM` adicionados ao schema em `packages/env/src/server.ts` (`z.string().min(1)`).

## 5. Better Auth (`packages/auth/src/dashboard.ts`) — mecanismo resolvido

Confirmado via docs/issues Better Auth (v1.6.x):

- **Sem admin plugin.** Criação do usuário no convite e da credencial no aceite usam o **internal context**: `const ctx = await authDashboard.$context` → `ctx.internalAdapter.createUser(...)`, `ctx.internalAdapter.createAccount({ providerId: "credential", password: await ctx.password.hash(pw) })`. (Padrão documentado em issue oficial; `admin.setUserPassword` foi descartado porque exige sessão.) ⚠️ Verificar em runtime que `authDashboard.$context` resolve dentro de server action Next (há relato de "No auth context found" em certos ambientes — testar cedo).
- `emailAndPassword.disableSignUp: true` — sem self-cadastro. Bloqueia só o endpoint de **sign-up**; **não** afeta `signInEmail` (usado no aceite) nem o `internalAdapter` (server-side). Convite-only garantido.
- `emailAndPassword.sendResetPassword: async ({ user, url }) => sendPasswordResetEmail({ to: user.email, url })`.
- `emailAndPassword.revokeSessionsOnPasswordReset: true`.
- `requireEmailVerification` **não setado** (verificação removida); sem bloco `emailVerification`.
- **Token de reset** (forgot password) mantém o default do Better Auth (1h — apropriado para segurança). **Token de convite é NOSSO** (7d), totalmente desacoplado do reset — sem conflito de TTL.

## 6. Remoções / cleanup

- **Sai:** `ApprovalSheet`, `approveUser`, `rejectUser`, `bulkRejectUsers`, e o uso de `PendingPanel`/`bulk-pending-selection` para usuários. `fetchPendingUsersAction` / `fetchPendingUsersPage` aposentados (ou repurpose para "convites pendentes").
- **`pending` ressignificado:** "convidado, aguardando aceite". Badges/labels de status atualizados ("Convidado" em vez de "Pendente de aprovação" onde fizer sentido).
- O removido em **PR #112** (sign-up público do login) já está alinhado; esta etapa completa a transição.

## 7. Arquitetura / isolamento

- `@emach/email` — unidade isolada: entrada clara (`sendInviteEmail`/`sendPasswordResetEmail`), sem dependência de auth/web; testável (render do template → HTML).
- `inviteUser` / accept ficam em `dashboard/users/actions.ts` + uma rota `/convite`; reusam `AuthShell`, `RoleSelect`, `BranchesCombobox`, `userBranch`.
- `@emach/auth` ganha só o wiring de `sendResetPassword` (importa `@emach/email`) + config; sem JSX.

## 8. Testes / verificação

- `authErrorMessage` já testado; adicionar casos para novos códigos se surgirem.
- Render dos templates React Email → snapshot/HTML (garante que renderiza sem erro).
- `bun check-types` + ultracite (arquivos tocados) + `bun run test`.
- Smoke ao vivo (DB + porta — ver [[reference_emach_dev_auth_smoke]]): convidar um email de teste → receber email (Resend) → aceitar → logar; forgot → email → reset → logar.
- MCP Resend (`list-domains`, envio de teste) após relançar o `claude` (issue #113).

## 9. Fora de escopo

- Reativação dos gates role-based (ADR-0012) — continua P-futuro.
- Templates de email transacional de pedido/cliente (ficam no repo ecommerce).
