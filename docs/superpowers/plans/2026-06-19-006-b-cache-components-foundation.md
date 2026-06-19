# 006-B Fase 1 — Fundação Cache Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar `cacheComponents: true` no dashboard (Next 16) deferindo os reads de sessão pra baixo de `<Suspense>`, sem cachear dado nenhum, mantendo a auth 100% idêntica.

**Architecture:** O `dashboard/layout.tsx` para de dar `await` na sessão no topo (o que bloqueava o prerender). A lógica session-dependent (gate pending/suspended + sidebar) vai pra um componente async `DashboardChrome` sob `<Suspense>` (fallback `SidebarSkeleton`); o frame do layout prerenderiza estático. As 5 páginas auth/landing deferem seu próprio read de sessão do mesmo jeito. O `SidebarProvider` passa a ler o cookie de aberto/fechado no client (o layout não lê mais server-side). ZERO `use cache` — todo dado segue lido no request.

**Tech Stack:** Next.js 16.2 (App Router, Turbopack, `cacheComponents`), React 19 (React Compiler ON), Better Auth (`@emach/auth/dashboard`), Vitest (`environment: node`), `@emach/ui` (sidebar vendored shadcn).

## Global Constraints

- **ZERO `use cache`** nesta fase. Nenhum dado é cacheado; tudo lê no request (nas dynamic holes).
- **Auth fica no RSC, SEM middleware** (respeita ADR-0021).
- `cacheComponents: true` é **top-level** no `next.config.ts` (Next 16; o `experimental.cacheComponents` está deprecado).
- Anti-patterns banidos (raiz `CLAUDE.md`): sem `console.*` (usar `logger`); sem `any`/`as any`/`@ts-ignore`/`@ts-expect-error`; sem `key={index}` em `.map()` (IDs estáveis); `next/image` (não `<img>`); sem `React.forwardRef`; sem `useMemo`/`useCallback` manuais em código novo (React Compiler) — exceto código **vendored** já existente (`SidebarProvider` já usa `useCallback`, manter).
- Antes de cada commit: `bun verify` (= `bun check-types && bun check && bun --cwd apps/web test`). Paths são absolutos a partir da raiz do monorepo (CWD = raiz).
- Cada `Read` antes de `Edit`; se `Edit` falhar com `string not found`, re-`Read` (o hook PostToolUse roda `bun fix` e pode reordenar imports).

---

### Task 1: `DashboardChrome` + `SidebarSkeleton` + teste de regressão de auth

Extrai a lógica session-dependent do layout (gate + sidebar) num componente async testável e cria o fallback do Suspense. **Ainda não wireia no layout** (Task 3 faz isso).

**Files:**
- Create: `apps/web/src/app/dashboard/_components/dashboard-chrome.tsx`
- Create: `apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx`
- Test: `apps/web/src/app/dashboard/_components/__tests__/dashboard-chrome.test.ts`

**Interfaces:**
- Consumes: `requireCurrentSession()` / `getUserStatus(session)` de `@/lib/session`; `can(session, cap)` / `getUserCapabilities(session)` de `@/lib/permissions`; `fetchDashboardCounts()` de `../pending-data`; `AppSidebar` de `./app-sidebar` (props: `canManageUsers: boolean`, `capabilities: Capability[]`, `countsPromise: Promise<DashboardCounts>`, `user`).
- Produces: `DashboardChrome(): Promise<React.ReactElement>` (async RSC; redireciona `pending`→`/pending`, `suspended`→`/suspended`, senão renderiza `<AppSidebar>`). `SidebarSkeleton(): React.ReactElement`.

- [ ] **Step 1: Escrever o teste de regressão de auth (falha)**

