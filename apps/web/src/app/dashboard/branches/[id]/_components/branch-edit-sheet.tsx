"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { BranchFormFields } from "../../_components/branch-form-fields";
import {
	type BranchFormValues,
	branchSchema,
} from "../../_components/branch-schema";
import { DeleteBranchDialog } from "../../_components/delete-branch-dialog";
import { updateBranch } from "../../actions";
import type { BranchDetail } from "../../data";

interface Props {
	branch: BranchDetail;
}

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	status: "Status",
	phone: "Telefone",
	cep: "CEP",
	street: "Rua",
	streetNumber: "Número",
	complement: "Complemento",
	neighborhood: "Bairro",
	city: "Cidade",
	state: "UF",
	responsibleUserId: "Responsável",
};

function toFormValues(b: BranchDetail): BranchFormValues {
	return {
		name: b.name,
		status: b.status,
		phone: b.phone ?? undefined,
		cep: b.cep ?? undefined,
		street: b.street ?? undefined,
		streetNumber: b.streetNumber ?? undefined,
		complement: b.complement ?? undefined,
		neighborhood: b.neighborhood ?? undefined,
		city: b.city ?? undefined,
		state: b.state ?? undefined,
		responsibleUserId: b.responsibleUserId ?? undefined,
	};
}

export function BranchEditSheet({ branch }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [values, setValues] = useState<BranchFormValues>(() =>
		toFormValues(branch)
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(toFormValues(branch));
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
		const parsed = branchSchema.safeParse(values);
		if (!parsed.success) {
			setIssues(zodIssuesToFormIssues(parsed.error, FIELD_LABELS));
			return;
		}
		startTransition(async () => {
			const res = await updateBranch(branch.id, parsed.data);
			if (res.ok) {
				toast.success("Filial atualizada");
				close();
				router.refresh();
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
			<BranchFormFields
				branchId={branch.id}
				disabled={submitting}
				onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
				showTeamSection
				values={values}
			/>
			<div className="mt-8 border-border border-t pt-6">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className="font-medium text-destructive text-sm">
							Zona destrutiva
						</h3>
						<p className="mt-1 text-muted-foreground text-xs">
							Remove a filial. Estoque positivo e pedidos abertos bloqueiam a
							exclusão.
						</p>
					</div>
					<DeleteBranchDialog branchId={branch.id} branchName={branch.name} />
				</div>
			</div>
		</EntityEditSheet>
	);
}
