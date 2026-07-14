import { db } from "@emach/db";
import { stockAlertSent } from "@emach/db/schema/inventory";
import { toDate } from "@emach/db/utils";
import { sendStockAlertEmail } from "@emach/email/send";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface StockAlertDbRow extends Record<string, unknown> {
	alert_level: "critical" | "reorder";
	branch_id: string;
	branch_name: string;
	deficit: number;
	last_alert_level: "critical" | "reorder" | null;
	last_sent_at: string | Date | null;
	min_qty: number;
	quantity: number;
	reorder_point: number;
	sku: string;
	tool_name: string;
	variant_id: string;
}

interface RecipientDbRow extends Record<string, unknown> {
	branch_id: string;
	email: string;
}

interface SuperAdminDbRow extends Record<string, unknown> {
	email: string;
}

interface AlertItem {
	alertLevel: "critical" | "reorder";
	deficit: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolName: string;
	variantId: string;
}

interface BranchAlert {
	branchName: string;
	items: AlertItem[];
}

/**
 * Item entra no alerta se nunca foi alertado, se o cooldown de 7 dias
 * expirou, ou se escalou de reorder para critical (fura o cooldown).
 */
function shouldAlert(row: StockAlertDbRow, now: number): boolean {
	const lastSentAt = toDate(row.last_sent_at);
	if (!lastSentAt) {
		return true;
	}
	if (now - lastSentAt.getTime() > COOLDOWN_MS) {
		return true;
	}
	return row.alert_level === "critical" && row.last_alert_level === "reorder";
}

/** Agrupa as linhas elegíveis (fora do cooldown) por filial. */
function buildBranchAlerts(
	rows: StockAlertDbRow[],
	now: number
): Map<string, BranchAlert> {
	const byBranch = new Map<string, BranchAlert>();
	for (const row of rows) {
		if (!shouldAlert(row, now)) {
			continue;
		}
		const entry = byBranch.get(row.branch_id) ?? {
			branchName: row.branch_name,
			items: [],
		};
		entry.items.push({
			alertLevel: row.alert_level,
			deficit: Number(row.deficit),
			quantity: Number(row.quantity),
			reorderPoint: Number(row.reorder_point),
			sku: row.sku,
			toolName: row.tool_name,
			variantId: row.variant_id,
		});
		byBranch.set(row.branch_id, entry);
	}
	return byBranch;
}

/** Resolve destinatários de uma filial: admins vinculados ou fallback de super_admins. */
async function resolveRecipients(
	branchId: string,
	recipientsByBranch: Map<string, string[]>,
	getSuperAdminEmails: () => Promise<string[]>
): Promise<string[]> {
	const direct = recipientsByBranch.get(branchId) ?? [];
	if (direct.length > 0) {
		return direct;
	}
	return await getSuperAdminEmails();
}

/** Persiste o upsert de cooldown para cada item alertado de uma filial. */
async function recordAlertsSent(branchId: string, items: AlertItem[]) {
	for (const item of items) {
		await db
			.insert(stockAlertSent)
			.values({
				branchId,
				variantId: item.variantId,
				alertLevel: item.alertLevel,
				sentAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [stockAlertSent.branchId, stockAlertSent.variantId],
				set: { alertLevel: item.alertLevel, sentAt: new Date() },
			});
	}
}

/**
 * Envia o alerta de uma filial e grava o cooldown. Upsert só ocorre após o
 * send ter sucesso (falha = re-tentativa no próximo dia útil).
 */
