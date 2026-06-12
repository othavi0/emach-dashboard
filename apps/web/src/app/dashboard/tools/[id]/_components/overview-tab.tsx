import { buttonVariants } from "@emach/ui/components/button";
import { Card, CardContent } from "@emach/ui/components/card";
import { Separator } from "@emach/ui/components/separator";
import Link from "next/link";
import { ToolDescription } from "@/components/tool-description";
import { formatDayMonthShortYear } from "@/lib/format/datetime";
import type {
	ToolDetailAttribute,
	ToolDetailCategory,
	ToolDetailImage,
	ToolDetailRow,
	ToolStockSummary,
} from "../_lib/tool-detail-data";
import { ToolSpecs } from "./tool-specs";

interface OverviewTabProps {
	attributes: ToolDetailAttribute[];
	categories: ToolDetailCategory[];
	images: ToolDetailImage[];
	stockSummary: ToolStockSummary;
	tool: ToolDetailRow;
}

export function OverviewTab({
	tool,
	images,
	categories,
	attributes,
	stockSummary,
}: OverviewTabProps) {
	const primaryCategory = categories.find((c) => c.isPrimary);
	const otherCategories = categories.filter((c) => !c.isPrimary);

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_280px]">
			<div className="flex min-w-0 flex-col gap-5">
				{images.length > 0 ? (
					<div className="grid grid-cols-4 gap-2">
						{images.slice(0, 8).map((img) => (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							// biome-ignore lint/correctness/useImageSize: thumb Supabase, dimensões via CSS
							<img
								alt=""
								className="aspect-square w-full rounded-md object-cover"
								key={img.id}
								src={img.url}
							/>
						))}
					</div>
				) : (
					<div className="aspect-video rounded-md bg-muted" />
				)}

				{tool.description && <ToolDescription markdown={tool.description} />}

				<ToolSpecs attributes={attributes} tool={tool} />
			</div>

			<aside className="flex flex-col gap-4">
				<Card>
					<CardContent className="pt-6">
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Estoque resumo
						</p>
						<p className="mt-1 font-semibold text-2xl tabular-nums">
							{stockSummary.totalStock}{" "}
							<span className="font-normal text-muted-foreground text-sm">
								unid.
							</span>
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							em {stockSummary.branchCount}{" "}
							{stockSummary.branchCount === 1 ? "filial" : "filiais"}
							{stockSummary.criticalCount + stockSummary.reorderCount > 0 && (
								<>
									{" · "}
									<span className="text-destructive">
										{stockSummary.criticalCount + stockSummary.reorderCount} em
										alerta
									</span>
								</>
							)}
						</p>
						<Separator className="my-3" />
						<Link
							className={buttonVariants({
								variant: "outline",
								size: "sm",
								className: "w-full",
							})}
							href={`/dashboard/tools/${tool.id}?tab=estoque`}
						>
							Ver na aba Estoque →
						</Link>
					</CardContent>
				</Card>

				<Card>
					<CardContent className="pt-6">
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Metadados
						</p>
						<dl className="mt-3 flex flex-col gap-2 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs">Categoria</dt>
								<dd>{primaryCategory?.categoryName ?? "—"}</dd>
								{otherCategories.length > 0 && (
									<dd className="text-muted-foreground text-xs">
										+ {otherCategories.map((c) => c.categoryName).join(", ")}
									</dd>
								)}
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Fornecedor</dt>
								<dd>{tool.supplierName ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Criada</dt>
								<dd>{formatDayMonthShortYear(tool.createdAt)}</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			</aside>
		</div>
	);
}
