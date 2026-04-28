"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@emach/ui/components/accordion";
import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { ChevronDownIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";

export function ToastTriggers() {
	return (
		<>
			<Button onClick={() => toast("Pedido salvo com sucesso")}>toast()</Button>
			<Button
				onClick={() =>
					toast.success("Tudo certo", {
						description: "Sua alteração foi aplicada.",
					})
				}
				variant="secondary"
			>
				success
			</Button>
			<Button
				onClick={() =>
					toast.error("Algo deu errado", {
						description: "Tente novamente em instantes.",
					})
				}
				variant="outline"
			>
				error
			</Button>
			<Button
				onClick={() =>
					toast.message("Lembrete", {
						description: "Você tem 3 ordens pendentes.",
					})
				}
				variant="ghost"
			>
				message
			</Button>
		</>
	);
}

export function DialogShowcase() {
	return (
		<Dialog>
			<DialogTrigger render={<Button>Abrir dialog</Button>} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirmar ação</DialogTitle>
					<DialogDescription>
						Esta ação atualiza o status do pedido para "concluído". Você poderá
						reverter em até 24h.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose render={<Button variant="outline">Cancelar</Button>} />
					<DialogClose render={<Button>Confirmar</Button>} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function PopoverShowcase() {
	return (
		<Popover>
			<PopoverTrigger
				render={<Button variant="outline">Abrir popover</Button>}
			/>
			<PopoverContent>
				<PopoverHeader>
					<PopoverTitle>Filtrar resultados</PopoverTitle>
					<PopoverDescription>
						Ajuste os filtros aplicados à lista atual.
					</PopoverDescription>
				</PopoverHeader>
			</PopoverContent>
		</Popover>
	);
}

export function TooltipShowcase() {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger render={<Button variant="ghost">Hover aqui</Button>} />
				<TooltipContent>Dica curta sobre a ação</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function DropdownShowcase() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="outline">
						Abrir menu <ChevronDownIcon />
					</Button>
				}
			/>
			<DropdownMenuContent className="min-w-44">
				<DropdownMenuLabel>Ações do pedido</DropdownMenuLabel>
				<DropdownMenuItem onClick={() => toast("Editar")}>
					<SettingsIcon /> Editar
					<DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => toast("Marcado como pronto")}>
					Marcar pronto
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => toast.error("Excluído")}
					variant="destructive"
				>
					Excluir
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function AccordionShowcase() {
	return (
		<Accordion className="w-full" defaultValue={["a"]}>
			<AccordionItem value="a">
				<AccordionTrigger>
					Como funcionam variantes de voltagem?
				</AccordionTrigger>
				<AccordionContent>
					Rows distintas em <code>tool</code> compartilhando o mesmo{" "}
					<code>model</code>. Não há tabela <code>tool_variant</code>.
				</AccordionContent>
			</AccordionItem>
			<AccordionItem value="b">
				<AccordionTrigger>Quem pode editar promoções?</AccordionTrigger>
				<AccordionContent>
					Manager e admin via capability <code>promotions.manage</code>.
				</AccordionContent>
			</AccordionItem>
			<AccordionItem value="c">
				<AccordionTrigger>Onde fica o audit trail de estoque?</AccordionTrigger>
				<AccordionContent>
					Tabela <code>stockMovement</code> — partial unique index garante
					idempotência de débitos de venda.
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
