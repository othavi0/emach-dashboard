import { db } from "@emach/db";
import {
	orderStatusHistory,
	order as orderTable,
} from "@emach/db/schema/orders";
import { env } from "@emach/env/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

const STALE_INTERVAL = sql`interval '72 hours'`;
const REASON =
	"Cancelado automaticamente por inatividade (>72h sem pagamento confirmado)";

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let canceled = 0;
	try {
		const staleOrders = await db
			.select({ id: orderTable.id })
			.from(orderTable)
			.where(
				and(
					eq(orderTable.status, "pending_payment"),
					lt(orderTable.createdAt, sql`now() - ${STALE_INTERVAL}`)
				)
			);

		for (const { id } of staleOrders) {
			try {
				await db.transaction(async (tx) => {
					const [current] = await tx
						.select({ status: orderTable.status })
						.from(orderTable)
						.where(eq(orderTable.id, id))
						.for("update");

					if (!current || current.status !== "pending_payment") {
						return; // mudou entre o list e o lock — pular
					}

					await tx
						.update(orderTable)
						.set({ status: "canceled", canceledAt: new Date() })
						.where(eq(orderTable.id, id));

					await tx.insert(orderStatusHistory).values({
						id: crypto.randomUUID(),
						orderId: id,
						fromStatus: "pending_payment",
						toStatus: "canceled",
						actorType: "system",
						actorUserId: null,
						reason: REASON,
					});

					canceled++;
				});
			} catch (perOrderErr) {
				logger.error("cancelStaleOrder", { orderId: id, err: perOrderErr });
			}
		}

		return NextResponse.json({ ok: true, canceled });
	} catch (err) {
		logger.error("cancelStaleOrdersCron", err);
		return NextResponse.json(
			{ ok: false, error: "Internal error" },
			{ status: 500 }
		);
	}
}
