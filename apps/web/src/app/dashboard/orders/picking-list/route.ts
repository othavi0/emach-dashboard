import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { isCapabilityError } from "@/lib/action-error";
import { getUserBranchScope } from "@/lib/branch-scope";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { fetchPickingListOrders } from "./_lib/data";
import { EmptyPickingListDocument, PickingListDocument } from "./_lib/document";
import { registerPdfFonts } from "./_lib/fonts";
import { batchLabel } from "./_lib/picking-list-logic";
import { resolvePickingListParams } from "./_lib/resolve-params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
	try {
		const session = await requireCapability("orders.read");
		const resolved = resolvePickingListParams(new URL(req.url).searchParams);
		if (!resolved.ok) {
			return new Response(resolved.error, { status: 400 });
		}
		const scope = await getUserBranchScope(session);
		const orders = await fetchPickingListOrders(resolved.params, scope);

		registerPdfFonts();
		const generatedAt = new Date();
		const batch = batchLabel(generatedAt);
		// Filial do documento: única filial presente no conjunto, senão "—".
		// (order.branchId não vem na query; a filial exibida deriva do escopo
		// do lote — v1 mostra o nome só quando o operador é scoped a 1 filial.)
		const branchName: string | null = null;

		const doc =
			orders.length === 0
				? createElement(EmptyPickingListDocument, { batch })
				: createElement(PickingListDocument, {
						batch,
						branchName,
						generatedAt,
						operatorName: session.user.name ?? session.user.email ?? "—",
						orders,
					});

		const buffer = await renderToBuffer(
			doc as Parameters<typeof renderToBuffer>[0]
		);
		logger.info("picking_list.pdf", {
			userId: session.user.id,
			orders: orders.length,
			mode: resolved.params.mode,
		});
		return new Response(new Uint8Array(buffer), {
			headers: {
				"Cache-Control": "no-store",
				"Content-Disposition": `inline; filename="lista-separacao-${batch}.pdf"`,
				"Content-Type": "application/pdf",
			},
		});
	} catch (error) {
		if (isCapabilityError(error)) {
			return new Response("Sem permissão", { status: 403 });
		}
		logger.error("picking_list.pdf", error);
		return new Response("Erro ao gerar a lista de separação", { status: 500 });
	}
}
