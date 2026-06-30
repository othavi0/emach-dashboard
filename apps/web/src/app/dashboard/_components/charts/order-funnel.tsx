"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
	ORDER_STATUS_LABELS,
	type OrderStatus,
} from "../../orders/status-meta";

// Inclui os status no config para que o header do tooltip resolva o rótulo PT
// (ChartTooltipContent consulta config[label] pelo valor do eixo categórico).
const config = {
	count: { label: "Pedidos", color: "var(--chart-1)" },
	...Object.fromEntries(
		Object.entries(ORDER_STATUS_LABELS).map(([status, label]) => [
			status,
			{ label },
		])
	),
} satisfies ChartConfig;

export function OrderFunnel({
	data,
}: {
	data: { status: string; count: number }[];
}) {
	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
				Nenhum pedido no período
			</div>
		);
	}

	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<BarChart data={data} layout="vertical">
				<CartesianGrid horizontal={false} />
				<XAxis axisLine={false} tickLine={false} type="number" />
				<YAxis
					axisLine={false}
					dataKey="status"
					tickFormatter={(value: string) =>
						ORDER_STATUS_LABELS[value as OrderStatus] ?? value
					}
					tickLine={false}
					type="category"
					width={128}
				/>
				<ChartTooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={4} />
			</BarChart>
		</ChartContainer>
	);
}