Create `apps/web/src/app/dashboard/_components/__tests__/dashboard-chrome.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentSession = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
	vi.fn((path: string) => {
		throw new Error(`REDIRECT:${path}`);
	})
);
const mockCan = vi.hoisted(() => vi.fn());
const mockGetUserCapabilities = vi.hoisted(() => vi.fn());
const mockFetchDashboardCounts = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/session", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/session")>();
	return { ...actual, requireCurrentSession: mockRequireCurrentSession };
});
vi.mock("@/lib/permissions", () => ({
	can: mockCan,
	getUserCapabilities: mockGetUserCapabilities,
}));
vi.mock("../../pending-data", () => ({
	fetchDashboardCounts: mockFetchDashboardCounts,
}));
vi.mock("../app-sidebar", () => ({ AppSidebar: () => null }));

import { DashboardChrome } from "../dashboard-chrome";

function sessionWith(status: string, role = "admin") {
	return {
		user: {
			id: "u1",
			name: "Teste",
			email: "t@e.com",
			role,
			image: null,
			status,
		},
	};
}

describe("DashboardChrome — gate de auth", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCan.mockResolvedValue(true);
		mockGetUserCapabilities.mockResolvedValue(new Set());
		mockFetchDashboardCounts.mockReturnValue(Promise.resolve({}));
	});

	it("redireciona pending → /pending", async () => {
		mockRequireCurrentSession.mockResolvedValue(sessionWith("pending"));
		await expect(DashboardChrome()).rejects.toThrow("REDIRECT:/pending");
		expect(mockRedirect).toHaveBeenCalledWith("/pending");
	});

	it("redireciona suspended → /suspended", async () => {
		mockRequireCurrentSession.mockResolvedValue(sessionWith("suspended"));
		await expect(DashboardChrome()).rejects.toThrow("REDIRECT:/suspended");
		expect(mockRedirect).toHaveBeenCalledWith("/suspended");
	});

	it.each(["super_admin", "admin", "user"])(
		"active (%s) renderiza sem redirect",
		async (role) => {
			mockRequireCurrentSession.mockResolvedValue(sessionWith("active", role));
			const el = await DashboardChrome();
			expect(mockRedirect).not.toHaveBeenCalled();
			expect(el).toBeTruthy();
		}
	);
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `bun --cwd apps/web run vitest run src/app/dashboard/_components/__tests__/dashboard-chrome.test.ts`
Expected: FAIL — `Cannot find module '../dashboard-chrome'` (ainda não existe).

- [ ] **Step 3: Criar `DashboardChrome`**

Create `apps/web/src/app/dashboard/_components/dashboard-chrome.tsx` (extração literal das linhas 27-67 do `layout.tsx` atual):

```tsx
import { redirect } from "next/navigation";
import { can, getUserCapabilities } from "@/lib/permissions";
import { getUserStatus, requireCurrentSession } from "@/lib/session";
import { fetchDashboardCounts } from "../pending-data";
import { AppSidebar } from "./app-sidebar";

/**
 * Dynamic hole do dashboard layout: concentra TUDO que depende da sessão.
 * Renderizado sob <Suspense> no layout (fallback = SidebarSkeleton) pra que o
 * frame do layout prerenderize estático sob cacheComponents (006-B).
 */
export async function DashboardChrome() {
	const session = await requireCurrentSession();
	const status = getUserStatus(session);
	if (status === "pending") {
		redirect("/pending");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}

	const [canManageUsers, capsSet] = await Promise.all([
		can(session, "users.approve"),
		getUserCapabilities(session),
	]);

	// Counts NÃO são aguardados: a promise flui pra sidebar e cada badge a consome
	// sob <Suspense> (use()). fetchDashboardCounts é memoizado por request (cache()).
	const countsPromise = fetchDashboardCounts();

	return (
		<AppSidebar
			canManageUsers={canManageUsers}
			capabilities={[...capsSet]}
			countsPromise={countsPromise}
			user={{
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
				role: session.user.role,
				image: session.user.image,
			}}
		/>
	);
}
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `bun --cwd apps/web run vitest run src/app/dashboard/_components/__tests__/dashboard-chrome.test.ts`
Expected: PASS (5 testes: pending, suspended, e 3× active).

