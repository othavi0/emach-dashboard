import { z } from "zod";

import { isValidCnpj } from "@/lib/cpf-cnpj";
import { isValidPhoneBr } from "@/lib/validation/phone-br";

const URL_RE = /^https?:\/\/.+/i;

const supplierObject = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Nome obrigatório")
		.min(2, "Nome muito curto")
		.max(120, "Nome muito longo"),
	contactEmail: z
		.email("E-mail inválido")
		.max(180, "E-mail muito longo")
		.optional()
		.or(z.literal("")),
	phone: z
		.string({ error: "Telefone obrigatório" })
		.trim()
		.min(1, "Telefone obrigatório")
		.refine(isValidPhoneBr, "Telefone inválido (use DDD + número)"),
	website: z
		.string()
		.trim()
		.max(255, "URL muito longa")
		.refine(
			(v) => !v || URL_RE.test(v),
			"URL deve começar com http:// ou https://"
		)
		.optional()
		.or(z.literal("")),
	cnpj: z
		.string()
		.trim()
		.refine((v) => !v || isValidCnpj(v), "CNPJ inválido")
		.optional()
		.or(z.literal("")),
	notes: z
		.string()
		.trim()
		.max(1000, "Observações muito longas")
		.optional()
		.or(z.literal("")),
});

export const supplierSchema = supplierObject.superRefine((data, ctx) => {
	// Sem CNPJ, exigimos uma observação explicando o motivo — fornecedor sem
	// documento não pode passar despercebido.
	const hasCnpj = Boolean(data.cnpj?.trim());
	const hasNotes = Boolean(data.notes?.trim());
	if (!(hasCnpj || hasNotes)) {
		ctx.addIssue({
			code: "custom",
			path: ["notes"],
			message: "Sem CNPJ, descreva o motivo nas observações",
		});
	}
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
