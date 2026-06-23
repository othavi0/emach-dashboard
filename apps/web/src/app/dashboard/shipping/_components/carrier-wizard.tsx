"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { focusFirstError } from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { createCarrierWithZones } from "../actions";
import { CarrierFormFields } from "./carrier-form-fields";
import {
	type CreateCarrierDraft,
	createCarrierSchema,
	EMPTY_CARRIER_DRAFT,
} from "./carrier-schema";
import {
	CARRIER_STEP_FIELDS,
	CARRIER_STEPS,
	type CarrierStepId,
	EMPTY_ZONE,
} from "./carrier-wizard-steps";
import { ZoneFieldset } from "./zone-fieldset";

const INITIAL_ZONE = {
	...EMPTY_ZONE,
	cepRanges: [] as CreateCarrierDraft["zones"][number]["cepRanges"],
	rates: [
		{
			weightFromKg: null,
			weightToKg: null,
			baseAmount: null,
			perKgAmount: 0,
		},
	],
} satisfies CreateCarrierDraft["zones"][number];

const INITIAL: CreateCarrierDraft = {
	...EMPTY_CARRIER_DRAFT,
	zones: [INITIAL_ZONE],
};

export function CarrierWizard() {
	const router = useRouter();
	const [active, setActive] = useState<CarrierStepId>("dados");
	const [values, setValues] = useState<CreateCarrierDraft>(INITIAL);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<CreateCarrierDraft>();
	const [submitting, startTransition] = useTransition();

	const patch = (next: Partial<CreateCarrierDraft>) =>
		setValues((prev) => ({ ...prev, ...next }));

	const setZone = (index: number, zone: CreateCarrierDraft["zones"][number]) =>
		setValues((prev) => ({
			...prev,
			zones: prev.zones.map((z, i) => (i === index ? zone : z)),
		}));

	const addZone = () =>
		setValues((prev) => ({
			...prev,
			zones: [
				...prev.zones,
				{
					...EMPTY_ZONE,
					cepRanges: [] as CreateCarrierDraft["zones"][number]["cepRanges"],
					rates: [
						{
							weightFromKg: null,
							weightToKg: null,
							baseAmount: null,
							perKgAmount: 0,
						},
					],
				},
			],
		}));

	const removeZone = (index: number) =>
		setValues((prev) => ({
			...prev,
			zones: prev.zones.filter((_, i) => i !== index),
		}));

	const submit = () => {
		clearErrors();
		const parsed = createCarrierSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			const keys = parsed.error.issues.map((i) => String(i.path[0]));
			const failing = CARRIER_STEPS.find((s) =>
				(CARRIER_STEP_FIELDS[s.id] as string[]).some((f) => keys.includes(f))
			);
			if (failing) {
				setActive(failing.id);
			}
			// Double-rAF: cobre o commit do novo passo antes de focar
			focusFirstError();
			return;
		}
		startTransition(async () => {
			const res = await createCarrierWithZones(parsed.data);
			if (res.ok) {
				notify.success("Transportadora criada");
				router.push(`/dashboard/shipping/carriers/${res.data.id}`);
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<div className="flex flex-col gap-6">
			<ol
				aria-label="Etapas"
				className="flex gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60"
			>
				{CARRIER_STEPS.map((s) => (
					<li key={s.id}>
						<button
							aria-current={s.id === active ? "step" : undefined}
							className={
								s.id === active
									? "rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
									: "rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
							}
							onClick={() => setActive(s.id)}
							type="button"
						>
							{s.label}
						</button>
					</li>
				))}
			</ol>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				{active === "dados" ? (
					<CarrierFormFields
						disabled={submitting}
						errors={errors}
						onPatch={patch}
						values={values}
					/>
				) : (
					<div className="flex flex-col gap-4">
						{values.zones.map((zone, index) => (
							// Inputs controlados sem id estável até o submit; index é a key (exceção do CLAUDE.md — NÃO usar biome-ignore noArrayIndexKey)
							<ZoneFieldset
								disabled={submitting}
								index={index}
								key={index}
								onChange={(z) => setZone(index, z)}
								onRemove={
									values.zones.length > 1 ? () => removeZone(index) : undefined
								}
								value={zone}
							/>
						))}
						{typeof errors.zones === "string" ? (
							<FieldError>{errors.zones}</FieldError>
						) : null}
						<Button onClick={addZone} type="button" variant="outline">
							+ Nova zona
						</Button>
					</div>
				)}
			</section>

			<div className="flex items-center justify-between">
				<Button
					disabled={active === "dados"}
					onClick={() => setActive("dados")}
					type="button"
					variant="ghost"
				>
					‹ Voltar
				</Button>
				{active === "dados" ? (
					<Button onClick={() => setActive("zonas")} type="button">
						Próximo ›
					</Button>
				) : (
					<Button disabled={submitting} onClick={submit} type="button">
						{submitting ? (
							<>
								<Spinner /> Criando…
							</>
						) : (
							"Criar transportadora"
						)}
					</Button>
				)}
			</div>
		</div>
	);
}
