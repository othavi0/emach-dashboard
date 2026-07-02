"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Briefcase, CalendarDays, Clock, Monitor } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { formatDate } from "@/lib/format/datetime";
import { formatRelative } from "@/lib/format/relative";
import { RoleBadge } from "../../_components/role-badge";
import { StatusBadge } from "../../_components/status-badge";
import type {
	UserActivityRow,
	UserDetail,
	UserDetailKpis,
	UserLinkedBranch,
} from "../../data";
import { ACTION_ICONS, FALLBACK_ACTION_ICON } from "./activity-icons";
import { ACTIVITY_LABELS_AFFECTING } from "./activity-labels";
import { SwitchTabButton } from "./switch-tab-button";

interface Props {
	kpis: UserDetailKpis;
	linkedBranches: UserLinkedBranch[];
	recentActivity: (UserActivityRow & { actorName: string | null })[];
	user: UserDetail;
}

export function ProfileTab({
	user,
	kpis,
	linkedBranches,
	recentActivity,
}: Props) {
	const lastLoginLabel = kpis.lastLoginAt
		? formatRelative(kpis.lastLoginAt)
		: "Nunca";

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow
				items={[
					{ label: "Filiais", value: kpis.linkedBranches, icon: Briefcase },
					{
						label: "Sessões ativas",
						value: kpis.activeSessions,
						icon: Monitor,
					},
					{
						label: "Último login",
						value: lastLoginLabel,
						icon: Clock,
					},
					{
						label: "Cadastrado em",
						value: formatDate(kpis.createdAt),
						icon: CalendarDays,
					},
				]}
			/>

			{/* Identidade & acesso — campos em 3 colunas + faixa-footer com o ID */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-sm">Identidade & acesso</CardTitle>
					<StatusBadge status={user.status} />
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								E-mail
							</dt>
							<dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
								<span className="break-all">{user.email}</span>
								<Badge variant={user.emailVerified ? "success" : "secondary"}>
									{user.emailVerified ? "Verificado" : "Não verificado"}
								</Badge>
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Cargo
							</dt>
							<dd className="mt-1">
								<RoleBadge role={user.role} />
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Filiais
							</dt>
							<dd className="mt-1">
								{linkedBranches.length === 0 ? (
									<span className="text-muted-foreground text-sm italic">
										Sem filial vinculada
									</span>
								) : (
									<div className="flex flex-wrap gap-1.5">
										{linkedBranches.map((b) => (
											<span
												className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
												key={b.id}
											>
												{b.name}
											</span>
										))}
									</div>
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Provedor de login
							</dt>
							<dd className="mt-1 text-sm">{user.provider ?? "—"}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Sessões ativas
							</dt>
							<dd className="mt-1 text-sm tabular-nums">
								{kpis.activeSessions}{" "}
								{kpis.activeSessions === 1 ? "dispositivo" : "dispositivos"}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Último login
							</dt>
							<dd className="mt-1 text-sm">{lastLoginLabel}</dd>
						</div>
					</dl>
					<div className="-mx-4 mt-4 -mb-4 border-border border-t">
						<div className="flex flex-col items-center py-2.5">
							<span className="font-medium font-mono text-[13px] text-foreground">
								{user.id}
							</span>
							<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
								ID do usuário
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Atividade recente — prévia em tabela (histórico completo na aba Atividade) */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-sm">Atividade recente</CardTitle>
					<SwitchTabButton
						className="text-primary text-xs hover:underline"
						tab="activity"
					>
						Ver tudo
					</SwitchTabButton>
				</CardHeader>
				<CardContent>
					{recentActivity.length === 0 ? (
						<p className="py-6 text-center text-muted-foreground text-sm">
							Nenhuma atividade registrada
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Ação</TableHead>
									<TableHead>Por quem</TableHead>
									<TableHead className="text-right">Quando</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{recentActivity.map((item) => {
									const Icon =
										ACTION_ICONS[item.action] ?? FALLBACK_ACTION_ICON;
									return (
										<TableRow key={item.id}>
											<TableCell>
												<div className="flex items-center gap-2">
													<Icon
														aria-hidden
														className="size-4 shrink-0 text-muted-foreground"
													/>
													<span>
														{ACTIVITY_LABELS_AFFECTING[item.action] ??
															item.action}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{item.actorName ?? "—"}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{formatRelative(new Date(item.createdAt))}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
