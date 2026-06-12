import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	title: string;
}

export function SectionCard({
	title,
	action,
	children,
	className,
}: SectionCardProps) {
	return (
		<section
			className={cn(
				"flex flex-col overflow-hidden rounded-lg border border-border bg-card",
				className
			)}
		>
			<header className="flex items-center justify-between gap-2 border-border border-b px-4 py-2.5">
				<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					{title}
				</h3>
				{action}
			</header>
			<div className="p-4">{children}</div>
		</section>
	);
}
