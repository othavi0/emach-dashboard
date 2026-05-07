"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

interface ScopePopoverTool {
	id: string;
	name: string;
}

interface ScopePopoverProps {
	tools: ScopePopoverTool[];
}

export function ScopePopover({ tools }: ScopePopoverProps) {
	if (tools.length === 0) {
		return <Badge variant="warning">Sem ferramentas</Badge>;
	}

	const label =
		tools.length === 1 ? "1 ferramenta" : `${tools.length} ferramentas`;

	return (
		<Popover>
			<PopoverTrigger
				className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
				type="button"
			>
				{label}
				<ChevronDown aria-hidden className="size-3" />
			</PopoverTrigger>
			<PopoverContent align="start" className="max-h-80 w-72 overflow-auto p-1">
				<ul className="flex flex-col gap-0.5">
					{tools.map((tool) => (
						<li key={tool.id}>
							<Link
								className="block truncate rounded px-2 py-1.5 text-foreground text-sm hover:bg-muted"
								href={`/dashboard/tools/${tool.id}/edit`}
								title={tool.name}
							>
								{tool.name}
							</Link>
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