- [ ] **Step 5: Criar `SidebarSkeleton` (fallback do Suspense)**

Create `apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx`:

```tsx
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@emach/ui/components/sidebar";
import { Skeleton } from "@emach/ui/components/skeleton";

// Chaves estáveis (não index) pras linhas do skeleton — lista fixa, nunca reordena.
const NAV_ROWS = [
	"dashboard",
	"catalogo",
	"pedidos",
	"estoque",
	"clientes",
	"reviews",
	"config",
	"usuarios",
] as const;

/** Fallback do <Suspense> do dashboard layout enquanto a sessão resolve. */
export function SidebarSkeleton() {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center justify-center px-2 py-2">
					<Skeleton className="h-7 w-28" />
				</div>
			</SidebarHeader>
			<SidebarContent className="gap-2 px-2 py-2">
				{NAV_ROWS.map((row) => (
					<Skeleton className="h-8 w-full" key={row} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<Skeleton className="h-10 w-full" />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
```

- [ ] **Step 6: Verificar tipos/lint e commitar**

Run: `bun check-types && bun check`
Expected: ambos verdes (0 erros).

```bash
git add apps/web/src/app/dashboard/_components/dashboard-chrome.tsx apps/web/src/app/dashboard/_components/sidebar-skeleton.tsx apps/web/src/app/dashboard/_components/__tests__/dashboard-chrome.test.ts
git commit -m "feat(006-b): extrai DashboardChrome + SidebarSkeleton com teste de auth"
```

---

### Task 2: `SidebarProvider` lê o cookie aberto/fechado no client

Hoje o `SidebarProvider` recebe `defaultOpen` lido server-side no layout. Como o layout vai parar de ler o cookie (Task 3), o estado persistido precisa vir do client. Adiciona um `useEffect` que sincroniza do cookie após o mount (sem hydration mismatch: SSR + 1º render client usam `defaultOpen`; o efeito ajusta logo depois).

**Files:**
- Modify: `packages/ui/src/components/sidebar.tsx` (import do React + bloco do `SidebarProvider`, ~linha 80)

**Interfaces:**
- Consumes: nada novo.
- Produces: `SidebarProvider` passa a hidratar o estado do cookie `sidebar_state` no client. API pública inalterada (`defaultOpen`/`open`/`onOpenChange` seguem iguais).

- [ ] **Step 1: Garantir `useEffect` no import do React**

Read `packages/ui/src/components/sidebar.tsx` (topo). O import de `react` já traz `useState`/`useCallback`. Adicionar `useEffect` à lista (ordem alfabética que o `bun fix` aceita). Ex., se hoje é:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
```

confirmar que `useEffect` está presente; se não, adicionar. (Se o import for namespaced `import * as React`, usar `React.useEffect` no Step 2.)

- [ ] **Step 2: Adicionar o efeito de sync do cookio**

Modify `packages/ui/src/components/sidebar.tsx` — logo após `const [_open, _setOpen] = useState(defaultOpen);` (linha ~80), inserir:

```tsx
	const [_open, _setOpen] = useState(defaultOpen);
	// O layout não lê mais o cookie server-side (cacheComponents: o read dinâmico
	// impediria o static shell de prerenderizar). SSR + 1º render client usam
	// defaultOpen (sem hydration mismatch); este efeito sincroniza pro valor
	// persistido no cookie logo após o mount.
	useEffect(() => {
		const match = document.cookie
			.split(";")
			.map((c) => c.trim())
			.find((c) => c.startsWith("sidebar_state="));
		if (match) {
			_setOpen(match.split("=")[1] !== "false");
		}
	}, []);
