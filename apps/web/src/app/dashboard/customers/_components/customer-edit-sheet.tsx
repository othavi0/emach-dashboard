"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Textarea } from "@emach/ui/components/textarea";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { formatDocument } from "@/lib/cpf-cnpj";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateCustomerProfile } from "../actions";
import type { CustomerDetail } from "../data";
import {
	type UpdateCustomerProfileInput,
	updateCustomerProfileSchema,
} from "../schema";

interface Props {
	customer: CustomerDetail;
}

interface FormValues {
	clientType: string; // "" | "b2c" | "b2b"
	email: string;
	internalNotes: string;
	name: string;
	phone: string;
	status: CustomerDetail["status"];
}

function toFormValues(c: CustomerDetail): FormValues {
	return {
		name: c.name,
		email: c.email,
		phone: c.phone ?? "",
		status: c.status,
		clientType: c.clientType ?? "",
		internalNotes: c.internalNotes ?? "",
	};
}

export function CustomerEditSheet({ customer }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [values, setValues] = useState<FormValues>(() =>
		toFormValues(customer)
	);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<UpdateCustomerProfileInput>();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(toFormValues(customer));
			clearErrors();
		}
	}, [open, customer, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateCustomerProfileSchema.safeParse({
			clientId: customer.id,
			name: values.name.trim(),
			email: values.email.trim(),
			phone: values.phone.trim() || null,
			internalNotes: values.internalNotes.trim() || null,
			status: values.status,
			clientType: (values.clientType as "b2c" | "b2b") || null,
		});
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateCustomerProfile(parsed.data);
			if (res.ok) {
				notify.success("Cliente atualizado");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados do cliente"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${customer.name}`}
		>
			<div className="flex flex-col gap-4">
				<LabeledField
					error={errors.name}
					id="customer-name"
					label="Nome"
					required
				>
					{(field) => (
						<Input
							{...field}
							onChange={(e) =>
								setValues((p) => ({ ...p, name: e.target.value }))
							}
							value={values.name}
						/>
					)}
				</LabeledField>

				<LabeledField
					error={errors.email}
					id="customer-email"
					label="Email"
					required
				>
					{(field) => (
						<Input
							{...field}
							onChange={(e) =>
								setValues((p) => ({ ...p, email: e.target.value }))
							}
							type="email"
							value={values.email}
						/>
					)}
				</LabeledField>

				<LabeledField error={errors.phone} id="customer-phone" label="Telefone">
					{(field) => (
						<Input
							{...field}
							onChange={(e) =>
								setValues((p) => ({ ...p, phone: e.target.value }))
							}
							placeholder="+55 11 9 9999-9999"
							value={values.phone}
						/>
					)}
				</LabeledField>

				<LabeledField
					help={
						<HelpTooltip
							label="Ajuda sobre documento"
							text="Documento não é editável pelo admin (vem do cadastro do cliente)."
						/>
					}
					id="customer-document"
					label="Documento"
				>
					{(field) => (
						<Input
							{...field}
							disabled
							readOnly
							value={
								customer.document
									? formatDocument(customer.document)
									: "Não informado"
							}
						/>
					)}
				</LabeledField>

				<LabeledField
					error={errors.status}
					id="customer-status"
					label="Status"
					required
				>
					{(field) => (
						<Select
							onValueChange={(v) =>
								setValues((p) => ({
									...p,
									status: (v ?? p.status) as FormValues["status"],
								}))
							}
							value={values.status}
						>
							<SelectTrigger {...field}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="active">Ativo</SelectItem>
									<SelectItem value="inactive">Inativo</SelectItem>
									<SelectItem value="blocked">Bloqueado</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</LabeledField>

				<LabeledField
					error={errors.clientType}
					id="customer-client-type"
					label="Tipo de cliente"
				>
					{(field) => (
						<Select
							onValueChange={(v) =>
								setValues((p) => ({
									...p,
									clientType: v == null || v === "__none__" ? "" : v,
								}))
							}
							value={values.clientType || "__none__"}
						>
							<SelectTrigger {...field}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">Não definido</SelectItem>
									<SelectItem value="b2c">Pessoa Física (B2C)</SelectItem>
									<SelectItem value="b2b">Pessoa Jurídica (B2B)</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</LabeledField>

				<LabeledField
					error={errors.internalNotes}
					id="customer-internal-notes"
					label="Notas internas"
				>
					{(field) => (
						<Textarea
							{...field}
							maxLength={2000}
							onChange={(e) =>
								setValues((p) => ({ ...p, internalNotes: e.target.value }))
							}
							placeholder="Observações internas (não visível ao cliente)…"
							rows={4}
							value={values.internalNotes}
						/>
					)}
				</LabeledField>
			</div>
		</EntityEditSheet>
	);
}
