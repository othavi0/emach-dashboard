import { Badge } from "@emach/ui/components/badge";
import {
	CircleCheck,
	FolderTree,
	Package,
	SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";

import {
	EntityKpisRow,
	type KpiItem,
} from "@/components/entity/entity-kpis-row";
import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../../_lib/attribute-schema";
import type { CategoryAttributeView } from "../../actions";

interface Props {
	attributes: CategoryAttributeView[];
	categoryId: string;
	childrenCount: number;
	description: string | null;
	isActive: boolean;
	productCount: number;
	rollupProductCount: number;
}

export function OverviewTab({
	attributes,
	categoryId,
	childrenCount,
	description,
	isActive,
	productCount,
	rollupProductCount,
}: Props) {
	const kpis: KpiItem[] = [
		{
			label: "Produtos",
			value: rollupProductCount,
			icon: Package,
			hint:
				rollupProductCount === productCount
					? undefined
					: `${productCount} ${productCount === 1 ? "direto" : "diretos"}`,
		},
		{ label: "Subcategorias", value: childrenCount, icon: FolderTree },
		{ label: "Atributos", value: attributes.length, icon: SlidersHorizontal },
		{
			label: "Status",
			value: isActive ? "Ativa" : "Inativa",
			icon: CircleCheck,
			tone: isActive ? "success" : "default",
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<EntityKpisRow items={kpis} />

			<div className="grid gap-4 lg:grid-cols-2">
				<section className="overflow-hidden rounded-lg border border-border bg-card">
					<div className="px-4 pt-4 pb-3">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Descrição
						</h3>
					</div>
					<p className="border-border border-t px-4 py-3 text-muted-foreground text-sm leading-relaxed">
						{description ?? "Sem descrição."}
					</p>
				</section>

				<section className="overflow-hidden rounded-lg border border-border bg-card">
					<div className="px-4 pt-4 pb-3">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Atributos técnicos · {attributes.length}
						</h3>
					</div>
					{attributes.length === 0 ? (
						<p className="border-border border-t px-4 py-3 text-muted-foreground text-xs">
							Nenhum atributo aplicável.
						</p>
					) : (
						attributes.map(({ def, ownerName }) => (
							<div
								className="flex items-center justify-between gap-3 border-border border-t px-4 py-2.5"
								key={def.id}
							>
								<span className="text-sm">
									<span className="font-medium">{def.label}</span>{" "}
									<span className="text-muted-foreground text-xs">
										· {ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}
										{def.unit ? ` · ${def.unit}` : ""}
									</span>
								</span>
								{ownerName ? (
									<Badge variant="secondary">↑ {ownerName}</Badge>
								) : (
									<Badge variant="default">Próprio</Badge>
								)}
							</div>
						))
					)}
					<div className="border-border border-t bg-muted px-4 py-3">
						<Link
							className="text-info text-xs hover:underline"
							href={`/dashboard/categories/${categoryId}/edit`}
						>
							Editar atributos na página de edição →
						</Link>
					</div>
				</section>
			</div>
		</div>
	);
}
