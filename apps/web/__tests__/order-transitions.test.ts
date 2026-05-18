import { orderStatusEnum } from "@emach/db/schema/orders";
import { describe, expect, it } from "vitest";
import {
	capForStatus,
	updateOrderStatusSchema,
	VALID_TRANSITIONS,
} from "../src/app/dashboard/orders/schema";

// UUIDs v4 válidos (Zod v4 usa validação estrita de version/variant)
const VALID_ORDER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const VALID_BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ORDER_ITEM_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

describe("VALID_TRANSITIONS", () => {
	it("cobre exatamente os 9 estados do order_status", () => {
		expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(
			[...orderStatusEnum.enumValues].sort()
		);
	});

	it("implementa a máquina de estados do ADR-0005", () => {
		expect(VALID_TRANSITIONS).toEqual({
			pending_payment: ["paid", "payment_failed", "canceled"],
			payment_failed: ["pending_payment", "canceled"],
			paid: ["preparing", "refunded"],
			preparing: ["shipped", "refunded"],
			shipped: ["delivered", "refunded", "returned"],
			delivered: ["returned"],
			returned: ["refunded"],
			canceled: [],
			refunded: [],
		});
	});

	it("toda transição alvo é um estado válido", () => {
		const valid = new Set<string>(orderStatusEnum.enumValues);
		for (const targets of Object.values(VALID_TRANSITIONS)) {
			for (const target of targets) {
				expect(valid.has(target)).toBe(true);
			}
		}
	});

	it("shipped → returned é uma transição válida (novo edge: falha na entrega)", () => {
		expect(VALID_TRANSITIONS.shipped).toContain("returned");
	});

	it("estados terminais (canceled, refunded) não têm saídas", () => {
		expect(VALID_TRANSITIONS.canceled).toHaveLength(0);
		expect(VALID_TRANSITIONS.refunded).toHaveLength(0);
	});

	it("transições inválidas — estados que NÃO podem ir direto para shipped", () => {
		for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
			if (from === "preparing") {
				continue; // único que pode ir para shipped
			}
			expect(targets).not.toContain("shipped");
		}
	});

	it("pending_payment não pode ir para preparing, shipped, delivered ou returned", () => {
		const disallowed = ["preparing", "shipped", "delivered", "returned"];
		for (const status of disallowed) {
			expect(VALID_TRANSITIONS.pending_payment).not.toContain(status);
		}
	});

	it("delivered só pode ir para returned (sem refund direto)", () => {
		expect(VALID_TRANSITIONS.delivered).toEqual(["returned"]);
	});

	it("returned só pode ir para refunded", () => {
		expect(VALID_TRANSITIONS.returned).toEqual(["refunded"]);
	});
});

describe("capForStatus", () => {
	it("canceled exige orders.cancel", () => {
		expect(capForStatus("canceled")).toBe("orders.cancel");
	});

	it("refunded exige orders.refund", () => {
		expect(capForStatus("refunded")).toBe("orders.refund");
	});

	it.each([
		"pending_payment",
		"paid",
		"preparing",
		"shipped",
		"delivered",
		"payment_failed",
		"returned",
	] as const)("%s exige orders.update_status", (status) => {
		expect(capForStatus(status)).toBe("orders.update_status");
	});
});

describe("updateOrderStatusSchema — regra: reason obrigatório", () => {
	const STATUSES_REQUIRING_REASON = [
		"canceled",
		"refunded",
		"returned",
	] as const;
	const STATUSES_NOT_REQUIRING_REASON = [
		"pending_payment",
		"payment_failed",
		"paid",
		"preparing",
		"delivered",
	] as const;

	describe("FALHA quando reason ausente/vazio para status que exige", () => {
		it.each(
			STATUSES_REQUIRING_REASON
		)("%s sem reason → inválido com issue em 'reason'", (toStatus) => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus,
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				const reasonIssue = result.error.issues.find(
					(i) => i.path[0] === "reason"
				);
				expect(reasonIssue).toBeDefined();
			}
		});

		it.each(
			STATUSES_REQUIRING_REASON
		)("%s com reason vazio ('') → inválido com issue em 'reason'", (toStatus) => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus,
				reason: "",
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				const reasonIssue = result.error.issues.find(
					(i) => i.path[0] === "reason"
				);
				expect(reasonIssue).toBeDefined();
			}
		});

		it.each(
			STATUSES_REQUIRING_REASON
		)("%s com reason apenas espaços → inválido com issue em 'reason'", (toStatus) => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus,
				reason: "   ",
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				const reasonIssue = result.error.issues.find(
					(i) => i.path[0] === "reason"
				);
				expect(reasonIssue).toBeDefined();
			}
		});
	});

	describe("PASSA quando reason preenchido para status que exige", () => {
		it("canceled com reason válido → válido", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "canceled",
				reason: "Cliente desistiu da compra",
			});
			expect(result.success).toBe(true);
		});

		it("refunded com reason válido → válido", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "refunded",
				reason: "Produto com defeito confirmado",
			});
			expect(result.success).toBe(true);
		});

		it("returned com reason válido → válido", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "returned",
				reason: "Falha na entrega — destinatário ausente",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("PASSA sem reason para status que NÃO exige", () => {
		it.each(
			STATUSES_NOT_REQUIRING_REASON
		)("%s sem reason → válido", (toStatus) => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus,
			});
			// Estes status não exigem reason nem trackingCode — o parse deve passar.
			expect(result.success).toBe(true);
		});

		it("paid sem reason → válido (sem issue em 'reason')", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "paid",
			});
			expect(result.success).toBe(true);
		});
	});

	describe("regra: trackingCode obrigatório para shipped", () => {
		it("shipped sem trackingCode → inválido com issue em 'trackingCode'", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "shipped",
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				const issue = result.error.issues.find(
					(i) => i.path[0] === "trackingCode"
				);
				expect(issue).toBeDefined();
			}
		});

		it("shipped com trackingCode → válido", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "shipped",
				trackingCode: "BR123456789BR",
			});
			expect(result.success).toBe(true);
		});

		it("shipped NÃO exige reason (não é status de cancelamento/reembolso/devolução)", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "shipped",
				trackingCode: "BR123456789BR",
			});
			expect(result.success).toBe(true);
			if (!result.success) {
				const reasonIssue = result.error.issues.find(
					(i) => i.path[0] === "reason"
				);
				expect(reasonIssue).toBeUndefined();
			}
		});
	});

	describe("campos opcionais — reason ≤ 500 chars, trackingCode ≤ 200 chars", () => {
		it("reason com 500 chars → válido para canceled", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "canceled",
				reason: "a".repeat(500),
			});
			expect(result.success).toBe(true);
		});

		it("reason com 501 chars → inválido (max 500)", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "canceled",
				reason: "a".repeat(501),
			});
			expect(result.success).toBe(false);
		});

		it("returnItems com UUIDs válidos → válido para returned", () => {
			const result = updateOrderStatusSchema.safeParse({
				orderId: VALID_ORDER_ID,
				toStatus: "returned",
				reason: "Falha na entrega",
				returnItems: [
					{ orderItemId: VALID_ORDER_ITEM_ID, branchId: VALID_BRANCH_ID },
				],
			});
			expect(result.success).toBe(true);
		});
	});
});

// NOTE: A regra "branchId obrigatório ao entrar em preparing" vive em
// updateOrderStatus (actions.ts), dentro de uma transação DB, e não em nenhum
// Zod schema puro. Testá-la requer mock da transação inteira ou um DB real —
// ambos fogem do escopo de testes unitários. Cobertura deve vir via teste de
// integração (out of scope desta task).
