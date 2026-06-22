"use client";

import type { ClientAuditAction } from "@emach/db/schema/client-audit";
import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@emach/ui/components/collapsible";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { ChevronDownIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateTime } from "@/lib/format/datetime";
import type { CustomerAuditRow } from "../data";

const ACTION_LABELS: Record<ClientAuditAction, string> = {
	profile_updated: "Perfil atualizado",
	status_changed: "Status alterado",
	type_changed: "Tipo alterado",
	notes_updated: "Notas atualizadas",
	session_revoked: "Sessão revogada",
	sessions_revoked_all: "Todas sessões revogadas",
	password_reset_link_generated: "Link de reset gerado",
	exported: "Exportado",
};

const ACTION_VARIANTS: Record<
	ClientAuditAction,
	"info" | "secondary" | "warning" | "destructive"
> = {
	profile_updated: "info",
	status_changed: "warning",
	type_changed: "info",
	notes_updated: "info",
	session_revoked: "warning",
	sessions_revoked_all: "warning",
	password_reset_link_generated: "info",
	exported: "info",
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS) as ClientAuditAction[];

interface CustomerAuditTableProps {
	clientId: string;
	currentAction?: string;
	items: CustomerAuditRow[];
}

export function CustomerAuditTable({
	items,
	currentAction,
	clientId,
}: CustomerAuditTableProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	function handleActionFilter(value: string | null) {
		const next = new URLSearchParams(searchParams.toString());
		next.set("tab", "auditoria");
		if (!value || value === "__all__") {
			next.delete("auditAction");
		} else {
			next.set("auditAction", value);
		}
		router.replace(`/dashboard/customers/${clientId}?${next.toString()}`);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-sm">Auditoria</CardTitle>
				<div className="w-64">
					<Select
						onValueChange={handleActionFilter}
						value={currentAction ?? "__all__"}
					>
						<SelectTrigger>
							<SelectValue>
								{(v: string) =>
									v === "__all__"
										? "Todas as ações"
										: (ACTION_LABELS[v as ClientAuditAction] ?? v)
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="__all__">Todas as ações</SelectItem>
								{ALL_ACTIONS.map((action) => (
									<SelectItem key={action} value={action}>
										{ACTION_LABELS[action]}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhum registro de auditoria</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Ação</TableHead>
								<TableHead>Ator</TableHead>
								<TableHead>Diff</TableHead>
								<TableHead>Motivo</TableHead>
								<TableHead>Data</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((entry) => {
								const variant = ACTION_VARIANTS[entry.action] ?? "secondary";
								const label = ACTION_LABELS[entry.action] ?? entry.action;
								const hasDiff =
									entry.beforeJson !== null || entry.afterJson !== null;

								return (
									<TableRow key={entry.id}>
										<TableCell>
											<Badge variant={variant}>{label}</Badge>
										</TableCell>
										<TableCell className="text-sm">
											{entry.actorLabel}
										</TableCell>
										<TableCell className="text-sm">
											{hasDiff ? (
												<Collapsible>
													<CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
														Ver diff
														<ChevronDownIcon className="size-3" />
													</CollapsibleTrigger>
													<CollapsibleContent>
														<pre className="mt-1 max-w-xs overflow-auto rounded bg-muted px-2 py-1 font-mono text-[10px]">
															{entry.beforeJson !== null && (
																<div className="text-destructive">
																	{"- "}
																	{JSON.stringify(entry.beforeJson, null, 2)}
																</div>
															)}
															{entry.afterJson !== null && (
																<div className="text-success">
																	{"+ "}
																	{JSON.stringify(entry.afterJson, null, 2)}
																</div>
															)}
														</pre>
													</CollapsibleContent>
												</Collapsible>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell className="max-w-[160px] text-sm">
											{entry.reason ? (
												<Tooltip>
													<TooltipTrigger>
														<span className="block truncate text-muted-foreground">
															{entry.reason}
														</span>
													</TooltipTrigger>
													<TooltipContent className="max-w-xs">
														{entry.reason}
													</TooltipContent>
												</Tooltip>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatDateTime(entry.createdAt)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
