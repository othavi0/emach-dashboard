"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ZodError } from "zod";

import { createBranch, updateBranch } from "../actions";
import { type BranchFormValues, branchSchema } from "./branch-schema";

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

function zodErrorsToFieldMap(
	error: ZodError<BranchFormValues>
): Partial<Record<keyof BranchFormValues, string>> {
	const map: Partial<Record<keyof BranchFormValues, string>> = {};
	for (const issue of error.issues) {
		const key = issue.path[0] as keyof BranchFormValues | undefined;
		if (key && !map[key]) {
			map[key] = issue.message;
		}
	}
	return map;
}

export function BranchForm({ branchId, defaultValues, mode }: BranchFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState(defaultValues.name ?? "");
	const [address, setAddress] = useState(defaultValues.address ?? "");
	const [errors, setErrors] = useState<
		Partial<Record<keyof BranchFormValues, string>>
	>({});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const parsed = branchSchema.safeParse({ name, address });
		if (!parsed.success) {
			setErrors(zodErrorsToFieldMap(parsed.error));
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
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
					Informações básicas
				</h2>

				<div className="flex flex-col gap-2">
					<Label htmlFor="branch-name">Nome</Label>
					<Input
						disabled={isPending}
						id="branch-name"
						onChange={(event) => setName(event.target.value)}
						placeholder="Ex: Filial Centro"
						value={name}
					/>
					{errors.name && (
						<p className="text-destructive text-sm">{errors.name}</p>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="branch-address">Endereço (opcional)</Label>
					<Textarea
						disabled={isPending}
						id="branch-address"
						onChange={(event) => setAddress(event.target.value)}
						placeholder="Rua, número, bairro, cidade — UF"
						rows={3}
						value={address}
					/>
					{errors.address && (
						<p className="text-destructive text-sm">{errors.address}</p>
					)}
				</div>
			</section>

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
