import { buttonVariants } from "@emach/ui/components/button";
import { PlayIcon } from "lucide-react";
import Link from "next/link";

interface ActivePicking {
	clientName: string;
	number: string;
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

interface ResumeBannerProps {
	activePicking: ActivePicking;
}

export function ResumeBanner({ activePicking }: ResumeBannerProps) {
	const pct =
		activePicking.totalUnits > 0
			? Math.round((activePicking.pickedUnits / activePicking.totalUnits) * 100)
			: 0;

	return (
		<div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
				<PlayIcon aria-hidden className="size-5" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="font-semibold text-sm">
					Você tem uma separação em andamento
				</p>
				<p className="text-muted-foreground text-xs">
					Pedido {activePicking.number} · {activePicking.clientName} ·{" "}
					{activePicking.pickedUnits} de {activePicking.totalUnits} unidades
				</p>
				<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
					<div className="h-full bg-primary" style={{ width: `${pct}%` }} />
				</div>
			</div>

			<Link
				className={buttonVariants({ className: "shrink-0" })}
				href={`/dashboard/separacao/${activePicking.orderId}`}
			>
				Retomar
			</Link>
		</div>
	);
}
