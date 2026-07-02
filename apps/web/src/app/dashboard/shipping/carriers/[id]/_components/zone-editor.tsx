"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Separator } from "@emach/ui/components/separator";
import { Spinner } from "@emach/ui/components/spinner";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
	CepRangesEditor,
	type CepRangeValue,
} from "@/app/dashboard/branches/_components/cep-ranges-editor";
import { useLazyTabReload } from "@/components/entity/lazy-tab";
import { FieldError } from "@/components/field-error";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { integerMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import type { ZoneFormValues } from "../../../_components/zone-schema";
import { deleteZone, upsertZone } from "../../../actions";
import type { ZoneWithRates } from "../../../data";
import { RateTableEditor } from "./rate-table-editor";

interface Props {
	canManage: boolean;
	carrierId: string;
	zone: ZoneWithRates | null;
}

function toNumber(v: string | null | undefined): number | null {
	if (v == null) {
		return null;
	}
	const n = Number(v);
	return Number.isNaN(n) ? null : n;
}

interface ZoneHeaderProps {
	canManage: boolean;
	deleteOpen: boolean;
	isDeleting: boolean;
	onDeleteClick: () => void;
	onDeleteConfirm: () => void;
	onDeleteOpenChange: (open: boolean) => void;
	zoneName: string;
}

function ZoneHeader({
	canManage,
	isDeleting,
	deleteOpen,
	onDeleteClick,
	onDeleteConfirm,
	onDeleteOpenChange,
	zoneName,
}: ZoneHeaderProps) {
	return (
		<div className="mb-4 flex items-center justify-between">
			<h3 className="font-semibold text-sm">{zoneName}</h3>
			{canManage && (
				<>
					<Button
						onClick={onDeleteClick}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Trash2 className="size-3.5 text-destructive" />
						<span className="sr-only">Remover zona {zoneName}</span>
					</Button>
					<AlertDialog onOpenChange={onDeleteOpenChange} open={deleteOpen}>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Remover zona <strong>{zoneName}</strong>?
								</AlertDialogTitle>
								<AlertDialogDescription>
									Esta ação remove a zona e todas as faixas de peso vinculadas.
									Não pode ser desfeita.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isDeleting}>
									Cancelar
								</AlertDialogCancel>
								<AlertDialogAction
									disabled={isDeleting}
									onClick={(e) => {
										e.preventDefault();
										onDeleteConfirm();
									}}
								>
									{isDeleting ? (
										<>
											<Spinner /> Removendo…
										</>
									) : (
										"Remover"
									)}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</>
			)}
		</div>
	);
}

export function ZoneEditor({ carrierId, canManage, zone }: Props) {
	const router = useRouter();
	const reloadTab = useLazyTabReload();
	const [expanded, setExpanded] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [isDeleting, startDeleteTransition] = useTransition();
	const { errors, clearErrors } = useFormErrors<ZoneFormValues>();

	const [cepRanges, setCepRanges] = useState<CepRangeValue[]>(
		(zone?.cepRanges ?? []) as CepRangeValue[]
	);
	const [deliveryDays, setDeliveryDays] = useState<number | null>(
		zone?.deliveryDays ?? null
	);
	const [minFreightAmount, setMinFreightAmount] = useState<number | null>(
		toNumber(zone?.minFreightAmount)
	);

	// New zone mode — show "Nova zona" button until expanded
	if (!(zone || expanded)) {
		if (!canManage) {
			return null;
		}
		return (
			<Button
				className="h-auto w-full justify-center border-dashed py-6"
				onClick={() => {
					clearErrors();
					setExpanded(true);
				}}
				type="button"
				variant="outline"
			>
				<Plus className="size-4" /> Nova zona
			</Button>
		);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const values: ZoneFormValues = {
			cepRanges,
			deliveryDays,
			minFreightAmount,
		};
		startTransition(async () => {
			const result = await upsertZone(carrierId, zone?.id ?? null, values);
			if (result.ok) {
				notify.success(zone ? "Zona atualizada" : "Zona criada");
				if (!zone) {
					setExpanded(false);
					setCepRanges([]);
					setDeliveryDays(null);
					setMinFreightAmount(null);
					clearErrors();
				}
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error ?? "Erro ao salvar zona");
			}
		});
	}

	function handleDelete() {
		if (!zone) {
			return;
		}
		startDeleteTransition(async () => {
			const result = await deleteZone(carrierId, zone.id);
			if (result.ok) {
				notify.success("Zona removida");
				setDeleteOpen(false);
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error ?? "Erro ao remover zona");
				setDeleteOpen(false);
			}
		});
	}

	const isNewZone = !zone;
	const disabled = isPending || !canManage;
	const submitLabel = zone ? "Salvar zona" : "Criar zona";

	return (
		<div className="rounded-lg border bg-card p-4">
			{zone ? (
				<ZoneHeader
					canManage={canManage}
					deleteOpen={deleteOpen}
					isDeleting={isDeleting}
					onDeleteClick={() => setDeleteOpen(true)}
					onDeleteConfirm={handleDelete}
					onDeleteOpenChange={setDeleteOpen}
					zoneName={zone.name}
				/>
			) : (
				<h3 className="mb-4 font-semibold text-sm">Nova zona</h3>
			)}

			<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
				<div className="flex flex-col gap-2">
					<span className="font-medium text-sm leading-none">
						Faixas de CEP
					</span>
					<CepRangesEditor
						disabled={disabled}
						onChange={setCepRanges}
						presetOnly
						value={cepRanges}
					/>
					<FieldError>{errors.cepRanges}</FieldError>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<LabeledField
						error={errors.deliveryDays}
						id={`zone-days-${zone?.id ?? "new"}`}
						label="Prazo (dias)"
					>
						{(field) => (
							<MaskedInput
								{...field}
								disabled={disabled}
								mask={integerMask}
								onChange={(v) => setDeliveryDays(v === undefined ? null : v)}
								placeholder="3"
								value={deliveryDays ?? undefined}
							/>
						)}
					</LabeledField>

					<LabeledField
						error={errors.minFreightAmount}
						id={`zone-min-freight-${zone?.id ?? "new"}`}
						label="Frete mínimo (R$)"
					>
						{(field) => (
							<MoneyInput
								aria-invalid={field["aria-invalid"]}
								disabled={disabled}
								id={field.id}
								onChange={(v) => setMinFreightAmount(v)}
								value={minFreightAmount}
							/>
						)}
					</LabeledField>
				</div>

				{canManage && (
					<div className="flex justify-end gap-2">
						{isNewZone && (
							<Button
								disabled={isPending}
								onClick={() => {
									setExpanded(false);
									clearErrors();
								}}
								size="sm"
								type="button"
								variant="ghost"
							>
								Cancelar
							</Button>
						)}
						<Button disabled={isPending} size="sm" type="submit">
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								submitLabel
							)}
						</Button>
					</div>
				)}
			</form>

			{zone && (
				<>
					<Separator className="-mx-4 my-4 w-auto" />
					<RateTableEditor
						canManage={canManage}
						carrierId={carrierId}
						initialRates={zone.rates}
						zoneId={zone.id}
					/>
				</>
			)}
		</div>
	);
}
