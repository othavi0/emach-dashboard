"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { createCarrier } from "../actions";
import { CarrierFormFields } from "./carrier-form-fields";
import {
	type CarrierDraft,
	carrierSchema,
	EMPTY_CARRIER_DRAFT,
} from "./carrier-schema";

export function CarrierCreateSheet() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("newCarrier") === "1";

	const [values, setValues] = useState<CarrierDraft>(EMPTY_CARRIER_DRAFT);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<CarrierDraft>();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setValues(EMPTY_CARRIER_DRAFT);
			clearErrors();
		}
	}, [open, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("newCarrier");
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
			const res = await createCarrier(parsed.data);
			if (res.ok) {
				notify.success("Transportadora criada");
				router.push(`/dashboard/shipping/carriers/${res.data.id}`);
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Preencha os dados da transportadora"
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitLabel="Criar transportadora"
			submitting={submitting}
			title="Nova transportadora"
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
