# Login Redesign — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela de login crua por um sistema de auth editorial (split A2), removendo a slop legada, e deixar a Slice 1 deploy-ready sozinha.

**Architecture:** Um componente `AuthShell` (Server Component) provê o split + hero constante (`surface-deep` + acento coral, wordmark EMACH real, Cormorant). Cada tela renderiza `<AuthShell><FormDaTela /></AuthShell>`. Login funcional; `/esqueci-senha` navegável com submit inativo; `/pending` e `/suspended` migram pro shell. Header global some das rotas de auth via early-return.

**Tech Stack:** Next 16 (App Router, RSC), React 19, Tailwind v4 + tokens `@emach/ui`, Better Auth client, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-login-auth-redesign-design.md`

---

## File Structure

- `apps/web/src/components/auth/auth-shell.tsx` — **criar**. Split + hero constante. Server Component, sem estado. Reusado por todas as telas de auth.
- `apps/web/src/components/auth/login-form.tsx` — **criar**. Client Component. Form de login (toggle senha, painel de erro pt-BR, loading).
- `apps/web/src/components/auth/forgot-password-form.tsx` — **criar**. Server Component. Form de recuperação com submit inativo.
- `apps/web/src/components/auth/auth-status-panel.tsx` — **criar**. Client Component. Painel de estado terminal (ícone + título + descrição + Sair). Usado por pending/suspended.
- `apps/web/src/lib/auth-error.ts` — **criar**. `authErrorMessage()` puro: código Better Auth → pt-BR.
- `apps/web/src/lib/__tests__/auth-error.test.ts` — **criar**. Testes do mapa.
- `apps/web/src/app/login/page.tsx` — **modificar**. Renderiza `AuthShell` + `LoginForm`.
- `apps/web/src/app/esqueci-senha/page.tsx` — **criar**. Renderiza `AuthShell` + `ForgotPasswordForm`.
- `apps/web/src/app/pending/page.tsx` — **modificar**. `AuthShell` + `AuthStatusPanel`.
- `apps/web/src/app/suspended/page.tsx` — **modificar**. `AuthShell` + `AuthStatusPanel`.
- `apps/web/src/app/pending/layout.tsx` — **deletar** (AuthShell provê layout).
- `apps/web/src/app/suspended/layout.tsx` — **deletar**.
- `apps/web/src/app/pending/_components/status-card.tsx` — **deletar** (substituído por `auth-status-panel.tsx`).
- `apps/web/src/components/auth-card.tsx` — **deletar** (substituído por `auth-shell` + `login-form`).
- `apps/web/src/components/app-header.tsx` — **modificar**. Early-return nas rotas de auth.
- `apps/web/src/app/layout.tsx` — **modificar**. Corrigir acento em metadata ("gestão").

---

### Task 1: `AuthShell` — split + hero constante

**Files:**
- Create: `apps/web/src/components/auth/auth-shell.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import Image from "next/image";

export function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid min-h-svh flex-1 md:grid-cols-[1.05fr_0.95fr]">
			<aside className="relative hidden flex-col justify-between bg-surface-deep px-10 py-12 md:flex">
				<Image
					alt="Emach"
					className="h-8 w-auto"
					height={32}
					priority
					src="/emach-nome-branco.svg"
					width={132}
				/>
				<div>
					<h1 className="font-serif font-medium text-5xl text-foreground tracking-tight">
						Painel de <span className="text-primary">gestão</span>
					</h1>
					<span
						aria-hidden
						className="mt-4 block h-[3px] w-14 rounded-full bg-primary"
					/>
					<p className="mt-4 max-w-[32ch] text-muted-foreground text-sm leading-relaxed">
						Estoque, pedidos e catálogo da E-mach em um só lugar.
					</p>
				</div>
				<p className="text-[11px] text-muted-foreground uppercase tracking-wider">
					Acesso restrito · equipe interna
				</p>
			</aside>

			<main className="flex items-center justify-center bg-background px-6 py-12">
				<div className="w-full max-w-sm">
					<Image
						alt="Emach"
						className="mb-8 h-7 w-auto md:hidden"
						height={29}
						priority
						src="/emach-nome-branco.svg"
						width={120}
					/>
					{children}
				</div>
			</main>
		</div>
	);
}
```

- [ ] **Step 2: Type-check + lint**

Run: `cd apps/web && bun check-types && cd ../.. && bun check`
Expected: sem erros. (`bun check` = ultracite; pega regras de lint que o tsc não pega.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/auth-shell.tsx
git commit -m "feat(auth): AuthShell com hero editorial split"
```

---

### Task 2: `authErrorMessage` — mapa de erro Better Auth → pt-BR (TDD)

