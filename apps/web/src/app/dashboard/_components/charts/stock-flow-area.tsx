"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	entradas: { label: "Entradas", color: "var(--chart-2)" },
	saidas: { label: "Saídas", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function StockFlowArea({
	data,
}: {
	data: { week: string; entradas: number; saidas: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="week" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={40} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="entradas"
					fill="var(--color-entradas)"
					fillOpacity={0.2}
					stackId="1"
					stroke="var(--color-entradas)"
					type="monotone"
				/>
				<Area
					dataKey="saidas"
					fill="var(--color-saidas)"
					fillOpacity={0.2}
					stackId="2"
					stroke="var(--color-saidas)"
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
