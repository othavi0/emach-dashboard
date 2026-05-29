"use client";

import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SupplierToolRow } from "../../data";

const STATUS_LABEL: Record<SupplierToolRow["status"], string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
};

const STATUS_VARIANT: Record<
	SupplierToolRow["status"],
	"default" | "secondary" | "outline" | "destructive"
> = {
	active: "default",
	draft: "secondary",
	discontinued: "outline",
};

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

interface Props {
	initialSearch: string;
	supplierId: string;
	tools: SupplierToolRow[];
}

export function ToolsTab({ supplierId, tools, initialSearch }: Props) {
	const [query, setQuery] = useState(initialSearch);

	const filtered = query
		? tools.filter(
				(t) =>
					t.name.toLowerCase().includes(query.toLowerCase()) ||
					t.slug.toLowerCase().includes(query.toLowerCase())
			)
		: tools;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<Input
					className="max-w-xs"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Buscar ferramenta…"
					value={query}
				/>
				<Link
					className={buttonVariants({ size: "sm" })}
					href={`/dashboard/tools/new?supplierId=${supplierId}`}
				>
					Nova ferramenta
				</Link>
			</div>

			{filtered.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-12 text-center">
					<Wrench
						aria-hidden
						className="size-12 text-muted-foreground opacity-40"
					/>
					<p className="font-medium text-sm">Sem ferramentas vinculadas</p>
					<p className="text-muted-foreground text-xs">
						{query
							? "Nenhuma ferramenta corresponde à busca."
							: "Adicione a primeira ferramenta deste fornecedor."}
					</p>
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>SKU padrão</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="tabular-nums">Criada em</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map((tool) => (
							<TableRow key={tool.id}>
								<TableCell>
									<Link
										className="font-medium underline-offset-4 hover:underline"
										href={`/dashboard/tools/${tool.id}`}
									>
										{tool.name}
									</Link>
									<p className="text-muted-foreground text-xs">{tool.slug}</p>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm tabular-nums">
									{tool.defaultSku ?? "—"}
								</TableCell>
								<TableCell>
									<Badge variant={STATUS_VARIANT[tool.status]}>
										{STATUS_LABEL[tool.status]}
									</Badge>
								</TableCell>
								<TableCell className="text-sm tabular-nums">
									{DATE_FORMAT.format(tool.createdAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