**Files:**
- Create: `apps/web/src/lib/auth-error.ts`
- Test: `apps/web/src/lib/__tests__/auth-error.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";

import { authErrorMessage } from "../auth-error";

describe("authErrorMessage", () => {
	it("mapeia código conhecido para pt-BR", () => {
		expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
			"Email ou senha incorretos. Verifique e tente de novo."
		);
	});

	it("usa fallback para código desconhecido", () => {
		expect(authErrorMessage({ code: "ALGO_INESPERADO" })).toContain(
			"Não foi possível entrar"
		);
	});

	it("usa fallback para null", () => {
		expect(authErrorMessage(null)).toContain("Não foi possível entrar");
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd apps/web && bun run test auth-error`
Expected: FAIL — `Cannot find module '../auth-error'`.

- [ ] **Step 3: Implementar o mínimo**

```ts
type AuthErrorLike =
	| { code?: string; message?: string; statusText?: string }
	| null
	| undefined;

const AUTH_ERROR_PT: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: "Email ou senha incorretos. Verifique e tente de novo.",
	USER_NOT_FOUND: "Não encontramos uma conta com esse email.",
	INVALID_EMAIL: "Informe um email válido.",
	USER_ALREADY_EXISTS: "Já existe uma conta com esse email.",
};

const FALLBACK = "Não foi possível entrar agora. Tente novamente em instantes.";

export function authErrorMessage(error: AuthErrorLike): string {
	const code = error?.code;
	if (code && AUTH_ERROR_PT[code]) {
		return AUTH_ERROR_PT[code];
	}
	return FALLBACK;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd apps/web && bun run test auth-error`
Expected: PASS (3 testes).

- [ ] **Step 5: Type-check + lint + commit**

```bash
cd apps/web && bun check-types && cd ../.. && bun check
git add apps/web/src/lib/auth-error.ts apps/web/src/lib/__tests__/auth-error.test.ts
git commit -m "feat(auth): mapa de erro Better Auth para pt-BR"
```

---

### Task 3: `LoginForm` + nova `/login`

**Files:**
- Create: `apps/web/src/components/auth/login-form.tsx`
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Criar `LoginForm`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";

export function LoginForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");

		setIsSubmitting(true);
		await authClient.signIn.email(
			{ email, password },
			{
				onSuccess: () => {
					router.replace("/dashboard");
					router.refresh();
				},
				onError: (ctx) => {
					setErrorMessage(authErrorMessage(ctx.error));
					setIsSubmitting(false);
				},
			}
		);
	};

	return (
		<div>
			<h1 className="font-serif font-medium text-3xl tracking-tight">Entrar</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Acesse com seu email corporativo.
			</p>

			<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
				{errorMessage ? (
					<p
						className="rounded-md border border-destructive/55 bg-destructive/12 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{errorMessage}
					</p>
				) : null}

				<div className="flex flex-col gap-2">
					<Label htmlFor="email">Email</Label>
					<Input
						autoComplete="email"
						id="email"
						name="email"
						placeholder="voce@emach.com.br"
						required
						type="email"
					/>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="password">Senha</Label>
					<div className="relative">
						<Input
							autoComplete="current-password"
							className="pr-10"
							id="password"
							name="password"
							placeholder="••••••••"
							required
							type={showPassword ? "text" : "password"}
						/>
						<Button
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							className="-translate-y-1/2 absolute top-1/2 right-1"
							onClick={() => setShowPassword((v) => !v)}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							{showPassword ? (
								<EyeOff aria-hidden className="size-4" />
							) : (
								<Eye aria-hidden className="size-4" />
							)}
						</Button>
					</div>
				</div>

				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Entrando..." : "Entrar"}
				</Button>
			</form>

			<Link
				className="mt-4 block text-right text-primary text-sm hover:underline"
				href="/esqueci-senha"
			>
				Esqueci minha senha
			</Link>
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `login/page.tsx`**

Substituir o conteúdo inteiro por:

```tsx
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function LoginPage() {
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

	return (
		<AuthShell>
			<LoginForm />
		</AuthShell>
	);
}
```

- [ ] **Step 3: Type-check + lint**

Run: `cd apps/web && bun check-types && cd ../.. && bun check`
Expected: sem erros. (Confirmar que `size="icon-sm"` existe em `packages/ui/src/components/button.tsx` — DESIGN.md §4 lista; se o nome divergir, usar o size de ícone disponível.)

- [ ] **Step 4: Smoke visual** (server na 3008 já roda; precisa estar deslogado)

Deslogar (ou usar janela anônima), abrir `http://localhost:3008/login`. Verificar:
- Hero split à esquerda (surface-deep, wordmark, "Painel de **gestão**" com coral, traço de acento).
- Toggle de senha mostra/oculta e tem `aria-label`.
- Login com credencial errada → painel de erro pt-BR no topo (não toast).
- Loading mostra "Entrando...".
- Não há `AppHeader` no topo (será resolvido na Task 6 — por ora pode aparecer; reconferir após Task 6).
- Mobile (estreitar a janela): hero colapsa, mini-wordmark aparece, form ocupa largura.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auth/login-form.tsx apps/web/src/app/login/page.tsx
git commit -m "feat(auth): redesign do login (split, toggle senha, erro pt-BR)"
```

---

### Task 4: `/esqueci-senha` (tela navegável, submit inativo)

**Files:**
- Create: `apps/web/src/components/auth/forgot-password-form.tsx`
- Create: `apps/web/src/app/esqueci-senha/page.tsx`

- [ ] **Step 1: Criar `ForgotPasswordForm`** (Server Component — sem interatividade)

```tsx
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import Link from "next/link";

export function ForgotPasswordForm() {
	return (
		<div>
			<h1 className="font-serif font-medium text-3xl tracking-tight">
				Recuperar acesso
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Enviaremos um link de redefinição para o seu email.
			</p>

			<form className="mt-6 flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor="email">Email</Label>
					<Input
						autoComplete="email"
						disabled
						id="email"
						name="email"
						placeholder="voce@emach.com.br"
						type="email"
					/>
				</div>
				<Button disabled type="button">
					Enviar link
				</Button>
				<p className="text-center text-muted-foreground text-xs">
					Disponível em breve.
				</p>
			</form>

			<Link
				className="mt-4 block text-center text-muted-foreground text-sm hover:text-foreground"
				href="/login"
			>
				← Voltar para o login
			</Link>
		</div>
	);
}
```

- [ ] **Step 2: Criar `esqueci-senha/page.tsx`**

```tsx
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentSession } from "@/lib/session";

