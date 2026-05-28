import { Card, CardContent } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";
import { NumberTicker } from "./number-ticker";

export function KpiCard({
	label,
	value,
	sub,
	tone = "default",
	format,
}: {
	label: string;
	value: number;
	sub?: ReactNode;
	tone?: "default" | "warning" | "destructive";
	format?: (n: number) => string;
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
					<NumberTicker format={format} value={value} />
				</p>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</CardContent>
		</Card>
	);
}
