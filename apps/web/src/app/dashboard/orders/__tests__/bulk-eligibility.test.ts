import { describe, expect, it } from "vitest";

import {
	BULK_SKIP_LABEL,
	bulkSkipReasonFromError,
	bulkStartSeparationSkipReason,
} from "../_lib/bulk-eligibility";

describe("bulkStartSeparationSkipReason", () => {
	it("paid com filial é elegível", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "paid", branchId: "b1" })
		).toBeNull();
	});

	it("status diferente de paid é pulado", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "preparing", branchId: "b1" })
		).toBe("status_diferente");
		expect(
			bulkStartSeparationSkipReason({ status: "canceled", branchId: "b1" })
		).toBe("status_diferente");
	});

	it("paid sem filial é pulado (preparing exige branch)", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "paid", branchId: null })
		).toBe("sem_filial");
	});

	it("labels de toast existem para todo reason", () => {
		expect(BULK_SKIP_LABEL.sem_filial).toBe("sem filial");
		expect(BULK_SKIP_LABEL.status_diferente).toBe("não está mais em Pago");
	});
});

describe("bulkSkipReasonFromError", () => {
	it("erro Forbidden: é escopo", () => {
		expect(
			bulkSkipReasonFromError(
				new Error("Forbidden: missing capability orders.update_status")
			)
		).toBe("fora do seu escopo");
	});

	it("erro de filial fora do escopo é escopo", () => {
		expect(
			bulkSkipReasonFromError(new Error("Filial fora do seu escopo: b1"))
		).toBe("fora do seu escopo");
	});

	it("erro de triagem restrita a admin/super_admin é escopo", () => {
		expect(
			bulkSkipReasonFromError(
				new Error(
					"Pedido na triagem só pode ser tratado por admin ou super_admin"
				)
			)
		).toBe("fora do seu escopo");
	});

	it("erro de infra não é escopo — aborta o lote", () => {
		expect(bulkSkipReasonFromError(new Error("connection refused"))).toBeNull();
	});

	it("valor não-Error não é escopo", () => {
		expect(bulkSkipReasonFromError("string error")).toBeNull();
	});
});
