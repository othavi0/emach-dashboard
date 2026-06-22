"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { createBox } from "../actions";
import { BoxFormFields } from "./box-form-fields";
import { type BoxFormValues, boxSchema } from "./box-schema";

const defaultValues: BoxFormValues = {
	name: "",
	internalLengthCm: 0,
	internalWidthCm: 0,
	internalHeightCm: 0,
	maxWeightKg: 0,
	tareWeightKg: 0,
	active: true,
};

export function BoxCreateSheet() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("newBox") === "1";

	const [values, setValues] = useState<BoxFormValues>(defaultValues);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BoxFormValues>();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(defaultValues);
			clearErrors();
		}
	}, [open, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("newBox");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = boxSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await createBox(parsed.data);
			if (res.ok) {
				notify.success("Caixa criada");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Preencha as dimensões internas da embalagem"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitLabel="Criar caixa"
			submitting={submitting}
			title="Nova caixa"
		>
			<BoxFormFields
				disabled={submitting}
				errors={errors}
				onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
				values={values}
			/>
		</EntityEditSheet>
	);
}