async function dispatchBranchAlert(
	branchId: string,
	branchName: string,
	items: AlertItem[],
	recipientsByBranch: Map<string, string[]>,
	getSuperAdminEmails: () => Promise<string[]>
): Promise<"sent" | "no_recipients"> {
	const to = await resolveRecipients(
		branchId,
		recipientsByBranch,
		getSuperAdminEmails
	);
	if (to.length === 0) {
		logger.error("stockAlertsCron", {
			branchId,
			branchName,
			reason: "no_recipients",
		});
		return "no_recipients";
	}

	await sendStockAlertEmail({
		to,
		branchName,
		dashboardUrl: `${env.BETTER_AUTH_URL}/dashboard/tools?mode=repor&branchId=${branchId}`,
		items,
	});
	await recordAlertsSent(branchId, items);
	return "sent";
}

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let emailsSent = 0;
	let branchesSkipped = 0;
	let itemsAlerted = 0;

	try {
		const result = await db.execute<StockAlertDbRow>(sql`
			SELECT
				b.id   AS branch_id,
				b.name AS branch_name,
				tv.id  AS variant_id,
				t.name AS tool_name,
				tv.sku,
				sl.quantity,
				sl.min_qty,
				sl.reorder_point,
				(sl.reorder_point - sl.quantity) AS deficit,
				CASE
					WHEN sl.quantity <= sl.min_qty AND sl.min_qty > 0 THEN 'critical'
					ELSE 'reorder'
				END AS alert_level,
				sas.sent_at AS last_sent_at,
				sas.alert_level AS last_alert_level
			FROM stock_level sl
			JOIN branch b ON b.id = sl.branch_id
			JOIN tool_variant tv ON tv.id = sl.variant_id
			JOIN tool t ON t.id = tv.tool_id
			LEFT JOIN stock_alert_sent sas
				ON sas.branch_id = sl.branch_id AND sas.variant_id = sl.variant_id
			WHERE sl.quantity < sl.reorder_point
				AND sl.reorder_point > 0
				AND t.status = 'active'
				AND b.status = 'active'
			ORDER BY b.id, deficit DESC
		`);

		const byBranch = buildBranchAlerts(result.rows, Date.now());

		if (byBranch.size === 0) {
			return NextResponse.json({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
		}

		const branchIds = [...byBranch.keys()];
		const recipientsResult = await db.execute<RecipientDbRow>(sql`
			SELECT ub.branch_id, u.email
			FROM user_branch ub
			JOIN "user" u ON u.id = ub.user_id
			WHERE u.role = 'admin'
				AND u.status = 'active'
				AND ub.branch_id IN (${sql.join(
					branchIds.map((id) => sql`${id}`),
					sql`, `
				)})
		`);
		const recipientsByBranch = new Map<string, string[]>();
		for (const row of recipientsResult.rows) {
			const emails = recipientsByBranch.get(row.branch_id) ?? [];
			emails.push(row.email);
			recipientsByBranch.set(row.branch_id, emails);
		}

		// Fallback resolvido no máximo uma vez por execução.
		let superAdminEmails: string[] | null = null;
		const getSuperAdminEmails = async (): Promise<string[]> => {
			if (superAdminEmails === null) {
				const superAdminsResult = await db.execute<SuperAdminDbRow>(sql`
					SELECT email FROM "user"
					WHERE role = 'super_admin' AND status = 'active'
				`);
				superAdminEmails = superAdminsResult.rows.map((r) => r.email);
			}
			return superAdminEmails;
		};

		for (const [branchId, { branchName, items }] of byBranch) {
			try {
				const outcome = await dispatchBranchAlert(
					branchId,
					branchName,
					items,
					recipientsByBranch,
					getSuperAdminEmails
				);
				if (outcome === "no_recipients") {
					branchesSkipped++;
					continue;
				}
				emailsSent++;
				itemsAlerted += items.length;
			} catch (perBranchErr) {
				branchesSkipped++;
				logger.error("stockAlertsCron", { branchId, err: perBranchErr });
			}
		}

		return NextResponse.json({
			ok: true,
			emailsSent,
			branchesSkipped,
			itemsAlerted,
		});
	} catch (err) {
		logger.error("stockAlertsCron", err);
		return NextResponse.json(
			{ ok: false, error: "Internal error" },
			{ status: 500 }
		);
	}
}
