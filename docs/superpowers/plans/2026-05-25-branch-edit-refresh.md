# Branch Edit Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refazer o formulário de editar filial em `/dashboard/branches/[id]?edit=1` substituindo o input UUID do responsável por um select, adicionando máscara real no telefone, endereço estruturado (CEP + ViaCEP autofill), flag de status (ativo/inativo) e paridade total com o create form.

**Architecture:** Schema do `branch` ganha campos estruturados (`cep`, `street`, `streetNumber`, `complement`, `neighborhood`, `city`, `state`, `status`) e droppa `address`. Componente compartilhado `BranchFormFields` é reusado por edit sheet e create page. Responsável vem de server action `listResponsibleCandidates(branchId)` que filtra por `user_branch + status='active'`. CEP via `MaskedInput` + lookup ViaCEP client-side com fallback silencioso.

**Tech Stack:** Next 16 RSC + React 19 + Drizzle (push-only) + Better Auth + Zod + sonner toast + `MaskedInput` (apps/web/src/components/masked-input.tsx) + ViaCEP HTTP API.

**Verification gate:** Projeto não tem suíte de testes automatizada. Cada task verifica via `bun check-types` (TypeScript) e smoke manual quando aplicável. Para SQL/queries SSR, smoke run-time obrigatório (CLAUDE.md raiz).

---

### Task 1: Schema do branch — adicionar campos estruturados + status, dropar address

**Files:**
- Modify: `packages/db/src/schema/inventory.ts` (bloco `export const branch`)

- [ ] **Step 1: Editar schema**

Substituir o bloco `branch`:

```ts
export const branch = pgTable(
	"branch",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		phone: text("phone"),
		// Endereço estruturado (substitui address legacy)
		cep: text("cep"),
		street: text("street"),
		streetNumber: text("street_number"),
		complement: text("complement"),
		neighborhood: text("neighborhood"),
		city: text("city"),
		state: varchar("state", { length: 2 }),
		status: text("status", { enum: ["active", "inactive"] })
			.default("active")
			.notNull(),
		responsibleUserId: text("responsible_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("branch_created_idx").on(table.createdAt.desc(), table.id.desc()),
	]
);
```

Garantir que `varchar` esteja no import: `import { ..., varchar } from "drizzle-orm/pg-core"` (ajustar se já existir).

- [ ] **Step 2: Push schema pro DB**

Run: `bun db:sync`
Expected: prompt do drizzle-kit pode pedir confirmação pra dropar `address` — confirmar "create + drop". Output deve conter `ALTER TABLE ... DROP COLUMN "address"` e `ADD COLUMN "cep"`, etc.

- [ ] **Step 3: Verificar que app compila com o schema novo**

Run: `bun check-types 2>&1 | head -30`
Expected: TypeScript vai apontar erros em `apps/web/src/app/dashboard/branches/data.ts` e `branch-card.tsx`, `overview-tab.tsx`, `branch-edit-sheet.tsx` referenciando `branch.address` que não existe mais. Esses serão consertados nas próximas tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat(db): branch ganha endereço estruturado e status; dropa address"
```

---

### Task 2: Helper `formatBranchAddress`

**Files:**
- Create: `apps/web/src/lib/format/branch.ts`

- [ ] **Step 1: Criar helper**

Conteúdo do arquivo:

```ts
export interface BranchAddressLike {
	street?: string | null;
	streetNumber?: string | null;
	neighborhood?: string | null;
	city?: string | null;
	state?: string | null;
}

export function formatBranchAddress(b: BranchAddressLike): string | null {
	if (!b.street && !b.city) {
		return null;
	}
	const streetPart =
		b.street && b.streetNumber ? `${b.street}, ${b.streetNumber}` : b.street;
	const cityPart =
		b.city && b.state ? `${b.city}/${b.state}` : (b.city ?? b.state ?? null);
	const parts = [streetPart, b.neighborhood, cityPart].filter(Boolean);
	return parts.length > 0 ? parts.join(" — ") : null;
}

export function formatCep(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}
	const digits = raw.replace(/\D/g, "");
	if (digits.length !== 8) {
		return null;
	}
	return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/format/branch.ts
git commit -m "feat(web): helper formatBranchAddress + formatCep"
```

---

### Task 3: Máscaras `phoneBrMask` e `cepMask`

**Files:**
- Create: `apps/web/src/lib/masks/phone-br.ts`
- Create: `apps/web/src/lib/masks/cep.ts`
- Modify: `apps/web/src/lib/masks/index.ts`

- [ ] **Step 1: Criar `phone-br.ts`**

```ts
import type { Mask } from "./index";

const PHONE_DIGITS_MAX = 11;

function sanitizePhone(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, PHONE_DIGITS_MAX);
	if (digits.length === 0) {
		return "";
	}
	if (digits.length <= 2) {
		return `(${digits}`;
	}
	if (digits.length <= 6) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
	}
	if (digits.length <= 10) {
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
	}
	return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export const phoneBrMask: Mask<string> = {
	format: (raw) => (raw ? sanitizePhone(raw) : ""),
	parse: (display) => {
		const digits = display.replace(/\D/g, "");
		return digits.length === 0 ? undefined : digits;
	},
	sanitize: sanitizePhone,
	inputMode: "numeric",
	placeholder: "(00) 00000-0000",
	maxLength: 16,
};
```

- [ ] **Step 2: Criar `cep.ts`**

```ts
import type { Mask } from "./index";

