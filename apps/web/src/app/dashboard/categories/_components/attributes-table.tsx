"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { Badge } from "@emach/ui/components/badge";
import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Pencil } from "lucide-react";
import Link from "next/link";

import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../_lib/attribute-schema";
import { DeleteAttributeDialog } from "./delete-attribute-dialog";

export interface OwnRow {
	def: AttributeDefinition;
	usageCount: number;
}

export interface InheritedRow {
	def: AttributeDefinition;
	ownerCategoryId: string;
	ownerCategoryName: string;
}

interface OwnTableProps {
	canDelete: boolean;
	canUpdate: boolean;
	categoryId: string;
	onEdit: (attribute: AttributeDefinition) => void;
	rows: OwnRow[];
}

export function OwnAttributesTable({
	categoryId,
	canDelete,
	canUpdate,
	onEdit,
	rows,
}: OwnTableProps) {
	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-xs">
				Nenhum atributo próprio. Use "Novo atributo" para adicionar.
			</p>
		);
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Rótulo</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Unidade</TableHead>
					<TableHead>Obrigatório</TableHead>
					<TableHead className="w-32 text-right">Ações</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map(({ def, usageCount }) => (
					<TableRow key={def.id}>
						<TableCell className="font-medium">
							{def.label}
							<p className="font-mono text-muted-foreground text-xs">
								{def.slug}
							</p>
						</TableCell>
						<TableCell>{ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}</TableCell>
						<TableCell>{def.unit ?? "—"}</TableCell>
						<TableCell>
							{def.isRequired ? (
								<Badge>Obrigatório</Badge>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="text-right">
							<div className="flex justify-end gap-1">
								{canUpdate && (
									<Button
										aria-label={`Editar atributo ${def.label}`}
										onClick={() => onEdit(def)}
										size="icon-sm"
										type="button"
										variant="secondary"
									>
										<Pencil aria-hidden className="size-3.5" />
									</Button>
								)}
								{canDelete && (
									<DeleteAttributeDialog
										attributeId={def.id}
										attributeLabel={def.label}
										categoryId={categoryId}
										usageCount={usageCount}
									/>
								)}
							</div>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

interface InheritedTableProps {
	rows: InheritedRow[];
}

export function InheritedAttributesTable({ rows }: InheritedTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Rótulo</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Origem</TableHead>
					<TableHead className="w-32 text-right">Ação</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map(({ def, ownerCategoryId, ownerCategoryName }) => (
					<TableRow key={def.id}>
						<TableCell className="font-medium">
							{def.label}
							<p className="font-mono text-muted-foreground text-xs">
								{def.slug}
							</p>
						</TableCell>
						<TableCell>{ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}</TableCell>
						<TableCell>
							<Badge variant="secondary">{ownerCategoryName}</Badge>
						</TableCell>
						<TableCell className="text-right">
							<Link
								className={buttonVariants({ size: "sm", variant: "ghost" })}
								href={`/dashboard/categories/${ownerCategoryId}/edit`}
							>
								Abrir →
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
