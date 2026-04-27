"use client";

import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import { DeleteCategoryDialog } from "./delete-category-dialog";

export interface CategoryRow {
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	path: string;
	slug: string;
}

interface CategoriesTableProps {
	canMutate: boolean;
	categories: CategoryRow[];
}

export function CategoriesTable({
	canMutate,
	categories,
}: CategoriesTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Slug</TableHead>
					<TableHead className="w-32">Status</TableHead>
					<TableHead className="w-56 text-right">Ações</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{categories.map((c) => (
					<TableRow key={c.id}>
						<TableCell
							className="font-medium"
							style={{ paddingLeft: `${0.75 + c.depth * 1.25}rem` }}
						>
							{c.depth > 0 && <span className="text-muted-foreground">└ </span>}
							{c.name}
						</TableCell>
						<TableCell className="text-muted-foreground">
							<code className="text-xs">{c.path}</code>
						</TableCell>
						<TableCell>
							<Badge variant={c.isActive ? "default" : "outline"}>
								{c.isActive ? "Ativa" : "Inativa"}
							</Badge>
						</TableCell>
						<TableCell className="text-right">
							<div className="flex justify-end gap-2">
								{canMutate && (
									<>
										<Link
											className={buttonVariants({
												variant: "ghost",
												size: "sm",
											})}
											href={`/dashboard/categories/${c.id}/edit`}
										>
											Editar
										</Link>
										<DeleteCategoryDialog
											categoryId={c.id}
											categoryName={c.name}
										/>
									</>
								)}
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
