import type { ReactNode } from "react";

interface PageHeaderProps {
	action?: ReactNode;
	description?: ReactNode;
	title: ReactNode;
}

export function PageHeader({ action, description, title }: PageHeaderProps) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="font-medium font-serif text-2xl uppercase leading-tight tracking-[0.015em]">
					{title}
				</h1>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}
