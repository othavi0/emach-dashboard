"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VOLTAGE_OPTIONS } from "../../_components/tool-schema";
import { setDefaultToolVariant, updateToolVariant } from "../../actions";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	canMutate: boolean;
	toolId: string;
	variants: ToolDetailVariant[];
}

interface RowState {
	costAmount: string;
	priceAmount: string;
	sku: string;
	voltage: string | null;
}

function makeRowState(v: ToolDetailVariant): RowState {
	return {
		sku: v.sku,
		voltage: v.voltage,
		priceAmount: v.priceAmount,
		costAmount: v.costAmount ?? "",
	};
}

function isDirty(initial: RowState, current: RowState): boolean {
	return (
		initial.sku !== current.sku ||
		initial.voltage !== current.voltage ||
		initial.priceAmount !== current.priceAmount ||
		initial.costAmount !== current.costAmount
	);
}

export function VariantsTab({ variants, toolId, canMutate }: VariantsTabProps) {
	if (variants.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhuma variante cadastrada.
			</p>
		);
	}

	if (!canMutate) {
		return <VariantsReadOnly variants={variants} />;
	}

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead className="text-right">Preço (R$)</TableHead>
							<TableHead className="text-right">Custo (R$)</TableHead>
							<TableHead className="text-center">Padrão</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map((v) => (
							<EditableRow key={v.id} toolId={toolId} variant={v} />
						))}
					</TableBody>
				</Table>

				<div className="flex justify-end">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button disabled size="sm" variant="outline">
									+ Variante
								</Button>
							}
						/>
						<TooltipContent>
							Use "Editar" no header para adicionar/remover variantes.
						</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</TooltipProvider>
	);
}

interface EditableRowProps {
	toolId: string;
	variant: ToolDetailVariant;
}

function EditableRow({ variant, toolId }: EditableRowProps) {
	const initial = makeRowState(variant);
	const [state, setState] = useState<RowState>(initial);
	const [savedTick, setSavedTick] = useState(false);
	const [pending, startTransition] = useTransition();
	const [defaultPending, startDefaultTransition] = useTransition();
	const dirty = isDirty(initial, state);

	function handleSave() {
		startTransition(async () => {
			const result = await updateToolVariant({
				variantId: variant.id,
				sku: state.sku === initial.sku ? undefined : state.sku,
				voltage:
					state.voltage === initial.voltage
						? undefined
						: (state.voltage as (typeof VOLTAGE_OPTIONS)[number] | null),
				priceAmount:
					state.priceAmount === initial.priceAmount
						? undefined
						: state.priceAmount,
				costAmount:
					state.costAmount === initial.costAmount
						? undefined
						: state.costAmount === ""
							? null
							: state.costAmount,
			});
			if (result.ok) {
				toast.success("Variante atualizada");
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1800);
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleSetDefault() {
		if (variant.isDefault) {
			return;
		}
		startDefaultTransition(async () => {
			const result = await setDefaultToolVariant({
				toolId,
				variantId: variant.id,
			});
			if (result.ok) {
				toast.success("Variante padrão atualizada");
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<TableRow>
			<TableCell>
				<Input
					className="h-8 font-mono text-xs"
					onChange={(e) => setState({ ...state, sku: e.target.value })}
					value={state.sku}
				/>
			</TableCell>
			<TableCell>
				<Select
					onValueChange={(value) =>
						setState({ ...state, voltage: value === "_none_" ? null : value })
					}
					value={state.voltage ?? "_none_"}
				>
					<SelectTrigger className="h-8 w-[120px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="_none_">—</SelectItem>
						{VOLTAGE_OPTIONS.map((v) => (
							<SelectItem key={v} value={v}>
								{v}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</TableCell>
			<TableCell className="text-right">
				<Input
					className="h-8 text-right tabular-nums"
					inputMode="decimal"
					onChange={(e) => setState({ ...state, priceAmount: e.target.value })}
					placeholder="0.00"
					value={state.priceAmount}
				/>
			</TableCell>
			<TableCell className="text-right">
				<Input
					className="h-8 text-right tabular-nums"
					inputMode="decimal"
					onChange={(e) => setState({ ...state, costAmount: e.target.value })}
					placeholder="0.00"
					value={state.costAmount}
				/>
			</TableCell>
			<TableCell className="text-center">
				<input
					checked={variant.isDefault}
					className="size-4 accent-primary"
					disabled={defaultPending}
					name={`default-${toolId}`}
					onChange={handleSetDefault}
					type="radio"
				/>
			</TableCell>
			<TableCell className="text-right">
				{dirty ? (
					<Button disabled={pending} onClick={handleSave} size="sm">
						{pending ? "Salvando…" : "Salvar"}
					</Button>
				) : savedTick ? (
					<span className="inline-flex items-center gap-1 text-success text-xs">
						<CheckCircle2 className="size-3.5" /> Salvo
					</span>
				) : null}
			</TableCell>
		</TableRow>
	);
}

function VariantsReadOnly({ variants }: { variants: ToolDetailVariant[] }) {
	const PRICE = new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
	const fmt = (v: string | null) =>
		v === null ? "—" : PRICE.format(Number(v));

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>SKU</TableHead>
					<TableHead>Voltagem</TableHead>
					<TableHead className="text-right">Preço</TableHead>
					<TableHead className="text-right">Custo</TableHead>
					<TableHead className="text-center">Padrão</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{variants.map((v) => (
					<TableRow key={v.id}>
						<TableCell className="font-mono text-xs">{v.sku}</TableCell>
						<TableCell>{v.voltage ?? "—"}</TableCell>
						<TableCell className="text-right tabular-nums">
							{fmt(v.priceAmount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{fmt(v.costAmount)}
						</TableCell>
						<TableCell className="text-center">
							{v.isDefault ? "●" : "—"}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
