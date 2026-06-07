# ADR 0013 — Auth de staff é convite-only

**Data:** 2026-06-05
**Status:** Aceito
**Substitui:** ADR-0010 (signup público com aprovação manual).

## Contexto

ADR-0010 manteve o signup público (`/sign-up` aberto → `status='pending'` → aprovação manual no dashboard) por ser o caminho que **não** exigia escrever um flow de invitation, num momento de baixo volume de onboarding. O custo aceito eram a página pública indexável e a triagem periódica de spam.

Esse custo passou a não compensar: a página pública era a única superfície de cadastro aberta de um produto **100% interno**, e a triagem manual de spam é trabalho recorrente sem valor. O flow de convite, antes adiado, ficou barato de implementar sobre o Better Auth 1.6.11 (`$context.internalAdapter`), validado em runtime (PRs #112 Slice 1/2A, #116 Slice 2B).

Decidimos migrar para **convite-only**: não há auto-cadastro; o acesso nasce de um convite emitido por um admin.

## Decisão

- **Sem signup público.** A rota `/sign-up` foi removida; `disableSignUp: true` no `authDashboard` (não afeta `signInEmail`).
- **Convite:** admin convida (email + cargo + filiais) em `/dashboard/users`. Cria-se o `user` via `internalAdapter.createUser` (sem credential) — nasce `status='pending'` (default) — e grava-se `inviteToken` + `inviteTokenExpiresAt` (7 dias, single-use) na própria linha de `user`.
- **Aceite:** o convidado abre `/convite?token=…`, define nome + senha. Cria-se a credential (`internalAdapter.createAccount`, `providerId='credential'`), seta-se `status='active'`, limpa-se o token e faz-se `signInEmail` automático.
- **Verificação de email removida** — redundante com o convite-por-link (o token já prova posse do email).

## Consequências

- **`user.status` muda de semântica:** `pending` agora é "convidado, aguardando aceite" — não mais "auto-cadastrado aguardando aprovação manual". `pending → active` ocorre no aceite, não numa aprovação. `suspended` inalterado.
- **"Convite/Invitation" passa a ser conceito do domínio** (revertendo a consequência de ADR-0010 que o negava). Materializado em `user.inviteToken`/`inviteTokenExpiresAt`, sem tabela própria.
- Não há mais triagem de spam nem `rejectUser` de auto-cadastro como fluxo cotidiano; remover acesso é `suspended`/delete.
- O enum `user_status` continua `pending/active/suspended` (sem migration — push-only, ADR-0006). O guard-rail de status (bloquear `pending`/`suspended`) permanece (ADR-0012).
- A última pessoa `super_admin` `active` continua protegida (last-super-admin guard).

## Reabertura

Reabrir signup público exigiria reintroduzir `/sign-up` + allowlist de domínio + triagem de spam — exatamente o que esta decisão eliminou. Só faz sentido se o produto deixar de ser interno.
