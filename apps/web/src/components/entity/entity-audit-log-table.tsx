"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Fragment, useState } from "react";

export interface AuditEntry {
	action: string;
	actor: { id: string | null; name: string; type: "user" | "system" };
	after?: Record<string, unknown> | null;
	at: Date;
	before?: Record<string, unknown> | null;
	id: string;
	reason?: string | null;
	target?: { label: string; href?: string };
}

interface Props {
	actionLabels?: Record<string, string>;
	emptyMessage?: string;
	entries: AuditEntry[];
}

const DATETIME = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
});

function hasDiff(entry: AuditEntry): boolean {
	return Boolean(
		(entry.before && Object.keys(entry.before).length > 0) ||
			(entry.after && Object.keys(entry.after).length > 0) ||
			entry.reason
	);
}

export function EntityAuditLogTable({
	entries,
	actionLabels = {},
	emptyMessage = "Sem registros.",
}: Props) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	if (entries.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}

	const toggle = (id: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10" />
					<TableHead>Quando</TableHead>
					<TableHead>Ator</TableHead>
					<TableHead>Ação</TableHead>
					<TableHead>Alvo</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((entry) => {
					const isOpen = expanded.has(entry.id);
					const expandable = hasDiff(entry);
					return (
						<Fragment key={entry.id}>
							<TableRow
								className={cn(expandable && "cursor-pointer")}
								onClick={() => expandable && toggle(entry.id)}
							>
								<TableCell>
									{expandable ? (
										isOpen ? (
											<ChevronDownIcon className="size-4 text-muted-foreground" />
										) : (
											<ChevronRightIcon className="size-4 text-muted-foreground" />
										)
									) : null}
								</TableCell>
								<TableCell className="text-sm tabular-nums">
									{DATETIME.format(entry.at)}
								</TableCell>
								<TableCell className="text-sm">
									{entry.actor.name}
									{entry.actor.type === "system" ? (
										<Badge className="ml-1.5" variant="outline">
											sistema
										</Badge>
									) : null}
								</TableCell>
								<TableCell>
									<Badge variant="secondary">
										{actionLabels[entry.action] ?? entry.action}
									</Badge>
								</TableCell>
								<TableCell className="text-sm">
									{entry.target?.label ?? "—"}
								</TableCell>
							</TableRow>
							{isOpen && expandable ? (
								<TableRow>
									<TableCell />
									<TableCell className="bg-muted/30" colSpan={4}>
										{entry.reason ? (
											<p className="mb-2 text-sm">
												<span className="font-medium">Motivo:</span>{" "}
												{entry.reason}
											</p>
										) : null}
										<div className="grid gap-3 sm:grid-cols-2">
											{entry.before ? (
												<div>
													<p className="mb-1 text-muted-foreground text-xs uppercase">
														Antes
													</p>
													<pre className="rounded bg-background p-2 text-xs">
														{JSON.stringify(entry.before, null, 2)}
													</pre>
												</div>
											) : null}
											{entry.after ? (
												<div>
													<p className="mb-1 text-muted-foreground text-xs uppercase">
														Depois
													</p>
													<pre className="rounded bg-background p-2 text-xs">
														{JSON.stringify(entry.after, null, 2)}
													</pre>
												</div>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							) : null}
						</Fragment>
					);
				})}
			</TableBody>
		</Table>
	);
}
