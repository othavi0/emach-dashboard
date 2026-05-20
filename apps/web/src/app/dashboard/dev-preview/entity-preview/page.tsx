"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Ban,
	Building2,
	CheckCircle2,
	Clock,
	Eye,
	Factory,
	MoreHorizontal,
} from "lucide-react";
import { useState } from "react";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";
import { EntityCard, EntityCardGrid } from "@/components/entity/entity-card";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";

const SAMPLE_AUDIT = [
	{
		id: "a1",
		at: new Date("2026-05-19T14:32:00"),
		action: "profile_updated",
		actor: { id: "u1", name: "João Mendes", type: "user" as const },
		target: { label: "Joaquim Industrial" },
		before: { phone: "11 9999-1111" },
		after: { phone: "11 9999-2222" },
	},
	{
		id: "a2",
		at: new Date("2026-05-18T09:10:00"),
		action: "created",
		actor: { id: null, name: "sistema", type: "system" as const },
		target: { label: "Joaquim Industrial" },
	},
];

export default function EntityPreview() {
	const [open, setOpen] = useState(false);
	return (
		<div className="space-y-8">
			<PageHeader
				description="Bancada visual dos primitives da Fase 0"
				title="Entity Preview"
			/>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityKpisRow</h2>
				<EntityKpisRow
					items={[
						{ label: "Ativos", value: 12, icon: CheckCircle2 },
						{
							label: "Pendentes",
							value: 3,
							tone: "warning",
							icon: Clock,
							href: "?status=pending",
						},
						{ label: "Suspensos", value: 1, icon: Ban },
						{ label: "Filiais", value: 4, icon: Building2 },
					]}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityIdentityHeader</h2>
				<EntityIdentityHeader
					actions={
						<>
							<Button onClick={() => setOpen(true)}>Editar</Button>
							<Button variant="outline">Reset senha</Button>
							<Button variant="outline">Suspender</Button>
						</>
					}
					avatarFallback="JM"
					badges={
						<>
							<Badge>Admin</Badge>
							<Badge variant="outline">
								<CheckCircle2 className="mr-1 size-3" /> Ativo
							</Badge>
						</>
					}
					subtitle="joao@emach.com.br"
					title="João Mendes"
				/>
				<EntityIdentityHeader
					avatarFallback={<Factory className="size-5" />}
					badges={<Badge variant="outline">website</Badge>}
					subtitle="contato@joaquim.com.br"
					title="Joaquim Industrial Ltda"
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityCardGrid (lista)</h2>
				<EntityCardGrid>
					<EntityCard
						avatarFallback="JM"
						badges={
							<>
								<Badge>Admin</Badge>
								<Badge variant="outline">
									<CheckCircle2 className="mr-1 size-3" /> Ativo
								</Badge>
							</>
						}
						footer={
							<>
								<span className="text-muted-foreground text-xs">
									Último login há 2h
								</span>
								<Button size="sm" variant="outline">
									<Eye aria-hidden className="size-3.5" /> Ver
								</Button>
							</>
						}
						href="#"
						meta="Matriz SP · Filial RJ"
						subtitle="joao@emach.com.br"
						title="João Mendes"
					/>
					<EntityCard
						avatarFallback="AS"
						badges={
							<>
								<Badge variant="secondary">Manager</Badge>
								<Badge variant="outline">
									<CheckCircle2 className="mr-1 size-3" /> Ativo
								</Badge>
							</>
						}
						footer={
							<>
								<span className="text-muted-foreground text-xs">
									Último login há 1d
								</span>
								<Button size="sm" variant="outline">
									<Eye aria-hidden className="size-3.5" /> Ver
								</Button>
							</>
						}
						href="#"
						meta="Filial RJ"
						subtitle="ana@emach.com.br"
						title="Ana Silva"
					/>
					<EntityCard
						avatarFallback="CO"
						badges={
							<>
								<Badge variant="outline">Estoquista</Badge>
								<Badge variant="warning">
									<Clock className="mr-1 size-3" /> Pendente
								</Badge>
							</>
						}
						footer={
							<>
								<span className="text-muted-foreground text-xs">
									Aguardando aprovação
								</span>
								<Button size="sm">Aprovar</Button>
							</>
						}
						href="#"
						meta="Sem filial vinculada"
						subtitle="carlos@emach.com.br"
						title="Carlos Oliveira"
					/>
					<EntityCard
						avatarFallback="MR"
						badges={
							<>
								<Badge variant="outline">Estoquista</Badge>
								<Badge variant="destructive">
									<Ban className="mr-1 size-3" /> Suspenso
								</Badge>
							</>
						}
						footer={
							<>
								<span className="text-muted-foreground text-xs">
									Suspenso há 5d
								</span>
								<Button size="sm" variant="outline">
									<MoreHorizontal aria-hidden className="size-3.5" />
								</Button>
							</>
						}
						href="#"
						meta="Matriz SP"
						subtitle="mariana@emach.com.br"
						title="Mariana Rocha"
					/>
				</EntityCardGrid>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityTabs</h2>
				<EntityTabs
					defaultValue="profile"
					tabs={[
						{
							value: "profile",
							label: "Perfil",
							content: <p className="text-sm">Conteúdo da aba Perfil</p>,
						},
						{
							value: "branches",
							label: "Filiais",
							badge: (
								<Badge className="ml-1" variant="secondary">
									2
								</Badge>
							),
							content: <p className="text-sm">Conteúdo da aba Filiais</p>,
						},
						{
							value: "activity",
							label: "Atividade",
							content: <p className="text-sm">Conteúdo da aba Atividade</p>,
						},
					]}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityAuditLogTable</h2>
				<EntityAuditLogTable
					actionLabels={{
						profile_updated: "Perfil atualizado",
						created: "Criado",
					}}
					entries={SAMPLE_AUDIT}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityEditSheet</h2>
				<Button onClick={() => setOpen(true)}>Abrir sheet</Button>
				<EntityEditSheet
					description="Atualize os dados do usuário"
					onOpenChange={setOpen}
					onSubmit={(e) => {
						e.preventDefault();
						setOpen(false);
					}}
					open={open}
					title="Editar usuário"
				>
					<div className="space-y-4">
						<div>
							<Label htmlFor="name">Nome</Label>
							<Input defaultValue="João Mendes" id="name" />
						</div>
						<div>
							<Label htmlFor="email">Email</Label>
							<Input defaultValue="joao@emach.com.br" id="email" />
						</div>
					</div>
				</EntityEditSheet>
			</section>
		</div>
	);
}
