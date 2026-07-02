import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SwitchTabButton } from "./switch-tab-button";

export type KpiTone = "default" | "warning" | "danger" | "success";

export interface KpiItem {
	hint?: ReactNode;
	href?: string;
	icon?: LucideIcon;
	label: string;
	switchTab?: string;
	tone?: KpiTone;
	value: ReactNode;
}

interface Props {
	iconSize?: "sm" | "lg";
	items: KpiItem[];
}

const TONE_VALUE: Record<KpiTone, string> = {
	default: "text-foreground",
	warning: "text-warning",
	danger: "text-destructive",
	success: "text-success",
};

const TONE_ICON: Record<KpiTone, string> = {
	default: "text-muted-foreground",
	warning: "text-warning",
	danger: "text-destructive",
	success: "text-success",
};

const ICON_SIZE: Record<"sm" | "lg", string> = {
	sm: "size-4",
	lg: "size-5",
};

export function EntityKpisRow({ items, iconSize = "sm" }: Props) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			{items.map((item) => {
				const tone = item.tone ?? "default";
				const Icon = item.icon;
				const inner = (
					<Card className="h-full">
						<CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
							<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
								{item.label}
							</CardTitle>
							{Icon ? (
								<Icon
									aria-hidden
									className={cn(ICON_SIZE[iconSize], TONE_ICON[tone])}
								/>
							) : null}
						</CardHeader>
						<CardContent>
							<p
								className={cn(
									"font-medium text-2xl tabular-nums tracking-tight",
									TONE_VALUE[tone]
								)}
							>
								{item.value}
							</p>
							{item.hint ? (
								<p className="text-muted-foreground text-xs">{item.hint}</p>
							) : null}
						</CardContent>
					</Card>
				);
				let content: ReactNode = inner;
				if (item.switchTab) {
					content = (
						<SwitchTabButton
							className="block h-full w-full text-left transition-opacity hover:opacity-80"
							tab={item.switchTab}
						>
							{inner}
						</SwitchTabButton>
					);
				} else if (item.href) {
					content = (
						<Link
							className="block h-full transition-opacity hover:opacity-80"
							href={item.href}
						>
							{inner}
						</Link>
					);
				}
				return (
					<div className="h-full" key={item.label}>
						{content}
					</div>
				);
			})}
		</div>
	);
}
