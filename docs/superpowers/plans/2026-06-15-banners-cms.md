# Banners da home (CMS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-06-15-banners-cms-design.md`. Leia antes de começar.
> **Cada subagent implementador:** Read cada arquivo antes de Edit (não herda state do parent). Rodar `bun check-types` antes de commitar. Não rodar Bash destrutivo em paralelo com Write/Edit.

**Goal:** CMS no dashboard para gerenciar os banners do carrossel da home do storefront (CRUD + reorder + publicação + upload de 4 imagens + preview ao vivo), com a tabela `banner` owned-by-dashboard.

**Architecture:** Tabela Drizzle `banner` (push-only, ADR-0006) sincronizada pro ecommerce via CI. Rota `/dashboard/site/banners` seguindo o entity/CRUD pattern (DESIGN.md §4): listagem com media-cards reordenáveis (dnd-kit) + páginas `/new` e `/[id]/edit` com form de 2 colunas (campos + preview ao vivo sticky). Mutações via server actions com `requireCapability("site.update_banners")` + `ActionResult<T>`. Upload espelhando `tool-images`.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 + Supabase Postgres/Storage, Zod, dnd-kit, vitest (node env).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/db/src/schema/banner.ts` (criar) | Tabela `banner` + tipos `Banner`/`NewBanner` |
| `packages/db/src/schema/index.ts` (modificar) | Re-export do barrel |
| `apps/web/src/lib/supabase-server.ts` (modificar) | Constante `BANNER_IMAGES_BUCKET` |
| `apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts` (criar) | Zod schema + `MAX_ACTIVE_BANNERS` + tipos (fonte única form+action) |
| `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts` (criar) | Testes do zod schema |
| `apps/web/src/app/dashboard/site/banners/_components/image-actions.ts` (criar) | `uploadBannerImage` / `deleteBannerImage` |
| `apps/web/src/app/dashboard/site/banners/actions.ts` (criar) | Fetchers + `createBanner`/`updateBanner`/`deleteBanner`/`reorderBanners`/`toggleBannerActive` |
| `apps/web/src/app/dashboard/_components/nav-config.ts` (modificar) | Reativar item "Banners" |
| `apps/web/src/app/dashboard/site/banners/page.tsx` (criar) | Listagem (Server Component) |
| `apps/web/src/app/dashboard/site/banners/_components/banner-card.tsx` (criar) | Media-card |
| `apps/web/src/app/dashboard/site/banners/_components/banner-list.tsx` (criar) | Grid 3-col + dnd-kit + seções + toggle |
| `apps/web/src/app/dashboard/site/banners/_components/delete-banner-dialog.tsx` (criar) | AlertDialog destrutivo |
| `apps/web/src/app/dashboard/site/banners/_components/image-upload-tile.tsx` (criar) | Slot de upload único com guidelines |
| `apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx` (criar) | Preview desktop/mobile |
| `apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx` (criar) | Form 2 colunas (new+edit) |
| `apps/web/src/app/dashboard/site/banners/new/page.tsx` (criar) | Página criar |
| `apps/web/src/app/dashboard/site/banners/[id]/edit/page.tsx` (criar) | Página editar |

---

## Task 1: Schema `banner` + barrel + db:sync

**Files:**
- Create: `packages/db/src/schema/banner.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Criar o schema**

Arquivo `packages/db/src/schema/banner.ts`:

```ts
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const banner = pgTable("banner", {
	id: text("id").primaryKey(),
	backgroundImageUrl: text("background_image_url").notNull(),
	backgroundImageMobileUrl: text("background_image_mobile_url"),
	productImageUrl: text("product_image_url"),
	productImageMobileUrl: text("product_image_mobile_url"),
	title: text("title").notNull(),
	subtitle: text("subtitle"),
	altText: text("alt_text").notNull(),
	ctaLabel: text("cta_label").notNull(),
	ctaHref: text("cta_href").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export type Banner = typeof banner.$inferSelect;
export type NewBanner = typeof banner.$inferInsert;
```

- [ ] **Step 2: Registrar no barrel**

Em `packages/db/src/schema/index.ts`, adicionar a linha em ordem alfabética (depois de `./auth`, antes de `./categories`):

```ts
export * from "./banner";
```

- [ ] **Step 3: Aplicar no banco**

Run: `bun db:sync`
Expected: drizzle-kit cria a tabela `banner` sem prompt destrutivo (tabela nova). Termina com "Changes applied" + apply-sql idempotente verde.

- [ ] **Step 4: Verificar a tabela**

Run: `bun check-types`
Expected: PASS (tipos `Banner`/`NewBanner` resolvem).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/banner.ts packages/db/src/schema/index.ts
git commit -m "feat(db): tabela banner para o CMS de banners da home"
```

---

## Task 2: Bucket `banner-images`

**Files:**
- Modify: `apps/web/src/lib/supabase-server.ts`

- [ ] **Step 1: Adicionar a constante**

Em `apps/web/src/lib/supabase-server.ts`, logo abaixo de `export const TOOL_IMAGES_BUCKET = "tool-images";`:

```ts
export const BANNER_IMAGES_BUCKET = "banner-images";
```

- [ ] **Step 2: Criar o bucket no Supabase**

O bucket público `banner-images` precisa existir no projeto Supabase. Criar via dashboard do Supabase (Storage → New bucket → name `banner-images`, **Public** marcado) ou via MCP `mcp__supabase__execute_sql`:

```sql
insert into storage.buckets (id, name, public)
values ('banner-images', 'banner-images', true)
on conflict (id) do nothing;
```

Expected: bucket listado como público (espelha `tool-images`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/supabase-server.ts
git commit -m "feat: constante BANNER_IMAGES_BUCKET"
```

