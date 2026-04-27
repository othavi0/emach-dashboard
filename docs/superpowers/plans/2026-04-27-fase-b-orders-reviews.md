# Fase B: Orders + Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Orders (read + fulfillment) and Reviews (moderation) modules for the emach-dashboard admin.

**Architecture:** Two new schema files (`orders.ts`, `reviews.ts`) with Drizzle pgEnums, tables, relations, and checks. Server actions follow the established `ActionResult<T>` pattern with `requireCapability`, Zod validation, and Drizzle transactions. UI follows the existing feature structure: `page.tsx` + `actions.ts` + `schema.ts` + `_components/`.

**Tech Stack:** Drizzle ORM 0.45, Next 16 (RSC + Server Actions), React 19, shadcn/ui, Zod, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-04-27-fase-b-orders-reviews-design.md`

---

## Task 1: Orders Schema (`packages/db/src/schema/orders.ts`)

**Files:**
- Create: `packages/db/src/schema/orders.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create `orders.ts` with enums, tables, checks, indexes, and relations**

```ts
// packages/db/src/schema/orders.ts
import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { apiKey } from "./api-keys";
import { user } from "./auth";
import { client } from "./client";
import { branch } from "./inventory";
import { actorTypeEnum } from "./stock-movements";
import { tool } from "./tools";

// --- Enums ---

export const orderStatusEnum = pgEnum("order_status", [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const paymentStatusEnum = pgEnum("payment_status", [
	"pending",
	"authorized",
	"paid",
	"failed",
	"refunded",
]);
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

// --- Tables ---

export const order = pgTable(
	"order",
	{
		id: text("id").primaryKey(),
		number: text("number").unique().notNull(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "restrict" }),
		branchId: text("branch_id").references(() => branch.id, {
			onDelete: "set null",
		}),
		status: orderStatusEnum("status").notNull().default("pending_payment"),
		paymentStatus: paymentStatusEnum("payment_status")
			.notNull()
			.default("pending"),
		paymentMethod: text("payment_method"),
		paymentProviderRef: text("payment_provider_ref"),
		subtotalAmount: numeric("subtotal_amount", {
			precision: 12,
			scale: 2,
		}).notNull(),
		discountAmount: numeric("discount_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		shippingAmount: numeric("shipping_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		totalAmount: numeric("total_amount", {
			precision: 12,
			scale: 2,
		}).notNull(),
		shippingAddress: jsonb("shipping_address").notNull(),
		shippingMethod: text("shipping_method"),
		shippingTrackingCode: text("shipping_tracking_code"),
		notes: text("notes"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		paidAt: timestamp("paid_at"),
		shippedAt: timestamp("shipped_at"),
		deliveredAt: timestamp("delivered_at"),
		canceledAt: timestamp("canceled_at"),
	},
	(table) => [
		index("order_client_id_idx").on(table.clientId),
		index("order_branch_id_idx").on(table.branchId),
		index("order_status_created_idx").on(
			table.status,
			table.createdAt.desc()
		),
		index("order_number_idx").on(table.number),
	]
);

export const orderItem = pgTable(
	"order_item",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "restrict" }),
		sku: text("sku"),
		name: text("name").notNull(),
		model: text("model"),
		voltage: text("voltage"),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		quantity: integer("quantity").notNull(),
		lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
		discountAmount: numeric("discount_amount", {
			precision: 12,
			scale: 2,
		})
			.notNull()
			.default("0"),
		cost: numeric("cost", { precision: 12, scale: 2 }),
		ncm: text("ncm"),
		cest: text("cest"),
		manufacturerName: text("manufacturer_name"),
		weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
		lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
		widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
		heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
	},
	(table) => [
		index("order_item_order_id_idx").on(table.orderId),
		check("quantity_positive", sql`${table.quantity} > 0`),
	]
);

export const orderStatusHistory = pgTable(
	"order_status_history",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		fromStatus: orderStatusEnum("from_status").notNull(),
		toStatus: orderStatusEnum("to_status").notNull(),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		actorApiKeyId: text("actor_api_key_id").references(() => apiKey.id, {
			onDelete: "set null",
		}),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_status_history_order_idx").on(
			table.orderId,
			table.createdAt.desc()
		),
		check(
			"actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId}   IS NOT NULL AND ${table.actorApiKeyId} IS NULL)
				OR (${table.actorType} = 'apiKey' AND ${table.actorApiKeyId} IS NOT NULL AND ${table.actorUserId} IS NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL  AND ${table.actorApiKeyId} IS NULL)
			)`
		),
	]
);