```

Atualizar o comentário da linha ~79 (que diz "read from a cookie server-side") removendo a parte server-side, já que agora é client.

- [ ] **Step 3: Verificar e commitar**

Run: `bun check-types && bun check`
Expected: verdes.

```bash
git add packages/ui/src/components/sidebar.tsx
git commit -m "feat(006-b): SidebarProvider lê o cookie sidebar_state no client"
```

---

### Task 3: Refatorar `dashboard/layout.tsx` pro split (abordagem A)

Remove o `await` da sessão e a leitura do cookie do topo do layout; envolve `DashboardChrome` em `<Suspense>` e mantém o frame estático.

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx` (substituição quase total do componente)

**Interfaces:**
- Consumes: `DashboardChrome` / `SidebarSkeleton` (Task 1).
- Produces: layout não-async, sem read de sessão/cookie no topo.

- [ ] **Step 1: Reescrever o layout**

Read `apps/web/src/app/dashboard/layout.tsx`, depois substituir todo o arquivo por:

```tsx
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardChrome } from "./_components/dashboard-chrome";
import { SidebarSkeleton } from "./_components/sidebar-skeleton";

export const metadata: Metadata = {
	description:
		"Área administrativa privada da Emach Ferramentas para gestão operacional do e-commerce.",
	robots: {
		follow: false,
		index: false,
	},
};

export default function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<SidebarProvider>
			<Suspense fallback={<SidebarSkeleton />}>
				<DashboardChrome />
			</Suspense>
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-serif text-base">emach</span>
				</header>
				<div className="flex w-full flex-col gap-6 px-6 py-6">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
```

Notas: removidos `cookies`/`redirect`/`can`/`getUserCapabilities`/`getUserStatus`/`requireCurrentSession`/`parseSidebarCookie`/`SIDEBAR_COOKIE_NAME`/`AppSidebar`/`fetchDashboardCounts` (agora dentro do `DashboardChrome`); o componente deixou de ser `async`; `SidebarProvider` sem `defaultOpen` (default `true` + sync client da Task 2).

- [ ] **Step 2: Verificar (sem flag ainda — comportamento deve seguir idêntico)**

Run: `bun verify`
Expected: `check-types` + `check` + os testes (509 agora, com o novo) verdes.

- [ ] **Step 3: Smoke rápido de auth (sem flag) — opcional mas recomendado**

`bun dev:web` → logar e visitar `/dashboard` → sidebar renderiza, nav por role correta, estado aberto/fechado persiste no reload (cookie via client). Encerrar o dev.

- [ ] **Step 4: Commitar**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "refactor(006-b): split do dashboard layout (sessão sob Suspense)"
```

---

### Task 4: Deferir o read de sessão nas 5 páginas auth/landing

Cada página lê `getCurrentSession()` no topo (bloqueia prerender sob o flag). Mover a checagem-de-sessão-redirect pra um componente async sob `<Suspense>`, mantendo o conteúdo estático fora dele.

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/pending/page.tsx`
- Modify: `apps/web/src/app/suspended/page.tsx`
- Modify: `apps/web/src/app/esqueci-senha/page.tsx`

**Interfaces:**
- Consumes: `getCurrentSession`/`getUserStatus` de `@/lib/session`; `redirect` de `next/navigation`; `Suspense` de `react`. Componentes de conteúdo já existentes (`AuthShell`, `LoginForm`, `AuthStatusPanel`, `ForgotPasswordForm`).
- Produces: páginas não-async com o redirect-gate sob `<Suspense fallback={null}>`.

- [ ] **Step 1: `/` (root — redirect puro, sem conteúdo estático)**

Read `apps/web/src/app/page.tsx`, substituir o componente:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Entrada do dashboard administrativo da Emach Ferramentas para gestão de ferramentas, pedidos, estoque e clientes.",
	title: "Emach Dashboard",
};

async function HomeRedirect() {
	const session = await getCurrentSession();
	redirect(session?.user ? "/dashboard" : "/login");
}

