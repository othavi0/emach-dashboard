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
import { Spinner } from "@emach/ui/components/spinner";
import { Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import { deleteBox, updateBox } from "../actions";
import type { ShippingBoxRow } from "../data";
import { BoxFormFields } from "./box-form-fields";
import { type BoxFormState, type BoxFormValues, boxSchema } from "./box-schema";

interface Props {
	boxes: ShippingBoxRow[];
}

function toFormValues(b: ShippingBoxRow): BoxFormState {
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

const defaultValues: BoxFormState = {
	name: "",
	active: true,
};

export function BoxEditSheet({ boxes }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const editId = params.get("editBox");
	const box = editId ? boxes.find((b) => b.id === editId) : undefined;
	const open = Boolean(editId && box);

	// Lazy init: em deep-link (?editBox= no primeiro render) o sheet já nasce
	// aberto e o reset síncrono abaixo não dispara — inicializar do box.
	const [values, setValues] = useState<BoxFormState>(() =>
		open && box ? toFormValues(box) : defaultValues
	);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BoxFormValues>();
	const [submitting, startTransition] = useTransition();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, startDeleteTransition] = useTransition();

	// Reset síncrono durante o render (padrão "adjusting state when a prop
	// changes") — sem o re-render extra do reset via effect.
	const [lastReset, setLastReset] = useState({ box, open });
	if (lastReset.open !== open || lastReset.box !== box) {
		setLastReset({ box, open });
		if (open && box) {
			setValues(toFormValues(box));
			clearErrors();
			setConfirmDelete(false);
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

	const handleDelete = () => {
		if (!editId) {
			return;
		}
		startDeleteTransition(async () => {
			const res = await deleteBox(editId);
			if (res.ok) {
				notify.success("Caixa excluída");
				setConfirmDelete(false);
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<>
			<EntityEditSheet
				description="Atualize os dados da embalagem"
				footerStart={
					<Button
						className="text-destructive"
						disabled={submitting || deleting}
						onClick={() => setConfirmDelete(true)}
						type="button"
						variant="outline"
					>
						<Trash2 aria-hidden className="size-3.5" />
						Excluir caixa
					</Button>
				}
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
			<AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir caixa?</AlertDialogTitle>
						<AlertDialogDescription>
							A caixa <strong>{box?.name}</strong> será removida do catálogo de
							envio permanentemente. Produtos que só cabiam nela passam a sair
							como "Frete a combinar" na loja. Esta ação não pode ser desfeita.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleting}
							onClick={(e) => {
								e.preventDefault();
								handleDelete();
							}}
						>
							{deleting ? (
								<>
									<Spinner /> Excluindo…
								</>
							) : (
								"Excluir"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
