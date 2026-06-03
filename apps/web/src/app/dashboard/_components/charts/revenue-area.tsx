"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

const config = {
	revenue: { label: "Receita", color: "var(--chart-1)" },
	movingAvg: { label: "Média 7d", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function RevenueArea({
	data,
}: {
	data: { day: string; revenue: number; movingAvg: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="day" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={48} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="revenue"
					fill="var(--color-revenue)"
					fillOpacity={0.2}
					stroke="var(--color-revenue)"
					type="monotone"
				/>
				{/* isAnimationActive=false: a animação de desenho do recharts
				    conflita com strokeDasharray e renderiza os traços em
				    segmentos parciais no primeiro load. Sem ela, a linha
				    tracejada aparece inteira enquanto a Area faz o reveal. */}
				<Line
					dataKey="movingAvg"
					dot={false}
					isAnimationActive={false}
					stroke="var(--color-movingAvg)"
					strokeDasharray="4 4"
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