export const orderNote = pgTable(
	"order_note",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		authorId: text("author_id")
			.notNull()
			.references(() => user.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("order_note_order_idx").on(table.orderId, table.createdAt.desc()),
	]
);

// --- Relations ---

export const orderRelations = relations(order, ({ one, many }) => ({
	client: one(client, { fields: [order.clientId], references: [client.id] }),
	branch: one(branch, { fields: [order.branchId], references: [branch.id] }),
	items: many(orderItem),
	statusHistory: many(orderStatusHistory),
	notes: many(orderNote),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
	order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
	tool: one(tool, { fields: [orderItem.toolId], references: [tool.id] }),
}));

export const orderStatusHistoryRelations = relations(
	orderStatusHistory,
	({ one }) => ({
		order: one(order, {
			fields: [orderStatusHistory.orderId],
			references: [order.id],
		}),
		actorUser: one(user, {
			fields: [orderStatusHistory.actorUserId],
			references: [user.id],
		}),
		actorApiKey: one(apiKey, {
			fields: [orderStatusHistory.actorApiKeyId],
			references: [apiKey.id],
		}),
	})
);

export const orderNoteRelations = relations(orderNote, ({ one }) => ({
	order: one(order, {
		fields: [orderNote.orderId],
		references: [order.id],
	}),
	author: one(user, {
		fields: [orderNote.authorId],
		references: [user.id],
	}),
}));

// --- Types ---

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type OrderItem = typeof orderItem.$inferSelect;
export type NewOrderItem = typeof orderItem.$inferInsert;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
export type OrderNote = typeof orderNote.$inferSelect;
export type NewOrderNote = typeof orderNote.$inferInsert;
```

- [ ] **Step 2: Add re-exports to `packages/db/src/schema/index.ts`**

Add at the end of the file:
```ts
export * from "./orders";
```

- [ ] **Step 3: Add orders imports to `packages/db/src/index.ts`**

Add the import block:
```ts
import {
	order,
	orderItem,
	orderItemRelations,
	orderNote,
	orderNoteRelations,
	orderRelations,
	orderStatusHistory,
	orderStatusHistoryRelations,
} from "./schema/orders";
```

Add to the `schema` object:
```ts
order,
orderItem,
orderItemRelations,
orderNote,
orderNoteRelations,
orderRelations,
orderStatusHistory,
orderStatusHistoryRelations,
```

- [ ] **Step 4: Run type check**

Run: `bun check-types`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/orders.ts packages/db/src/schema/index.ts packages/db/src/index.ts
git commit -m "feat: adicionar schema de orders (order, orderItem, orderStatusHistory, orderNote)"
```

---

## Task 2: Reviews Schema (`packages/db/src/schema/reviews.ts`)

**Files:**
- Create: `packages/db/src/schema/reviews.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create `reviews.ts` with enum, table, checks, indexes, and relations**

```ts
// packages/db/src/schema/reviews.ts
import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { client } from "./client";
import { order } from "./orders";
import { tool } from "./tools";

export const reviewStatusEnum = pgEnum("review_status", [
	"pending",
	"approved",
	"rejected",
	"spam",
]);
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];

