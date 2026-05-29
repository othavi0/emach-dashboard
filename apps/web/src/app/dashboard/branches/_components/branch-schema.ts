import type { BranchBusinessHours } from "@emach/db/schema/inventory";
import { z } from "zod";

const phoneRegex = /^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/;
const cepDigitsRegex = /^\d{8}$/;
const ufRegex = /^[A-Z]{2}$/;
const CEP_RANGE_REGEX = /^\d{5}-?\d{3}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const defaultBusinessHours: BranchBusinessHours = {
	weekdays: { isOpen: true, opensAt: "08:00", closesAt: "18:00" },
	saturday: { isOpen: true, opensAt: "08:00", closesAt: "12:00" },
	holidays: { isOpen: false, opensAt: null, closesAt: null },
};

export const cepRangeSchema = z.object({
	from: z.string().regex(CEP_RANGE_REGEX, "CEP inválido (00000-000)"),
	to: z.string().regex(CEP_RANGE_REGEX, "CEP inválido (00000-000)"),
});

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
	.transform((value) => ({
		isOpen: value.isOpen,
		opensAt: value.isOpen ? value.opensAt : null,
		closesAt: value.isOpen ? value.closesAt : null,
	}));

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
	);

export type BranchFormValues = z.infer<typeof branchSchema>;
