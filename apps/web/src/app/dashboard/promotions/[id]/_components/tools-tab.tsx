import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatDesconto } from "../../_components/_lib/format";
import type { PromotionDetail } from "../../actions";

export function ToolsTab({ detail }: { detail: PromotionDetail }) {
	if (detail.tools.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhuma ferramenta vinculada</EmptyTitle>
					<EmptyDescription>
						Vincule ferramentas para que o desconto seja aplicado a elas.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Link
						className={buttonVariants({ variant: "default" })}
						href={`/dashboard/promotions/${detail.id}?tab=tools&edit=1`}
					>
						Gerenciar ferramentas
					</Link>
				</EmptyContent>
			</Empty>
		);
	}

	const discountLabel = `−${formatDesconto(detail.discountPct)}`;

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{detail.tools.map((t) => (
				<div
					className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm"
					key={t.id}
				>
					<div className="relative overflow-hidden">
						{t.thumbUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							// biome-ignore lint/correctness/useImageSize: fixed aspect via Tailwind
							<img
								alt={t.name}
								className="aspect-[16/9] w-full object-cover"
								src={t.thumbUrl}
							/>
						) : (
							<div aria-hidden className="aspect-[16/9] w-full bg-muted/40" />
						)}
						<div className="absolute top-2 right-2">
							<Badge className="shadow-sm backdrop-blur-sm" variant="success">
								{discountLabel}
							</Badge>
						</div>
					</div>
					<div className="flex flex-col gap-1 px-4 pt-3 pb-3">
						<Link
							className="line-clamp-2 flex items-center gap-1 font-semibold text-[14px] text-foreground leading-[1.3] tracking-tight hover:underline"
							href={`/dashboard/tools/${t.id}`}
						>
							{t.name}
							<ArrowUpRight
								aria-hidden
								className="size-3.5 shrink-0 opacity-60"
							/>
						</Link>
						{t.sku ? (
							<p className="line-clamp-1 text-muted-foreground text-xs">
								SKU {t.sku}
							</p>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}