export default function HomePage() {
	return (
		<Suspense fallback={null}>
			<HomeRedirect />
		</Suspense>
	);
}
```

- [ ] **Step 2: `/login`**

Read `apps/web/src/app/login/page.tsx`, substituir:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Acesse o dashboard administrativo da Emach Ferramentas para gerenciar ferramentas, pedidos, estoque e clientes.",
	title: "Entrar",
};

async function LoginRedirectGate() {
	const session = await getCurrentSession();
	if (session?.user) {
		const status = getUserStatus(session);
		if (status === "pending") {
			redirect("/pending");
		}
		if (status === "suspended") {
			redirect("/suspended");
		}
		redirect("/dashboard");
	}
	return null;
}

export default function LoginPage() {
	return (
		<>
			<Suspense fallback={null}>
				<LoginRedirectGate />
			</Suspense>
			<AuthShell>
				<LoginForm />
			</AuthShell>
		</>
	);
}
```

- [ ] **Step 3: `/pending`**

Read `apps/web/src/app/pending/page.tsx`, substituir o componente (manter o `metadata` e os imports de `Clock`/`AuthStatusPanel` existentes):

```tsx
import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Acompanhe o status de aprovação da sua conta no dashboard administrativo da Emach Ferramentas.",
	robots: { follow: false, index: false },
	title: "Conta em aprovação",
};

async function PendingRedirectGate() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}
	return null;
}

export default function PendingPage() {
	return (
		<>
			<Suspense fallback={null}>
				<PendingRedirectGate />
			</Suspense>
			<AuthShell>
				<AuthStatusPanel
					description="Um administrador vai revisar seu cadastro. Você terá acesso após a aprovação."
					icon={<Clock aria-hidden className="size-5" />}
					title="Conta aguardando aprovação"
					tone="warning"
				/>
			</AuthShell>
		</>
	);
}
```

- [ ] **Step 4: `/suspended`** — mesmo padrão. Read o arquivo, mover a checagem (linhas 20-30: sem sessão→`/login`, active→`/dashboard`, pending→`/pending`) pra um `SuspendedRedirectGate` async sob `<Suspense fallback={null}>`, página vira sync, conteúdo (`AuthShell`+`AuthStatusPanel` com `Ban`/tone destructive) fora do Suspense. Imports: + `Suspense`.

- [ ] **Step 5: `/esqueci-senha`** — mesmo padrão. Read o arquivo, mover a checagem (linhas 19-22: logado→`/dashboard`) pra um `ForgotRedirectGate` async sob `<Suspense fallback={null}>`, página sync, `AuthShell`+`ForgotPasswordForm` fora. Imports: + `Suspense`.

- [ ] **Step 6: Verificar e commitar**

