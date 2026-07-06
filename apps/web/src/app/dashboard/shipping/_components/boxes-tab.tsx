import { buttonVariants } from "@emach/ui/components/button";
import { Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { formatMeasure } from "@/lib/format/number";
import { can, requireCapability } from "@/lib/permissions";

import { getBoxes, getToolsWithoutBox } from "../data";
import { BoxCard } from "./box-card";
import { BoxCreateSheet } from "./box-create-sheet";
import { BoxEditSheet } from "./box-edit-sheet";

export async function BoxesTab() {
	const session = await requireCapability("shipping.read");
	const canManage = await can(session, "shipping.manage");
	const [boxes, toolsWithoutBox] = await Promise.all([
		getBoxes(),
		getToolsWithoutBox(),
	]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-muted-foreground text-sm">
						{boxes.length === 0
							? "Nenhuma caixa cadastrada."
							: `${boxes.length} caixa${boxes.length === 1 ? "" : "s"} cadastrada${boxes.length === 1 ? "" : "s"}.`}
					</p>
				</div>
				{canManage && (
					<Link
						className={buttonVariants({ size: "sm" })}
						href="?newBox=1"
						scroll={false}
					>
						<Plus className="size-4" />
						Nova caixa
					</Link>
				)}
			</div>

			{toolsWithoutBox.length > 0 && (
				<div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4">
					<p className="flex items-center gap-2 font-medium text-sm">
						<TriangleAlert
							aria-hidden
							className="size-4 shrink-0 text-warning"
						/>
						{toolsWithoutBox.length === 1
							? "1 produto ativo não cabe em nenhuma caixa ativa"
							: `${toolsWithoutBox.length} produtos ativos não cabem em nenhuma caixa ativa`}
					</p>
					<p className="text-muted-foreground text-xs">
						Na loja eles aparecem como "Frete a combinar". Cadastre uma caixa
						maior, reative uma existente ou marque o produto como "viaja na
						própria embalagem".
					</p>
					<ul className="flex flex-col gap-1">
						{toolsWithoutBox.slice(0, 10).map((t) => (
							<li key={t.id}>
								<Link
									className="text-sm underline-offset-2 hover:underline"
									href={`/dashboard/tools/${t.id}`}
								>
									{t.name}
								</Link>{" "}
								<span className="text-muted-foreground text-xs">
									{formatMeasure(t.lengthCm)} × {formatMeasure(t.widthCm)} ×{" "}
									{formatMeasure(t.heightCm)} cm · {formatMeasure(t.weightKg)}{" "}
									kg
								</span>
							</li>
						))}
					</ul>
					{toolsWithoutBox.length > 10 && (
						<p className="text-muted-foreground text-xs">
							…e mais {toolsWithoutBox.length - 10}.
						</p>
					)}
				</div>
			)}

			{boxes.length > 0 ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{boxes.map((box) => (
						<BoxCard box={box} key={box.id} />
					))}
				</div>
			) : (
				<div className="rounded-md border border-border border-dashed bg-muted/40 p-8 text-center text-muted-foreground text-sm">
					Adicione a primeira embalagem clicando em "Nova caixa".
				</div>
			)}

			<BoxCreateSheet />
			<BoxEditSheet boxes={boxes} />
		</div>
	);
}
