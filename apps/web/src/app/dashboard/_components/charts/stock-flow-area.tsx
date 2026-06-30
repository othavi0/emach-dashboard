"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	entradas: { label: "Entradas", color: "var(--chart-4)" },
	saidas: { label: "Saídas", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function StockFlowArea({
	data,
}: {
	data: { week: string; entradas: number; saidas: number }[];
}) {
	// ids únicos dos gradientes — SVG ids são globais no document; ids fixos
	// colidiriam em múltiplas instâncias na mesma página (ex: futura /relatorios).
	const uid = useId().replaceAll(":", "");
	const entradasId = `fill-entradas-${uid}`;
	const saidasId = `fill-saidas-${uid}`;

	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
				Sem movimentações no período
			</div>
		);
	}

	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data}>
				<defs>
					<linearGradient id={entradasId} x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-entradas)"
							stopOpacity={0.4}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-entradas)"
							stopOpacity={0.02}
						/>
					</linearGradient>
					<linearGradient id={saidasId} x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-saidas)"
							stopOpacity={0.4}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-saidas)"
							stopOpacity={0.02}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="week" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={40} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="entradas"
					fill={`url(#${entradasId})`}
					stackId="1"
					stroke="var(--color-entradas)"
					strokeWidth={2}
					type="monotone"
				/>
				<Area
					dataKey="saidas"
					fill={`url(#${saidasId})`}
					stackId="2"
					stroke="var(--color-saidas)"
					strokeWidth={2}
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
