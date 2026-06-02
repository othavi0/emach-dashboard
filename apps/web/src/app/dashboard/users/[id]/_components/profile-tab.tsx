import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Briefcase, CalendarDays, Clock, Monitor } from "lucide-react";
import Link from "next/link";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { formatRelative } from "@/lib/format/relative";
import { RoleBadge } from "../../_components/role-badge";
import { StatusBadge } from "../../_components/status-badge";
import type { UserDetail, UserDetailKpis, UserLinkedBranch } from "../../data";

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

interface Props {
	kpis: UserDetailKpis;
	linkedBranches: UserLinkedBranch[];
	user: UserDetail;
}

export function ProfileTab({ user, kpis, linkedBranches }: Props) {
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
						value: kpis.lastLoginAt
							? formatRelative(kpis.lastLoginAt)
							: "Nunca",
						icon: Clock,
					},
					{
						label: "Cadastrado em",
						value: formatDate(kpis.createdAt),
						icon: CalendarDays,
					},
				]}
			/>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Identidade & acesso */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Identidade & acesso</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								E-mail
							</p>
							<div className="mt-1 flex flex-wrap items-center gap-2">
								<span className="text-sm">{user.email}</span>
								<Badge variant={user.emailVerified ? "success" : "secondary"}>
									{user.emailVerified ? "Verificado" : "Não verificado"}
								</Badge>
							</div>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Cargo
							</p>
							<div className="mt-1">
								<RoleBadge role={user.role} />
							</div>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Status
							</p>
							<div className="mt-1">
								<StatusBadge status={user.status} />
							</div>
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Provedor de login
							</p>
							<p className="mt-1 text-sm">{user.provider ?? "—"}</p>
						</div>
					</CardContent>
				</Card>

				{/* Vínculos & atividade */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Vínculos & atividade</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{linkedBranches.length === 0 ? (
							<p className="text-muted-foreground text-sm italic">
								Sem filial vinculada
							</p>
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
						<Link
							className="text-primary text-xs hover:underline"
							href="?tab=activity"
						>
							Ver atividade
						</Link>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
