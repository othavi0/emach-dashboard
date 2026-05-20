"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { supplierSchema } from "../../_components/supplier-schema";
import { updateSupplier } from "../../actions";
import type { SupplierDetail } from "../../data";

interface Props {
	supplier: SupplierDetail;
}

export function SupplierEditSheet({ supplier }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(supplier.name);
	const [contactEmail, setContactEmail] = useState(supplier.contactEmail ?? "");
	const [phone, setPhone] = useState(supplier.phone ?? "");
	const [website, setWebsite] = useState(supplier.website ?? "");
	const [cnpj, setCnpj] = useState(supplier.cnpj ?? "");
	const [notes, setNotes] = useState(supplier.notes ?? "");
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(supplier.name);
			setContactEmail(supplier.contactEmail ?? "");
			setPhone(supplier.phone ?? "");
			setWebsite(supplier.website ?? "");
			setCnpj(supplier.cnpj ?? "");
			setNotes(supplier.notes ?? "");
			setIssues([]);
		}
	}, [open, supplier]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = supplierSchema.safeParse({
			name,
			contactEmail,
			phone,
			website,
			cnpj,
			notes,
		});
		if (!parsed.success) {
			setIssues(
				zodIssuesToFormIssues(parsed.error, {
					name: "Nome",
					contactEmail: "E-mail",
					phone: "Telefone",
					website: "Website",
					cnpj: "CNPJ",
					notes: "Observações",
				})
			);
			return;
		}
		startTransition(async () => {
			const res = await updateSupplier(supplier.id, parsed.data);
			if (res.ok) {
				toast.success("Fornecedor atualizado");
				close();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados do fornecedor"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${supplier.name}`}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-name">Nome</Label>
					<Input
						id="supplier-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-email">E-mail</Label>
					<Input
						id="supplier-email"
						onChange={(e) => setContactEmail(e.target.value)}
						placeholder="contato@fornecedor.com"
						type="email"
						value={contactEmail}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-phone">Telefone</Label>
					<Input
						id="supplier-phone"
						onChange={(e) => setPhone(e.target.value)}
						placeholder="(00) 00000-0000"
						value={phone}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-website">Website</Label>
					<Input
						id="supplier-website"
						onChange={(e) => setWebsite(e.target.value)}
						placeholder="https://..."
						type="url"
						value={website}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-cnpj">CNPJ</Label>
					<Input
						id="supplier-cnpj"
						onChange={(e) => setCnpj(e.target.value)}
						value={cnpj}
					/>
					<p className="text-muted-foreground text-xs">
						Formato: 00.000.000/0000-00 (só dígitos são salvos)
					</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="supplier-notes">Observações</Label>
					<Textarea
						id="supplier-notes"
						onChange={(e) => setNotes(e.target.value)}
						rows={4}
						value={notes}
					/>
					<p className="text-muted-foreground text-xs">Markdown suportado</p>
				</div>
			</div>
		</EntityEditSheet>
	);
}
