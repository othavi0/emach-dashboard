"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Cell, Pie, PieChart } from "recharts";

const PALETTE = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

export function StatusDonut({
	data,
	config,
}: {
	data: { key: string; count: number }[];
	config: ChartConfig;
}) {
	if (data.length === 0) {
		return (
			<p className="flex h-56 items-center justify-center text-muted-foreground text-sm">
				Sem dados.
			</p>
		);
	}
	return (
		<ChartContainer className="h-56 w-full" config={config}>
			<PieChart>
				<ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
				<Pie
					data={data}
					dataKey="count"
					innerRadius={48}
					nameKey="key"
					strokeWidth={2}
				>
					{data.map((entry, i) => (
						<Cell fill={PALETTE[i % PALETTE.length]} key={entry.key} />
					))}
				</Pie>
			</PieChart>
		</ChartContainer>
	);
}
