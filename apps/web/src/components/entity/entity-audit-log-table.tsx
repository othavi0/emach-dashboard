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
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ScrollTextIcon,
} from "lucide-react";
import { Fragment, useState } from "react";

import { formatDateTime } from "@/lib/format/datetime";

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

function ExpandIcon({
	expandable,
	isOpen,
}: {
	expandable: boolean;
	isOpen: boolean;
}) {
	if (!expandable) {
		return null;
	}
	const Icon = isOpen ? ChevronDownIcon : ChevronRightIcon;
	return <Icon className="size-4 text-muted-foreground" />;
}

function DiffPanel({ label, value }: { label: string; value: unknown }) {
	return (
		<div>
			<p className="mb-1 text-muted-foreground text-xs uppercase">{label}</p>
			<pre className="rounded bg-background p-2 text-xs">
				{JSON.stringify(value, null, 2)}
			</pre>
		</div>
	);
}

function AuditRow({
	entry,
	expandable,
	isOpen,
	onToggle,
	actionLabel,
}: {
	entry: AuditEntry;
	expandable: boolean;
	isOpen: boolean;
	onToggle: () => void;
	actionLabel: string;
}) {
	return (
		<TableRow
			className={cn(expandable && "cursor-pointer")}
			onClick={expandable ? onToggle : undefined}
		>
			<TableCell>
				<ExpandIcon expandable={expandable} isOpen={isOpen} />
			</TableCell>
			<TableCell className="text-sm tabular-nums">
				{formatDateTime(entry.at)}
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
				<Badge variant="secondary">{actionLabel}</Badge>
			</TableCell>
			<TableCell className="text-sm">{entry.target?.label ?? "—"}</TableCell>
		</TableRow>
	);
}

function DetailRow({ entry }: { entry: AuditEntry }) {
	return (
		<TableRow>
			<TableCell />
			<TableCell className="bg-muted/30" colSpan={4}>
				{entry.reason ? (
					<p className="mb-2 text-sm">
						<span className="font-medium">Motivo:</span> {entry.reason}
					</p>
				) : null}
				<div className="grid gap-3 sm:grid-cols-2">
					{entry.before ? (
						<DiffPanel label="Antes" value={entry.before} />
					) : null}
					{entry.after ? (
						<DiffPanel label="Depois" value={entry.after} />
					) : null}
				</div>
			</TableCell>
		</TableRow>
	);
}

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
			<div className="flex flex-col items-center gap-2 py-12 text-center">
				<ScrollTextIcon
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">{emptyMessage}</p>
				<p className="text-muted-foreground text-xs">
					As mutações registradas aparecerão aqui.
				</p>
			</div>
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
					const actionLabel = actionLabels[entry.action] ?? entry.action;
					return (
						<Fragment key={entry.id}>
							<AuditRow
								actionLabel={actionLabel}
								entry={entry}
								expandable={expandable}
								isOpen={isOpen}
								onToggle={() => toggle(entry.id)}
							/>
							{isOpen && expandable ? <DetailRow entry={entry} /> : null}
						</Fragment>
					);
				})}
			</TableBody>
		</Table>
	);
}
