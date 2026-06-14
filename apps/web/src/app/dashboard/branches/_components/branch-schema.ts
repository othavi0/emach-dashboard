import type {
	BranchBusinessHours,
	BranchBusinessHoursPeriod,
} from "@emach/db/schema/inventory";
import { z } from "zod";

const phoneRegex = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;
const cepDigitsRegex = /^\d{8}$/;
const ufRegex = /^[A-Z]{2}$/;
const CEP_8_DIGITS = /^\d{8}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const defaultBusinessHours: BranchBusinessHours = {
	weekdays: {
		isOpen: true,
		opensAt: "08:00",
		closesAt: "18:00",
		breakStart: null,
		breakEnd: null,
	},
	saturday: {
		isOpen: true,
		opensAt: "08:00",
		closesAt: "12:00",
		breakStart: null,
		breakEnd: null,
	},
	holidays: {
		isOpen: false,
		opensAt: null,
		closesAt: null,
		breakStart: null,
		breakEnd: null,
	},
};

const cepDigits = z
	.string()
	.transform((v) => v.replace(/\D/g, ""))
	.pipe(z.string().regex(CEP_8_DIGITS, "CEP inválido (8 dígitos)"));

export const cepRangeSchema = z
	.object({
		from: cepDigits,
		to: cepDigits,
		label: z.string().trim().max(60, "Rótulo muito longo").optional(),
	})
	.refine((r) => r.from <= r.to, {
		message: "CEP inicial deve ser ≤ CEP final",
		path: ["to"],
	});

function cepRangesOverlap(ranges: { from: string; to: string }[]): boolean {
	const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const cur = sorted[i];
		if (prev && cur && cur.from <= prev.to) {
			return true;
		}
	}
	return false;
}

const optionalTrimmed = z
	.string()
	.trim()
	.optional()
	.or(z.literal(""))
	.transform((v) => (v ? v : undefined));

const timeValueSchema = z
	.string()
	.trim()
	.regex(timeRegex, "Horário inválido (HH:mm)")
	.nullable();

const businessHoursPeriodSchema = z
	.object({
		isOpen: z.boolean(),
		opensAt: timeValueSchema,
		closesAt: timeValueSchema,
	})
	.superRefine((value, ctx) => {
		if (!value.isOpen) {
			return;
		}

		if (!value.opensAt) {
			ctx.addIssue({
				code: "custom",
				message: "Horário de abertura obrigatório",
				path: ["opensAt"],
			});
		}

		if (!value.closesAt) {
			ctx.addIssue({
				code: "custom",
				message: "Horário de fechamento obrigatório",
				path: ["closesAt"],
			});
		}

		if (value.opensAt && value.closesAt && value.closesAt <= value.opensAt) {
			ctx.addIssue({
				code: "custom",
				message: "Fechamento deve ser depois da abertura",
				path: ["closesAt"],
			});
		}
	})
	.transform(
		(value): BranchBusinessHoursPeriod => ({
			isOpen: value.isOpen,
			opensAt: value.isOpen ? value.opensAt : null,
			closesAt: value.isOpen ? value.closesAt : null,
			breakStart: null,
			breakEnd: null,
		})
	);

export const businessHoursSchema = z
	.object({
		weekdays: businessHoursPeriodSchema,
		saturday: businessHoursPeriodSchema,
		holidays: businessHoursPeriodSchema,
	})
	.default(defaultBusinessHours);

export const branchSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Nome obrigatório")
			.min(2, "Nome muito curto")
			.max(120, "Nome muito longo"),
		status: z.enum(["active", "inactive"]).default("active"),
		phone: z
			.string()
			.trim()
			.max(40, "Telefone muito longo")
			.regex(phoneRegex, "Telefone inválido")
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined)),
		businessHours: businessHoursSchema,
		cep: z
			.string()
			.trim()
			.transform((v) => v.replace(/\D/g, ""))
			.refine((v) => v === "" || cepDigitsRegex.test(v), "CEP inválido")
			.optional()
			.transform((v) => (v ? v : undefined)),
		street: optionalTrimmed.pipe(
			z.string().max(200, "Rua muito longa").optional()
		),
		streetNumber: optionalTrimmed.pipe(
			z.string().max(20, "Número muito longo").optional()
		),
		complement: optionalTrimmed.pipe(
			z.string().max(100, "Complemento muito longo").optional()
		),
		neighborhood: optionalTrimmed.pipe(
			z.string().max(120, "Bairro muito longo").optional()
		),
		city: optionalTrimmed.pipe(
			z.string().max(120, "Cidade muito longa").optional()
		),
		state: z
			.string()
			.trim()
			.toUpperCase()
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined))
			.refine((v) => !v || ufRegex.test(v), "UF inválido (use 2 letras)"),
		responsibleUserId: optionalTrimmed.pipe(z.string().min(1).optional()),
		cepRanges: z.array(cepRangeSchema).max(20).optional().nullable(),
	})
	.refine(
		(data) => {
			if (!data.cep) {
				return true;
			}
			return Boolean(
				data.street && data.streetNumber && data.city && data.state
			);
		},
		{
			message:
				"Quando CEP é preenchido, rua, número, cidade e UF são obrigatórios",
			path: ["cep"],
		}
	)
	.refine((data) => !(data.cepRanges && cepRangesOverlap(data.cepRanges)), {
		message: "Faixas de CEP da filial não podem se sobrepor",
		path: ["cepRanges"],
	});

export type BranchFormValues = z.infer<typeof branchSchema>;
