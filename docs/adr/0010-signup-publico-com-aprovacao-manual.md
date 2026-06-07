# Signup público de staff com aprovação manual

> **Status: Superseded por [ADR-0013](0013-auth-convite-only.md) (2026-06-05).** O signup público foi removido em favor de convite-only (PR #116) — `/sign-up` não existe mais e `disableSignUp: true` está ativo. O texto abaixo fica como registro histórico da decisão original.

O dashboard usa Better Auth com `emailAndPassword.enabled=true` em `packages/auth/src/dashboard.ts`, o que significa que qualquer pessoa com a URL `/sign-up` cria conta — a conta cai em `status='pending'` (default em `additionalFields.status`) e fica invisível ao dashboard até um admin aprovar via `/dashboard/users`. Avaliamos três caminhos: (a) invite-only com link de token para set-password, (b) signup público com allowlist de domínio (`@emach.com.br`), e (c) manter o público com aprovação manual. Decidimos manter o público — é o caminho que **não requer escrever um flow de invitation** (token, expiração, página `/accept-invite`, reenvio) num momento em que ainda não temos um processo formal de onboarding de staff e o volume esperado é baixo (poucas dezenas de funcionários, não milhares).

Aceitamos os riscos: a página `/sign-up` é pública e indexável, e o admin precisará periodicamente rejeitar contas de spam. Para mitigar, mantemos `rejectUser` como DELETE físico (libera email pra reuso, mantém tabela limpa) e adicionamos bulk-reject no card de pending. Não removemos a possibilidade de virar invite-only depois — é uma mudança aditiva (toggle no `authDashboard` + nova rota).

## Consequências

- `signUp` continua habilitado em `packages/auth/src/dashboard.ts`; novos users nascem com `role='user'` e `status='pending'`.
- O conceito de "Invited" / "Invitation" não existe no domínio (CONTEXT.md mantém `pending → active → suspended` para User status).
- `rejectUser` é DELETE físico — não há `status='rejected'`. Trilha de auditoria fica apenas no `userActivityLog` do ator que rejeitou.
- Bulk-reject no card de pending é parte do escopo desta iteração para tornar a triagem de spam operacional.
- Se o volume de spam tornar a triagem manual inviável, a evolução natural é (1) allowlist de domínio em `authDashboard.emailAndPassword.signUp` ou (2) migração para invite-only — ambas são mudanças localizadas em `packages/auth` + uma rota nova.
- A trilha em `userActivityLog` precisa cachear o email/nome do rejected no `metadata` antes do DELETE (caso contrário, não dá pra investigar quem foi rejeitado).
