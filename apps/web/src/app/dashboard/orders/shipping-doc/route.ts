import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { isCapabilityError } from "@/lib/action-error";
import { getUserBranchScope } from "@/lib/branch-scope";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { registerPdfFonts } from "../picking-list/_lib/fonts";
import { fetchShippingDocOrders } from "./_lib/data";
import { resolveShippingDocParams } from "./_lib/resolve-params";
import {
	EmptyShippingDocDocument,
	ShippingDocDocument,
} from "./_lib/shipping-doc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
	try {
		const session = await requireCapability("orders.read");
		const resolved = resolveShippingDocParams(new URL(req.url).searchParams);
		if (!resolved.ok) {
			return new Response(resolved.error, { status: 400 });
		}
		const scope = await getUserBranchScope(session);
		const orders = await fetchShippingDocOrders(resolved.params, scope);

		registerPdfFonts();
		const generatedAt = new Date();
		const operatorName = session.user.name ?? session.user.email ?? "—";

		const doc =
			orders.length === 0
				? createElement(EmptyShippingDocDocument, { generatedAt })
				: createElement(ShippingDocDocument, {
						generatedAt,
						operatorName,
						orders,
					});

		const buffer = await renderToBuffer(
			doc as Parameters<typeof renderToBuffer>[0]
		);
		logger.info("shipping_doc.pdf", {
			userId: session.user.id,
			orders: orders.length,
			mode: resolved.params.mode,
		});
		return new Response(new Uint8Array(buffer), {
			headers: {
				"Cache-Control": "no-store",
				"Content-Disposition": `inline; filename="dados-envio-${generatedAt.getTime()}.pdf"`,
				"Content-Type": "application/pdf",
			},
		});
	} catch (error) {
		if (isCapabilityError(error)) {
			return new Response("Sem permissão", { status: 403 });
		}
		logger.error("shipping_doc.pdf", error);
		return new Response("Erro ao gerar o documento de envio", { status: 500 });
	}
}