---

## Task 3: Zod schema + testes (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bannerFormSchema, MAX_ACTIVE_BANNERS } from "../banner-schema";

const valid = {
	backgroundImageUrl: "https://x.supabase.co/storage/v1/object/public/banner-images/a.jpg",
	backgroundImageMobileUrl: null,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: "Potência redefinida",
	subtitle: null,
	altText: "EMACH — Potência redefinida",
	ctaLabel: "Ver Catálogo",
	ctaHref: "/catalog",
	isActive: false,
};

describe("bannerFormSchema", () => {
	it("aceita um banner válido", () => {
		expect(bannerFormSchema.safeParse(valid).success).toBe(true);
	});

	it("exige backgroundImageUrl", () => {
		const r = bannerFormSchema.safeParse({ ...valid, backgroundImageUrl: "" });
		expect(r.success).toBe(false);
	});

	it("rejeita title acima de 80 chars", () => {
		const r = bannerFormSchema.safeParse({ ...valid, title: "a".repeat(81) });
		expect(r.success).toBe(false);
	});

	it("rejeita ctaLabel acima de 30 chars", () => {
		const r = bannerFormSchema.safeParse({ ...valid, ctaLabel: "a".repeat(31) });
		expect(r.success).toBe(false);
	});

	it("rejeita subtitle acima de 140 chars", () => {
		const r = bannerFormSchema.safeParse({ ...valid, subtitle: "a".repeat(141) });
		expect(r.success).toBe(false);
	});

	it("aceita ctaHref interno (/) e externo (https://)", () => {
		expect(bannerFormSchema.safeParse({ ...valid, ctaHref: "/catalog" }).success).toBe(true);
		expect(bannerFormSchema.safeParse({ ...valid, ctaHref: "https://x.com" }).success).toBe(true);
	});

	it("rejeita ctaHref que não começa com / nem https://", () => {
		expect(bannerFormSchema.safeParse({ ...valid, ctaHref: "catalog" }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...valid, ctaHref: "http://x.com" }).success).toBe(false);
	});

	it("expõe MAX_ACTIVE_BANNERS = 6", () => {
		expect(MAX_ACTIVE_BANNERS).toBe(6);
	});
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `bun --cwd apps/web test banner-schema`
Expected: FAIL — "Cannot find module '../banner-schema'".

- [ ] **Step 3: Implementar o schema**

`apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts`:

```ts
import { z } from "zod";

export const MAX_ACTIVE_BANNERS = 6;

const CTA_HREF_RE = /^(\/|https:\/\/)/;

const nullableTrimmed = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v.length === 0 ? null : v))
		.nullable()
		.or(z.null());

export const bannerFormSchema = z.object({
	backgroundImageUrl: z.string().min(1, "Imagem de fundo é obrigatória"),
	backgroundImageMobileUrl: z.string().nullable(),
	productImageUrl: z.string().nullable(),
	productImageMobileUrl: z.string().nullable(),
	title: z.string().trim().min(1, "Título é obrigatório").max(80, "Máx 80 caracteres"),
	subtitle: nullableTrimmed(140),
	altText: z.string().trim().min(1, "Texto alternativo é obrigatório"),
	ctaLabel: z.string().trim().min(1, "Rótulo do botão é obrigatório").max(30, "Máx 30 caracteres"),
	ctaHref: z
		.string()
		.trim()
		.min(1, "Link do botão é obrigatório")
		.regex(CTA_HREF_RE, "Use uma rota interna (/...) ou URL https://"),
	isActive: z.boolean(),
});

export type BannerFormValues = z.infer<typeof bannerFormSchema>;
```

- [ ] **Step 4: Rodar o teste (deve passar)**

Run: `bun --cwd apps/web test banner-schema`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts
git commit -m "feat(banners): zod schema + testes"
```

---

## Task 4: Image actions (upload/delete)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/image-actions.ts`

- [ ] **Step 1: Implementar (espelha tools/image-actions.ts)**

```ts
"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	extractPublicUrlPath,
	removeStorageObject,
	uploadToPublicBucket,
} from "@/lib/storage";
import { BANNER_IMAGES_BUCKET } from "@/lib/supabase-server";

const MAX_SIZE_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadBannerImage(
	formData: FormData
): Promise<{ url: string }> {
	const session = await requireCapability("site.update_banners");

	const { url } = await uploadToPublicBucket({
		bucket: BANNER_IMAGES_BUCKET,
		formData,
		maxSizeBytes: MAX_SIZE_BYTES,
		allowedTypes: ALLOWED_TYPES,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "banner.image_uploaded",
		targetType: "banner",
		metadata: { url },
	});
	return { url };
}

export async function deleteBannerImage(url: string): Promise<void> {
	const session = await requireCapability("site.update_banners");

	const path = extractPublicUrlPath(url, BANNER_IMAGES_BUCKET);
	if (!path) {
		return;
	}

	await removeStorageObject(BANNER_IMAGES_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "banner.image_deleted",
		targetType: "banner",
		metadata: { path },
	});
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Se `targetType: "banner"` não for aceito por um union literal de `logUserActivity`, conferir a assinatura em `apps/web/src/lib/activity.ts` e usar o tipo correto (ex: `"site"`); ajustar `action`/`targetType` ao que a função aceita.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/image-actions.ts
git commit -m "feat(banners): upload/delete de imagem no bucket banner-images"
```

---

## Task 5: Server actions + fetchers

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/actions.ts`

- [ ] **Step 1: Implementar**

```ts
"use server";

import { db } from "@emach/db";
import { banner } from "@emach/db/schema/banner";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logUserActivity } from "@/lib/activity";
import { getPgError } from "@/lib/db-error";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	type BannerFormValues,
	bannerFormSchema,
	MAX_ACTIVE_BANNERS,
} from "./_components/banner-schema";

