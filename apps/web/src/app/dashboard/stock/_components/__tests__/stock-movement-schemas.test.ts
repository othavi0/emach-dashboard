import { describe, expect, it } from "vitest";
import {
	stockEntrySchema,
	stockRecountSchema,
	stockWriteOffSchema,
} from "../stock-movement-schema";

describe("stockEntrySchema", () => {
	it("aceita input válido", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 5,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("aceita note presente", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 5,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
			note: "NF #1234",
		});
		expect(result.success).toBe(true);
	});

	it("aceita note ausente (campo opcional)", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 5,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("rejeita quantity=0", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 0,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path[0]);
			expect(paths).toContain("quantity");
			const msg = result.error.issues.find((i) => i.path[0] === "quantity")
				?.message;
			expect(msg).toBe("Quantidade deve ser maior que zero");
		}
	});

	it("rejeita quantity negativa", () => {
		const result = stockEntrySchema.safeParse({
			quantity: -1,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
	});

	it("rejeita supplierId vazio", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 5,
			supplierId: "",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((i) => i.path[0] === "supplierId");
			expect(issue?.message).toBe("Fornecedor obrigatório na entrada");
		}
	});

	it("rejeita quantity não-inteira", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 1.5,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path[0]);
			expect(paths).toContain("quantity");
		}
	});

	it("rejeita note > 500 chars", () => {
		const result = stockEntrySchema.safeParse({
			quantity: 5,
			supplierId: "sup1",
			variantId: "v1",
			branchId: "b1",
			note: "a".repeat(501),
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((i) => i.path[0] === "note");
			expect(issue?.message).toBe(
				"Observação não pode exceder 500 caracteres"
			);
		}
	});
});

describe("stockWriteOffSchema", () => {
	it("aceita input válido (reason=perda, note ausente)", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "perda",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("rejeita quantity=0", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 0,
			reason: "perda",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path[0]);
			expect(paths).toContain("quantity");
		}
	});

	it("schema não exige supplierId (campo não existe)", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "perda",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect("supplierId" in result.data).toBe(false);
		}
	});

	it("rejeita quando reason=outro e note vazia", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "outro",
			note: "",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((i) => i.path[0] === "note");
			expect(issue?.message).toBe(
				"Observação obrigatória quando motivo é 'Outro'"
			);
		}
	});

	it("rejeita quando reason=outro e note ausente", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "outro",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((i) => i.path[0] === "note");
			expect(issue?.message).toBe(
				"Observação obrigatória quando motivo é 'Outro'"
			);
		}
	});

	it("aceita quando reason=outro e note preenchida", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "outro",
			note: "Equipamento danificado",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("aceita quando reason=perda e note vazia (note opcional para perda)", () => {
		const result = stockWriteOffSchema.safeParse({
			quantity: 3,
			reason: "perda",
			note: "",
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});
});

describe("stockRecountSchema", () => {
	it("aceita newQty=0 (min=0, diferente dos outros dois)", () => {
		const result = stockRecountSchema.safeParse({
			newQty: 0,
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("aceita newQty positivo", () => {
		const result = stockRecountSchema.safeParse({
			newQty: 10,
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("rejeita newQty negativo", () => {
		const result = stockRecountSchema.safeParse({
			newQty: -1,
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const issue = result.error.issues.find((i) => i.path[0] === "newQty");
			expect(issue?.message).toBe("Quantidade não pode ser negativa");
		}
	});

	it("rejeita newQty não-inteiro", () => {
		const result = stockRecountSchema.safeParse({
			newQty: 3.7,
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path[0]);
			expect(paths).toContain("newQty");
		}
	});

	it("aceita note ausente", () => {
		const result = stockRecountSchema.safeParse({
			newQty: 5,
			variantId: "v1",
			branchId: "b1",
		});
		expect(result.success).toBe(true);
	});

	it("aceita note presente", () => {
		const result = stockRecountSchema.safeParse({
			newQty: 5,
			variantId: "v1",
			branchId: "b1",
			note: "Recontagem física de 17/06",
		});
		expect(result.success).toBe(true);
	});
});
