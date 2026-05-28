"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	count: { label: "Pedidos", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function OrderFunnel({
	data,
}: {
	data: { status: string; count: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<BarChart data={data} layout="vertical">
				<CartesianGrid horizontal={false} />
				<XAxis axisLine={false} tickLine={false} type="number" />
				<YAxis
					axisLine={false}
					dataKey="status"
					tickLine={false}
					type="category"
					width={96}
				/>
				<ChartTooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={4} />
			</BarChart>
		</ChartContainer>
	);
}
