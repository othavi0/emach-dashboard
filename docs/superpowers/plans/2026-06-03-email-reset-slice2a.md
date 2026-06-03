# Email Foundation + Reset de Senha — Slice 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundação de email transacional (`@emach/email` + Resend) e tornar o fluxo de reset de senha 100% funcional, provando o pipeline Resend end-to-end antes do convite (Slice 2B).

**Architecture:** Novo pacote `@emach/email` (espelha o setup react/JSX do `@emach/ui`) com client Resend + templates React Email (fundo claro, marca EMACH). `@emach/auth` wira `sendResetPassword` chamando `@emach/email`. `/esqueci-senha` ativa o submit; nova `/redefinir-senha` consome o token.

**Tech Stack:** Resend SDK, React Email (`@react-email/components`), Better Auth (email/password reset), Next 16 RSC, t3-env, Tailwind tokens.

**Spec:** `docs/superpowers/specs/2026-06-03-convite-only-auth-design.md` (§3.3, §4, §5)

**Pré-requisito de ambiente:** `RESEND_API_KEY` + `EMAIL_FROM` já no `apps/web/.env`; domínio `emachferramentas.com.br` verificado; `mise.toml` (#113) commitado. Smoke de email exige `bun dev:web` numa porta com auth alinhado (ver [[reference_emach_dev_auth_smoke]]).

---

## File Structure

- `packages/env/src/server.ts` — **modificar**. Adiciona `RESEND_API_KEY`, `EMAIL_FROM` ao schema.
- `packages/email/package.json` — **criar**. `@emach/email` (resend, @react-email/components, react).
- `packages/email/tsconfig.json` — **criar** (copia de `packages/ui/tsconfig.json`).
- `packages/email/src/client.ts` — **criar**. Resend singleton.
- `packages/email/src/templates/password-reset.tsx` — **criar**. Template.
- `packages/email/src/send.tsx` — **criar**. `sendPasswordResetEmail`.
- `packages/auth/package.json` — **modificar**. Adiciona dep `@emach/email`.
- `packages/auth/src/dashboard.ts` — **modificar**. `disableSignUp`, `sendResetPassword`, `revokeSessionsOnPasswordReset`.
- `apps/web/src/components/auth/forgot-password-form.tsx` — **modificar** (vira client, ativa submit).
- `apps/web/src/components/auth/reset-password-form.tsx` — **criar** (client).
- `apps/web/src/app/redefinir-senha/page.tsx` — **criar**.

---

### Task 1: env vars de email

**Files:**
- Modify: `packages/env/src/server.ts`

- [ ] **Step 1: Adicionar ao schema `server`**

Em `packages/env/src/server.ts`, dentro de `createEnv({ server: { ... } })`, após `NEXT_PUBLIC_SUPABASE_URL: z.url(),` adicionar:

```ts
		RESEND_API_KEY: z.string().min(1),
		EMAIL_FROM: z.string().min(1),
```

(`runtimeEnv: process.env` já mapeia tudo — sem mais mudanças.)

- [ ] **Step 2: Type-check + commit**

```bash
cd packages/env && bun check-types && cd ../..
git add packages/env/src/server.ts
git commit -m "feat(env): validar RESEND_API_KEY e EMAIL_FROM"
```

---

### Task 2: scaffold do pacote `@emach/email`

**Files:**
- Create: `packages/email/package.json`
- Create: `packages/email/tsconfig.json`
- Create: `packages/email/src/client.ts`

- [ ] **Step 1: `package.json`**

```json
{
	"name": "@emach/email",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"exports": {
		"./send": "./src/send.tsx"
	},
	"scripts": {
		"check-types": "tsc --noEmit"
	},
	"dependencies": {
		"@emach/env": "workspace:*",
		"react": "catalog:"
	},
	"devDependencies": {
		"@emach/config": "workspace:*",
		"@types/react": "catalog:",
		"typescript": "^6.0.3"
	}
}
```

- [ ] **Step 2: Instalar `resend` + `@react-email/components` no pacote**

Run (da raiz): `bun add resend @react-email/components --filter @emach/email`
Expected: ambos adicionados em `dependencies` do `packages/email/package.json` com a versão resolvida. (Se `--filter` não suportar add, rodar `cd packages/email && bun add resend @react-email/components`.)

- [ ] **Step 3: `tsconfig.json`** — copiar exatamente o de `packages/ui/tsconfig.json`

```bash
cp packages/ui/tsconfig.json packages/email/tsconfig.json
```

(Garante o mesmo suporte a JSX/`react-jsx` do pacote UI.)

- [ ] **Step 4: `src/client.ts`**

```ts
import { env } from "@emach/env/server";
import { Resend } from "resend";

export const resend = new Resend(env.RESEND_API_KEY);
```

- [ ] **Step 5: Type-check**

Run: `cd packages/email && bun check-types`
Expected: sem erros (templates/send vêm na Task 3; client.ts isolado compila).

- [ ] **Step 6: Commit**

```bash
git add packages/email/package.json packages/email/tsconfig.json packages/email/src/client.ts package.json bun.lock
git commit -m "feat(email): scaffold do pacote @emach/email com client Resend"
```

---

### Task 3: template PasswordResetEmail + `sendPasswordResetEmail`

**Files:**
- Create: `packages/email/src/templates/password-reset.tsx`
- Create: `packages/email/src/send.tsx`

- [ ] **Step 1: Template (React Email, fundo claro, marca EMACH coral)**

`packages/email/src/templates/password-reset.tsx`:

```tsx
import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	pixelBasedPreset,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

interface PasswordResetEmailProps {
	url: string;
}

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
	return (
		<Html lang="pt-BR">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: { extend: { colors: { coral: "#cc785c" } } },
				}}
			>
				<Head />
				<Body className="bg-gray-100 font-sans">
					<Preview>Redefinir sua senha no painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Redefinir senha
							</Heading>
							<Text className="text-base text-gray-700">
								Recebemos um pedido para redefinir a senha do painel de gestão.
								Clique no botão abaixo para criar uma nova senha. O link expira em
								1 hora.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={url}
							>
								Redefinir minha senha
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não pediu isso, ignore este email — sua senha continua a
								mesma.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

PasswordResetEmail.PreviewProps = {
	url: "https://exemplo.com/redefinir-senha?token=abc123",
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
```

- [ ] **Step 2: `send.tsx`**

`packages/email/src/send.tsx`:

```tsx
import { env } from "@emach/env/server";

import { resend } from "./client";
import { PasswordResetEmail } from "./templates/password-reset";

export async function sendPasswordResetEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Redefinir sua senha — E-mach",
		react: <PasswordResetEmail url={url} />,
	});
}
```

- [ ] **Step 3: Type-check + lint**

Run: `cd packages/email && bun check-types && cd ../.. && bunx ultracite check packages/email/src`
Expected: sem erros. (Se `@react-email/components` não exportar `pixelBasedPreset` na versão instalada, importar de `react-email` ou remover o preset e usar estilos inline — verificar o export real com `bunx ultracite` / erro de tipo.)

- [ ] **Step 4: Commit**

```bash
git add packages/email/src/templates/password-reset.tsx packages/email/src/send.tsx
git commit -m "feat(email): template e envio de reset de senha"
```

---

### Task 4: wirar `sendResetPassword` no Better Auth

**Files:**
- Modify: `packages/auth/package.json`
- Modify: `packages/auth/src/dashboard.ts`

- [ ] **Step 1: Adicionar dep `@emach/email`**

Em `packages/auth/package.json`, em `dependencies`, adicionar:

```json
		"@emach/email": "workspace:*",
```

Run: `bun install`

- [ ] **Step 2: Editar `dashboard.ts`**

Adicionar import no topo (junto aos outros):

```ts
import { sendPasswordResetEmail } from "@emach/email/send";
```

Substituir o bloco:

```ts
	emailAndPassword: {
		enabled: true,
	},
```

por:

```ts
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail({ to: user.email, url });
		},
	},
```

- [ ] **Step 3: Type-check + commit**

```bash
cd packages/auth && bun check-types && cd ../..
git add packages/auth/package.json packages/auth/src/dashboard.ts bun.lock
git commit -m "feat(auth): wirar sendResetPassword (Resend) + disableSignUp"
```

---

### Task 5: ativar `/esqueci-senha`

**Files:**
- Modify: `apps/web/src/components/auth/forgot-password-form.tsx`

- [ ] **Step 1: Reescrever como client component funcional**

Substituir o conteúdo inteiro de `apps/web/src/components/auth/forgot-password-form.tsx` por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();

		setIsSubmitting(true);
		await authClient.requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/redefinir-senha`,
		});
		// Resposta constante (não revela se o email existe).
		setSent(true);
		setIsSubmitting(false);
	};

	if (sent) {
		return (
			<div>
				<h1 className="font-medium font-serif text-3xl tracking-tight">
					Verifique seu email
				</h1>
				<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
					Se houver uma conta com esse email, enviamos um link para redefinir a
					senha. O link expira em 1 hora.
				</p>
				<Link
					className="mt-6 block text-muted-foreground text-sm hover:text-foreground"
					href="/login"
				>
					← Voltar para o login
				</Link>
			</div>
		);
	}

	return (
		<div>
			<h1 className="font-medium font-serif text-3xl tracking-tight">
				Recuperar acesso
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Enviaremos um link de redefinição para o seu email.
			</p>

			<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
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
				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Enviando..." : "Enviar link"}
				</Button>
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

- [ ] **Step 2: Confirmar que a page já passa (Server Component renderiza o client form)**

`apps/web/src/app/esqueci-senha/page.tsx` não muda (já renderiza `<ForgotPasswordForm />` dentro do `AuthShell`).

- [ ] **Step 3: Type-check + lint + commit**

```bash
cd apps/web && bun check-types && cd ../.. && bunx ultracite check apps/web/src/components/auth/forgot-password-form.tsx
git add apps/web/src/components/auth/forgot-password-form.tsx
git commit -m "feat(auth): ativar submit de /esqueci-senha (requestPasswordReset)"
```

---

### Task 6: página `/redefinir-senha`

**Files:**
- Create: `apps/web/src/components/auth/reset-password-form.tsx`
- Create: `apps/web/src/app/redefinir-senha/page.tsx`

- [ ] **Step 1: `reset-password-form.tsx` (client)**

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

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		const formData = new FormData(event.currentTarget);
		const password = String(formData.get("password") ?? "");
		const confirm = String(formData.get("confirm") ?? "");

		if (password !== confirm) {
			setErrorMessage("As senhas não coincidem.");
			return;
		}

		setIsSubmitting(true);
		await authClient.resetPassword(
			{ newPassword: password, token },
			{
				onSuccess: () => {
					router.replace("/login");
					router.refresh();
				},
				onError: () => {
					setErrorMessage(
						"Não foi possível redefinir. O link pode ter expirado — solicite um novo."
					);
					setIsSubmitting(false);
				},
			}
		);
	};

	return (
		<div>
			<h1 className="font-medium font-serif text-3xl tracking-tight">
				Nova senha
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Defina uma senha para sua conta.
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
					<Label htmlFor="password">Nova senha</Label>
					<div className="relative">
						<Input
							autoComplete="new-password"
							className="pr-10"
							id="password"
							minLength={8}
							name="password"
							placeholder="Mínimo 8 caracteres"
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

				<div className="flex flex-col gap-2">
					<Label htmlFor="confirm">Confirmar senha</Label>
					<Input
						autoComplete="new-password"
						id="confirm"
						minLength={8}
						name="confirm"
						placeholder="Repita a senha"
						required
						type={showPassword ? "text" : "password"}
					/>
				</div>

				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Salvando..." : "Salvar nova senha"}
				</Button>
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

- [ ] **Step 2: `redefinir-senha/page.tsx`**

```tsx
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	return (
		<AuthShell>
			{token ? (
				<ResetPasswordForm token={token} />
			) : (
				<div>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Link inválido
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Este link de redefinição não é válido. Solicite um novo na tela de
						recuperação.
					</p>
				</div>
			)}
		</AuthShell>
	);
}
```

(`/redefinir-senha` já está em `AUTH_ROUTES` do `app-header.tsx` — sem header. Confirmado na Slice 1.)

- [ ] **Step 3: Type-check + lint + commit**

```bash
cd apps/web && bun check-types && cd ../.. && bunx ultracite check apps/web/src/components/auth/reset-password-form.tsx apps/web/src/app/redefinir-senha/page.tsx
git add apps/web/src/components/auth/reset-password-form.tsx apps/web/src/app/redefinir-senha/page.tsx
git commit -m "feat(auth): página /redefinir-senha funcional"
```

---

### Task 7: smoke end-to-end + verificação

- [ ] **Step 1: Preview dos templates (opcional, rápido)**

Render do template pra HTML sem quebrar:

```bash
cd packages/email && bun -e "import('@react-email/components').then(async (m)=>{const {PasswordResetEmail}=await import('./src/templates/password-reset.tsx'); console.log((await m.render(PasswordResetEmail({url:'http://x'}))).slice(0,80))})"
```
Expected: imprime início de HTML (`<!DOCTYPE` ou `<html`). Se o runtime não resolver `.tsx` via `bun -e`, pular e validar no smoke real.

- [ ] **Step 2: Smoke ao vivo do reset**

Subir `bun dev:web` numa porta com auth alinhado (ou ajustar `.env` p/ a porta — reverter depois, ver [[reference_emach_dev_auth_smoke]]). Deslogado:
1. `/esqueci-senha` → digitar email de um usuário real → "Enviar link" → tela "Verifique seu email".
2. Conferir no Resend (dashboard ou MCP `list-emails`/`get-email`) que o email saiu com o template branded.
3. Abrir o link do email → cai em `/redefinir-senha?token=...` → definir nova senha → redireciona `/login`.
4. Logar com a nova senha → entra no dashboard.
5. `revokeSessionsOnPasswordReset`: sessões antigas caíram (re-login exigido).

- [ ] **Step 3: Verificação final**

```bash
cd apps/web && bun check-types && cd ../.. && bun run --filter @emach/web test
```
Expected: types limpos, testes passam.

---

## Self-review

- **Cobertura do spec:** §4 (pacote @emach/email + template + send) → Tasks 2,3. §5 (disableSignUp, sendResetPassword, revokeSessionsOnPasswordReset) → Task 4. §3.3 (esqueci-senha ativo + /redefinir-senha) → Tasks 5,6. env → Task 1. ✅ (Invite §3.1/3.2 e remoções §6 ficam pra Slice 2B — escopo deste plano é a fundação + reset.)
- **Placeholders:** nenhum — todo passo tem código/comando. As 2 notas de fallback (pixelBasedPreset export; `bun -e` tsx) são contingências reais com ação concreta, não placeholders.
- **Consistência de tipos:** `sendPasswordResetEmail({to,url})` igual em send.tsx (Task 3) e dashboard.ts (Task 4). `PasswordResetEmail({url})` consistente. `ResetPasswordForm({token})` ↔ page passa `token`.

## Fora deste plano (Slice 2B — convite)

Tabela/colunas de invite token, `inviteUser`/`acceptInvite` (internalAdapter), `/convite` + form, `InviteEmail`, dialog de convite em `/dashboard/users`, remoção de ApprovalSheet/approveUser/rejectUser/bulkReject/PendingPanel, ressignificar `pending`→"convidado". Plano próprio após 2A validar o pipeline Resend.