export const review = pgTable(
	"review",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "restrict" }),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "restrict" }),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "restrict" }),
		rating: integer("rating").notNull(),
		title: text("title"),
		body: text("body").notNull(),
		status: reviewStatusEnum("status").notNull().default("pending"),
		moderatedBy: text("moderated_by").references(() => user.id, {
			onDelete: "set null",
		}),
		moderatedAt: timestamp("moderated_at"),
		moderationNote: text("moderation_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		check("rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
		uniqueIndex("review_client_tool_order_idx").on(
			table.clientId,
			table.toolId,
			table.orderId
		),
		index("review_tool_id_idx").on(table.toolId),
		index("review_status_created_idx").on(
			table.status,
			table.createdAt.desc()
		),
	]
);

export const reviewRelations = relations(review, ({ one }) => ({
	tool: one(tool, { fields: [review.toolId], references: [tool.id] }),
	client: one(client, { fields: [review.clientId], references: [client.id] }),
	order: one(order, { fields: [review.orderId], references: [order.id] }),
	moderator: one(user, {
		fields: [review.moderatedBy],
		references: [user.id],
	}),
}));

export type Review = typeof review.$inferSelect;
export type NewReview = typeof review.$inferInsert;
```

- [ ] **Step 2: Add re-export to `packages/db/src/schema/index.ts`**

Add at the end:
```ts
export * from "./reviews";
```

- [ ] **Step 3: Add reviews imports to `packages/db/src/index.ts`**

Add import:
```ts
import { review, reviewRelations } from "./schema/reviews";
```

Add to schema object:
```ts
review,
reviewRelations,
```

- [ ] **Step 4: Run type check**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/reviews.ts packages/db/src/schema/index.ts packages/db/src/index.ts
git commit -m "feat: adicionar schema de reviews (review com verified-buyer)"
```

---

## Task 3: FK constraints em `stockMovement` + Sequence

**Files:**
- Modify: `packages/db/src/schema/stock-movements.ts`
- Modify: `packages/db/src/migrations/_triggers.sql`

- [ ] **Step 1: Add FK references to `orderId` and `orderItemId` in `stock-movements.ts`**

Replace the existing `orderId` and `orderItemId` column definitions with:

```ts
// Add these imports at the top (alongside existing imports):
import { order, orderItem } from "./orders";

// Replace these two lines in the stockMovement table:
orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
orderItemId: text("order_item_id").references(() => orderItem.id, { onDelete: "set null" }),
```

Also add relations for the new FKs. In `stockMovementRelations`, add:
```ts
order: one(order, {
	fields: [stockMovement.orderId],
	references: [order.id],
}),
orderItem: one(orderItem, {
	fields: [stockMovement.orderItemId],
	references: [orderItem.id],
}),
```

- [ ] **Step 2: Add sequence to `_triggers.sql`**

Append at the end of the file:
```sql

-- Sequence para número do pedido (formato YYYY-000NNN)
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
```

- [ ] **Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/stock-movements.ts packages/db/src/migrations/_triggers.sql
git commit -m "feat: adicionar FKs reais em stockMovement (order, orderItem) + sequence order_number_seq"
```

---

## Task 4: Migration — push to dev

**Files:** none created/modified

- [ ] **Step 1: Generate and push migration**

```bash
bun db:push
```

Expected: Drizzle detects new tables (`order`, `order_item`, `order_status_history`, `order_note`, `review`), new enums (`order_status`, `payment_status`, `review_status`), altered `stock_movement` (new FK constraints). Apply changes.

- [ ] **Step 2: Apply triggers (includes new sequence)**

```bash
bun db:apply-triggers
```

Expected: Existing triggers recreated + new sequence `order_number_seq` created.

- [ ] **Step 3: Verify in Drizzle Studio**

```bash
bun db:studio
```

Check: tables `order`, `order_item`, `order_status_history`, `order_note`, `review` exist. Sequence `order_number_seq` exists (run `SELECT nextval('order_number_seq')` to confirm).

- [ ] **Step 4: Generate migration for staging/prod**

```bash
bun db:generate
```

Review the generated SQL file in `packages/db/src/migrations/`.

- [ ] **Step 5: Commit migration**

```bash
git add packages/db/src/migrations/
git commit -m "chore: gerar migration para orders + reviews + FK stockMovement"
```

---

## Task 5: Orders Zod schemas (`apps/web`)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/schema.ts`

