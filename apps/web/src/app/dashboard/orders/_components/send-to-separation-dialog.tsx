"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@emach/ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { useState } from "react";
import type { BranchOption } from "../data";
import { BULK_SEPARATION_LIMIT } from "../status-meta";

interface SendToSeparationDialogProps {
	branches: BranchOption[];
	onConfirm: (branchId: string | null) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	orderCount: number;
	pending: boolean;
	withoutBranchCount: number;
}

function pluralSuffix(count: number): string {
	return count === 1 ? "" : "s";
}

// Pedidos que já têm filial nunca são sobrescritos (bulkStartSeparation aplica
// branchId só onde branch_id IS NULL) — a descrição deixa isso explícito (D1).
function buildDescription(
	orderCount: number,
	withoutBranchCount: number
): string {
	const withBranchCount = orderCount - withoutBranchCount;
	if (withoutBranchCount === 0) {
		return `Todos os ${orderCount} pedido${pluralSuffix(orderCount)} selecionado${pluralSuffix(orderCount)} já ${orderCount === 1 ? "tem" : "têm"} filial.`;
	}
	if (withBranchCount === 0) {
		return `Nenhum dos ${orderCount} pedido${pluralSuffix(orderCount)} selecionado${pluralSuffix(orderCount)} tem filial. Escolha a filial que vai separar.`;
	}
	return `${withBranchCount} já ${withBranchCount === 1 ? "tem" : "têm"} filial (mantida); ${withoutBranchCount} sem filial ${withoutBranchCount === 1 ? "vai" : "vão"} para a escolhida.`;
}

// Controlado pelo BulkActionBar (sem DialogTrigger próprio). D1: um botão só na
// listagem de Pedidos, decidindo a filial junto do envio. Quando todos os
// selecionados já têm filial, o Select some e o dialog vira confirmação simples
// (withoutBranchCount === 0).
export function SendToSeparationDialog({
	branches,
	onConfirm,
	onOpenChange,
	open,
	orderCount,
	pending,
	withoutBranchCount,
}: SendToSeparationDialogProps) {
	const [branchId, setBranchId] = useState(
		branches.length === 1 ? (branches[0]?.id ?? "") : ""
	);
	// Reset (e re-pré-seleção) da escolha quando o dialog abre/fecha — padrão
	// in-render (React Compiler ativo; evita useEffect de reset). Canônico:
	// user-edit-sheet / BranchPickerDialog.
	const [lastOpen, setLastOpen] = useState(open);
	if (open !== lastOpen) {
		setLastOpen(open);
		setBranchId(branches.length === 1 ? (branches[0]?.id ?? "") : "");
	}

	const needsBranch = withoutBranchCount > 0;
	// Teto por lote (backstop no server via zod); aqui bloqueia proativamente pra
	// não deixar o usuário confirmar uma seleção que o server recusaria inteira.
	const overLimit = orderCount > BULK_SEPARATION_LIMIT;
	const canConfirm =
		!(pending || overLimit) && (!needsBranch || Boolean(branchId));

	const handleConfirm = () => {
		onConfirm(needsBranch ? branchId : null);
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Enviar para separação</DialogTitle>
					<DialogDescription>
						{buildDescription(orderCount, withoutBranchCount)}
					</DialogDescription>
				</DialogHeader>

				{overLimit && (
					<p className="text-destructive text-xs">
						Selecione no máximo {BULK_SEPARATION_LIMIT} pedidos por vez (você
						selecionou {orderCount}).
					</p>
				)}

				{needsBranch && (
					<div className="space-y-1">
						<label
							className="text-muted-foreground text-xs"
							htmlFor="send-to-separation-branch"
						>
							Filial responsável pelos pedidos sem filial
						</label>
						<Select
							onValueChange={(v) =>
								setBranchId(!v || v === "__none__" ? "" : v)
							}
							value={branchId || "__none__"}
						>
							<SelectTrigger id="send-to-separation-branch">
								<SelectValue>
									{(v: string) =>
										v === "__none__"
											? "Selecionar filial"
											: (branches.find((b) => b.id === v)?.name ??
												"Selecionar filial")
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">Selecionar filial</SelectItem>
									{branches.map((branch) => (
										<SelectItem key={branch.id} value={branch.id}>
											{branch.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}

				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						type="button"
						variant="ghost"
					>
						Cancelar
					</Button>
					<Button disabled={!canConfirm} onClick={handleConfirm} type="button">
						{pending ? (
							<>
								<Spinner /> Enviando…
							</>
						) : (
							`Enviar ${orderCount} pedido${pluralSuffix(orderCount)}`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
