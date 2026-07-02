# Follow-ups da review do épico #261 — design

**Data:** 2026-07-02
**Origem:** achados do `/code-review` de três eixos do épico #261 (tabs client-side) + pré-existentes anotados durante o loop de migração. Nenhum é regressão do épico; todos têm causa diagnosticada.
**Empacotamento:** 1 branch/PR único (`fix-followups-261`). Itens independentes entre si — se o item 1 travar no upgrade, degrada pro workaround sem segurar os demais.

## Item 1 — Hydration mismatch `data-slot` no DropdownMenuTrigger

**Sintoma:** badge "1 Issue" do dev overlay nas telas com `DropdownMenuTrigger render={<Button/>}` (listagem de promoções `promotions/page.tsx:151`, `sidebar-footer-user.tsx:96`, design page). O `Button` seta `data-slot="button"` e o `Trigger` seta `data-slot="dropdown-menu-trigger"` (`packages/ui/src/components/dropdown-menu.tsx:17`); o merge de props do base-ui resolve numa ordem no SSR e noutra na hydration.

**Decisão (usuário): upgrade-first.**
1. Checar a versão de `@base-ui-components/react` em `packages/ui/package.json` contra o changelog upstream (procurar fix de ordem determinística de merge no `render`).
2. Se houver **patch/minor** com o fix: bump + `bun verify` + smoke visual nas superfícies principais (listagem de promoções, menu do usuário na sidebar, um form com Select/Dialog).
3. Se **não houver fix** ou for **major**: workaround mínimo — `suppressHydrationWarning` no elemento do `DropdownMenuTrigger` em `packages/ui/src/components/dropdown-menu.tsx`, com comentário explicando o mismatch de ordem de `data-slot` e link da issue upstream. Workaround declarado: esconde mismatches futuros só nesse elemento.

**Sucesso:** dev overlay sem o warning na listagem de promoções.

## Item 2 — Gap de paginação de activity em `users/[id]` para self

**Sintoma:** self sem `users.manage` vê a 1ª página da aba Atividade (gate da tab é self-OU-manage), mas o "load more" falha — `fetchUserActivityByUserPage`/`fetchUserActivityAffectingPage` (`apps/web/src/app/dashboard/users/actions.ts:721-740`) exigem `users.manage` estrito. O helper `requireUserDetailAccess` em `users/[id]/_lib/tab-actions.ts` já documenta a divergência em comentário.

**Fix:** as duas actions de paginação passam a usar o mesmo gate self-OU-manage do helper. Se importar de `_lib/tab-actions.ts` (arquivo `"use server"`) num outro `"use server"` criar atrito, mover o helper para `users/[id]/_lib/access.ts` (server-only puro, sem `"use server"`) e importar nos dois lugares — regra do build: `"use server"` só exporta async functions.

**Sucesso:** self sem `users.manage` pagina a própria atividade; terceiro sem capability segue bloqueado (403/erro).

## Item 3 — `reload()` via Context do LazyTab

**Sintoma:** mutação disparada de dentro de uma tab lazy (revoke de sessão, moderação de review, link/unlink de team) chama `router.refresh()`, que atualiza props do server mas não re-dispara o fetch do `LazyTab` já ativado. Documentado como limitação no ADR-0024.

**Decisão (usuário): expor o `retry` existente via Context.**
- `apps/web/src/components/entity/lazy-tab.tsx`: criar `LazyTabReloadContext` + hook exportado `useLazyTabReload(): () => void`; o `LazyTab` envolve `children` no provider com o `retry` de `useLazyTab`. Fora do provider, o hook devolve no-op (mesmo idioma do `useSetActiveTab`).
- Call sites (mutação dentro de tab lazy → chamar `reload()` no sucesso, mantendo `router.refresh()` onde ele também atualiza KPIs/header):
  1. Revoke de sessão em `users/[id]` (tab Sessões).
  2. Revoke de sessão em `customers/[id]` (tab Sessões — o "revogar todas" do header fica fora, é outra superfície).
  3. Moderação de review em `tools/[id]` (tab Avaliações).
  4. Link/unlink de team em `branches/[id]` (tab Equipe, `TeamLinkPanel`).
  - Durante a implementação, varrer `router.refresh()` dentro de `*-tab-loader.tsx`/componentes de tab lazy para não deixar call site de fora; a lista acima é o mínimo conhecido.
- ADR-0024: a bala de "Limitação conhecida" vira o padrão (`useLazyTabReload` + exemplo canônico), citando este spec.

**Sucesso:** revogar uma sessão na tab Sessões de `users/[id]` remove a linha da lista sem reabrir a tab.

## Item 4 — `KNOWN_TABS` derivado do array de tabs

**Sintoma:** 6 páginas (suppliers, categories, carriers, branches, users, customers) clampam `initialTab` contra `Set` literal mantido à mão — risco de drift silencioso (tab nova esquecida no Set cai no default). `orders` já deriva do array.

**Fix:** helper em `apps/web/src/components/entity/tab-url.ts`:
`clampInitialTab(raw: string | undefined, tabs: readonly { value: string }[], defaultValue: string): string` — irmão de `resolveTabFromSearch`, com testes em `tab-url.test.ts`. As 8 páginas de detalhe (6 acima + orders + promotions) passam a construir o array `tabs` primeiro e clampar com o helper; apagar os `Set` literais. Zero mudança de comportamento (tabs condicionais já entram/saem do array no server).

## Gate e verificação

- `bun verify` (check-types + ultracite + 615+ testes) e `bun run build` (item 2 toca `"use server"`).
- Smoke browser (dev server :3001, sessão Brave): (1) listagem de promoções sem "1 Issue"; (3) revoke de sessão atualiza a lista in-place; (4) deep-link `?tab=` segue clampando em 2 páginas amostradas; (2) verificação de código + teste manual se houver user self de teste sem `users.manage`.
- Merge no fluxo aprovado (CI `quality` verde → squash).
