import { describe, expect, it } from "vitest";

import {
	BULK_SKIP_LABEL,
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
