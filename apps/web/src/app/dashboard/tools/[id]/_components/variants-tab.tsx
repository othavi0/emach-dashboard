"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Switch } from "@emach/ui/components/switch";
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
import { CheckCircle2, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import { DeleteToolDialog } from "../../_components/delete-tool-dialog";
import { DeleteVariantDialog } from "../../_components/delete-variant-dialog";
import { VOLTAGE_OPTIONS } from "../../_components/tool-schema";
import {
	setDefaultToolVariant,
	setVariantVisibility,
	updateToolVariant,
} from "../../actions";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	canDelete: boolean;
	canMutate: boolean;
	orderedVariantIds: string[];
	toolId: string;
	toolName: string;
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

export function VariantsTab({
	variants,
	toolId,
	toolName,
	canMutate,
	canDelete,
	orderedVariantIds,
}: VariantsTabProps) {
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

	const orderedSet = new Set(orderedVariantIds);
	const toolHasOrders = orderedVariantIds.length > 0;

	return (
		<TooltipProvider delay={200}>
			<div className="flex flex-col gap-6">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>SKU</TableHead>
							<TableHead>Voltagem</TableHead>
							<TableHead className="text-right">Preço (R$)</TableHead>
							<TableHead className="text-right">Custo (R$)</TableHead>
							<TableHead className="text-center">Padrão</TableHead>
							<TableHead>Visível no site</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{variants.map((v) => (
							<EditableRow
								canDelete={canDelete}
								hasOrders={orderedSet.has(v.id)}
								isOnlyVariant={variants.length === 1}
								key={v.id}
								toolId={toolId}
								variant={v}
							/>
						))}
					</TableBody>
				</Table>

				{canDelete && (
					<div className="rounded-[10px] border border-destructive/40 bg-destructive/5 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-medium text-destructive text-sm">
									Excluir ferramenta
								</p>
								<p className="text-muted-foreground text-xs">
									Remove a ferramenta e todas as variantes. Não pode ser
									desfeito.
								</p>
							</div>
							<DeleteToolDialog
								disabledReason={
									toolHasOrders
										? "Esta ferramenta tem pedidos e não pode ser excluída. Oculte-a do site."
										: null
								}
								toolId={toolId}
								toolName={toolName}
								triggerLabel="Excluir ferramenta"
							/>
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}

interface EditableRowProps {
	canDelete: boolean;
	hasOrders: boolean;
	isOnlyVariant: boolean;
	toolId: string;
	variant: ToolDetailVariant;
}

function EditableRow({
	variant,
	toolId,
	canDelete,
	hasOrders,
	isOnlyVariant,
}: EditableRowProps) {
	const initial = makeRowState(variant);
	const [state, setState] = useState<RowState>(initial);
	const [savedTick, setSavedTick] = useState(false);
	const [pending, startTransition] = useTransition();
	const [defaultPending, startDefaultTransition] = useTransition();
	const [visiblePending, startVisibleTransition] = useTransition();
	const dirty = isDirty(initial, state);

	function handleSave() {
		let costAmountValue: string | null | undefined;
		if (state.costAmount === initial.costAmount) {
			costAmountValue = undefined;
		} else if (state.costAmount === "") {
			costAmountValue = null;
		} else {
			costAmountValue = state.costAmount;
		}
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
				costAmount: costAmountValue,
			});
			if (result.ok) {
				notify.success("Variante atualizada");
				setSavedTick(true);
				setTimeout(() => setSavedTick(false), 1800);
			} else {
				notify.error(result.error);
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
				notify.success("Variante padrão atualizada");
			} else {
				notify.error(result.error);
			}
		});
	}

	function handleToggleVisibility(visible: boolean) {
		startVisibleTransition(async () => {
			const result = await setVariantVisibility({
				variantId: variant.id,
				visible,
			});
			if (result.ok) {
				if (result.data.warning === "default_hidden") {
					notify.warning(
						"A variante padrão está oculta do site. Defina outra como padrão visível."
					);
				} else {
					notify.success(
						visible ? "Variante visível no site" : "Variante oculta"
					);
				}
			} else {
				notify.error(result.error);
			}
		});
	}

	let saveControl: React.ReactNode = null;
	if (dirty) {
		saveControl = (
			<Button disabled={pending} onClick={handleSave} size="sm">
				{pending ? "Salvando…" : "Salvar"}
			</Button>
		);
	} else if (savedTick) {
		saveControl = (
			<span className="inline-flex items-center gap-1 text-success text-xs">
				<CheckCircle2 className="size-3.5" /> Salvo
			</span>
		);
	}

	let deleteControl: React.ReactNode = null;
	if (canDelete) {
		// Mesma ordem do helper resolveVariantDeletion (hasOrders antes de única).
		if (hasOrders) {
			deleteControl = (
				<DisabledDeleteIcon reason="Tem pedidos — não pode excluir. Oculte do site." />
			);
		} else if (isOnlyVariant) {
			deleteControl = (
				<DisabledDeleteIcon reason="A ferramenta precisa de ao menos uma variante." />
			);
		} else {
			deleteControl = (
				<DeleteVariantDialog variantId={variant.id} variantSku={variant.sku} />
			);
		}
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
						{VOLTAGE_OPTIONS.map((opt) => (
							<SelectItem key={opt} value={opt}>
								{opt}
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
			<TableCell>
				<div className="flex items-center gap-2">
					<Switch
						checked={variant.visibleOnSite}
						disabled={visiblePending}
						onCheckedChange={handleToggleVisibility}
						size="sm"
					/>
					<Badge variant={variant.visibleOnSite ? "success" : "secondary"}>
						{variant.visibleOnSite ? "Ativa" : "Oculta"}
					</Badge>
				</div>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end gap-2">
					{saveControl}
					{deleteControl}
				</div>
			</TableCell>
		</TableRow>
	);
}

function DisabledDeleteIcon({ reason }: { reason: string }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button disabled size="icon-sm" variant="ghost">
						<Lock aria-hidden className="size-3.5 text-muted-foreground" />
					</Button>
				}
			/>
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
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
					<TableHead>Visível no site</TableHead>
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
							{v.isDefault ? (
								<CheckCircle2
									aria-label="Variante padrão"
									className="inline size-3.5 text-primary"
								/>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell>
							<Badge variant={v.visibleOnSite ? "success" : "secondary"}>
								{v.visibleOnSite ? "Ativa" : "Oculta"}
							</Badge>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
