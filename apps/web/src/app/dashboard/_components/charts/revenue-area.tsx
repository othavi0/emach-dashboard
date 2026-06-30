"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

const config = {
	revenue: { label: "Receita", color: "var(--chart-1)" },
	movingAvg: { label: "Tendência", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function RevenueArea({
	data,
}: {
	data: { day: string; revenue: number; movingAvg: number }[];
}) {
	// id único do gradiente: SVG ids são globais no document, então um id fixo
	// colidiria se o chart fosse renderizado em múltiplas instâncias na mesma
	// página (ex: futura /relatorios). useId() antes de qualquer return.
	const fillId = `fill-revenue-${useId().replaceAll(":", "")}`;

	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
				Sem vendas no período
			</div>
		);
	}

	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<defs>
					<linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-revenue)"
							stopOpacity={0.42}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-revenue)"
							stopOpacity={0.02}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="day" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={48} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="revenue"
					fill={`url(#${fillId})`}
					stroke="var(--color-revenue)"
					strokeWidth={2.5}
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
