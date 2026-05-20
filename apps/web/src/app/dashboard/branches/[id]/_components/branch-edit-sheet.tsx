"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Switch } from "@emach/ui/components/switch";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { branchSchema } from "../../_components/branch-schema";
import { setDefaultBranch, updateBranch } from "../../actions";
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
	const [isDefault, setIsDefault] = useState(branch.isDefault);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(branch.name);
			setAddress(branch.address ?? "");
			setPhone(branch.phone ?? "");
			setResponsibleUserId(branch.responsibleUserId ?? "");
			setIsDefault(branch.isDefault);
			setIssues([]);
		}
	}, [open, branch]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleDefaultToggle = (checked: boolean) => {
		if (!checked || branch.isDefault) {
			return;
		}
		setIsDefault(true);
		startTransition(async () => {
			const res = await setDefaultBranch(branch.id);
			if (res.ok) {
				toast.success("Filial padrão atualizada");
			} else {
				setIsDefault(false);
				toast.error(res.error);
			}
		});
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
				<div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">Filial padrão</span>
						<span className="text-muted-foreground text-xs">
							{branch.isDefault
								? "Esta já é a filial padrão"
								: "Tornar esta filial a padrão do sistema"}
						</span>
					</div>
					<Switch
						checked={isDefault}
						disabled={branch.isDefault || submitting}
						onCheckedChange={handleDefaultToggle}
					/>
				</div>
			</div>
		</EntityEditSheet>
	);
}
