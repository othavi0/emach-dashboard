"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
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

import { formatDateTime } from "@/lib/format/datetime";
import { formatSessionIp } from "../_lib/format-session-ip";
import type { CustomerSessionRow } from "../data";
import { RevokeSessionDialog } from "./revoke-session-dialog";

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
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Sessões ativas</CardTitle>
			</CardHeader>
			<CardContent>
				{sessions.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhuma sessão ativa</EmptyTitle>
						</EmptyHeader>
					</Empty>
				) : (
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
										{formatDateTime(session.createdAt)}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatDateTime(session.expiresAt)}
									</TableCell>
									<TableCell className="font-mono text-muted-foreground text-xs">
										{formatSessionIp(session.ipAddress)}
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
				)}
			</CardContent>
		</Card>
	);
}
