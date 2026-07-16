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
import { BULK_ASSIGN_LIMIT } from "../status-meta";

interface BranchPickerDialogProps {
	branches: BranchOption[];
	onConfirm: (branchId: string) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	orderCount: number;
	pending: boolean;
}

// Controlado pelo BulkActionBar (sem DialogTrigger próprio): coleta a filial de
// destino para a atribuição em lote. Sentinela "__none__" como placeholder,
// mesmo padrão do Select de filial singular (order-action-column).
export function BranchPickerDialog({
	branches,
	onConfirm,
	onOpenChange,
	open,
	orderCount,
	pending,
}: BranchPickerDialogProps) {
	const [branchId, setBranchId] = useState("");
	// Reset da seleção quando o dialog abre/fecha — padrão in-render (React
	// Compiler ativo; evita useEffect de reset). Canônico: user-edit-sheet.
	const [lastOpen, setLastOpen] = useState(open);
	if (open !== lastOpen) {
		setLastOpen(open);
		setBranchId("");
	}

	// Teto por lote (backstop no server via zod); aqui bloqueia proativamente pra
	// não deixar o usuário confirmar uma seleção que o server recusaria inteira.
	const overLimit = orderCount > BULK_ASSIGN_LIMIT;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Atribuir filial</DialogTitle>
					<DialogDescription>
						Roteia {orderCount} pedido{orderCount === 1 ? "" : "s"} selecionado
						{orderCount === 1 ? "" : "s"} para a filial escolhida. Pedidos fora
						do seu escopo são pulados.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="bulk-branch-assign"
					>
						Filial responsável
					</label>
					<Select
						onValueChange={(v) => setBranchId(!v || v === "__none__" ? "" : v)}
						value={branchId || "__none__"}
					>
						<SelectTrigger id="bulk-branch-assign">
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
					{overLimit && (
						<p className="text-destructive text-xs">
							Selecione no máximo {BULK_ASSIGN_LIMIT} pedidos por vez (você
							selecionou {orderCount}).
						</p>
					)}
				</div>

				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						type="button"
						variant="ghost"
					>
						Cancelar
					</Button>
					<Button
						disabled={pending || !branchId || overLimit}
						onClick={() => onConfirm(branchId)}
						type="button"
						variant="outline"
					>
						{pending ? (
							<>
								<Spinner /> Atribuindo…
							</>
						) : (
							"Atribuir filial"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
