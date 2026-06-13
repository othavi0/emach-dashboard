"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	errorToastMessage,
	focusFirstError,
	zodIssuesToFieldErrors,
} from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { BranchFormFields } from "../../_components/branch-form-fields";
import {
	type BranchFormValues,
	branchSchema,
	defaultBusinessHours,
} from "../../_components/branch-schema";
import { updateBranch } from "../../actions";
import type { BranchDetail } from "../../data";

interface Props {
	branch: BranchDetail;
}

function toFormValues(b: BranchDetail): BranchFormValues {
	return {
		name: b.name,
		status: b.status,
		phone: b.phone ?? undefined,
		businessHours: b.businessHours ?? defaultBusinessHours,
		cep: b.cep ?? undefined,
		street: b.street ?? undefined,
		streetNumber: b.streetNumber ?? undefined,
		complement: b.complement ?? undefined,
		neighborhood: b.neighborhood ?? undefined,
		city: b.city ?? undefined,
		state: b.state ?? undefined,
		responsibleUserId: b.responsibleUserId ?? undefined,
		cepRanges: b.cepRanges ?? [],
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
	const [errors, setErrors] = useState<
		Partial<Record<keyof BranchFormValues, string>>
	>({});
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(toFormValues(branch));
			setErrors({});
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
			setErrors(zodIssuesToFieldErrors<BranchFormValues>(parsed.error));
			notify.error(errorToastMessage(parsed.error.issues.length));
			focusFirstError();
			return;
		}
		startTransition(async () => {
			const res = await updateBranch(branch.id, parsed.data);
			if (res.ok) {
				notify.success("Filial atualizada");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da filial"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${branch.name}`}
			widthClassName="data-[side=right]:sm:max-w-2xl"
		>
			<BranchFormFields
				branchId={branch.id}
				disabled={submitting}
				errors={errors}
				onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
				showTeamSection
				values={values}
			/>
		</EntityEditSheet>
	);
}
