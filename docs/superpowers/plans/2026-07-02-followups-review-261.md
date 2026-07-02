# Follow-ups da review do épico #261 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver os 4 achados pós-review do épico #261: clamp derivado (helper), gate de paginação self, reload() em tab lazy, e hydration mismatch do DropdownMenuTrigger.

**Architecture:** Tudo sobre a fundação de tabs client-side já existente (`apps/web/src/components/entity/`). Item 4 vira helper puro testável em `tab-url.ts`; item 2 move um guard para módulo server-only compartilhável; item 3 expõe o `retry` do `LazyTab` via Context; item 1 é bump de dependência com fallback documentado.

**Tech Stack:** Next 16 / React 19, Base UI (`@base-ui/react`), bun + vitest, monorepo turbo.

**Spec:** `docs/superpowers/specs/2026-07-02-followups-review-261-design.md` (ler antes de começar).

## Global Constraints

- Branch de trabalho: `fix-followups-261` (já existe, spec commitado nela). Commits em Conventional Commits PT, subject ≤50 chars.
- Read cada arquivo antes de Edit (`cat`/`sed` NÃO contam para o harness); Edit falhou com "string not found" → re-Read antes de re-tentar (hook PostToolUse roda `bun fix` e reformata).
- `bun check-types` cedo em cada task; gate final da branch = `bun verify` + `bun run build` (item 2 toca arquivo `"use server"`).
- Proibido: `console.*`, `any`, `@ts-ignore`, `useMemo`/`useCallback` manuais (React Compiler), barrel files novos.
- Arquivo `"use server"` só pode exportar async functions (regra de build, não de tsc).
- NÃO abrir browser/MCP/dev server nas tasks — smoke visual é do orquestrador no gate final.
- Paths com `[id]` quebram glob no shell — citar paths entre aspas.

---

### Task 1: Helper `clampInitialTab` + migrar as 8 páginas

**Files:**
- Modify: `apps/web/src/components/entity/tab-url.ts` (adicionar helper)
- Test: `apps/web/src/components/entity/tab-url.test.ts` (adicionar describe)
- Modify (8 páginas — apagar `Set` literal, usar helper):
  - `apps/web/src/app/dashboard/suppliers/[id]/page.tsx:51-52`
  - `apps/web/src/app/dashboard/users/[id]/page.tsx:77-85`
  - `apps/web/src/app/dashboard/shipping/carriers/[id]/page.tsx:21,34`
  - `apps/web/src/app/dashboard/branches/[id]/page.tsx:58-65`
  - `apps/web/src/app/dashboard/promotions/[id]/page.tsx:45-46`
  - `apps/web/src/app/dashboard/customers/[id]/page.tsx:40-...`
  - `apps/web/src/app/dashboard/categories/[id]/page.tsx` (procurar `KNOWN_TABS`)
  - `apps/web/src/app/dashboard/orders/[id]/page.tsx:117-123` (já deriva do array; só trocar pelo helper)

**Interfaces:**
- Produces: `clampInitialTab(raw: string | undefined, tabs: readonly { value: string }[], defaultValue: string): string` exportado de `@/components/entity/tab-url`.

- [x] **Step 1: Escrever os testes (falhando)** — em `tab-url.test.ts`, adicionar:

```ts
describe("clampInitialTab", () => {
	const TABS = [{ value: "overview" }, { value: "estoque" }];

	it("aceita tab conhecida", () => {
		expect(clampInitialTab("estoque", TABS, "overview")).toBe("estoque");
	});

	it("cai no default quando raw é undefined", () => {
		expect(clampInitialTab(undefined, TABS, "overview")).toBe("overview");
	});

	it("clampa valor desconhecido para o default", () => {
		expect(clampInitialTab("hacker", TABS, "overview")).toBe("overview");
	});
});
```

(importar `clampInitialTab` junto do import existente de `buildTabHref, resolveTabFromSearch`)

- [x] **Step 2: Rodar e ver falhar** — `bun test apps/web/src/components/entity/tab-url.test.ts` → FAIL (export não existe).

