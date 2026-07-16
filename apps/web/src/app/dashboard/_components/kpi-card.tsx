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

export function KpiCard({
	label,
	value,
	sub,
	delta,
	tone = "default",
	format,
}: {
	label: string;
	// string = valor já formatado (ex: duração "1h 12min") — renderiza estático,
	// sem NumberTicker (o ticker só anima/formata números).
	value: number | string;
	sub?: ReactNode;
	delta?: number | null;
	tone?: "default" | "warning" | "destructive";
	format?: NumberFormat;
}) {
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
					{typeof value === "number" ? (
						<NumberTicker format={format} value={value} />
					) : (
						value
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