- [ ] **Step 1: Create Zod schemas for all order actions**

```ts
// apps/web/src/app/dashboard/orders/schema.ts
import type { OrderStatus } from "@emach/db/schema/orders";
import { z } from "zod";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending_payment: ["canceled"],
	paid: ["preparing", "canceled", "refunded"],
	preparing: ["shipped", "canceled"],
	shipped: ["delivered", "canceled"],
	delivered: [],
	canceled: [],
	refunded: [],
};

export { VALID_TRANSITIONS };

export const updateOrderStatusSchema = z
	.object({
		orderId: z.string().uuid(),
		toStatus: z.enum([
			"pending_payment",
			"paid",
			"preparing",
			"shipped",
			"delivered",
			"canceled",
			"refunded",
		]),
		reason: z.string().max(500).optional(),
		trackingCode: z.string().trim().min(1).max(200).optional(),
		branchId: z.string().uuid().optional(),
		returnItems: z
			.array(
				z.object({
					orderItemId: z.string().uuid(),
					branchId: z.string().uuid(),
				})
			)
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.toStatus === "shipped" && !data.trackingCode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Código de rastreio obrigatório ao marcar como enviado",
				path: ["trackingCode"],
			});
		}
	});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const addOrderNoteSchema = z.object({
	orderId: z.string().uuid(),
	body: z.string().trim().min(1).max(2000),
});

export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

export const assignBranchSchema = z.object({
	orderId: z.string().uuid(),
	branchId: z.string().uuid(),
});

export type AssignBranchInput = z.infer<typeof assignBranchSchema>;

export const updateTrackingCodeSchema = z.object({
	orderId: z.string().uuid(),
	trackingCode: z.string().trim().min(1).max(200),
});

export type UpdateTrackingCodeInput = z.infer<typeof updateTrackingCodeSchema>;
```

- [ ] **Step 2: Run type check**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/schema.ts
git commit -m "feat: adicionar Zod schemas para orders actions"
```

---

## Task 6: Orders Server Actions (`apps/web`)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/actions.ts`

- [ ] **Step 1: Create `actions.ts` with all 4 server actions**

