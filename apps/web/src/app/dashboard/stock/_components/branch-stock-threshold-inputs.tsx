"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateStockThresholds } from "../actions";

interface BranchStockThresholdInputsProps {
	branchId: string;
	initialMinQty: number;
	initialReorderPoint: number;
	variantId: string;
}

export function BranchStockThresholdInputs({
	branchId,
	initialMinQty,
	initialReorderPoint,
	variantId,
}: BranchStockThresholdInputsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const [minQty, setMinQty] = useState(initialMinQty);
	const [reorderPoint, setReorderPoint] = useState(initialReorderPoint);

	const validationError =
		reorderPoint < minQty ? "Reposição deve ser ≥ mínimo" : null;

	const isDirty =
		minQty !== initialMinQty || reorderPoint !== initialReorderPoint;

	function handleSave() {
		if (validationError) {
			return;
		}

		startTransition(async () => {
			const result = await updateStockThresholds({
				variantId,
				branchId,
				minQty,
				reorderPoint,
			});

			if (result.ok) {
				toast.success("Limiares atualizados");
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<Input
					aria-label="Quantidade mínima"
					className="h-7 w-20 text-right text-sm"
					disabled={isPending}
					min={0}
					onChange={(e) => setMinQty(Number.parseInt(e.target.value, 10) || 0)}
					type="number"
					value={minQty}
				/>
				<Input
					aria-label="Ponto de reposição"
					className="h-7 w-20 text-right text-sm"
					disabled={isPending}
					min={0}
					onChange={(e) =>
						setReorderPoint(Number.parseInt(e.target.value, 10) || 0)
					}
					type="number"
					value={reorderPoint}
				/>
				{isDirty && (
					<Button
						disabled={!!validationError || isPending}
						onClick={handleSave}
						size="sm"
						variant="outline"
					>
						{isPending ? <Spinner /> : "Salvar"}
					</Button>
				)}
			</div>
			{validationError && (
				<p className="text-destructive text-xs">{validationError}</p>
			)}
		</div>
	);
}