- [x] **Step 3: Implementar o helper** — em `tab-url.ts`, acima de `buildTabHref`:

```ts
/**
 * Clamp server-side do `?tab=` contra as tabs realmente montadas — derivado
 * do array (não de Set literal) para não driftar quando uma tab condicional
 * entra/sai (ex: "reembolso" em orders, "permissoes" em users).
 */
export function clampInitialTab(
	raw: string | undefined,
	tabs: readonly { value: string }[],
	defaultValue: string
): string {
	return raw && tabs.some((t) => t.value === raw) ? raw : defaultValue;
}
```

- [x] **Step 4: Rodar e ver passar** — `bun test apps/web/src/components/entity/tab-url.test.ts` → PASS.

- [x] **Step 5: Migrar as 8 páginas.** Em cada `page.tsx`: Read o arquivo inteiro; localizar o `Set` literal `KNOWN_TABS` e o cálculo de `initialTab`. Reordenar se preciso para que o array `tabs: EntityClientTab[]` seja construído ANTES do clamp (todos os dados já estão fetched nesse ponto), apagar o `Set`, e trocar por:

```ts
const initialTab = clampInitialTab(sp.tab, tabs, "overview"); // default de cada página
```

Import: `import { clampInitialTab } from "@/components/entity/tab-url";`. Defaults por página: suppliers `"overview"`, users `"profile"`, carriers `DEFAULT_TAB` (const existente), branches `"overview"`, promotions `"overview"`, customers `"perfil"`, categories `DEFAULT_TAB`/`"visao-geral"` (conferir no arquivo), orders `DEFAULT_TAB` (já existe — só trocar a expressão manual pelo helper). ATENÇÃO users: a tab `permissoes` é condicional (`targetManageable`) — como o array já é condicional, o helper cobre; apagar também o spread condicional do Set antigo. ATENÇÃO orders: `reembolso` condicional idem.

- [x] **Step 6: Verificar** — `bun check-types` → verde; `rg -n "KNOWN_TABS" apps/web/src` → só ocorrências em comentários/nenhuma.

