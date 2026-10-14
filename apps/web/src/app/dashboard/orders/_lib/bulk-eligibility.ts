// Elegibilidade do bulk pago→separação (spec 2026-07-11). Puro e fora do
// "use server" para ser testável (padrão ADR-0019).

export type BulkSkipReason = "sem_filial" | "status_diferente";

export function bulkStartSeparationSkipReason(locked: {
	branchId: string | null;
	status: string;
}): BulkSkipReason | null {
	if (locked.status !== "paid") {
		return "status_diferente";
	}

	if (!locked.branchId) {
		return "sem_filial";
	}

	return null;
}

export const BULK_SKIP_LABEL: Record<BulkSkipReason, string> = {
	sem_filial: "sem filial",
	status_diferente: "não está mais em Pago",
};

// Classifica erro lançado durante o processamento de UM pedido do lote:
// autorização/escopo → skip reportado; infra/desconhecido → aborta o lote.
export function bulkSkipReasonFromError(error: unknown): string | null {
	if (!(error instanceof Error)) {
		return null;
	}

	if (
		error.message.startsWith("Forbidden:") ||
		error.message.includes("fora do seu escopo") ||
		error.message.startsWith("Pedido na triagem")
	) {
		return "fora do seu escopo";
	}

	return null;
}
