import { buttonVariants } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import Link from "next/link";

import { can, requireCapability } from "@/lib/permissions";

import { getBoxes } from "../data";
import { BoxCard } from "./box-card";
import { BoxCreateSheet } from "./box-create-sheet";
import { BoxEditSheet } from "./box-edit-sheet";

export async function BoxesTab() {
	const session = await requireCapability("shipping.read");
	const canManage = await can(session, "shipping.manage");
	const boxes = await getBoxes();

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
