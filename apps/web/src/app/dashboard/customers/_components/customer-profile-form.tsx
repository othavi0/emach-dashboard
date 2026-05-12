"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorPanel, type FormIssue } from "@/components/form-error-panel";
import { formatDocument } from "@/lib/cpf-cnpj";
import { updateCustomerProfile } from "../actions";
import type { CustomerDetail } from "../data";

interface CustomerProfileFormProps {
	canEdit: boolean;
	customer: CustomerDetail;
	editMode: boolean;
}

const STATUS_LABELS: Record<string, string> = {
	active: "Ativo",
	inactive: "Inativo",
	blocked: "Bloqueado",
};

const TYPE_LABELS: Record<string, string> = {
	b2c: "Pessoa Física (B2C)",
	b2b: "Pessoa Jurídica (B2B)",
};

export function CustomerProfileForm({
	customer,
	editMode,
	canEdit,
}: CustomerProfileFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [issues, setIssues] = useState<FormIssue[]>([]);

	const [name, setName] = useState(customer.name);
	const [email, setEmail] = useState(customer.email);
	const [phone, setPhone] = useState(customer.phone ?? "");
	const [status, setStatus] = useState(customer.status);
	const [clientType, setClientType] = useState<string>(
		customer.clientType ?? ""
	);
	const [internalNotes, setInternalNotes] = useState(
		customer.internalNotes ?? ""
	);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIssues([]);

		startTransition(async () => {
			const result = await updateCustomerProfile({
				clientId: customer.id,
				name: name.trim(),
				email: email.trim(),
				phone: phone.trim() || null,
				internalNotes: internalNotes.trim() || null,
				status,
				clientType: (clientType as "b2c" | "b2b") || null,
			});

			if (result.ok) {
				toast.success("Perfil atualizado com sucesso");
				router.push(`/dashboard/customers/${customer.id}?tab=perfil`);
				router.refresh();
			} else {
				toast.error(result.error);
				setIssues([{ path: "Formulário", message: result.error }]);
			}
		});
	}

	if (!editMode) {
		return (
			<dl className="grid gap-4 text-sm sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Nome
					</dt>
					<dd>{customer.name}</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Email
					</dt>
					<dd>{customer.email}</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Telefone
					</dt>
					<dd>{customer.phone ?? "—"}</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Documento
					</dt>
					<dd className="font-mono">
						{customer.document ? formatDocument(customer.document) : "—"}
					</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Status
					</dt>
					<dd>{STATUS_LABELS[customer.status] ?? customer.status}</dd>
				</div>
				<div className="flex flex-col gap-1">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Tipo
					</dt>
					<dd>
						{customer.clientType
							? (TYPE_LABELS[customer.clientType] ?? customer.clientType)
							: "—"}
					</dd>
				</div>
				<div className="flex flex-col gap-1 sm:col-span-2">
					<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Notas internas
					</dt>
					<dd className="whitespace-pre-wrap">
						{customer.internalNotes ?? "—"}
					</dd>
				</div>

				{canEdit && (
					<div className="sm:col-span-2">
						<Link
							className="text-primary text-sm underline underline-offset-4"
							href={`/dashboard/customers/${customer.id}?tab=perfil&edit=1`}
						>
							Editar perfil
						</Link>
					</div>
				)}
			</dl>
		);
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			{issues.length > 0 && <FormErrorPanel issues={issues} />}

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-name">
						Nome *
					</label>
					<Input
						id="profile-name"
						onChange={(e) => setName(e.target.value)}
						required
						value={name}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-email">
						Email *
					</label>
					<Input
						id="profile-email"
						onChange={(e) => setEmail(e.target.value)}
						required
						type="email"
						value={email}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-phone">
						Telefone
					</label>
					<Input
						id="profile-phone"
						onChange={(e) => setPhone(e.target.value)}
						placeholder="+55 11 9 9999-9999"
						value={phone}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-document">
						Documento
					</label>
					<Input
						disabled
						id="profile-document"
						readOnly
						value={
							customer.document
								? formatDocument(customer.document)
								: "Não informado"
						}
					/>
					<p className="text-muted-foreground text-xs">
						Documento não pode ser editado pelo admin.
					</p>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-status">
						Status *
					</label>
					<Select
						onValueChange={(v) => {
							if (v !== null) {
								setStatus(v as typeof status);
							}
						}}
						value={status}
					>
						<SelectTrigger id="profile-status">
							<SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="active">Ativo</SelectItem>
								<SelectItem value="inactive">Inativo</SelectItem>
								<SelectItem value="blocked">Bloqueado</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="profile-type">
						Tipo de cliente
					</label>
					<Select
						onValueChange={(v) =>
							setClientType(v === "__none__" || v === null ? "" : v)
						}
						value={clientType || "__none__"}
					>
						<SelectTrigger id="profile-type">
							<SelectValue>
								{(v: string) =>
									v === "__none__" ? "Não definido" : (TYPE_LABELS[v] ?? v)
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="__none__">Não definido</SelectItem>
								<SelectItem value="b2c">Pessoa Física (B2C)</SelectItem>
								<SelectItem value="b2b">Pessoa Jurídica (B2B)</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<label className="font-medium text-sm" htmlFor="profile-notes">
						Notas internas
					</label>
					<Textarea
						id="profile-notes"
						maxLength={2000}
						onChange={(e) => setInternalNotes(e.target.value)}
						placeholder="Observações internas sobre o cliente (não visível ao cliente)..."
						rows={4}
						value={internalNotes}
					/>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					{isPending ? "Salvando…" : "Salvar alterações"}
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href={`/dashboard/customers/${customer.id}?tab=perfil`}
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
