import { describe, expect, it } from "vitest";

import {
	exceptionResumeDenial,
	queueCardCta,
	splitQueueByOwnership,
} from "../_lib/picking-logic";

const EXCEPTION_BY_JOAO = {
	pickerName: "João",
	pickerUserId: "usr_joao",
	status: "exception" as const,
};

const JOAO_NAME_PATTERN = /João/;
const ADMIN_MENTION_PATTERN = /admin/i;

describe("exceptionResumeDenial (posse de exceção, spec 2026-07-17)", () => {
	it("sem sessão anterior → liberado", () => {
		expect(
			exceptionResumeDenial(null, { id: "usr_1", role: "user" })
		).toBeNull();
	});

	it("última sessão canceled → pool geral, liberado pra qualquer role", () => {
		expect(
			exceptionResumeDenial(
				{ ...EXCEPTION_BY_JOAO, status: "canceled" },
				{ id: "usr_1", role: "user" }
			)
		).toBeNull();
	});

	it("exceção do próprio ator → liberado", () => {
		expect(
			exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_joao", role: "user" })
		).toBeNull();
	});

	it("exceção alheia + role user → negado com nome do dono", () => {
		const denial = exceptionResumeDenial(EXCEPTION_BY_JOAO, {
			id: "usr_other",
			role: "user",
		});
		expect(denial).toMatch(JOAO_NAME_PATTERN);
		expect(denial).toMatch(ADMIN_MENTION_PATTERN);
	});

	it("exceção alheia + admin/super_admin → liberado", () => {
		for (const role of ["admin", "super_admin"]) {
			expect(
				exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_adm", role })
			).toBeNull();
		}
	});

	it("exceção órfã (pickerUserId null, user deletado) → pool, liberado", () => {
		expect(
			exceptionResumeDenial(
				{ ...EXCEPTION_BY_JOAO, pickerUserId: null },
				{ id: "usr_1", role: "user" }
			)
		).toBeNull();
	});

	it("role ausente/nula não é admin → negado", () => {
		expect(
			exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_other" })
		).not.toBeNull();
	});
});

describe("splitQueueByOwnership", () => {
	const rows = [
		{ orderId: "o1", pickerUserId: "me" },
		{ orderId: "o2", pickerUserId: "other" },
		{ orderId: "o3", pickerUserId: undefined },
		{ orderId: "o4", pickerUserId: "me" },
	];

	it("separa minhas das dos outros preservando a ordem", () => {
		const { mine, others } = splitQueueByOwnership(rows, "me");
		expect(mine.map((r) => r.orderId)).toEqual(["o1", "o4"]);
		expect(others.map((r) => r.orderId)).toEqual(["o2", "o3"]);
	});

	it("sem pickerUserId (linha órfã) cai em others", () => {
		const { others } = splitQueueByOwnership(rows, "me");
		expect(others.some((r) => r.orderId === "o3")).toBe(true);
	});
});

describe("queueCardCta (CTA por role, mockup A 2026-07-17)", () => {
	it("a_separar → Separar primary, independe de role", () => {
		expect(queueCardCta("a_separar", false, false)).toEqual({
			kind: "primary",
			label: "Separar",
		});
	});

	it("em_separacao própria → Retomar separação warning", () => {
		expect(queueCardCta("em_separacao", true, false)).toEqual({
			kind: "warning",
			label: "Retomar separação",
		});
	});

	it("em_separacao alheia: user → Ver andamento; admin → Assumir separação", () => {
		expect(queueCardCta("em_separacao", false, false)).toEqual({
			kind: "outline-muted",
			label: "Ver andamento",
		});
		expect(queueCardCta("em_separacao", false, true)).toEqual({
			kind: "outline",
			label: "Assumir separação",
		});
	});

	it("excecoes: própria ou admin → Resolver; alheia + user → null (sem CTA)", () => {
		expect(queueCardCta("excecoes", true, false)).toEqual({
			kind: "outline",
			label: "Resolver",
		});
		expect(queueCardCta("excecoes", false, true)).toEqual({
			kind: "outline",
			label: "Resolver",
		});
		expect(queueCardCta("excecoes", false, false)).toBeNull();
	});
});
