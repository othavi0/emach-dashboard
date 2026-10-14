import { Card, CardContent } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { type NumberFormat, NumberTicker } from "./number-ticker";

function DeltaBadge({ delta }: { delta: number }) {
	const up = delta >= 0;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 font-medium text-xs tabular-nums",
				up ? "text-success" : "text-destructive"
			)}
		>
			{up ? (
				<TrendingUp aria-hidden className="size-3.5" />
			) : (
				<TrendingDown aria-hidden className="size-3.5" />
			)}
			{up ? "+" : ""}
			{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
		</span>
	);
}

// `display` é um valor já formatado (ex: duração "1h 12min"): renderiza
// estático, sem NumberTicker (o ticker só anima/formata números).
type KpiValue =
	| { value: number; format?: NumberFormat; display?: never }
	| { display: string; value?: never; format?: never };

export function KpiCard({
	label,
	sub,
	delta,
	tone = "default",
	...kpi
}: {
	label: string;
	sub?: ReactNode;
	delta?: number | null;
	tone?: "default" | "warning" | "destructive";
} & KpiValue) {
	return (
		<Card
			className={cn(
				tone === "destructive" && "border-destructive/40",
				tone === "warning" && "border-amber-500/40"
			)}
		>
			<CardContent className="flex flex-col gap-1 p-4">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				<p
					className={cn(
						"font-semibold text-2xl tabular-nums",
						tone === "destructive" && "text-destructive"
					)}
				>
					{kpi.display === undefined ? (
						<NumberTicker format={kpi.format} value={kpi.value} />
					) : (
						kpi.display
					)}
				</p>
				{delta == null ? (
					sub && <p className="text-muted-foreground text-xs">{sub}</p>
				) : (
					<DeltaBadge delta={delta} />
				)}
			</CardContent>
		</Card>
	);
}
