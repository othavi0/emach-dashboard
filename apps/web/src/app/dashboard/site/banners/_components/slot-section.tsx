"use client";

import { Switch } from "@emach/ui/components/switch";
import type { ReactNode } from "react";

export function SlotSection({
	id,
	title,
	enabled,
	onToggle,
	children,
}: {
	id: string;
	title: string;
	enabled: boolean;
	onToggle: (on: boolean) => void;
	children: ReactNode;
}) {
	return (
		<fieldset className="rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between px-4 py-3">
				<label
					className="font-medium text-muted-foreground text-xs uppercase tracking-wider"
					htmlFor={id}
				>
					{title}
				</label>
				<Switch checked={enabled} id={id} onCheckedChange={onToggle} />
			</div>
			{enabled && (
				<div className="border-border border-t px-4 py-4">{children}</div>
			)}
		</fieldset>
	);
}