```ts
// apps/web/src/app/dashboard/orders/actions.ts
"use server";

import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import {
	order,
	orderNote,
	orderStatusHistory,
	type OrderStatus,
	orderItem,
} from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	addOrderNoteSchema,
	assignBranchSchema,
	updateOrderStatusSchema,
	updateTrackingCodeSchema,
	VALID_TRANSITIONS,
	type AddOrderNoteInput,
	type AssignBranchInput,
	type UpdateOrderStatusInput,
	type UpdateTrackingCodeInput,
} from "./schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const ORDERS_PATH = "/dashboard/orders";

const STATUS_TIMESTAMP_MAP: Partial<Record<OrderStatus, string>> = {
	paid: "paidAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
	refunded: "canceledAt",
};

function capForStatus(toStatus: OrderStatus): "orders.update_status" | "orders.cancel" | "orders.refund" {
	if (toStatus === "canceled") return "orders.cancel";
	if (toStatus === "refunded") return "orders.refund";
	return "orders.update_status";
}

export async function updateOrderStatus(
	input: UpdateOrderStatusInput
): Promise<ActionResult> {
	const parsed = updateOrderStatusSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}

	const { orderId, toStatus, reason, trackingCode, branchId, returnItems } = parsed.data;
	const session = await requireCapability(capForStatus(toStatus));

	try {
		await db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ status: order.status })
				.from(order)
				.where(eq(order.id, orderId))
				.for("update");

			if (!locked) throw new Error("Pedido não encontrado");

			const currentStatus = locked.status as OrderStatus;
			const allowed = VALID_TRANSITIONS[currentStatus];
			if (!allowed?.includes(toStatus)) {
				throw new Error(
					`Transição inválida: ${currentStatus} → ${toStatus}`
				);
			}

			const updates: Record<string, unknown> = { status: toStatus };
			const tsField = STATUS_TIMESTAMP_MAP[toStatus];
			if (tsField) {
				updates[tsField] = new Date();
			}
			if (toStatus === "shipped" && trackingCode) {
				updates.shippingTrackingCode = trackingCode;
			}
			if (toStatus === "preparing" && branchId) {
				updates.branchId = branchId;
			}

			await tx.update(order).set(updates).where(eq(order.id, orderId));

			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: currentStatus,
				toStatus,
				actorType: "user",
				actorUserId: session.user.id,
				reason: reason ?? null,
			});

			if (
				(toStatus === "canceled" || toStatus === "refunded") &&
				returnItems &&
				returnItems.length > 0
			) {
				for (const item of returnItems) {
					const [oi] = await tx
						.select({ toolId: orderItem.toolId, quantity: orderItem.quantity })
						.from(orderItem)
						.where(eq(orderItem.id, item.orderItemId));

					if (!oi) continue;

					const [sl] = await tx
						.select({ quantity: stockLevel.quantity })
						.from(stockLevel)
						.where(
							and(
								eq(stockLevel.toolId, oi.toolId),
								eq(stockLevel.branchId, item.branchId)
							)
						)
						.for("update");

					const previousQty = sl?.quantity ?? 0;
					const newQty = previousQty + oi.quantity;

					await tx
						.insert(stockLevel)
						.values({
							toolId: oi.toolId,
							branchId: item.branchId,
							quantity: newQty,
							updatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [stockLevel.toolId, stockLevel.branchId],
							set: { quantity: newQty, updatedAt: new Date() },
						});

					await tx.insert(stockMovement).values({
						id: crypto.randomUUID(),
						toolId: oi.toolId,
						branchId: item.branchId,
						previousQty,
						newQty,
						delta: oi.quantity,
						reason: "ajuste_inventario",
						reasonNote: `Devolução ao estoque — pedido cancelado/reembolsado`,
						orderId,
						orderItemId: item.orderItemId,
						actorType: "user",
						actorId: session.user.id,
					});
				}
			}
		});

		revalidatePath(ORDERS_PATH);
		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateOrderStatus", error);
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}

export async function addOrderNote(
	input: AddOrderNoteInput
): Promise<ActionResult> {
	const parsed = addOrderNoteSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}

	const session = await requireCapability("orders.add_note");
	const { orderId, body } = parsed.data;

	try {
		await db.insert(orderNote).values({
			id: crypto.randomUUID(),
			orderId,
			authorId: session.user.id,
			body,
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("addOrderNote", error);
		return { ok: false, error: "Erro ao adicionar nota" };
	}
}

export async function assignBranch(
	input: AssignBranchInput
): Promise<ActionResult> {
	const parsed = assignBranchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}

	await requireCapability("orders.update_status");
	const { orderId, branchId } = parsed.data;

	try {
		await db
			.update(order)
			.set({ branchId })
			.where(eq(order.id, orderId));

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("assignBranch", error);
		return { ok: false, error: "Erro ao atribuir filial" };
	}
}

export async function updateTrackingCode(
	input: UpdateTrackingCodeInput
): Promise<ActionResult> {
	const parsed = updateTrackingCodeSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}

	await requireCapability("orders.update_status");
	const { orderId, trackingCode } = parsed.data;

	try {
		await db
			.update(order)
			.set({ shippingTrackingCode: trackingCode })
			.where(eq(order.id, orderId));

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateTrackingCode", error);
		return { ok: false, error: "Erro ao atualizar rastreio" };
	}
}
```

- [ ] **Step 2: Run type check**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts
git commit -m "feat: adicionar server actions de orders (updateStatus, addNote, assignBranch, updateTrackingCode)"
```

---

## Task 7: Reviews Zod schemas + Server Actions

**Files:**
- Create: `apps/web/src/app/dashboard/reviews/schema.ts`
- Create: `apps/web/src/app/dashboard/reviews/actions.ts`

- [ ] **Step 1: Create `reviews/schema.ts`**

```ts
// apps/web/src/app/dashboard/reviews/schema.ts
import { z } from "zod";

