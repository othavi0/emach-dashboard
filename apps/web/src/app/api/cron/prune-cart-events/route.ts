import { db } from "@emach/db";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Retenção 180d = 2× a maior janela exibida (90d) — margem p/ análise retroativa.
const RETENTION = sql`interval '180 days'`;

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const result = await db.execute(
			sql`DELETE FROM cart_event WHERE created_at < now() - ${RETENTION}`
		);
		return NextResponse.json({ ok: true, deleted: result.rowCount ?? 0 });
	} catch (err) {
		logger.error("pruneCartEventsCron", err);
		return NextResponse.json(
			{ ok: false, error: "Internal error" },
			{ status: 500 }
		);
	}
}