export default async function ForgotPasswordPage() {
	const session = await getCurrentSession();
	if (session?.user) {
		redirect("/dashboard");
	}

	return (
		<AuthShell>
			<ForgotPasswordForm />
		</AuthShell>
	);
}
```

- [ ] **Step 3: Type-check + lint**

Run: `cd apps/web && bun check-types && cd ../.. && bun check`
Expected: sem erros.

- [ ] **Step 4: Smoke visual**

Deslogado, abrir `http://localhost:3008/esqueci-senha`. Verificar: mesmo hero, título "Recuperar acesso", input + botão **desabilitados**, hint "Disponível em breve.", link "← Voltar para o login" funciona. Clicar "Esqueci minha senha" no `/login` leva aqui.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auth/forgot-password-form.tsx apps/web/src/app/esqueci-senha/page.tsx
git commit -m "feat(auth): tela /esqueci-senha (submit inativo ate email transport)"
```

---

### Task 5: Migrar `/pending` e `/suspended` pro `AuthShell`

**Files:**
- Create: `apps/web/src/components/auth/auth-status-panel.tsx`
- Modify: `apps/web/src/app/pending/page.tsx`
- Modify: `apps/web/src/app/suspended/page.tsx`
- Delete: `apps/web/src/app/pending/layout.tsx`
- Delete: `apps/web/src/app/suspended/layout.tsx`
- Delete: `apps/web/src/app/pending/_components/status-card.tsx`

- [ ] **Step 1: Criar `AuthStatusPanel`**

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";

type Tone = "warning" | "destructive";

const TONE_CLASS: Record<Tone, string> = {
	warning: "bg-warning/15 text-warning",
	destructive: "bg-destructive/15 text-destructive",
};

export function AuthStatusPanel({
	description,
	icon,
	title,
	tone,
}: {
	description: string;
	icon: ReactNode;
	title: string;
	tone: Tone;
}) {
	const router = useRouter();
	const [isSigningOut, startSignOut] = useTransition();

	function handleSignOut() {
		startSignOut(async () => {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
		});
	}

	return (
		<div>
			<div
				className={`flex size-11 items-center justify-center rounded-[11px] ${TONE_CLASS[tone]}`}
			>
				{icon}
			</div>
			<h1 className="mt-4 font-serif font-medium text-3xl tracking-tight">
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
				{description}
			</p>
			<Button
				className="mt-6"
				disabled={isSigningOut}
				onClick={handleSignOut}
				variant="outline"
			>
				{isSigningOut ? "Saindo..." : "Sair"}
			</Button>
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `pending/page.tsx`**

```tsx
import { Clock } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function PendingPage() {
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

	return (
		<AuthShell>
			<AuthStatusPanel
				description="Um administrador vai revisar seu cadastro. Você terá acesso após a aprovação."
				icon={<Clock aria-hidden className="size-5" />}
				title="Conta aguardando aprovação"
				tone="warning"
			/>
		</AuthShell>
	);
}
```

- [ ] **Step 3: Reescrever `suspended/page.tsx`**

```tsx
import { Ban } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function SuspendedPage() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "pending") {
		redirect("/pending");
	}

	return (
		<AuthShell>
			<AuthStatusPanel
				description="Sua conta foi suspensa. Fale com seu administrador para mais informações."
				icon={<Ban aria-hidden className="size-5" />}
				title="Acesso suspenso"
				tone="destructive"
			/>
		</AuthShell>
	);
}
```

- [ ] **Step 4: Deletar arquivos obsoletos**

```bash
git rm apps/web/src/app/pending/layout.tsx apps/web/src/app/suspended/layout.tsx apps/web/src/app/pending/_components/status-card.tsx
```

- [ ] **Step 5: Type-check + lint**

Run: `cd apps/web && bun check-types && cd ../.. && bun check`
Expected: sem erros. (Confirma que nada mais importa `status-card` — o grep deve voltar vazio: `ugrep -rl "status-card" apps/web/src`.)

- [ ] **Step 6: Smoke visual**

Como exige usuário `pending`/`suspended`, validar pelo menos o render do shell: com sessão ativa, forçar a rota não redireciona (vai pro dashboard). Para smoke real, usar um usuário de teste com `status='pending'` via SQL, ou confiar no type-check + revisão visual do componente. No mínimo: confirmar que não há erro de runtime ao compilar a rota (`nextjs_call 3008 get_errors` ou abrir a rota logado e ver o redirect funcionar).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/auth/auth-status-panel.tsx apps/web/src/app/pending/page.tsx apps/web/src/app/suspended/page.tsx
git commit -m "feat(auth): migrar pending/suspended para AuthShell"
```

