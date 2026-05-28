"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const config = {
	count: { label: "Avaliações", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function RatingBars({
	data,
}: {
	data: { rating: number; count: number }[];
}) {
	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<BarChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis
					axisLine={false}
					dataKey="rating"
					tickFormatter={(v) => `${v}★`}
					tickLine={false}
				/>
				<YAxis axisLine={false} tickLine={false} width={32} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={4} />
			</BarChart>
		</ChartContainer>
	);
}
