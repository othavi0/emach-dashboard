// apps/web/scripts/backfill-banner-composition.ts
// One-off: preenche banner.composition onde NULL, a partir do layout legado
// (layout/productScale/ctaScale + flags has*), via legacyToComposition (Task 2).
// Idempotente (WHERE composition IS NULL — reexecutar é seguro, só toca linhas
// ainda não migradas).
//
// Rodar: bun apps/web/scripts/backfill-banner-composition.ts
//
// ⚠️ Banco único dev=prod (dashboard + ecommerce compartilham o mesmo Supabase).
// Rodar SOMENTE com autorização explícita do user nesta sessão — é UPDATE em
// massa na tabela banner. Fica reservado pro rollout (fim da Fase 4).
import { db } from "@emach/db";
import { banner } from "@emach/db/schema/banner";
import { eq, isNull } from "drizzle-orm";
import {
	deriveHasFlagsFromBanner,
	legacyToComposition,
} from "../src/app/dashboard/site/banners/_components/composition/derive-legacy";

async function main() {
	const rows = await db.select().from(banner).where(isNull(banner.composition));
	for (const row of rows) {
		const composition = legacyToComposition({
			layout: row.layout,
			productScale: row.productScale,
			ctaScale: row.ctaScale,
			...deriveHasFlagsFromBanner(row),
		});
		await db.update(banner).set({ composition }).where(eq(banner.id, row.id));
		process.stdout.write(`backfilled ${row.id} (${row.layout})\n`);
	}
	process.stdout.write(`total: ${rows.length}\n`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		process.stderr.write(`[backfill-banner-composition] FAIL ${String(err)}\n`);
		process.exit(1);
	});