- [x] **Step 7: Commit** — `git add -A && git commit -m "refactor(entity): clampInitialTab derivado do array"` (body: cita spec + elimina drift de Set literal, refs #261).

---

### Task 2: Gate self-OU-manage na paginação de activity

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/_lib/access.ts`
- Modify: `apps/web/src/app/dashboard/users/[id]/_lib/tab-actions.ts` (remover helper local, importar do novo)
- Modify: `apps/web/src/app/dashboard/users/actions.ts:721-740` (trocar gate das 2 actions)

**Interfaces:**
- Produces: `requireUserDetailAccess(targetUserId: string): Promise<Session>` exportado de `.../users/[id]/_lib/access.ts` (server-only, SEM `"use server"`).
- Consumes: `requireCurrentSession` (`@/lib/session`), `getUserCapabilities` (`@/lib/permissions` — conferir path exato no import atual de `tab-actions.ts`).

- [x] **Step 1: Criar `access.ts`** — mover o helper `requireUserDetailAccess` de `tab-actions.ts` (Read primeiro; o corpo atual está em `tab-actions.ts` ~linha 27) para o arquivo novo, com `import "server-only";` no topo e os mesmos imports (`requireCurrentSession`, `getUserCapabilities`). Manter o JSDoc, atualizando a nota: agora também é o gate das actions de paginação de `users/actions.ts`.

- [x] **Step 2: Atualizar `tab-actions.ts`** — remover a definição local e importar: `import { requireUserDetailAccess } from "./access";`. NÃO re-exportar (regra "use server").

- [x] **Step 3: Trocar o gate das 2 actions de paginação** — em `users/actions.ts`, nas funções `fetchUserActivityByUserPage` e `fetchUserActivityAffectingPage`, substituir a linha `await requireCapabilityWithContext("users.manage", { targetUserId: userId });` por `await requireUserDetailAccess(userId);` com import `import { requireUserDetailAccess } from "./[id]/_lib/access";` (conferir path relativo real — `actions.ts` fica em `users/`, o helper em `users/[id]/_lib/`).

- [x] **Step 4: Verificar** — `bun check-types` verde; `bun --cwd apps/web test` verde; como `actions.ts` é `"use server"`, anotar que o gate final da branch precisa de `bun run build`.

- [x] **Step 5: Commit** — `git commit -m "fix(users): paginação de activity aceita self"` (body: gate self-OU-manage alinhado ao da tab, fecha gap onde self via 1ª página mas não paginava; refs spec).

---

### Task 3: `reload()` via Context do LazyTab + call sites

**Files:**
- Modify: `apps/web/src/components/entity/lazy-tab.tsx`
- Modify (call sites confirmados):
  - `apps/web/src/app/dashboard/users/[id]/_components/sessions-list.tsx` (revoke de sessão — linhas ~31-40)
  - `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx:53` (moderação — usado dentro da tab Avaliações de tools E na listagem de reviews)
  - `apps/web/src/app/dashboard/branches/[id]/_components/team-member-card.tsx` (unlink)
  - `apps/web/src/app/dashboard/branches/[id]/_components/team-link-panel.tsx` (link)
- Modify: `docs/adr/0024-tabs-client-side-detalhe-entidade.md` (bala "Limitação conhecida")
- Test: `apps/web/src/components/entity/lazy-tab.test.tsx` (cobertura do no-op fora do provider)

**Interfaces:**
- Produces: `useLazyTabReload(): () => void` exportado de `@/components/entity/lazy-tab`. Dentro de um `LazyTab`, devolve o `retry` (re-fetch da tab); fora, devolve no-op estável.

- [ ] **Step 1: Fundação no `lazy-tab.tsx`** — Read o arquivo; adicionar Context + hook (mesmo idioma do `TabSetActiveContext` de `entity-client-tabs.tsx`):

```tsx
const LazyTabReloadContext = createContext<() => void>(() => {
	// no-op fora do provider (ex: componente usado fora de tab lazy)
});

/**
 * Re-dispara o fetch do LazyTab que envolve o componente. Mutações dentro de
 * tabs lazy chamam após sucesso — router.refresh() atualiza props do server,
 * mas não o dado buscado pelo loader (ADR-0024).
 */
export function useLazyTabReload(): () => void {
	return useContext(LazyTabReloadContext);
}
```

E no `LazyTab`, envolver o `LazyTabView` no provider: `<LazyTabReloadContext.Provider value={retry}>...</LazyTabReloadContext.Provider>`. Import de `createContext, useContext` no react import existente.

- [ ] **Step 2: Teste** — em `lazy-tab.test.tsx` (Read primeiro; segue o padrão `renderToStaticMarkup` de `entity-client-tabs.test.tsx`): adicionar teste de que um componente que chama `useLazyTabReload()` fora de provider renderiza sem lançar (no-op default). Rodar `bun test apps/web/src/components/entity/` → PASS.

- [ ] **Step 3: Call sites** — em cada arquivo listado (Read antes): adicionar `const reloadTab = useLazyTabReload();` e chamar `reloadTab()` no caminho de sucesso da mutação, MANTENDO o `router.refresh()` existente (ele atualiza KPIs/header; o reload atualiza a tab). Exemplo (sessions-list):

```tsx
const reloadTab = useLazyTabReload();
const revoke = (sessionId: string) => {
	startTransition(async () => {
		const res = await revokeUserSession({ sessionId });
		if (res.ok) {
			reloadTab();
		}
		// ...tratamento existente de erro/refresh permanece
	});
};
```

Adaptar ao código real de cada arquivo (não colar cegamente — ler o fluxo de sucesso de cada mutação). Em `moderate-actions.tsx` o componente também roda FORA de tab lazy (listagem de reviews) — o no-op cobre; nenhuma condicional necessária.

- [ ] **Step 4: Sweep de call sites esquecidos** — `rg -n "router.refresh" apps/web/src/app/dashboard --glob '*.tsx'` e classificar: componente renderizado DENTRO de tab lazy (via `*-tab-loader.tsx`) sem `reloadTab()` → adicionar; componente de tab eager/página → deixar. Documentar no report quais ficaram de fora e por quê.

- [ ] **Step 5: ADR-0024** — Read a seção Consequências; reescrever a bala "Limitação conhecida (herdada do piloto...)": mutação dentro de tab lazy agora chama `useLazyTabReload()` no sucesso (padrão, exemplo canônico `sessions-list.tsx`); `router.refresh()` continua para props do server. Remover a frase "o padrão atual é o usuário reabrir a tab".

- [ ] **Step 6: Verificar + commit** — `bun check-types` + `bun --cwd apps/web test` verdes → `git commit -m "feat(entity): reload de tab lazy pós-mutação"` (body: useLazyTabReload via Context, call sites sessions/moderação/team, ADR atualizado; refs spec).

---

### Task 4: Hydration mismatch do DropdownMenuTrigger (upgrade-first)

**Files:**
- Modify: `packages/ui/package.json:17` (`"@base-ui/react": "^1.4.0"`)
- Fallback: `packages/ui/src/components/dropdown-menu.tsx:17`

**Interfaces:** nenhuma nova — mudança de dependência/atributo.

- [ ] **Step 1: Pesquisar o fix upstream** — `npm view @base-ui/react versions` mostra 1.4.1/1.5.0/1.6.0 disponíveis. Checar changelog/issues (WebFetch em `https://github.com/mui/base-ui/releases` e buscar por "data-slot"/"hydration"/"render prop merge") por um fix de ordem determinística de merge de atributos no `render`. Registrar no report o que encontrou (com link), mesmo que nada.

- [ ] **Step 2: Tentar o upgrade (minor)** — editar `packages/ui/package.json` para `"@base-ui/react": "^1.6.0"`, rodar `bun install`, depois `bun check-types` e `bun --cwd apps/web test`. Se check-types quebrar com breaking change de API do base-ui em >3 componentes, ABORTAR o upgrade (`git checkout packages/ui/package.json bun.lock`) e ir pro Step 4 (fallback).

- [ ] **Step 3: Validar o fix (se upgrade aplicou)** — o orquestrador valida visualmente no gate final (dev overlay sem "1 Issue" na listagem de promoções). Nesta task, apenas garantir gates verdes e registrar no report que a validação visual está pendente.

- [ ] **Step 4 (fallback, SÓ se Step 2 abortou ou o orquestrador reportar que o warning persiste):** em `dropdown-menu.tsx:17`, adicionar `suppressHydrationWarning` ao Trigger com comentário:

```tsx
return (
	<MenuPrimitive.Trigger
		data-slot="dropdown-menu-trigger"
		// Workaround: com render={<Button/>}, a ordem de merge do data-slot
		// diverge entre SSR e hydration (base-ui). Suprime só este elemento.
		// Upstream: <link da issue, se encontrado no Step 1>
		suppressHydrationWarning
		{...props}
	/>
);
```

- [ ] **Step 5: Commit** — upgrade: `git commit -m "chore(ui): bump @base-ui/react para 1.6.0"` (body: motivo hydration mismatch data-slot, refs spec). Fallback: `git commit -m "fix(ui): suprime hydration warning do menu trigger"`.

---

### Task 5 (orquestrador): gate integrado + PR

- [ ] `bun verify` + `bun run build` na branch (build obrigatório — Task 2 tocou `"use server"`).
- [ ] Smoke browser (dev :3001, sessão Brave): listagem de promoções sem "1 Issue" no dev overlay; revoke de sessão em `users/[id]?tab=sessions` remove a linha in-place; deep-link `?tab=` inválido cai no default em 2 páginas amostradas; "load more" de activity segue ok como super_admin.
- [ ] PR `fix-followups-261` → main, body com os 4 itens + resultado do smoke, "Refs #261" e link do spec. CI verde → squash-merge (fluxo aprovado).

## Self-review do plano

- Cobertura do spec: item 1→Task 4, item 2→Task 2, item 3→Task 3, item 4→Task 1, gate→Task 5. ✓
- Sem placeholders; código completo nos steps de código. ✓
- Consistência de nomes: `clampInitialTab`, `useLazyTabReload`, `requireUserDetailAccess` usados uniformemente. ✓