export const moderateReviewSchema = z
	.object({
		reviewId: z.string().uuid(),
		status: z.enum(["approved", "rejected", "spam"]),
		moderationNote: z.string().max(1000).optional(),
	})
	.superRefine((data, ctx) => {
		if (
			(data.status === "rejected" || data.status === "spam") &&
			!data.moderationNote?.trim()
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
				path: ["moderationNote"],
			});
		}
	});

export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
```

- [ ] **Step 2: Create `reviews/actions.ts`**

```ts
// apps/web/src/app/dashboard/reviews/actions.ts
"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { moderateReviewSchema, type ModerateReviewInput } from "./schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const REVIEWS_PATH = "/dashboard/reviews";

export async function moderateReview(
	input: ModerateReviewInput
): Promise<ActionResult> {
	const parsed = moderateReviewSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { reviewId, status, moderationNote } = parsed.data;

	try {
		await db
			.update(review)
			.set({
				status,
				moderatedBy: session.user.id,
				moderatedAt: new Date(),
				moderationNote: moderationNote ?? null,
			})
			.where(eq(review.id, reviewId));

		revalidatePath(REVIEWS_PATH);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("moderateReview", error);
		return { ok: false, error: "Erro ao moderar avaliação" };
	}
}
```

- [ ] **Step 3: Run type check**

Run: `bun check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/schema.ts apps/web/src/app/dashboard/reviews/actions.ts
git commit -m "feat: adicionar schema Zod + server action de reviews (moderateReview)"
```

---

## Task 8: Orders listing page + components

**Files:**
- Create: `apps/web/src/app/dashboard/orders/page.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/order-table.tsx`

This is a large UI task. The implementer should read the existing patterns in `apps/web/src/app/dashboard/(inventory)/tools/page.tsx` and `apps/web/src/app/dashboard/categories/page.tsx` to follow the established page structure (Server Component that fetches data, renders filters + table).

- [ ] **Step 1: Create `order-list-filters.tsx`**

Client component with:
- Tabs (using shadcn `Tabs`/`TabsList`/`TabsTrigger`) for: Todos, Aguardando pgto, Pagos, Em preparação, Enviados, Entregues, Cancelados
- Search input (shadcn `Input`) with debounced URL param `q`
- Branch select (shadcn `Select`) filtering by `branchId`
- All state driven by URL search params (`useSearchParams` + `useRouter`)

- [ ] **Step 2: Create `order-table.tsx`**

Server component receiving `orders` array. Columns: Número, Cliente, Status (badge), Total (R$), Data (relative), Filial. Each row links to `/dashboard/orders/[id]`. Use shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`. Status badge uses shadcn `Badge` with variant based on status.

- [ ] **Step 3: Create `orders/page.tsx`**

Server Component. Reads search params (`tab`, `q`, `page`, `branchId`). Builds Drizzle query with dynamic WHERE (status filter from tab, ILIKE on `order.number` or `client.name`, branchId eq, pagination with LIMIT 20 OFFSET). Fetches branches for the filter select. Renders `OrderListFilters` + `OrderTable`.

- [ ] **Step 4: Verify**

Run: `bun check-types && bun fix`
Run: `bun dev:web` → navigate to `/dashboard/orders` → verify empty state renders with tabs and search.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/
git commit -m "feat: adicionar página de listagem de pedidos com tabs, search e filtros"
```

---

## Task 9: Order detail page (split layout)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/order-timeline.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/stock-return-dialog.tsx`

- [ ] **Step 1: Create `order-detail-info.tsx`**

Server component. Receives order with items, client name. Renders:
- Header: order number + status badge + date
- Card "Itens": table with SKU, name, model, qty, unit price, line total
- Card "Endereço": formatted shipping address snapshot
- Card "Pagamento" (read-only): method, status, provider ref
- Card "Frete": method, amount, tracking code (shown as text; editing is in actions panel)

