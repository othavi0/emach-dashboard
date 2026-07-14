"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { updateBox } from "../actions";
import type { ShippingBoxRow } from "../data";
import { BoxFormFields } from "./box-form-fields";
import { type BoxFormValues, boxSchema } from "./box-schema";

interface Props {
	boxes: ShippingBoxRow[];
}

function toFormValues(b: ShippingBoxRow): BoxFormValues {
	return {
		name: b.name,
		internalLengthCm: Number(b.internalLengthCm),
		internalWidthCm: Number(b.internalWidthCm),
		internalHeightCm: Number(b.internalHeightCm),
		maxWeightKg: Number(b.maxWeightKg),
		tareWeightKg: Number(b.tareWeightKg),
		active: b.active,
	};
}

const defaultValues: BoxFormValues = {
	name: "",
	internalLengthCm: 0,
	internalWidthCm: 0,
	internalHeightCm: 0,
	maxWeightKg: 0,
	tareWeightKg: 0,
	active: true,
};

export function BoxEditSheet({ boxes }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const editId = params.get("editBox");
	const box = editId ? boxes.find((b) => b.id === editId) : undefined;
	const open = Boolean(editId && box);

	const [values, setValues] = useState<BoxFormValues>(defaultValues);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BoxFormValues>();
	const [submitting, startTransition] = useTransition();

	// Reset síncrono durante o render (padrão "adjusting state when a prop
	// changes") — sem o re-render extra do reset via effect.
	const [lastReset, setLastReset] = useState({ box, open });
	if (lastReset.open !== open || lastReset.box !== box) {
		setLastReset({ box, open });
		if (open && box) {
			setValues(toFormValues(box));
			clearErrors();
		}
	}

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("editBox");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!editId) {
			return;
		}
		const parsed = boxSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateBox(editId, parsed.data);
			if (res.ok) {
				notify.success("Caixa atualizada");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da embalagem"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={box ? `Editar ${box.name}` : "Editar caixa"}
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