const BANNERS_PATH = "/dashboard/site/banners";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function errorMessage(error: unknown): string {
	if (getPgError(error)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro inesperado";
}

async function countActive(excludeId?: string): Promise<number> {
	const where = excludeId
		? and(eq(banner.isActive, true), ne(banner.id, excludeId))
		: eq(banner.isActive, true);
	const [row] = await db.select({ n: count() }).from(banner).where(where);
	return row?.n ?? 0;
}

export async function fetchBanners() {
	await requireCapability("site.update_banners");
	return db.select().from(banner).orderBy(asc(banner.sortOrder), asc(banner.createdAt));
}

export async function fetchBanner(id: string) {
	await requireCapability("site.update_banners");
	const [row] = await db.select().from(banner).where(eq(banner.id, id)).limit(1);
	return row ?? null;
}

export async function createBanner(
	values: BannerFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("site.update_banners");
	const parsed = bannerFormSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos. Revise os campos." };
	}
	const v = parsed.data;

	try {
		if (v.isActive && (await countActive()) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos. Despublique um antes de publicar este.`,
			};
		}
		const [maxRow] = await db
			.select({ max: sql<number>`coalesce(max(${banner.sortOrder}), -1)` })
			.from(banner);
		const id = crypto.randomUUID();
		await db.insert(banner).values({
			id,
			backgroundImageUrl: v.backgroundImageUrl,
			backgroundImageMobileUrl: v.backgroundImageMobileUrl,
			productImageUrl: v.productImageUrl,
			productImageMobileUrl: v.productImageMobileUrl,
			title: v.title,
			subtitle: v.subtitle,
			altText: v.altText,
			ctaLabel: v.ctaLabel,
			ctaHref: v.ctaHref,
			isActive: v.isActive,
			sortOrder: (maxRow?.max ?? -1) + 1,
		});
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.created",
			targetType: "banner",
			targetId: id,
			metadata: { title: v.title },
		});
		revalidatePath(BANNERS_PATH);
		return { ok: true, data: { id } };
	} catch (error) {
		logger.error("createBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function updateBanner(
	id: string,
	values: BannerFormValues
): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	const parsed = bannerFormSchema.safeParse(values);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos. Revise os campos." };
	}
	const v = parsed.data;

	try {
		if (v.isActive && (await countActive(id)) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos. Despublique um antes de publicar este.`,
			};
		}
		await db
			.update(banner)
			.set({
				backgroundImageUrl: v.backgroundImageUrl,
				backgroundImageMobileUrl: v.backgroundImageMobileUrl,
				productImageUrl: v.productImageUrl,
				productImageMobileUrl: v.productImageMobileUrl,
				title: v.title,
				subtitle: v.subtitle,
				altText: v.altText,
				ctaLabel: v.ctaLabel,
				ctaHref: v.ctaHref,
				isActive: v.isActive,
			})
			.where(eq(banner.id, id));
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.updated",
			targetType: "banner",
			targetId: id,
			metadata: { title: v.title },
		});
		revalidatePath(BANNERS_PATH);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function toggleBannerActive(
	id: string,
	active: boolean
): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	try {
		if (active && (await countActive(id)) >= MAX_ACTIVE_BANNERS) {
			return {
				ok: false,
				error: `Máximo de ${MAX_ACTIVE_BANNERS} banners ativos.`,
			};
		}
		await db.update(banner).set({ isActive: active }).where(eq(banner.id, id));
		await logUserActivity({
			actorUserId: session.user.id,
			action: active ? "banner.published" : "banner.unpublished",
			targetType: "banner",
			targetId: id,
		});
		revalidatePath(BANNERS_PATH);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("toggleBannerActive", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function reorderBanners(
	orderedIds: string[]
): Promise<ActionResult> {
	await requireCapability("site.update_banners");
	try {
		await db.transaction(async (tx) => {
			for (const [index, id] of orderedIds.entries()) {
				await tx.update(banner).set({ sortOrder: index }).where(eq(banner.id, id));
			}
		});
		revalidatePath(BANNERS_PATH);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("reorderBanners", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}

export async function deleteBanner(id: string): Promise<ActionResult> {
	const session = await requireCapability("site.update_banners");
	try {
		const [row] = await db.select().from(banner).where(eq(banner.id, id)).limit(1);
		await db.delete(banner).where(eq(banner.id, id));
		// remove imagens do bucket (best-effort, não bloqueia)
		if (row) {
			const { deleteBannerImage } = await import("./_components/image-actions");
			for (const url of [
				row.backgroundImageUrl,
				row.backgroundImageMobileUrl,
				row.productImageUrl,
				row.productImageMobileUrl,
			]) {
				if (url) {
					await deleteBannerImage(url).catch(() => undefined);
				}
			}
		}
		await logUserActivity({
			actorUserId: session.user.id,
			action: "banner.deleted",
			targetType: "banner",
			targetId: id,
		});
		revalidatePath(BANNERS_PATH);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("deleteBanner", { err: error });
		return { ok: false, error: errorMessage(error) };
	}
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Conferir que `logUserActivity` aceita `targetType`/`action` usados; se o tipo for restrito, ajustar conforme a assinatura real em `apps/web/src/lib/activity.ts` (ver Task 4 Step 2). `count` e `ne` vêm de `drizzle-orm`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/actions.ts
git commit -m "feat(banners): server actions (CRUD + reorder + toggle) com guard de 6 ativos"
```

---

## Task 6: Reativar item de nav

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts:112-117`

- [ ] **Step 1: Remover `disabled`**

Substituir o item "Banners" (atualmente com `disabled: true`) por:

```ts
{
	label: "Banners",
	href: "/dashboard/site/banners" as Route,
	icon: ImageIcon,
},
```

(Mantém label, href e ícone — só remove a linha `disabled: true`.)

- [ ] **Step 2: Verificar**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts
git commit -m "feat(banners): reativa item Banners na sidebar"
```

---

## Task 7: Listagem (page + card + list + delete dialog)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/delete-banner-dialog.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/banner-card.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/banner-list.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/page.tsx`

- [ ] **Step 1: Delete dialog (espelha users/destructive-action-dialog.tsx, sem reason)**

`_components/delete-banner-dialog.tsx`:

```tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { deleteBanner } from "../actions";

export function DeleteBannerDialog({
	bannerId,
	bannerTitle,
}: {
	bannerId: string;
	bannerTitle: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<Button
				aria-label={`Excluir banner ${bannerTitle}`}
				onClick={(e) => {
					e.stopPropagation();
					setOpen(true);
				}}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<Trash2 className="size-3.5" />
			</Button>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Excluir banner?</AlertDialogTitle>
					<AlertDialogDescription>
						“{bannerTitle}” e suas imagens serão removidos permanentemente.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							startTransition(async () => {
								const r = await deleteBanner(bannerId);
								if (r.ok) {
									notify.success("Banner excluído");
									setOpen(false);
									router.refresh();
								} else {
									notify.error(r.error);
								}
							});
						}}
					>
						Excluir
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 2: Banner card (media-card — layout aprovado A)**

`_components/banner-card.tsx`. Card sortável (dnd-kit) com imagem dominante + corpo + footer (toggle + editar + excluir). Recebe `banner`, `sortable` (bool), `onToggle`.

```tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { buttonVariants } from "@emach/ui/components/button";
import { Switch } from "@emach/ui/components/switch";
import type { Banner } from "@emach/db/schema/banner";
import { GripVertical, Monitor, Pencil, Smartphone } from "lucide-react";
import Link from "next/link";
import { cn } from "@emach/ui/lib/utils";
import { DeleteBannerDialog } from "./delete-banner-dialog";

export function BannerCard({
	item,
	order,
	sortable,
	onToggle,
}: {
	item: Banner;
	order?: number;
	sortable: boolean;
	onToggle: (id: string, active: boolean) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: item.id, disabled: !sortable });

	return (
		<div
			className={cn(
				"group overflow-hidden rounded-[10px] border border-border bg-card transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm",
				!item.isActive && "opacity-70"
			)}
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			<div className="relative aspect-video bg-black">
				{/* biome-ignore lint/performance/noImgElement: Supabase public URL */}
				<img
					alt={item.altText}
					className="absolute inset-0 size-full object-cover"
					src={item.backgroundImageUrl}
				/>
				{item.productImageUrl && (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					<img
						alt=""
						className="absolute inset-0 m-auto size-3/5 object-contain drop-shadow-[0_20px_24px_rgba(0,0,0,0.55)]"
						src={item.productImageUrl}
					/>
				)}
				{typeof order === "number" && (
					<span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 font-bold text-white text-xs backdrop-blur">
						#{order}
					</span>
				)}
				<span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs backdrop-blur">
					<Monitor className="size-3.5 text-emerald-400" />
					<Smartphone
						className={cn(
							"size-3.5",
							item.backgroundImageMobileUrl ? "text-emerald-400" : "text-muted-foreground"
						)}
					/>
				</span>
				{sortable && (
					<button
						aria-label={`Reordenar ${item.title}`}
						className="absolute top-2 left-1/2 -translate-x-1/2 cursor-grab rounded-md bg-black/45 px-2 py-1 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
						type="button"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="size-4" />
					</button>
				)}
			</div>

			<div className="px-3 pt-3">
				<h3 className="truncate font-semibold text-sm">{item.title}</h3>
				<p className="truncate text-muted-foreground text-xs">
					{item.ctaLabel} → {item.ctaHref}
				</p>
			</div>

			<div className="mt-3 flex items-center justify-between border-border border-t px-3 py-2">
				<div className="flex items-center gap-1">
					<Link
						aria-label={`Editar ${item.title}`}
						className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
						href={`/dashboard/site/banners/${item.id}/edit`}
					>
						<Pencil className="size-3.5" />
					</Link>
					<DeleteBannerDialog bannerId={item.id} bannerTitle={item.title} />
				</div>
				<Switch
					aria-label={item.isActive ? "Despublicar" : "Publicar"}
					checked={item.isActive}
					onCheckedChange={(c) => onToggle(item.id, c)}
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Banner list (3-col grid, seções, dnd-kit, toggle)**

`_components/banner-list.tsx`:

```tsx
"use client";

import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import type { Banner } from "@emach/db/schema/banner";
import { buttonVariants } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cn } from "@emach/ui/lib/utils";
import { notify } from "@/lib/notify";
import { reorderBanners, toggleBannerActive } from "../actions";
import { BannerCard } from "./banner-card";
import { MAX_ACTIVE_BANNERS } from "./banner-schema";

export function BannerList({ banners }: { banners: Banner[] }) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [order, setOrder] = useState(banners);

	const active = useMemo(
		() => order.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
		[order]
	);
	const drafts = useMemo(() => order.filter((b) => !b.isActive), [order]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	);

	function handleToggle(id: string, next: boolean) {
		startTransition(async () => {
			const r = await toggleBannerActive(id, next);
			if (r.ok) {
				setOrder((prev) => prev.map((b) => (b.id === id ? { ...b, isActive: next } : b)));
				notify.success(next ? "Banner publicado" : "Banner despublicado");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active: a, over } = event;
		if (!over || a.id === over.id) {
			return;
		}
		const ids = active.map((b) => b.id);
		const from = ids.indexOf(String(a.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) {
			return;
		}
		const reordered = [...ids];
		const [moved] = reordered.splice(from, 1);
		if (moved === undefined) {
			return;
		}
		reordered.splice(to, 0, moved);
		setOrder((prev) =>
			prev.map((b) => {
				const idx = reordered.indexOf(b.id);
				return idx === -1 ? b : { ...b, sortOrder: idx };
			})
		);
		startTransition(async () => {
			const r = await reorderBanners(reordered);
			if (r.ok) {
				notify.success("Ordem atualizada");
				router.refresh();
			} else {
				notify.error(r.error);
				setOrder(banners);
			}
		});
	}

	return (
		<div className="flex flex-col gap-8">
			<section>
				<h2 className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					No ar — ordem do carrossel
					<span
						className={cn(
							"rounded-md bg-muted px-2 py-0.5 text-xs",
							active.length >= MAX_ACTIVE_BANNERS && "text-amber-500"
						)}
					>
						{active.length} / {MAX_ACTIVE_BANNERS} ativos
					</span>
				</h2>
				<DndContext id="banner-sortable" onDragEnd={handleDragEnd} sensors={sensors}>
					<SortableContext items={active.map((b) => b.id)} strategy={rectSortingStrategy}>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{active.map((b, i) => (
								<BannerCard
									item={b}
									key={b.id}
									onToggle={handleToggle}
									order={i + 1}
									sortable
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
				{active.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Nenhum banner publicado. Ative um rascunho abaixo para exibi-lo no carrossel.
					</p>
				)}
			</section>

			<section>
				<h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Rascunhos / despublicados
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{drafts.map((b) => (
						<BannerCard item={b} key={b.id} onToggle={handleToggle} sortable={false} />
					))}
					<Link
						className={cn(
							buttonVariants({ variant: "outline" }),
							"flex min-h-[200px] flex-col items-center justify-center gap-2 border-dashed text-muted-foreground"
						)}
						href="/dashboard/site/banners/new"
					>
						<Plus className="size-5" />
						Criar novo banner
					</Link>
				</div>
			</section>
		</div>
	);
}
```

- [ ] **Step 4: Página de listagem**

`page.tsx`:

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { fetchBanners } from "./actions";
import { BannerList } from "./_components/banner-list";

export default async function BannersPage() {
	const banners = await fetchBanners();

	return (
		<>
			<PageHeader
				action={
					<Link className={buttonVariants({ variant: "default" })} href="/dashboard/site/banners/new">
						Novo banner
					</Link>
				}
				description="Gerencie os slides do carrossel principal do site."
				title="Banners da home"
			/>
			{banners.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum banner cadastrado</EmptyTitle>
						<EmptyDescription>
							Crie o primeiro banner do carrossel da home.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link className={buttonVariants({ variant: "default" })} href="/dashboard/site/banners/new">
							Novo banner
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BannerList banners={banners} />
			)}
		</>
	);
}
```

- [ ] **Step 5: Verificar tipos + lint**

Run: `bun check-types && bun --cwd apps/web check`
Expected: PASS. Conferir que `Switch` existe em `@emach/ui/components/switch` e `cn` em `@emach/ui/lib/utils`; se o nome do componente divergir, ajustar o import ao que o pacote exporta (procurar com `ls packages/ui/src/components | grep -i switch`).

- [ ] **Step 6: Smoke visual**

Run: `bun dev:web` e visitar `/dashboard/site/banners`.
Verificar: empty state aparece sem banners; após criar (Task 8) os cards renderizam em 3 colunas no breakpoint xl, toggle publica/despublica, drag reordena os ativos. Conferir erros via `nextjs_call <port> get_errors`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/page.tsx apps/web/src/app/dashboard/site/banners/_components/{banner-card,banner-list,delete-banner-dialog}.tsx
git commit -m "feat(banners): listagem com media-cards, reorder e toggle"
```

---

## Task 8: Form de criar/editar (upload tiles + preview ao vivo + páginas)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/image-upload-tile.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/new/page.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/[id]/edit/page.tsx`

- [ ] **Step 1: Upload tile (slot único com guidelines)**

`_components/image-upload-tile.tsx`:

```tsx
"use client";

import { Spinner } from "@emach/ui/components/spinner";
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { deleteBannerImage, uploadBannerImage } from "./image-actions";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

export function ImageUploadTile({
	label,
	help,
	required,
	value,
	onChange,
}: {
	label: string;
	help: string;
	required?: boolean;
	value: string | null;
	onChange: (url: string | null) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);

	async function handleFile(file: File) {
		if (!ALLOWED.has(file.type)) {
			notify.error("Formato inválido (JPG/PNG/WEBP)");
			return;
		}
		if (file.size > MAX_BYTES) {
			notify.error("Arquivo excede 3MB");
			return;
		}
		setBusy(true);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const { url } = await uploadBannerImage(fd);
			onChange(url);
			notify.success("Imagem enviada");
		} catch (err) {
			notify.error(err instanceof Error ? err.message : "Falha no upload");
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove() {
		const current = value;
		onChange(null);
		if (current) {
			await deleteBannerImage(current).catch(() => undefined);
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-xs">
				{label}
				{required && <span className="text-destructive"> *</span>}
			</span>
			{value ? (
				<div className="relative aspect-video overflow-hidden rounded-md border border-border bg-black">
					{/* biome-ignore lint/performance/noImgElement: Supabase public URL */}
					<img alt={label} className="size-full object-contain" src={value} />
					<button
						aria-label="Remover imagem"
						className="absolute top-1.5 right-1.5 rounded-md bg-black/60 p-1 text-white"
						onClick={() => {
							handleRemove().catch(() => undefined);
						}}
						type="button"
					>
						<X className="size-3.5" />
					</button>
				</div>
			) : (
				<button
					className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-border border-dashed bg-muted/30 p-3 text-center transition-colors hover:border-foreground/40 disabled:opacity-50"
					disabled={busy}
					onClick={() => inputRef.current?.click()}
					type="button"
				>
					{busy ? <Spinner /> : <Upload className="size-5 text-muted-foreground" />}
					<span className="text-muted-foreground text-xs">Enviar imagem</span>
				</button>
			)}
			<span className="text-[10px] text-muted-foreground leading-tight">{help}</span>
			<input
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) {
						handleFile(f).catch(() => undefined);
					}
					e.target.value = "";
				}}
				ref={inputRef}
				type="file"
			/>
		</div>
	);
}
```

- [ ] **Step 2: Live preview (desktop/mobile)**

`_components/banner-live-preview.tsx`. Espelha a composição do `hero-carousel.tsx` (fundo cover + produto contain central + glow + CTA + dots). Texto é indicativo.

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { cn } from "@emach/ui/lib/utils";
import type { BannerFormValues } from "./banner-schema";

export function BannerLivePreview({ values }: { values: BannerFormValues }) {
	const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
	const bg =
		device === "mobile"
			? values.backgroundImageMobileUrl ?? values.backgroundImageUrl
			: values.backgroundImageUrl;
	const product =
		device === "mobile"
			? values.productImageMobileUrl ?? values.productImageUrl
			: values.productImageUrl;

	return (
		<div className="sticky top-4 flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Preview ao vivo
				</span>
				<div className="flex gap-1 rounded-lg bg-muted p-1">
					<Button onClick={() => setDevice("desktop")} size="sm" variant={device === "desktop" ? "default" : "ghost"}>
						<Monitor className="size-4" /> Desktop
					</Button>
					<Button onClick={() => setDevice("mobile")} size="sm" variant={device === "mobile" ? "default" : "ghost"}>
						<Smartphone className="size-4" /> Mobile
					</Button>
				</div>
			</div>
			<div
				className={cn(
					"relative mx-auto w-full overflow-hidden rounded-lg bg-black",
					device === "mobile" ? "aspect-[9/16] max-w-[240px]" : "aspect-video"
				)}
			>
				{bg ? (
					// biome-ignore lint/performance/noImgElement: preview de URL pública/efêmera
					<img alt="" className="absolute inset-0 size-full object-cover" src={bg} />
				) : (
					<div className="flex size-full items-center justify-center text-muted-foreground text-xs">
						Envie a imagem de fundo
					</div>
				)}
				<div
					aria-hidden
					className="pointer-events-none absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
					style={{ background: "radial-gradient(circle, rgba(230,0,18,0.25), transparent 70%)", filter: "blur(20px)" }}
				/>
				{product && (
					// biome-ignore lint/performance/noImgElement: preview de URL pública/efêmera
					<img alt="" className="absolute inset-0 m-auto size-3/5 object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]" src={product} />
				)}
				{values.title && (
					<div className="absolute bottom-10 left-4 z-10 max-w-[70%] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
						<p className="font-bold text-lg leading-tight">{values.title}</p>
						{values.subtitle && <p className="text-xs">{values.subtitle}</p>}
					</div>
				)}
				{values.ctaLabel && (
					<span className="absolute right-4 bottom-4 z-10 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground text-xs">
						{values.ctaLabel} →
					</span>
				)}
				<div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
					<span className="h-1 w-5 rounded bg-primary" />
					<span className="h-1 w-5 rounded bg-white/30" />
				</div>
			</div>
			<p className="text-[10px] text-muted-foreground">
				≈ como aparece na home. O texto é indicativo — a posição final é definida no refactor do storefront.
			</p>
		</div>
	);
}
```

- [ ] **Step 3: Banner form (2 colunas, new+edit)**

`_components/banner-form.tsx`:

```tsx
"use client";

import type { Banner } from "@emach/db/schema/banner";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Switch } from "@emach/ui/components/switch";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { createBanner, updateBanner } from "../actions";
import { type BannerFormValues, bannerFormSchema } from "./banner-schema";
import { BannerLivePreview } from "./banner-live-preview";
import { ImageUploadTile } from "./image-upload-tile";

function initial(banner?: Banner): BannerFormValues {
	return {
		backgroundImageUrl: banner?.backgroundImageUrl ?? "",
		backgroundImageMobileUrl: banner?.backgroundImageMobileUrl ?? null,
		productImageUrl: banner?.productImageUrl ?? null,
		productImageMobileUrl: banner?.productImageMobileUrl ?? null,
		title: banner?.title ?? "",
		subtitle: banner?.subtitle ?? null,
		altText: banner?.altText ?? "",
		ctaLabel: banner?.ctaLabel ?? "",
		ctaHref: banner?.ctaHref ?? "",
		isActive: banner?.isActive ?? false,
	};
}

export function BannerForm({ banner }: { banner?: Banner }) {
	const router = useRouter();
	const [values, setValues] = useState<BannerFormValues>(() => initial(banner));
	const [pending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } = useFormErrors<BannerFormValues>();

	function set<K extends keyof BannerFormValues>(key: K, v: BannerFormValues[K]) {
		setValues((prev) => ({ ...prev, [key]: v }));
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		clearErrors();
		const parsed = bannerFormSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const r = banner
				? await updateBanner(banner.id, parsed.data)
				: await createBanner(parsed.data);
			if (r.ok) {
				notify.success(banner ? "Banner atualizado" : "Banner criado");
				router.push("/dashboard/site/banners");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	return (
		<form className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]" onSubmit={handleSubmit}>
			<div className="flex flex-col gap-5">
				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">Imagens</legend>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="2560×1440 · 16:9 · WebP/JPG · ≤500KB"
							label="Fundo · desktop"
							onChange={(u) => {
								set("backgroundImageUrl", u ?? "");
							}}
							required
							value={values.backgroundImageUrl || null}
						/>
						<ImageUploadTile
							help="1080×1920 · 9:16 · ≤350KB · cai pro desktop se vazio"
							label="Fundo · mobile"
							onChange={(u) => set("backgroundImageMobileUrl", u)}
							value={values.backgroundImageMobileUrl}
						/>
						<ImageUploadTile
							help="~2400px · PNG transparente · ≤800KB"
							label="Produto · desktop"
							onChange={(u) => set("productImageUrl", u)}
							value={values.productImageUrl}
						/>
						<ImageUploadTile
							help="~1400px · PNG · ≤500KB · cai pro produto desktop se vazio"
							label="Produto · mobile"
							onChange={(u) => set("productImageMobileUrl", u)}
							value={values.productImageMobileUrl}
						/>
					</div>
					<FieldError>{errors.backgroundImageUrl}</FieldError>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">Conteúdo</legend>
					<div className="flex flex-col gap-3">
						<LabeledField error={errors.title} label={`Título (${values.title.length}/80)`} required>
							{(f) => (
								<Input
									{...f}
									maxLength={80}
									onBlur={() => {
										if (!values.altText) {
											set("altText", values.title);
										}
									}}
									onChange={(e) => set("title", e.target.value)}
									value={values.title}
								/>
							)}
						</LabeledField>
						<LabeledField error={errors.subtitle} label={`Subtítulo (${(values.subtitle ?? "").length}/140)`}>
							{(f) => (
								<Input
									{...f}
									maxLength={140}
									onChange={(e) => set("subtitle", e.target.value || null)}
									value={values.subtitle ?? ""}
								/>
							)}
						</LabeledField>
						<LabeledField error={errors.altText} help={{ text: "Descreve a imagem de fundo para leitores de tela." }} label="Texto alternativo (alt)" required>
							{(f) => (
								<Input {...f} onChange={(e) => set("altText", e.target.value)} value={values.altText} />
							)}
						</LabeledField>
					</div>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">Botão (CTA)</legend>
					<div className="flex flex-col gap-3">
						<LabeledField error={errors.ctaLabel} label={`Rótulo (${values.ctaLabel.length}/30)`} required>
							{(f) => (
								<Input {...f} maxLength={30} onChange={(e) => set("ctaLabel", e.target.value)} value={values.ctaLabel} />
							)}
						</LabeledField>
						<LabeledField error={errors.ctaHref} help={{ text: "Rota interna (/catalog) ou URL externa (https://...)." }} label="Link" required>
							{(f) => (
								<Input {...f} onChange={(e) => set("ctaHref", e.target.value)} placeholder="/catalog" value={values.ctaHref} />
							)}
						</LabeledField>
					</div>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">Publicação</legend>
					<label className="flex items-center gap-2 text-sm">
						<Switch checked={values.isActive} onCheckedChange={(c) => set("isActive", c)} />
						Publicar (exibir no carrossel)
					</label>
				</fieldset>

				<div className="flex justify-end gap-2">
					<Button onClick={() => router.back()} type="button" variant="ghost">Cancelar</Button>
					<Button disabled={pending} type="submit">{banner ? "Salvar" : "Criar banner"}</Button>
				</div>
			</div>

			<BannerLivePreview values={values} />
		</form>
	);
}
```

- [ ] **Step 4: Página criar**

`new/page.tsx`:

```tsx
import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { BannerForm } from "../_components/banner-form";

export default async function NewBannerPage() {
	await requireCapability("site.update_banners");
	return (
		<>
			<PageHeader description="Crie um novo banner para o carrossel da home." title="Novo banner" />
			<BannerForm />
		</>
	);
}
```

- [ ] **Step 5: Página editar**

`[id]/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { fetchBanner } from "../../actions";
import { BannerForm } from "../../_components/banner-form";

export default async function EditBannerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const banner = await fetchBanner(id);
	if (!banner) {
		notFound();
	}
	return (
		<>
			<PageHeader description="Edite o banner do carrossel." title={banner.title} />
			<BannerForm banner={banner} />
		</>
	);
}
```

- [ ] **Step 6: Verificar tipos + lint**

Run: `bun check-types && bun --cwd apps/web check`
Expected: PASS. Conferir nomes reais dos componentes de UI importados (`Input`, `Textarea`, `Switch`, `Spinner`) em `packages/ui/src/components/`; ajustar imports divergentes. Conferir a API de `LabeledField`/`useFormErrors` em `apps/web/src/components/labeled-field.tsx` e `apps/web/src/lib/use-form-errors.ts` (a prop `help` pode esperar outro shape — alinhar ao real).

- [ ] **Step 7: Smoke visual (fluxo completo)**

Run: `bun dev:web`. Em `/dashboard/site/banners/new`:
- Enviar imagem de fundo desktop → preview à direita atualiza; alternar Desktop/Mobile.
- Preencher título/subtítulo/CTA → preview reflete; alt pré-preenche com o título no blur.
- Submeter sem fundo → erro inline no campo (sem caixa no topo).
- Criar → volta pra listagem com o card.
- Editar um banner; publicar 6 e tentar o 7º → toast de bloqueio.
Conferir erros via `nextjs_call <port> get_errors`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/{image-upload-tile,banner-live-preview,banner-form}.tsx apps/web/src/app/dashboard/site/banners/new/page.tsx "apps/web/src/app/dashboard/site/banners/[id]/edit/page.tsx"
git commit -m "feat(banners): form de criar/editar com upload, preview ao vivo e guard de ativos"
```

---

## Task 9: Verificação final

- [ ] **Step 1: Tipos + lint + testes**

Run: `bun check-types && bun --cwd apps/web check && bun --cwd apps/web test`
Expected: tudo verde (inclui os 8 testes do banner-schema).

- [ ] **Step 2: Smoke end-to-end**

Run: `bun dev:web`. Percorrer: sidebar → Banners → criar com 4 imagens → publicar → reordenar (drag) → despublicar → editar → excluir (confirma sumiço do card). Verificar que reorder persiste após `router.refresh()`.

- [ ] **Step 3: Confirmar sync de schema (cross-repo)**

O PR de schema pro ecommerce é automático ao mergear na `main` (workflow `sync-db-schema.yml`). Nada a fazer agora além de mergear; registrar no PR que o issue de consumo no ecommerce (`getActiveBanners` + refactor do `HeroCarousel`) deve ser aberto após o sync.

---

## Self-Review

**Spec coverage:** §4 schema → Task 1. §5 storage → Tasks 2, 4. §6 rotas/nav/componentes → Tasks 6, 7, 8. §7 validação/guidelines → Tasks 3 (zod), 8 (guidelines nos tiles). §8 server actions → Task 5. §9 decisões (alt pré-preenche, nasce rascunho, sortOrder próximo) → Tasks 5, 8. §10 verificação → Task 9. ✔ Sem gaps.

**Type consistency:** `BannerFormValues`/`bannerFormSchema`/`MAX_ACTIVE_BANNERS` (Task 3) usados em Tasks 5, 7, 8 com os mesmos nomes. `Banner` (Task 1) usado em 7, 8. `ActionResult` definido em Task 5, consumido nos componentes. `fetchBanners`/`fetchBanner`/`createBanner`/`updateBanner`/`deleteBanner`/`reorderBanners`/`toggleBannerActive` consistentes entre actions e callers. ✔

**Placeholders:** nenhum "TBD"/"TODO"; todo passo de código tem código real. Pontos de verificação contra nomes reais de UI (`Switch`/`Input`/`LabeledField` API) sinalizados explicitamente nos steps de check-types — são confirmações, não placeholders.
