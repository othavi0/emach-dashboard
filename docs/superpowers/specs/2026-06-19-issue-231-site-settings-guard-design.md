# Issue #231 — Hardening do guard de `site/settings`

**Data:** 2026-06-19
**Issue:** [#231](https://github.com/othavioquiliao/emach-dashboard/issues/231) (label `ready-for-agent`)
**Origem:** achado no review do 006-B (pré-existente, não introduzido por ele)
**Severidade:** baixa (nenhuma mutação possível) — é defense-in-depth, não exploit.

## Problema

`apps/web/src/app/dashboard/site/settings/page.tsx` (`SettingsPageContent`) guarda com
`requireCurrentSession()`, enquanto as server actions de settings enforçam a capability
`site.update_settings`. Um usuário autenticado/ativo **sem** a capability consegue **ver** a
página (frete/redes), embora **não consiga salvar** (as actions barram a mutação). É uma
discrepância de visibilidade vs. mutação.

A exploração mostrou que o problema tem **duas camadas**, não uma:

1. **Página** (caminho normal de navegação): o guard fraco deixa a casca renderizar.
2. **Endpoints de leitura** (camada abaixo): `getOrCreateShippingSettings` e
   `listOriginBranchOptions` são exportadas de um módulo `"use server"` —
   logo, são **endpoints POST chamáveis por qualquer sessão** (ADR-0018). Sem guard próprio,
   um user sem a cap reconstrói a view chamando as actions direto, **mesmo com a página
   redirecionando**. Retornariam settings (origem de frete, URLs sociais) + nomes/CEPs das
   filiais.

## Decisão

**Capability correta = `site.update_settings`** (não `site.read`):

- A nav já gateia o item "Configurações" com `site.update_settings`
  (`apps/web/src/app/dashboard/_components/nav-config.ts:138`); o guard da página **espelha a
  nav**. Usar `site.read` (que é `[super_admin, admin]`) criaria nova inconsistência: link
  escondido pro admin, mas página acessível a ele.
- As actions de mutação (`settings/actions.ts:77,120`) já usam `site.update_settings`.
- `site.read` (descrição "Visualizar configurações do site", `defaultRoles: [super_admin,
  admin]`) é **dead code** — definida em `capabilities.ts:262` mas só referenciada no snapshot
  `permissions.disabled.ts`. Não faz parte deste fix (ver Fora de escopo).

**Escopo = defense-in-depth completo** (fecha as duas camadas): troca o guard da página **e**
adiciona guard nas duas reads. Seguro: as duas reads são chamadas **só** por
`settings/page.tsx` (verificado — sem callers externos), então guardá-las não quebra nenhum
outro fluxo. O lazy bootstrap do singleton segue ok (a mutação também faz upsert; o app
ecommerce lê a tabela direto, não esta action).

## Mudanças

### `apps/web/src/app/dashboard/site/settings/page.tsx`

```diff
- import { requireCurrentSession } from "@/lib/session";
+ import { requireCapabilityOrRedirect } from "@/lib/permissions";
  ...
  async function SettingsPageContent() {
-   await requireCurrentSession();
+   await requireCapabilityOrRedirect("site.update_settings");
```

(`requireCurrentSession` não é usada em mais nenhum lugar do arquivo — troca limpa de import.)

### `apps/web/src/app/dashboard/site/settings/actions.ts`

`requireCapability` já está importada (`:15`). Adicionar no início de cada read:

```diff
  export async function getOrCreateShippingSettings(): Promise<StoreSettings> {
+   await requireCapability("site.update_settings");
    ...
  export async function listOriginBranchOptions(): Promise<OriginBranchOption[]> {
+   await requireCapability("site.update_settings");
    ...
```

Espelha o padrão das reads de `banners/actions.ts` (`fetchBanners` → `requireCapability("site.update_banners")`).

## Fora de escopo (registrar, não fazer aqui)

- **`site.read` dead code** — remover do catálogo ou wire-up real é decisão à parte.
- **Pages de banners** (`banners/page.tsx`, `banners/[id]/edit/page.tsx`) não têm guard no
  topo; ficam seguros porque `fetchBanners`/`fetchBanner` se auto-guardam (`site.update_banners`,
  que **lança** em vez de redirecionar). Alinhar pro padrão redirect é cosmético/UX, não
  segurança.

Ambos valem um issue de cleanup separado.

> **Addendum (2026-06-20):** ambos os itens acima foram resolvidos no PR #235
> (`chore/site-guards-cleanup`) — guard `requireCapabilityOrRedirect` no topo dos
> pages de banners + remoção da cap morta `site.read` do catálogo (47→46). Este
> spec permanece como registro da decisão do #231.

## Verificação

- `bun verify` (check-types + check + test) — gate.
- Smoke opcional no browser: super_admin vê a página; sessão sem `site.update_settings` é
  redirecionada (página) e recebe erro de capability ao chamar as reads (endpoint).
- Sem migração de schema; sem mudança de UI.
