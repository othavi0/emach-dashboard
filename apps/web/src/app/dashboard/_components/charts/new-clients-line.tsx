"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@emach/ui/components/chart";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const config = {
	count: { label: "Novos clientes", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function NewClientsLine({
	data,
}: {
	data: { week: string; count: number }[];
}) {
	return (
		<ChartContainer className="h-56 w-full" config={config}>
			<LineChart data={data}>
				<CartesianGrid vertical={false} />
				<XAxis axisLine={false} dataKey="week" tickLine={false} />
				<YAxis axisLine={false} tickLine={false} width={32} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Line
					dataKey="count"
					dot={false}
					stroke="var(--color-count)"
					type="monotone"
				/>
			</LineChart>
		</ChartContainer>
	);
}
