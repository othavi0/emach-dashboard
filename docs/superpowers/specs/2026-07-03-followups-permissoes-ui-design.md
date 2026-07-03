# Follow-ups da leva de permissões de UI (PR #289)

> Data: 2026-07-03 · Origem: findings triados como follow-up no review final do branch `ajustes-usuario` (PR #289). Depende do código já mergeado/em-PR dessa leva.

## Contexto

O review final de `ajustes-usuario` marcou como Ready to merge e listou follow-ups não-bloqueantes. Este spec cobre a leva de acabamento decidida com o usuário: hardening de teste, polish de UX, cleanup de storage e consistência de código. Todos são mudanças pequenas e localizadas nos arquivos da feature original.

### Decisões (fechadas com o usuário)

- Escopo: itens #2–#7 (todos os follow-ups de código). **#1 (teste automatizado do fluxo de e-mail) fica de fora** — a corretude já foi verificada lendo o bundle do `better-auth@1.6.11`; teste unitário das send-fns seria raso e integração real é cara. Validação = QA manual (Resend), registrada como nota no PR.
- Cleanup de avatar (#4): gatilho **no save** (`updateOwnProfile`), best-effort pós-commit.

## Não-objetivos

- Teste de integração/unitário do fluxo de troca de e-mail (#1) — QA manual.
- Qualquer mudança de comportamento no fluxo de auth (double opt-in) ou nos gates de segurança já entregues — esta leva é acabamento, não altera invariantes.
- Cleanup de órfãos de "upload-e-cancela" de avatar — fora de escopo (mesma divergência aceita documentada para `tool-images`).

## Mudanças

### #2 — Teste de self-scope do `updateOwnProfile`
**Arquivo:** `apps/web/src/app/dashboard/users/__tests__/update-own-profile.test.ts`

O teste atual assere que `.set({ name })` recebe só o nome, mas **não** cobre a cláusula `.where()` (a garantia de que só o próprio usuário é atualizado) nem a auditoria. Estender o mock do query-builder para capturar o `.where(...)` e o de `@/lib/activity` para capturar `logUserActivity`, e assertir:
- `.where` chamado com `eq(userTable.id, session.user.id)` (self-scope — o invariante de segurança central da action).
- `logUserActivity` chamado com `action: "user.self_updated"` e `actorUserId` = id da sessão.

Segue o padrão de mock já usado no arquivo (`vi.hoisted` + mock de `@emach/db`/`@emach/auth/dashboard`). Sem mudança de código de produção.

### #3 — Label "Editar meus dados" no self-view
**Arquivos:** `edit-user-button.tsx`, `user-detail-actions.tsx`, `users/[id]/page.tsx`

Hoje o botão sempre diz "Editar Usuário", mesmo no self-view (onde abre o sheet "Editar meus dados") — inconsistência de label. Fix:
- `EditUserButton` ganha prop `label: string` (default mantém "Editar Usuário" para não quebrar outros usos, se houver).
- `page.tsx` computa `editLabel = isSelf ? "Editar meus dados" : "Editar usuário"` e passa via `UserDetailActions` → `EditUserButton`. Passa-se a **string derivada**, não o boolean `isSelf` (que foi removido de `UserDetailActions` no fix da Critical do dead-nav; não re-introduzir).

### #4 — Cleanup de avatar antigo no save
**Arquivo:** `apps/web/src/app/dashboard/users/actions.ts` (`updateOwnProfile`)

Quando um `image` novo é salvo, o arquivo antigo fica órfão no bucket `user-avatars`. Fix (espelha `deleteToolImage`):
- Antes do `db.update`, ler o `image` atual do próprio usuário.
- Após o commit, se `parsed.data.image` foi fornecido, difere do atual, e o antigo é uma URL do bucket `user-avatars`: `removeStorageObject(USER_AVATARS_BUCKET, extractPublicUrlPath(oldUrl, USER_AVATARS_BUCKET))` em **best-effort** (try/catch + `logger.error` no erro, sem quebrar a action).
- Importar `removeStorageObject`/`extractPublicUrlPath` de `@/lib/storage` e `USER_AVATARS_BUCKET` de `@/lib/supabase-server`.

Órfãos de upload-e-cancela permanecem (fora de escopo). Custo de storage desprezível.

### #5 — Unificar onde `!isSelf` é aplicado
**Arquivos:** `users/[id]/page.tsx`, `security-tab.tsx`

Inconsistência de padrão apontada no review: `canManageBranches`/`canUnlink`/`canManageStatus`/`canRevoke`/`canDelete` já chegam pré-multiplicados por `!isSelf` do `page.tsx`, mas `canResetPassword`/`canRevokeSessions` chegam **crus** ao `SecurityTab` e são multiplicados por `!isSelf` dentro do JSX. Unificar para o padrão pré-gated:
- `page.tsx` passa `canResetPassword={!isSelf && canResetPassword}` e `canRevokeSessions={!isSelf && canRevokeSessions}`.
- `SecurityTab` simplifica as condições para `{canResetPassword && …}` / `{canRevokeSessions && …}`, mantendo `isSelf` apenas para `{isSelf && <ChangeMyPasswordCard />}`.

**Risco (do review):** é lift-and-shift; verificar no smoke que a aba Segurança permanece correta nos dois modos (self → sem reset/force-logout, com trocar-senha; admin-gerencia-outro → reset/force-logout conforme capability).

### #6 — Limpar `.catch` morto no upload de avatar
**Arquivo:** `user-self-edit-sheet.tsx`

`onChange` do input de foto faz `onPickAvatar(e).catch(() => undefined)`, mas `onPickAvatar` já trata o próprio erro (via `notify`) — o `.catch` é morto. Trocar por `void onPickAvatar(e)` (marca a promise como intencionalmente não-aguardada). Se o lint de floating-promise exigir outra forma, usar a idiomática já presente no repo. Confirmar que `onPickAvatar` de fato não rejeita antes de trocar.

### #7 — Enviar só o campo que mudou
**Arquivo:** `user-self-edit-sheet.tsx`

O submit chama `updateOwnProfile({ name, image })` com ambos mesmo que só um tenha mudado. Passar a incluir só o(s) campo(s) alterado(s) (comparando com os valores iniciais). Evita reescrita redundante e combina com o #4 (não dispara a comparação de cleanup à toa). `updateOwnProfile` já monta o `update` condicionalmente, então enviar um subconjunto é seguro.

## Testes

- **#2:** o próprio teste é o entregável (RED→GREEN sobre as novas asserções).
- **#3, #6, #7:** sem teste novo (mudanças de UI/label; a suíte é env node sem render). Cobertura = `check-types` + smoke no browser.
- **#4:** teste unitário opcional do caminho de cleanup (assertir `removeStorageObject` chamado com o path extraído quando o image muda; não chamado quando igual). Recomendado por ser lógica de produção nova, mas leve.
- **#5:** sem teste novo (gating de UI); **smoke obrigatório** nos dois modos (self e admin-gerencia-outro) por ser o item de maior risco de regressão.
- Gate final: `bun verify` (check-types + check + test) + `bun run build` + smoke no browser em `localhost:3008` (role `user` já logado para o self-view; admin exige QA à parte).

## Ordem sugerida (por risco/independência)

1. #2 (teste, isolado) · 2. #3 (label) · 3. #6 + #7 (sheet) · 4. #4 (cleanup, actions) · 5. #5 (unify, maior risco — por último, com smoke dedicado).

Arquivos com sobreposição (execução **sequencial**, não paralela): `page.tsx` (#3, #5), `actions.ts` (#4, #7 indireto), `user-self-edit-sheet.tsx` (#6, #7).