Use shadcn `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Table`, `Badge`.

- [ ] **Step 2: Create `order-timeline.tsx`**

Server component. Receives statusHistory + notes arrays merged and sorted by `createdAt` desc. Each entry shows: icon (status change vs note), actor name (from JOIN), relative date, reason/body text. Use a simple `<ol>` with styled `<li>` items.

- [ ] **Step 3: Create `order-actions-panel.tsx`**

Client component. Receives current order status, order id, branches list. Renders:
- Contextual "next status" button (e.g., if `preparing` → "Marcar como Enviado")
- Branch select (if status is `paid` or `preparing` and no branch assigned)
- Tracking code input (if `shipped` transition or editing)
- Note form (textarea + submit button)
- Cancel/Refund buttons that trigger `stock-return-dialog`

Uses server actions via `useActionState` or form submission.

- [ ] **Step 4: Create `stock-return-dialog.tsx`**

Client component. Dialog (shadcn `Dialog`) that receives order items. Shows checkbox per item with branch select. On confirm, calls `updateOrderStatus` with `returnItems` array. Only items with checked boxes are included.

- [ ] **Step 5: Create `orders/[id]/page.tsx`**

Server Component. Fetches order with items (Drizzle `findFirst` with `with: { items: true, statusHistory: { with: { actorUser: true } }, notes: { with: { author: true } }, client: true, branch: true }`). Fetches branches for the actions panel. Renders split layout: left column `OrderDetailInfo`, right column `OrderActionsPanel` + `OrderTimeline`. Uses `grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6`.

- [ ] **Step 6: Verify**

Run: `bun check-types && bun fix`
Run: `bun dev:web` → navigate to `/dashboard/orders/[some-id]` → verify layout renders (will show 404 if no data, which is expected).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/
git commit -m "feat: adicionar página de detalhe do pedido com split layout, timeline e painel de ações"
```

---

## Task 10: Order print page

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/print/page.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/print-picking-slip.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/print-shipping-label.tsx`

- [ ] **Step 1: Create `print-picking-slip.tsx`**

Server component. Receives order + items + branch. Renders print-friendly A4 layout:
- Order number, date, branch name
- Table: SKU, product name, model, quantity
- Client notes (if any)
- `@media print` styles: hide non-essential, full width, no sidebar

- [ ] **Step 2: Create `print-shipping-label.tsx`**

Server component. Receives order. Renders compact ~10×15cm layout:
- Order number, tracking code
- Recipient name, full address (BR format)
- `@media print` styles: compact size

- [ ] **Step 3: Create `orders/[id]/print/page.tsx`**

Server Component. Reads search param `type` (default `picking`). Fetches order with items and branch. Renders `PrintPickingSlip` or `PrintShippingLabel` based on type. Includes a client-side "Imprimir" button that calls `window.print()` and a type toggle.

- [ ] **Step 4: Verify**