const CEP_DIGITS = 8;

function sanitizeCep(display: string): string {
	const digits = display.replace(/\D/g, "").slice(0, CEP_DIGITS);
	if (digits.length <= 5) {
		return digits;
	}
	return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export const cepMask: Mask<string> = {
	format: (raw) => (raw ? sanitizeCep(raw) : ""),
	parse: (display) => {
		const digits = display.replace(/\D/g, "");
		return digits.length === 0 ? undefined : digits;
	},
	sanitize: sanitizeCep,
	inputMode: "numeric",
	placeholder: "00000-000",
	maxLength: 9,
};
```

- [ ] **Step 3: Re-exportar no `index.ts`**

Adicionar ao final do arquivo `apps/web/src/lib/masks/index.ts`:

```ts
export { cepMask } from "./cep";
export { phoneBrMask } from "./phone-br";
```

- [ ] **Step 4: Verify**

Run: `bun check-types 2>&1 | grep masks`
Expected: sem erros relacionados a masks.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/masks/
git commit -m "feat(web): masks phoneBrMask e cepMask"
```

---

### Task 4: Atualizar `branches/data.ts` para refletir novo schema

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/data.ts` (interfaces `BranchDetail` e `BranchTableRow` + funções `getBranchDetail` e `fetchBranchesTablePage`)

- [ ] **Step 1: Rewrite `BranchDetail` interface (linha ~77)**

```ts
export interface BranchDetail {
	cep: string | null;
	city: string | null;
	complement: string | null;
	createdAt: Date;
	id: string;
	name: string;
	neighborhood: string | null;
	phone: string | null;
	responsibleName: string | null;
	responsibleUserId: string | null;
	state: string | null;
	status: "active" | "inactive";
	street: string | null;
	streetNumber: string | null;
	updatedAt: Date;
}
```

- [ ] **Step 2: Rewrite `getBranchDetail` select (linha ~88)**

```ts
export async function getBranchDetail(
	id: string
): Promise<BranchDetail | null> {
	const [row] = await db
		.select({
			id: branch.id,
			name: branch.name,
			phone: branch.phone,
			cep: branch.cep,
			street: branch.street,
			streetNumber: branch.streetNumber,
			complement: branch.complement,
			neighborhood: branch.neighborhood,
			city: branch.city,
			state: branch.state,
			status: branch.status,
			responsibleUserId: branch.responsibleUserId,
			responsibleName: userTable.name,
			createdAt: branch.createdAt,
			updatedAt: branch.updatedAt,
		})
		.from(branch)
		.leftJoin(userTable, eq(userTable.id, branch.responsibleUserId))
		.where(eq(branch.id, id))
		.limit(1);
	return (row as BranchDetail) ?? null;
}
```

- [ ] **Step 3: Rewrite `BranchTableRow` interface (linha ~203)**

Substituir `address` por endereço estruturado mínimo (o card usa `formatBranchAddress`) + `status`:

```ts
export interface BranchTableRow {
	activeSkus: number;
	city: string | null;
	createdAt: Date;
	id: string;
	lowStock: number;
	name: string;
	neighborhood: string | null;
	state: string | null;
	status: "active" | "inactive";
	street: string | null;
	streetNumber: string | null;
	teamCount: number;
}
```

- [ ] **Step 4: Localizar onde `BranchTableRow` é construído e ajustar select**

Grep:
```bash
rg "BranchTableRow" apps/web/src --type ts -n
```

Será em `apps/web/src/app/dashboard/branches/actions.ts` dentro de `fetchBranchesTablePage`. Substituir o select de campos do branch — onde lê `address: branch.address`, trocar pelos novos campos:

```ts
// Onde estiver select({ ... address: branch.address ... })
// trocar por:
.select({
	id: branch.id,
	name: branch.name,
	street: branch.street,
	streetNumber: branch.streetNumber,
	neighborhood: branch.neighborhood,
	city: branch.city,
	state: branch.state,
	status: branch.status,
	createdAt: branch.createdAt,
})
```

(Manter o restante do agregado intacto — `teamCount`, `activeSkus`, `lowStock` vêm de `getBranchTableAggregates`.)

- [ ] **Step 5: Verify**

Run: `bun check-types 2>&1 | grep -E "data.ts|actions.ts" | head -20`
Expected: zero erros nesses dois arquivos. Erros nos consumidores (`branch-card.tsx`, `overview-tab.tsx`, `branch-edit-sheet.tsx`) ainda persistem — serão consertados nas próximas tasks.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/data.ts apps/web/src/app/dashboard/branches/actions.ts
git commit -m "refactor(branches): data.ts retorna novos campos do schema"
```

---

### Task 5: `branch-card.tsx` — formatBranchAddress + badge inativa

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-card.tsx`

- [ ] **Step 1: Importar helper e usar**

Adicionar import:
```ts
import { formatBranchAddress } from "@/lib/format/branch";
```

Substituir o bloco que renderiza `{branch.address}` (linha ~68-72):

```tsx
{(() => {
	const addr = formatBranchAddress(branch);
	return addr ? (
		<p className="line-clamp-1 text-muted-foreground text-xs">{addr}</p>
	) : null;
})()}
```

- [ ] **Step 2: Adicionar badge "Inativa" no header (logo abaixo do nome)**

Após o `<p>` do nome (linha ~65-67), antes do bloco de endereço:

```tsx
{branch.status === "inactive" && (
	<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
		Inativa
	</span>
)}
```

- [ ] **Step 3: Aplicar opacity-70 no card inteiro quando inactive**

No `<div>` raiz do card (`group flex cursor-pointer flex-col...`), adicionar a classe condicional:

```tsx
className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${branch.status === "inactive" ? "opacity-70" : ""}`}
```

- [ ] **Step 4: Verify**

Run: `bun check-types 2>&1 | grep branch-card`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-card.tsx
git commit -m "feat(branches): card usa formatBranchAddress + badge Inativa"
```

---

### Task 6: `overview-tab.tsx` — exibir endereço estruturado

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx`

- [ ] **Step 1: Ler arquivo e identificar bloco do address**

Run: `rg -n "address" apps/web/src/app/dashboard/branches/\[id\]/_components/overview-tab.tsx`
Localizar o `<dt>` / `<dd>` que renderiza `detail.address`.

- [ ] **Step 2: Substituir bloco pelo endereço estruturado**

Importar:
```ts
import { formatBranchAddress, formatCep } from "@/lib/format/branch";
```

Substituir o `<dt>Endereço</dt><dd>{detail.address ?? "—"}</dd>` por:

```tsx
<div>
	<dt className="text-muted-foreground text-xs uppercase tracking-wider">
		Endereço
	</dt>
	<dd className="mt-1 text-sm">
		{(() => {
			const line = formatBranchAddress(detail);
			const cep = formatCep(detail.cep);
			if (!(line || cep)) {
				return "—";
			}
			return (
				<div className="flex flex-col gap-0.5">
					{line && <span>{line}</span>}
					{cep && (
						<span className="text-muted-foreground text-xs">CEP {cep}</span>
					)}
					{detail.complement && (
						<span className="text-muted-foreground text-xs">
							Compl.: {detail.complement}
						</span>
					)}
				</div>
			);
		})()}
	</dd>
</div>
```

- [ ] **Step 3: Verify**

Run: `bun check-types 2>&1 | grep overview-tab`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/_components/overview-tab.tsx
git commit -m "feat(branches): overview-tab mostra endereço estruturado + CEP"
```

---

### Task 7: Rewrite `branch-schema.ts` (Zod)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`

- [ ] **Step 1: Substituir conteúdo do arquivo**

```ts
import { z } from "zod";

const phoneRegex = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;
const cepDigitsRegex = /^\d{8}$/;
const ufRegex = /^[A-Z]{2}$/;

const optionalTrimmed = z
	.string()
	.trim()
	.optional()
	.or(z.literal(""))
	.transform((v) => (v ? v : undefined));

export const branchSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Nome obrigatório")
			.min(2, "Nome muito curto")
			.max(120, "Nome muito longo"),
		status: z.enum(["active", "inactive"]).default("active"),
		phone: z
			.string()
			.trim()
			.max(40, "Telefone muito longo")
			.regex(phoneRegex, "Telefone inválido")
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined)),
		cep: z
			.string()
			.trim()
			.transform((v) => v.replace(/\D/g, ""))
			.refine((v) => v === "" || cepDigitsRegex.test(v), "CEP inválido")
			.optional()
			.transform((v) => (v ? v : undefined)),
		street: optionalTrimmed.pipe(
			z.string().max(200, "Rua muito longa").optional()
		),
		streetNumber: optionalTrimmed.pipe(
			z.string().max(20, "Número muito longo").optional()
		),
		complement: optionalTrimmed.pipe(
			z.string().max(100, "Complemento muito longo").optional()
		),
		neighborhood: optionalTrimmed.pipe(
			z.string().max(120, "Bairro muito longo").optional()
		),
		city: optionalTrimmed.pipe(
			z.string().max(120, "Cidade muito longa").optional()
		),
		state: z
			.string()
			.trim()
			.toUpperCase()
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined))
			.refine((v) => !v || ufRegex.test(v), "UF inválido (use 2 letras)"),
		responsibleUserId: optionalTrimmed.pipe(z.string().uuid().optional()),
	})
	.refine(
		(data) => {
			if (!data.cep) {
				return true;
			}
			return Boolean(
				data.street && data.streetNumber && data.city && data.state
			);
		},
		{
			message:
				"Quando CEP é preenchido, rua, número, cidade e UF são obrigatórios",
			path: ["cep"],
		}
	);

export type BranchFormValues = z.infer<typeof branchSchema>;
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep branch-schema`
Expected: zero erros no schema (consumidores ainda podem reclamar, será resolvido).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-schema.ts
git commit -m "feat(branches): Zod schema com endereço estruturado, status e validação condicional"
```

---

### Task 8: Server action `listResponsibleCandidates`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (adicionar export + import)

- [ ] **Step 1: Adicionar imports no topo do arquivo (se ausentes)**

```ts
import { user } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
```

(Conferir o que já está importado e não duplicar.)

- [ ] **Step 2: Adicionar a função (após `listBranches`)**

```ts
export interface ResponsibleCandidate {
	email: string;
	id: string;
	image: string | null;
	name: string;
	role: "super_admin" | "admin" | "manager" | "user";
}

export async function listResponsibleCandidates(
	branchId: string
): Promise<ResponsibleCandidate[]> {
	await requireCapability("branches.manage");
	return await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			image: user.image,
		})
		.from(userBranch)
		.innerJoin(user, eq(userBranch.userId, user.id))
		.where(
			and(eq(userBranch.branchId, branchId), eq(user.status, "active"))
		)
		.orderBy(asc(user.name));
}
```

- [ ] **Step 3: Verify**

Run: `bun check-types 2>&1 | grep actions.ts | head -10`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "feat(branches): action listResponsibleCandidates"
```

