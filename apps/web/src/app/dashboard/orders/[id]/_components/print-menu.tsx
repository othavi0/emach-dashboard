"use client";

import { Button } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { ChevronDownIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";
import type { OrderDetail } from "../../data";

interface PrintMenuProps {
	order: OrderDetail;
}

export function PrintMenu({ order }: PrintMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant="secondary">
						<PrinterIcon aria-hidden className="size-4" />
						Imprimir
						<ChevronDownIcon aria-hidden className="size-4" />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				{order.nfeUrl ? (
					<DropdownMenuItem
						render={
							<Link
								href={order.nfeUrl}
								rel="noopener noreferrer"
								target="_blank"
							/>
						}
					>
						DANFE (NF-e)
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem disabled>DANFE (NF-e)</DropdownMenuItem>
				)}
				<DropdownMenuItem
					render={
						<Link
							href={`/dashboard/orders/${order.id}/print?type=shipping`}
							rel="noopener noreferrer"
							target="_blank"
						/>
					}
				>
					Etiqueta de envio
				</DropdownMenuItem>
				<DropdownMenuItem
					render={
						<Link
							href={`/dashboard/orders/${order.id}/print?type=picking`}
							rel="noopener noreferrer"
							target="_blank"
						/>
					}
				>
					Lista de separação
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
