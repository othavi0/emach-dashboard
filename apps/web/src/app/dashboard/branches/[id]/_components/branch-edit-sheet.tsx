"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { branchSchema } from "../../_components/branch-schema";
import { updateBranch } from "../../actions";
import type { BranchDetail } from "../../data";

interface Props {
	branch: BranchDetail;
}

export function BranchEditSheet({ branch }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(branch.name);
	const [address, setAddress] = useState(branch.address ?? "");
	const [phone, setPhone] = useState(branch.phone ?? "");
	const [responsibleUserId, setResponsibleUserId] = useState(
		branch.responsibleUserId ?? ""
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(branch.name);
			setAddress(branch.address ?? "");
			setPhone(branch.phone ?? "");
			setResponsibleUserId(branch.responsibleUserId ?? "");
			setIssues([]);
		}
	}, [open, branch]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = branchSchema.safeParse({
			name,
			address,
			phone,
			responsibleUserId,
		});
		if (!parsed.success) {
			setIssues(
				zodIssuesToFormIssues(parsed.error, {
					name: "Nome",
					address: "Endereço",
					phone: "Telefone",
					responsibleUserId: "Responsável",
				})
			);
			return;
		}
		startTransition(async () => {
			const res = await updateBranch(branch.id, parsed.data);
			if (res.ok) {
				toast.success("Filial atualizada");
				close();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da filial"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${branch.name}`}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-name">Nome</Label>
					<Input
						id="branch-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-address">Endereço</Label>
					<Input
						id="branch-address"
						onChange={(e) => setAddress(e.target.value)}
						placeholder="Rua, número, cidade…"
						value={address}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-phone">Telefone</Label>
					<Input
						id="branch-phone"
						onChange={(e) => setPhone(e.target.value)}
						placeholder="(00) 00000-0000"
						value={phone}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="branch-responsible">ID do responsável</Label>
					<Input
						id="branch-responsible"
						onChange={(e) => setResponsibleUserId(e.target.value)}
						placeholder="UUID do usuário responsável"
						value={responsibleUserId}
					/>
				</div>
			</div>
		</EntityEditSheet>
	);
}