Run: `bun check-types && bun fix`
Run: `bun dev:web` → verify page renders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/[id]/print/
git commit -m "feat: adicionar página de impressão de pedidos (romaneio + etiqueta)"
```

---

## Task 11: Reviews listing + detail pages

**Files:**
- Create: `apps/web/src/app/dashboard/reviews/page.tsx`
- Create: `apps/web/src/app/dashboard/reviews/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/reviews/_components/review-queue-table.tsx`
- Create: `apps/web/src/app/dashboard/reviews/_components/review-detail-card.tsx`
- Create: `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx`

- [ ] **Step 1: Create `review-queue-table.tsx`**

Server component. Receives reviews array (with tool + client joined). Columns: Produto (name + small thumbnail from tool images), Cliente, Rating (star icons or number), Trecho body (80 chars truncated), Data. Each row links to `/dashboard/reviews/[id]`. Use shadcn `Table`.

- [ ] **Step 2: Create `reviews/page.tsx`**

Server Component. Reads search param `status` (default `pending`). Fetches reviews with `tool` and `client` relations, filtered by status, ordered by `createdAt desc`, paginated 20 per page. Renders status select filter + `ReviewQueueTable`.

- [ ] **Step 3: Create `review-detail-card.tsx`**

Server component. Receives review with tool, client, order. Renders: product card (image + name + link to tool), client info (name + email), order link, rating (stars), title, full body text.

- [ ] **Step 4: Create `moderate-actions.tsx`**

Client component. Receives review id and current status. If `pending`: shows Approve / Reject / Spam buttons. Clicking Reject or Spam reveals a textarea for moderation note (required). Calls `moderateReview` server action. If already moderated: shows current status, moderator name, date, and note.

- [ ] **Step 5: Create `reviews/[id]/page.tsx`**

Server Component. Fetches review with `tool` (+ images), `client`, `order`, `moderator` relations. Renders `ReviewDetailCard` + `ModerateActions`.

- [ ] **Step 6: Verify**

Run: `bun check-types && bun fix`
Run: `bun dev:web` → navigate to `/dashboard/reviews` → verify empty state renders with status filter.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/
git commit -m "feat: adicionar páginas de moderação de reviews (listagem + detalhe)"
```

---

## Task 12: Sidebar + Dashboard stat card

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add "Vendas" group to sidebar**

In `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, add a new group in `NAV_GROUPS` between "Catálogo" and "Cadastros":

```ts
{
	label: "Vendas",
	items: [
		{ label: "Pedidos", href: "/dashboard/orders" as Route },
		{ label: "Avaliações", href: "/dashboard/reviews" as Route },
	],
},
```

- [ ] **Step 2: Add "Pedidos pendentes" stat card to dashboard**

In `apps/web/src/app/dashboard/page.tsx`:

Add to the `fetchInventoryStats` SQL query:
```sql
(SELECT COUNT(*)::int FROM "order" WHERE status IN ('paid', 'preparing')) AS orders_pending,
(SELECT COUNT(*)::int FROM "order" WHERE status = 'paid') AS orders_paid,
(SELECT COUNT(*)::int FROM "order" WHERE status = 'preparing') AS orders_preparing
```

Update the `InventoryStats` interface to include `orders_pending`, `orders_paid`, `orders_preparing`.

Add a `StatCard` in the grid:
```tsx
<StatCard
	description={`${stats.orders_paid} pagos · ${stats.orders_preparing} em separação`}
	href="/dashboard/orders?tab=paid"
	title="Pedidos pendentes"
	value={stats.orders_pending}
/>
```

- [ ] **Step 3: Add "Pedidos" to quick actions**

Add to `QUICK_ACTIONS` array:
```ts
{ href: "/dashboard/orders", label: "Pedidos", variant: "secondary" },
```

- [ ] **Step 4: Verify**

Run: `bun check-types && bun fix`
Run: `bun dev:web` → verify sidebar shows "Vendas" group, dashboard shows "Pedidos pendentes" card with 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/app-sidebar.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat: adicionar grupo Vendas na sidebar + stat card pedidos pendentes no dashboard"
```

---

## Task 13: Final verification + lint

**Files:** none

- [ ] **Step 1: Run full check**

```bash
bun fix
bun check-types
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Smoke test**

```bash
bun dev:web
```

Navigate and verify:
1. `/dashboard` — stat card "Pedidos pendentes" shows 0
2. Sidebar — "Vendas" group with "Pedidos" and "Avaliações"
3. `/dashboard/orders` — empty state with tabs, search, no errors
4. `/dashboard/reviews` — empty state with status filter, no errors

- [ ] **Step 3: Verify DB**

```bash
bun db:studio
```

Confirm all tables exist: `order`, `order_item`, `order_status_history`, `order_note`, `review`. Confirm sequence `order_number_seq` exists.

- [ ] **Step 4: Final commit (if any remaining changes)**

```bash
bun fix
git add -p  # review each hunk
git commit -m "chore: lint + ajustes finais Fase B"
```
