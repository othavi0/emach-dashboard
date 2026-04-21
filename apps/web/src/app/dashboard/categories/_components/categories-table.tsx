"use client";

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

import type { CategoryListItem } from "../actions";
import { DeleteCategoryDialog } from "./delete-category-dialog";

interface CategoriesTableProps {
	canMutate: boolean;
	categories: CategoryListItem[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

export function CategoriesTable({ categories, canMutate }: CategoriesTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Descrição</TableHead>
					<TableHead className="text-right">Ferramentas</TableHead>
					<TableHead className="w-32">Criada em</TableHead>
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{categories.map((category) => (
					<TableRow key={category.id}>
						<TableCell>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/categories/${category.id}`}
							>
								{category.name}
							</Link>
							{category.slug && (
								<p className="text-muted-foreground text-xs">
									/{category.slug}
								</p>
							)}
						</TableCell>
						<TableCell className="max-w-md text-muted-foreground text-sm">
							{category.description ?? "—"}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{category.toolsCount}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{formatDate(category.createdAt)}
						</TableCell>
						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({
											size: "sm",
											variant: "ghost",
										})}
										href={`/dashboard/categories/${category.id}/edit`}
									>
										Editar
									</Link>
									<DeleteCategoryDialog
										categoryId={category.id}
										categoryName={category.name}
									/>
								</div>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
