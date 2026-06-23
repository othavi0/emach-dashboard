"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { CarrierFormFields } from "../../../_components/carrier-form-fields";
import {
	type CarrierDraft,
	carrierSchema,
} from "../../../_components/carrier-schema";
import { updateCarrier } from "../../../actions";
import type { CarrierDetail } from "../../../data";

interface Props {
	detail: CarrierDetail;
}

function toFormValues(d: CarrierDetail): CarrierDraft {
	return {
		name: d.name,
		cnpj: d.cnpj ?? "",
		active: d.active,
		cubageDivisor: d.cubageDivisor,
		grisPercent: d.grisPercent === null ? null : Number(d.grisPercent),
		grisMinAmount: d.grisMinAmount === null ? null : Number(d.grisMinAmount),
		advaloremPercent:
			d.advaloremPercent === null ? null : Number(d.advaloremPercent),
		icmsPercent: d.icmsPercent === null ? null : Number(d.icmsPercent),
		notes: d.notes ?? "",
	};
}

export function CarrierEditSheet({ detail }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [values, setValues] = useState<CarrierDraft>(() =>
		toFormValues(detail)
	);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<CarrierDraft>();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(toFormValues(detail));
			clearErrors();
		}
	}, [open, detail, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = carrierSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateCarrier(detail.id, parsed.data);
			if (res.ok) {
				notify.success("Transportadora atualizada");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da transportadora"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${detail.name}`}
			widthClassName="data-[side=right]:sm:max-w-2xl"
		>
			<CarrierFormFields
				disabled={submitting}
				errors={errors}
				onPatch={(p) => setValues((prev) => ({ ...prev, ...p }))}
				values={values}
			/>
		</EntityEditSheet>
	);
}
