"use client";

import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";
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

import type { CustomerSessionRow } from "../data";
import { RevokeAllSessionsDialog } from "./revoke-all-sessions-dialog";
import { RevokeSessionDialog } from "./revoke-session-dialog";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date) {
	const diffMs = date.getTime() - Date.now();
	const diffDays = Math.round(diffMs / 86_400_000);
	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			const diffMinutes = Math.round(diffMs / 60_000);
			return RELATIVE.format(diffMinutes, "minute");
		}
		return RELATIVE.format(diffHours, "hour");
	}
	return RELATIVE.format(diffDays, "day");
}

function summarizeUserAgent(ua: string | null): string {
	if (!ua) {
		return "Desconhecido";
	}
	const truncated = ua.length > 60 ? `${ua.slice(0, 60)}…` : ua;
	return truncated;
}

interface CustomerSessionsTableProps {
	canManage: boolean;
	clientId: string;
	sessions: CustomerSessionRow[];
}

export function CustomerSessionsTable({
	sessions,
	clientId,
	canManage,
}: CustomerSessionsTableProps) {
	if (sessions.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhuma sessão ativa</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{canManage && (
				<div className="flex justify-end">
					<RevokeAllSessionsDialog
						clientId={clientId}
						sessionCount={sessions.length}
					/>
				</div>
			)}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Criada em</TableHead>
						<TableHead>Expira em</TableHead>
						<TableHead>IP</TableHead>
						<TableHead>User Agent</TableHead>
						<TableHead>Última atividade</TableHead>
						{canManage && (
							<TableHead className="w-16 text-right">Ação</TableHead>
						)}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sessions.map((session) => (
						<TableRow key={session.id}>
							<TableCell className="text-muted-foreground text-sm">
								{DATE_TIME.format(session.createdAt)}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{DATE_TIME.format(session.expiresAt)}
							</TableCell>
							<TableCell className="font-mono text-muted-foreground text-xs">
								{session.ipAddress ?? "—"}
							</TableCell>
							<TableCell className="max-w-[200px] text-sm">
								{session.userAgent ? (
									<Tooltip>
										<TooltipTrigger
											render={
												<span className="block truncate text-muted-foreground">
													{summarizeUserAgent(session.userAgent)}
												</span>
											}
										/>
										<TooltipContent className="max-w-xs break-all">
											{session.userAgent}
										</TooltipContent>
									</Tooltip>
								) : (
									<span className="text-muted-foreground">—</span>
								)}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{formatRelative(session.updatedAt)}
							</TableCell>
							{canManage && (
								<TableCell className="text-right">
									<RevokeSessionDialog
										clientId={clientId}
										sessionId={session.id}
										userAgentSummary={
											session.userAgent
												? summarizeUserAgent(session.userAgent)
												: undefined
										}
									/>
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