---

### Task 9: Componente `ResponsibleUserSelect`

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/responsible-user-select.tsx`

- [ ] **Step 1: Criar componente**

```tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
	listResponsibleCandidates,
	type ResponsibleCandidate,
} from "../actions";

interface Props {
	branchId: string;
	disabled?: boolean;
	onChange: (next: string | undefined) => void;
	value: string | undefined;
}

const ROLE_LABEL: Record<ResponsibleCandidate["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Manager",
	user: "Membro",
};

export function ResponsibleUserSelect({
	branchId,
	value,
	onChange,
	disabled,
}: Props) {
	const [candidates, setCandidates] = useState<ResponsibleCandidate[]>([]);
	const [isPending, startTransition] = useTransition();
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		startTransition(async () => {
			const rows = await listResponsibleCandidates(branchId);
			setCandidates(rows);
			setLoaded(true);
		});
	}, [branchId]);

	if (loaded && candidates.length === 0) {
		return (
			<div className="flex items-center justify-between rounded-md border border-border border-dashed px-3 py-2.5 text-sm">
				<span className="text-muted-foreground">
					Nenhum membro vinculado.
				</span>
				<Link
					className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs hover:underline"
					href={`/dashboard/branches/${branchId}?tab=team`}
				>
					<UserPlus aria-hidden className="size-3.5" />
					Vincular na aba Equipe
				</Link>
			</div>
		);
	}

	return (
		<Select
			disabled={disabled || isPending}
			onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
			value={value ?? "__none__"}
		>
			<SelectTrigger>
				<SelectValue placeholder={isPending ? "Carregando…" : "Selecione"} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__none__">
					<span className="text-muted-foreground">Sem responsável</span>
				</SelectItem>
				{candidates.map((c) => (
					<SelectItem key={c.id} value={c.id}>
						<div className="flex items-center gap-2">
							<span className="font-medium">{c.name}</span>
							<span className="text-muted-foreground text-xs">
								· {ROLE_LABEL[c.role]}
							</span>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep responsible-user-select`
Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/responsible-user-select.tsx
git commit -m "feat(branches): ResponsibleUserSelect com empty state pra equipe"
```

---

### Task 10: Componente `CepInput`

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/cep-input.tsx`

- [ ] **Step 1: Criar componente**

```tsx
"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/masked-input";
import { cepMask } from "@/lib/masks";
import { logger } from "@/lib/logger";

interface ViaCepResponse {
	bairro?: string;
	cep?: string;
	erro?: boolean;
	localidade?: string;
	logradouro?: string;
	uf?: string;
}

export interface CepResolved {
	city: string;
	neighborhood: string;
	state: string;
	street: string;
}

interface Props {
	disabled?: boolean;
	id?: string;
	onChange: (next: string | undefined) => void;
	onResolve: (resolved: CepResolved) => void;
	value: string | undefined;
}

const DEBOUNCE_MS = 300;
const TIMEOUT_MS = 5000;

export function CepInput({
	id,
	value,
	onChange,
	onResolve,
	disabled,
}: Props) {
	const [isFetching, setIsFetching] = useState(false);
	const lastFetchedRef = useRef<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!value || value.length !== 8) {
			return;
		}
		if (lastFetchedRef.current === value) {
			return;
		}
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		const cep = value;
		timerRef.current = setTimeout(() => {
			lastFetchedRef.current = cep;
			setIsFetching(true);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
			fetch(`https://viacep.com.br/ws/${cep}/json/`, {
				signal: controller.signal,
			})
				.then((r) => r.json() as Promise<ViaCepResponse>)
				.then((data) => {
					clearTimeout(timeout);
					if (data.erro) {
						toast.error("CEP não encontrado");
						return;
					}
					onResolve({
						street: data.logradouro ?? "",
						neighborhood: data.bairro ?? "",
						city: data.localidade ?? "",
						state: (data.uf ?? "").toUpperCase(),
					});
					toast.success("Endereço encontrado");
				})
				.catch((err) => {
					clearTimeout(timeout);
					logger.warn({ err, cep }, "ViaCEP lookup failed");
					toast.message("Não foi possível buscar endereço — preencha manual");
				})
				.finally(() => setIsFetching(false));
		}, DEBOUNCE_MS);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [value, onResolve]);

	return (
		<div className="relative">
			<MaskedInput
				disabled={disabled}
				id={id}
				mask={cepMask}
				onChange={(v) => onChange(v)}
				value={value}
			/>
			{isFetching && (
				<Loader2
					aria-hidden
					className="absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep cep-input`
Expected: zero erros. Se reclamar do `logger`, confirmar caminho com `rg "from \"@/lib/logger\"" apps/web/src -l | head -3`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/cep-input.tsx
git commit -m "feat(branches): CepInput com lookup ViaCEP debounced + AbortController"
```

---

### Task 11: Shared `BranchFormFields`

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`

- [ ] **Step 1: Criar componente**

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { MaskedInput } from "@/components/masked-input";
import { phoneBrMask } from "@/lib/masks";

import type { BranchFormValues } from "./branch-schema";
import { CepInput, type CepResolved } from "./cep-input";
import { ResponsibleUserSelect } from "./responsible-user-select";

type Patch = (next: Partial<BranchFormValues>) => void;

interface Props {
	branchId?: string;
	disabled?: boolean;
	onPatch: Patch;
	showTeamSection: boolean;
	values: BranchFormValues;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
			{children}
		</h3>
	);
}

export function BranchFormFields({
	branchId,
	values,
	onPatch,
	showTeamSection,
	disabled,
}: Props) {
	const handleCepResolve = (resolved: CepResolved) => {
		onPatch({
			street: values.street || resolved.street,
			neighborhood: values.neighborhood || resolved.neighborhood,
			city: values.city || resolved.city,
			state: values.state || resolved.state,
		});
	};

	return (
		<div className="flex flex-col gap-6">
			{/* Identidade */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Identidade</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-name">
						Nome <span className="text-destructive">*</span>
					</Label>
					<Input
						disabled={disabled}
						id="branch-name"
						onChange={(e) => onPatch({ name: e.target.value })}
						value={values.name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-status">Status</Label>
					<Select
						disabled={disabled}
						onValueChange={(v) =>
							onPatch({ status: v as BranchFormValues["status"] })
						}
						value={values.status}
					>
						<SelectTrigger id="branch-status">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="active">Ativa</SelectItem>
							<SelectItem value="inactive">Inativa</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Inativa esconde a filial dos pickers de novos pedidos/ajustes
						(histórico mantido).
					</p>
				</div>
			</section>

			{/* Contato */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Contato</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-phone">Telefone</Label>
					<MaskedInput
						disabled={disabled}
						id="branch-phone"
						mask={phoneBrMask}
						onChange={(v) => onPatch({ phone: v })}
						value={values.phone}
					/>
				</div>
			</section>

			{/* Endereço */}
			<section className="flex flex-col gap-3">
				<SectionHeader>Endereço</SectionHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-cep">CEP</Label>
					<CepInput
						disabled={disabled}
						id="branch-cep"
						onChange={(v) => onPatch({ cep: v })}
						onResolve={handleCepResolve}
						value={values.cep}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-street">Rua</Label>
					<Input
						disabled={disabled}
						id="branch-street"
						onChange={(e) => onPatch({ street: e.target.value })}
						value={values.street ?? ""}
					/>
				</div>
				<div className="grid grid-cols-[100px_1fr] gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-number">Nº</Label>
						<Input
							disabled={disabled}
							id="branch-number"
							onChange={(e) => onPatch({ streetNumber: e.target.value })}
							value={values.streetNumber ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-complement">Complemento</Label>
						<Input
							disabled={disabled}
							id="branch-complement"
							onChange={(e) => onPatch({ complement: e.target.value })}
							value={values.complement ?? ""}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-neighborhood">Bairro</Label>
					<Input
						disabled={disabled}
						id="branch-neighborhood"
						onChange={(e) => onPatch({ neighborhood: e.target.value })}
						value={values.neighborhood ?? ""}
					/>
				</div>
				<div className="grid grid-cols-[1fr_100px] gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-city">Cidade</Label>
						<Input
							disabled={disabled}
							id="branch-city"
							onChange={(e) => onPatch({ city: e.target.value })}
							value={values.city ?? ""}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-state">UF</Label>
						<Input
							disabled={disabled}
							id="branch-state"
							maxLength={2}
							onChange={(e) =>
								onPatch({ state: e.target.value.toUpperCase() })
							}
							value={values.state ?? ""}
						/>
					</div>
				</div>
			</section>

			{/* Equipe (oculto no create) */}
			{showTeamSection && branchId && (
				<section className="flex flex-col gap-3">
					<SectionHeader>Equipe</SectionHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-responsible">Responsável</Label>
						<ResponsibleUserSelect
							branchId={branchId}
							disabled={disabled}
							onChange={(v) => onPatch({ responsibleUserId: v })}
							value={values.responsibleUserId}
						/>
					</div>
				</section>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep branch-form-fields`
Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx
git commit -m "feat(branches): BranchFormFields compartilhado entre create e edit"
```

---

### Task 12: Refactor `branch-edit-sheet.tsx` para usar BranchFormFields

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx` (rewrite completo)

- [ ] **Step 1: Substituir conteúdo inteiro**

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { updateBranch } from "../../actions";
import type { BranchDetail } from "../../data";
import { BranchFormFields } from "../../_components/branch-form-fields";
import {
	type BranchFormValues,
	branchSchema,
} from "../../_components/branch-schema";

interface Props {
	branch: BranchDetail;
}

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	status: "Status",
	phone: "Telefone",
	cep: "CEP",
	street: "Rua",
	streetNumber: "Número",
	complement: "Complemento",
	neighborhood: "Bairro",
	city: "Cidade",
	state: "UF",
	responsibleUserId: "Responsável",
};

function toFormValues(b: BranchDetail): BranchFormValues {
	return {
		name: b.name,
		status: b.status,
		phone: b.phone ?? undefined,
		cep: b.cep ?? undefined,
		street: b.street ?? undefined,
		streetNumber: b.streetNumber ?? undefined,
		complement: b.complement ?? undefined,
		neighborhood: b.neighborhood ?? undefined,
		city: b.city ?? undefined,
		state: b.state ?? undefined,
		responsibleUserId: b.responsibleUserId ?? undefined,
	};
}

export function BranchEditSheet({ branch }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [values, setValues] = useState<BranchFormValues>(() =>
		toFormValues(branch)
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(toFormValues(branch));
			setIssues([]);
		}
	}, [open, branch]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = branchSchema.safeParse(values);
		if (!parsed.success) {
			setIssues(zodIssuesToFormIssues(parsed.error, FIELD_LABELS));
			return;
		}
		startTransition(async () => {
			const res = await updateBranch(branch.id, parsed.data);
			if (res.ok) {
				toast.success("Filial atualizada");
				close();
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da filial"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${branch.name}`}
		>
			<BranchFormFields
				branchId={branch.id}
				disabled={submitting}
				onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
				showTeamSection
				values={values}
			/>
		</EntityEditSheet>
	);
}
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep branch-edit-sheet`
Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/\[id\]/_components/branch-edit-sheet.tsx
git commit -m "refactor(branches): edit sheet usa BranchFormFields"
```

---

### Task 13: Refactor `branch-form.tsx` (create) para usar BranchFormFields

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form.tsx` (rewrite completo)

- [ ] **Step 1: Substituir conteúdo**

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { createBranch, updateBranch } from "../actions";
import { BranchFormFields } from "./branch-form-fields";
import {
	type BranchFormValues,
	branchSchema,
} from "./branch-schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	status: "Status",
	phone: "Telefone",
	cep: "CEP",
	street: "Rua",
	streetNumber: "Número",
	complement: "Complemento",
	neighborhood: "Bairro",
	city: "Cidade",
	state: "UF",
};

interface BranchFormProps {
	branchId?: string;
	defaultValues: Partial<BranchFormValues>;
	mode: "create" | "edit";
}

function SubmitLabel({
	isPending,
	mode,
}: {
	isPending: boolean;
	mode: "create" | "edit";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return <>{mode === "create" ? "Criar filial" : "Salvar alterações"}</>;
}

function buildInitial(d: Partial<BranchFormValues>): BranchFormValues {
	return {
		name: d.name ?? "",
		status: d.status ?? "active",
		phone: d.phone,
		cep: d.cep,
		street: d.street,
		streetNumber: d.streetNumber,
		complement: d.complement,
		neighborhood: d.neighborhood,
		city: d.city,
		state: d.state,
		responsibleUserId: d.responsibleUserId,
	};
}

export function BranchForm({ branchId, defaultValues, mode }: BranchFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<BranchFormValues>(() =>
		buildInitial(defaultValues)
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIssues([]);

		const parsed = branchSchema.safeParse(values);
		if (!parsed.success) {
			const next = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setIssues(next);
			toast.error(
				`${next.length} ${next.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			const action =
				mode === "create"
					? createBranch(parsed.data)
					: updateBranch(branchId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				toast.success(
					mode === "create" ? "Filial criada" : "Filial atualizada"
				);
				router.push("/dashboard/branches");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar a filial");
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-2xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<FormErrorPanel issues={issues} />
			<div className="rounded-md border border-border bg-card p-6">
				<BranchFormFields
					branchId={branchId}
					disabled={isPending}
					onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
					showTeamSection={mode === "edit"}
					values={values}
				/>
			</div>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/branches"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
```

- [ ] **Step 2: Verify**

Run: `bun check-types 2>&1 | grep -E "branch-form\.tsx|branches/new"`
Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form.tsx
git commit -m "refactor(branches): create form usa BranchFormFields"
```

---

### Task 14: Refactor `updateBranch` + `createBranch` (CEP normalize + responsible validation)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (funções `createBranch`, `updateBranch`, helper `normalizePayload`)

- [ ] **Step 1: Substituir `normalizePayload`**

```ts
function normalizePayload(input: BranchFormValues) {
	return {
		name: input.name,
		status: input.status,
		phone: input.phone ?? null,
		cep: input.cep ?? null, // já vem em dígitos via Zod transform
		street: input.street ?? null,
		streetNumber: input.streetNumber ?? null,
		complement: input.complement ?? null,
		neighborhood: input.neighborhood ?? null,
		city: input.city ?? null,
		state: input.state ?? null,
		responsibleUserId: input.responsibleUserId ?? null,
	};
}
```

- [ ] **Step 2: Editar `updateBranch` para validar responsável vinculado**

Localizar a função `updateBranch`. Antes do `await db.update(branch).set(...)`, adicionar:

```ts
if (data.responsibleUserId) {
	const [linked] = await db
		.select({ uid: userBranch.userId })
		.from(userBranch)
		.where(
			and(
				eq(userBranch.branchId, branchId),
				eq(userBranch.userId, data.responsibleUserId)
			)
		)
		.limit(1);
	if (!linked) {
		return {
			ok: false,
			error: "Responsável precisa estar vinculado à filial",
		};
	}
}
```

(Assumindo `data` é o payload pós-`branchSchema.parse`. Se o nome de variável for diferente no arquivo, adaptar.)

- [ ] **Step 3: Garantir que `createBranch` ignora `responsibleUserId`**

No início do `createBranch`, antes do db.insert, sobrescrever:

```ts
const payload = { ...normalizePayload(parsed.data), responsibleUserId: null };
```

Substituir o uso do payload anterior por este.

- [ ] **Step 4: Verify**

Run: `bun check-types 2>&1 | grep actions.ts`
Expected: zero erros.

- [ ] **Step 5: Smoke run-time (SQL não é checado por tsc)**

Garantir que o dev server está rodando:
```bash
bun dev:web 2>&1 | head -20
```

Visitar `/dashboard/branches` no browser e abrir um branch — confirmar que carrega sem 500.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "refactor(branches): updateBranch valida responsável vinculado; createBranch ignora responsibleUserId"
```

---

### Task 15: `listBranches` ganha `{ activeOnly }`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (função `listBranches`)
- Modify: `apps/web/src/app/dashboard/stock/branches/page.tsx` (caller existente)

- [ ] **Step 1: Editar `listBranches`**

```ts
export async function listBranches(opts?: {
	activeOnly?: boolean;
}): Promise<BranchListItem[]> {
	if (opts?.activeOnly) {
		return await db
			.select()
			.from(branch)
			.where(eq(branch.status, "active"))
			.orderBy(asc(branch.name));
	}
	return await db.select().from(branch).orderBy(asc(branch.name));
}
```

- [ ] **Step 2: Atualizar caller existente em `stock/branches/page.tsx`**

Esta página é a "Estoque por Filiais" admin — mostra TODAS as filiais (inclusive inativas) pra histórico. **Não** passar `activeOnly`. Apenas verificar que a chamada atual `listBranches()` continua funcionando (sem refactor).

Run: `rg "listBranches\(" apps/web/src --type ts -n`
Expected: ver os call sites. Se algum picker de "selecionar filial em novo pedido/ajuste" aparecer, adicionar `{ activeOnly: true }` neles.

- [ ] **Step 3: Verify**

Run: `bun check-types 2>&1 | grep listBranches`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "feat(branches): listBranches opt-in activeOnly"
```

---

### Task 16: `BranchesFilters` ganha toggle "Mostrar inativas"

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branches-filters.tsx`
- Modify: `apps/web/src/app/dashboard/branches/page.tsx`
- Modify: `apps/web/src/app/dashboard/branches/actions.ts` (`BranchesFiltersInput` + `fetchBranchesTablePage`)

- [ ] **Step 1: Adicionar `includeInactive` em `BranchesFiltersInput`**

Em `actions.ts`:

```ts
export interface BranchesFiltersInput {
	includeInactive?: boolean;
	search?: string;
	sort: BranchSort;
}
```

E aplicar no `fetchBranchesTablePage` — onde estiver `conditions: [...]`, adicionar:

```ts
if (!filters.includeInactive) {
	conditions.push(eq(branch.status, "active"));
}
```

- [ ] **Step 2: Adicionar chip em `branches-filters.tsx`**

Ler o arquivo primeiro:
```bash
rg -n "useFilterState\|useDebouncedParam\|status" apps/web/src/app/dashboard/branches/_components/branches-filters.tsx
```

Adicionar um chip toggle "Mostrar inativas" ao lado dos demais filtros existentes (padrão: OFF). Quando ON, adiciona `?inactive=1` à URL.

Estrutura mínima a adicionar dentro do JSX:

```tsx
<button
	className={`rounded-[7px] border px-3 py-1.5 text-xs transition-colors ${
		showInactive
			? "border-border bg-card text-foreground"
			: "border-transparent text-muted-foreground hover:text-foreground"
	}`}
	onClick={() => toggleInactive()}
	type="button"
>
	Mostrar inativas
</button>
```

Onde `showInactive` vem de `useFilterState({ key: "inactive" })` e `toggleInactive` faz `setParam(showInactive ? undefined : "1")`. Adaptar ao pattern atual do arquivo.

- [ ] **Step 3: Atualizar `branches/page.tsx` pra ler `inactive` do searchParams**

```ts
interface PageProps {
	searchParams: Promise<{
		inactive?: string;
		search?: string;
		sort?: string;
	}>;
}
```

No `filters`:

```ts
const filters: BranchesFiltersInput = {
	search: sp.search,
	sort: (sp.sort as BranchesFiltersInput["sort"]) ?? "newest",
	includeInactive: sp.inactive === "1",
};
```

- [ ] **Step 4: Verify**

Run: `bun check-types 2>&1 | grep -E "branches-filters|branches/page|actions.ts"`
Expected: zero erros.

- [ ] **Step 5: Smoke**

Visitar `/dashboard/branches` — chip "Mostrar inativas" aparece e funciona.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branches-filters.tsx apps/web/src/app/dashboard/branches/page.tsx apps/web/src/app/dashboard/branches/actions.ts
git commit -m "feat(branches): filtro 'Mostrar inativas' (default OFF)"
```

---

### Task 17: Smoke run-time (golden path + edge cases)

**Files:** — (apenas verificação)

- [ ] **Step 1: Garantir dev server rodando**

```bash
bun dev:web 2>&1 | head -10
```

Se não estiver rodando, subir e aguardar `✓ Ready`.

- [ ] **Step 2: Golden path — Editar filial existente**

Browser: `/dashboard/branches/<id>?edit=1`

Verificar:
- Sheet abre com seções: Identidade, Contato, Endereço, Equipe.
- Telefone com máscara — digitar números preenche `(00) 00000-0000`.
- CEP — digitar 8 dígitos válidos → spinner aparece → outros campos (rua/bairro/cidade/UF) preenchem → toast "Endereço encontrado".
- Select de Responsável — lista usuários vinculados; selecionar um e salvar funciona.
- Status — alternar entre Ativa/Inativa e salvar funciona.

- [ ] **Step 3: Edge — CEP inválido**

No mesmo sheet: digitar CEP `00000-000` → toast "CEP não encontrado", outros campos não mudam.

- [ ] **Step 4: Edge — Responsável de outra filial via DevTools**

Abrir DevTools → console:
```js
fetch("/dashboard/branches/<id>", {
  method: "POST",
  body: JSON.stringify({ /* simular um responsibleUserId que não está em user_branch */ })
})
```

(Mais simples: editar a filial e via React DevTools setar `responsibleUserId` no state pra um UUID de manager NÃO vinculado. Submeter.)

Esperado: server action retorna `{ ok: false, error: "Responsável precisa estar vinculado à filial" }` → toast vermelho.

- [ ] **Step 5: Edge — Filial sem equipe**

Criar uma filial nova via `/branches/new` (sem equipe). Voltar pra ela em `/branches/<id>?edit=1`. Seção Equipe → "Nenhum membro vinculado" + CTA pra `?tab=team`.

- [ ] **Step 6: Listagem — filtro inativas**

`/dashboard/branches` — chip "Mostrar inativas" OFF (default) esconde a filial que ficou inactive na Step 2. Ligar chip → reaparece com badge "Inativa" + `opacity-70`.

- [ ] **Step 7: Card display**

Card de filial sem endereço estruturado preenchido → não renderiza linha de endereço (ao invés de `null`/string vazia).
Card com endereço preenchido → renderiza `"Rua X, 100 — Bairro Y — Cidade/UF"`.

- [ ] **Step 8: Overview tab**

`/dashboard/branches/<id>` (overview) → bloco "Endereço" mostra endereço estruturado + CEP formatado + complemento (se houver) ou "—" se vazio.

- [ ] **Step 9: Create form paridade**

`/branches/new` → formulário tem todas as seções (Identidade, Contato, Endereço) **menos** Equipe (oculta). Submeter sem campos opcionais cria filial só com nome.

- [ ] **Step 10: Sem commit** — task de smoke, não cria arquivo. Se algum problema for descoberto, voltar à task correspondente e corrigir.

---

## Self-review

**1. Spec coverage:**

| Spec | Task(s) |
|---|---|
| Schema diff (cep, street, ..., status) | Task 1 |
| Drop `address` destrutivo | Task 1 (Step 2 confirma) |
| `formatBranchAddress` helper | Task 2 |
| Display fallback em branch-card + overview | Tasks 5, 6 |
| `ResponsibleUserSelect` lazy + empty state | Tasks 8, 9 |
| `CepInput` com ViaCEP + AbortController + fallback silencioso | Task 10 |
| Sheet com seções scrolladas | Task 11 (BranchFormFields), Task 12 (sheet usa) |
| Paridade create↔edit | Task 13 |
| `updateBranch` valida responsável vinculado + normaliza CEP | Task 14 |
| `createBranch` ignora responsibleUserId | Task 14 |
| `listBranches({activeOnly})` | Task 15 |
| Chip "Mostrar inativas" + badge "Inativa" | Tasks 5 (badge), 16 (chip) |
| Validações Zod condicionais (cep → street+number+city+state) | Task 7 |
| Smoke run-time | Task 17 |

Gaps: nenhum.

**2. Placeholder scan:** sem TBD/TODO/"add validation"/"similar to Task N". Cada step traz código pronto.

**3. Type consistency:** `BranchFormValues` referenciado consistentemente. `BranchDetail` e `BranchTableRow` redefinidos na Task 4 e consumidos nos consumers (Tasks 5, 6, 12). `ResponsibleCandidate` definido na Task 8, importado na Task 9.

**Pequena nota:** Task 11 usa `<Select>` do `@emach/ui/components/select` para o campo Status. Confirmar com `rg "from \"@emach/ui/components/select\"" apps/web/src -l | head -3` que esse import existe (já é usado em outros forms — `users/_components/`, por ex.).