Run: `bun verify`
Expected: verdes.

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/login/page.tsx apps/web/src/app/pending/page.tsx apps/web/src/app/suspended/page.tsx apps/web/src/app/esqueci-senha/page.tsx
git commit -m "refactor(006-b): defere read de sessão nas páginas auth/landing"
```

---

### Task 5: Ligar `cacheComponents: true` + gate de build + smoke multi-role

O capstone: ligar o flag e provar que o build passa (todos os reads deferidos) e a auth segue idêntica.

**Files:**
- Modify: `apps/web/next.config.ts` (adicionar `cacheComponents: true` top-level)

**Interfaces:**
- Consumes: tudo das Tasks 1-4.
- Produces: build verde com `cacheComponents:true`.

- [ ] **Step 1: Ligar o flag**

Read `apps/web/next.config.ts`. No objeto `nextConfig`, adicionar `cacheComponents: true` como propriedade **top-level** (irmã de `reactCompiler`, NÃO dentro de `experimental`):

```ts
const nextConfig: NextConfig = {
	typedRoutes: false,
	reactCompiler: true,
	cacheComponents: true,
	experimental: {
		// ... inalterado
	},
	// ... resto inalterado
};
```

- [ ] **Step 2: Build — o gate primário ("deferi tudo?")**

Run: `bun run --cwd apps/web build`
Expected: build **verde**, sem `HANGING_PROMISE_REJECTION` nem `Error: Route "..." used ... without a Suspense boundary` / "uncached data outside Suspense".

**ESCAPE HATCH:** se o build reportar um blocker numa rota não prevista (o build é o oráculo — pode haver 1-2 além das 6 mapeadas), aplicar o MESMO padrão de deferir (mover o read dinâmico pra um componente async sob `<Suspense>`) no arquivo apontado, e rodar o build de novo. Se o blocker for em algo que NÃO é read de sessão/cookie/headers (ex: um `use cache` inesperado, ou um read em componente compartilhado não-óbvio), **PARAR e reportar** — pode indicar uma suposição errada do plano.

- [ ] **Step 3: `bun verify` completo**

Run: `bun verify`
Expected: `check-types` + `check` + 509 testes verdes.

- [ ] **Step 4: Smoke multi-role (verificação de auth — gate de sucesso)**

`bun dev:web` (ou `/dev-up 3001`). Logar e verificar os 5 estados:

| Estado | Esperado |
|---|---|
| super_admin active | `/dashboard` renderiza; sidebar completa; sem redirect |
| admin active | `/dashboard` renderiza; sidebar filtrada por capability |
| user active | `/dashboard` renderiza; sidebar do role user |
| pending | `/dashboard` → redireciona pra `/pending`; `/login` logado-pending → `/pending` |
| suspended | `/dashboard` → redireciona pra `/suspended` |

Extra: `/` redireciona certo (logado→`/dashboard`, deslogado→`/login`); o frame do dashboard aparece antes da sidebar (skeleton→real); uma mutação reflete imediatamente no reload (dado fresco, ZERO cache). Encerrar o dev.

- [ ] **Step 5: Commitar**

```bash
git add apps/web/next.config.ts
git commit -m "feat(006-b): liga cacheComponents:true (fundação Cache Components)"
```

---

## Self-Review

**1. Spec coverage** (contra `docs/superpowers/specs/2026-06-19-006-b-cache-components-foundation-design.md`):
- §2 ligar `cacheComponents` + ZERO cache → Task 5 + Global Constraints. ✅
- §3 raio de impacto (layout + 5 páginas + flag; seguros não tocados) → Tasks 3, 4, 5. ✅
- §4 split do layout (DashboardChrome + SidebarSkeleton + Suspense) → Tasks 1, 3. ✅
- §5 cookie `sidebarOpen` client-side → Task 2. ✅
- §5 redirect pending/suspended no RSC sem middleware → Task 1 (DashboardChrome). ✅
- §6 deferrals das 5 páginas → Task 4. ✅
- §8 teste de regressão de auth (matriz) → Task 1 Step 1. Build verde → Task 5 Step 2. Smoke 5 roles → Task 5 Step 4. `bun verify` → Tasks 3/4/5. ✅
- §9 rollback (flag/PR) → implícito (flag isolada na Task 5; branch).

**2. Placeholder scan:** Tasks 4 Steps 4-5 descrevem `/suspended` e `/esqueci-senha` por referência ao padrão dos Steps 2-3 (mesmo template já mostrado com código completo nos Steps 1-3) — **aceitável** porque o código-modelo está inline logo acima e os dois arquivos originais estão citados com as linhas exatas a mover; não há lógica nova. Demais steps têm código real. Sem `TODO`/`TBD`.

**3. Type consistency:** `DashboardChrome` (async, sem args) e `SidebarSkeleton` (sync) usados igual na Task 3; props de `AppSidebar` batem com `app-sidebar.tsx`; `getCurrentSession`/`requireCurrentSession`/`getUserStatus` com as assinaturas reais de `session.ts`; cookie `sidebar_state` consistente entre Task 2 e o write existente do `SidebarProvider`. ✅

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-06-19-006-b-cache-components-foundation.md`.
