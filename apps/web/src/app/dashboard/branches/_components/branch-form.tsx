"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { createBranch, updateBranch } from "../actions";
import { BranchFormFields } from "./branch-form-fields";
import {
	type BranchFormValues,
	branchSchema,
	defaultBusinessHours,
} from "./branch-schema";

const FIELD_LABELS: Record<string, string> = {
	name: "Nome",
	status: "Status",
	phone: "Telefone",
	businessHours: "Horário de funcionamento",
	cep: "CEP",
	street: "Rua",
	streetNumber: "Número",
	complement: "Complemento",
	neighborhood: "Bairro",
	city: "Cidade",
	state: "UF",
	cepRanges: "Faixas de CEP",
};

interface BranchFormProps {
	branchId?: string;
	defaultValues: Partial<BranchFormValues>;
	mode: "create" | "edit";
}

function SubmitLabel({
	isPending,
	mode,
}: {
	isPending: boolean;
	mode: "create" | "edit";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return <>{mode === "create" ? "Criar filial" : "Salvar alterações"}</>;
}

function buildInitial(d: Partial<BranchFormValues>): BranchFormValues {
	return {
		name: d.name ?? "",
		status: d.status ?? "active",
		phone: d.phone,
		businessHours: d.businessHours ?? defaultBusinessHours,
		cep: d.cep,
		street: d.street,
		streetNumber: d.streetNumber,
		complement: d.complement,
		neighborhood: d.neighborhood,
		city: d.city,
		state: d.state,
		responsibleUserId: d.responsibleUserId,
		cepRanges: d.cepRanges ?? [],
	};
}

export function BranchForm({ branchId, defaultValues, mode }: BranchFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<BranchFormValues>(() =>
		buildInitial(defaultValues)
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIssues([]);

		const parsed = branchSchema.safeParse(values);
		if (!parsed.success) {
			const next = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setIssues(next);
			toast.error(
				`${next.length} ${next.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			const action =
				mode === "create"
					? createBranch(parsed.data)
					: updateBranch(branchId ?? "", parsed.data);
			const result = await action;

			if (result.ok) {
				toast.success(
					mode === "create" ? "Filial criada" : "Filial atualizada"
				);
				router.push("/dashboard/branches");
				router.refresh();
			} else {
				toast.error(result.error || "Não foi possível salvar a filial");
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-2xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<FormErrorPanel issues={issues} />
			<div className="rounded-md border border-border bg-card p-6">
				<BranchFormFields
					branchId={branchId}
					disabled={isPending}
					onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
					showTeamSection={mode === "edit"}
					values={values}
				/>
			</div>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/branches"
				>
					Cancelar
				</Link>
			</div>
		</form>
	);
}