---

### Task 6: Remover slop do header + metadata + `auth-card`

**Files:**
- Modify: `apps/web/src/components/app-header.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Delete: `apps/web/src/components/auth-card.tsx`

- [ ] **Step 1: Early-return do `AppHeader` nas rotas de auth**

Em `apps/web/src/components/app-header.tsx`, logo após `const DASHBOARD_ROUTE = "/dashboard";` e `const LOGIN_ROUTE = "/login";`, adicionar:

```tsx
const AUTH_ROUTES = [
	"/login",
	"/esqueci-senha",
	"/pending",
	"/suspended",
	"/redefinir-senha",
	"/convite",
	"/verificar-email",
];
```

Substituir o bloco:

```tsx
	const isDashboardRoute = pathname.startsWith(DASHBOARD_ROUTE);

	if (isDashboardRoute) {
		return null;
	}
```

por:

```tsx
	const isDashboardRoute = pathname.startsWith(DASHBOARD_ROUTE);
	const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

	if (isDashboardRoute || isAuthRoute) {
		return null;
	}
```

- [ ] **Step 2: Corrigir acento na metadata**

Em `apps/web/src/app/layout.tsx`, na `metadata.description`, trocar `"Dashboard de gestao de estoque e ecommerce da E-mach."` por `"Dashboard de gestão de estoque e e-commerce da E-mach."`

- [ ] **Step 3: Deletar `auth-card.tsx`** (agora sem uso)

```bash
git rm apps/web/src/components/auth-card.tsx
```

Confirmar zero imports remanescentes: `ugrep -rl "auth-card" apps/web/src` deve voltar vazio.

- [ ] **Step 4: Type-check + lint**

Run: `cd apps/web && bun check-types && cd ../.. && bun check`
Expected: sem erros.

- [ ] **Step 5: Smoke visual**

Deslogado: `http://localhost:3008/login` e `/esqueci-senha` — **sem** `AppHeader` no topo. Logado, fora de auth/dashboard (ex: `/`) — header ainda aparece. Em `/dashboard` — header ausente (comportamento antigo preservado).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/app-header.tsx apps/web/src/app/layout.tsx
git commit -m "refactor(auth): tirar AppHeader das rotas de auth, corrigir metadata, remover auth-card"
```

---

## Verificação final da slice

- [ ] `cd apps/web && bun check-types` — limpo.
- [ ] `bun check` (raiz) — limpo.
- [ ] `cd apps/web && bun run test` — suíte passa (auth-error incluso; lembrar do gap conhecido `activity.test.ts` documentado em `apps/web/CLAUDE.md`, não é regressão).
- [ ] Smoke deslogado: `/login` (hero, toggle, erro pt-BR, loading, sem header), `/esqueci-senha` (inativo, volta pro login).
- [ ] Smoke responsivo: hero colapsa no mobile.
- [ ] `git log --oneline` mostra os 6 commits da slice.

## Fora desta slice (próximos planos, ver §7 do spec)

1. Email transport (Resend) — habilita reset + verificação.
2. Reset de senha (ativar submit `/esqueci-senha` + `/redefinir-senha`).
3. Verificação de email (`/verificar-email`).
4. Convite-only (token + UI em `/dashboard/users` + `/convite`).
