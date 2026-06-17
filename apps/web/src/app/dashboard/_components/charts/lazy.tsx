"use client";

import { Skeleton } from "@emach/ui/components/skeleton";
import dynamic from "next/dynamic";

const chartFallback = () => <Skeleton className="h-64 w-full" />;

export const RevenueArea = dynamic(
	() => import("./revenue-area").then((m) => m.RevenueArea),
	{ ssr: false, loading: chartFallback }
);
export const OrderFunnel = dynamic(
	() => import("./order-funnel").then((m) => m.OrderFunnel),
	{ ssr: false, loading: chartFallback }
);
export const RatingBars = dynamic(
	() => import("./rating-bars").then((m) => m.RatingBars),
	{ ssr: false, loading: chartFallback }
);
export const StatusDonut = dynamic(
	() => import("./status-donut").then((m) => m.StatusDonut),
	{ ssr: false, loading: chartFallback }
);
export const NewClientsLine = dynamic(
	() => import("./new-clients-line").then((m) => m.NewClientsLine),
	{ ssr: false, loading: chartFallback }
);
export const StockFlowArea = dynamic(
	() => import("./stock-flow-area").then((m) => m.StockFlowArea),
	{ ssr: false, loading: chartFallback }
);
