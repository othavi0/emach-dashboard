"use client";

import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";

import { DeleteBranchDialog } from "./delete-branch-dialog";

export interface BranchRow {
	address: string | null;
	createdAt: Date;
	id: string;
	isDefault: boolean;
	name: string;
}

interface BranchesTableProps {
	branches: BranchRow[];
	canMutate: boolean;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

export function BranchesTable({ branches, canMutate }: BranchesTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Endereço</TableHead>
					<TableHead className="w-32">Criado em</TableHead>
					<TableActionsHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{branches.map((b) => (
					<TableRow key={b.id}>
						<TableCell className="font-medium">
							{b.name}
							{b.isDefault && (
								<Badge className="ml-2 text-[10px]" variant="default">
									Padrão ecommerce
								</Badge>
							)}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{b.address ?? "—"}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{formatDate(b.createdAt)}
						</TableCell>
						<TableActionsCell>
							<Link
								aria-label={`Gerenciar estoque de ${b.name}`}
								className={buttonVariants({
									size: "icon-sm",
									variant: "secondary",
								})}
								href={`/dashboard/branches/${b.id}/stock`}
							>
								<Boxes aria-hidden className="size-3.5" />
							</Link>
							{canMutate && (
								<>
									<Link
										aria-label={`Editar filial ${b.name}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "secondary",
										})}
										href={`/dashboard/branches/${b.id}/edit`}
									>
										<Pencil aria-hidden className="size-3.5" />
									</Link>
									<DeleteBranchDialog branchId={b.id} branchName={b.name} />
								</>
							)}
						</TableActionsCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
