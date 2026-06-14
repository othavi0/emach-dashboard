import { describe, expect, it } from "vitest";

import {
	branchSchema,
	defaultBusinessHours,
} from "@/app/dashboard/branches/_components/branch-schema";

const baseAddress = {
	phone: "(11) 98765-4321",
	cep: "01000-000",
	street: "Av. Paulista",
	streetNumber: "1578",
	neighborhood: "Bela Vista",
	city: "São Paulo",
	state: "SP",
};

describe("branchSchema businessHours", () => {
	it("keeps structured hours for weekdays, saturday, and holidays", () => {
		const parsed = branchSchema.safeParse({
			name: "Matriz",
			status: "active",
			...baseAddress,
			businessHours: defaultBusinessHours,
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) {
			return;
		}
		expect(parsed.data.businessHours).toEqual(defaultBusinessHours);
	});

	it("rejects open periods where closing time is not after opening time", () => {
		const parsed = branchSchema.safeParse({
			name: "Matriz",
			status: "active",
			...baseAddress,
			businessHours: {
				...defaultBusinessHours,
				weekdays: { isOpen: true, opensAt: "18:00", closesAt: "08:00" },
			},
		});

		expect(parsed.success).toBe(false);
	});
});
