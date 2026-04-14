import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import { requireCurrentSession } from "@/lib/session";

const crmModules = [
	{
		title: "Pipeline",
		description:
			"Organize oportunidades e acompanhe o avanco do funil comercial.",
	},
	{
		title: "Contatos",
		description: "Centralize contas, decisores e historico de relacionamento.",
	},
	{
		title: "Atividades",
		description: "Registre follow-ups, tarefas e proximos passos do time.",
	},
] as const;

const setupChecklist = [
	"Definir entidades principais do CRM: company, contact, deal e activity.",
	"Criar navegacao lateral e layout interno do dashboard.",
	"Mapear permissoes e perfis antes de abrir modulos de gestao.",
] as const;

const authChecklist = [
	"Cadastro por email e senha ativo.",
	"Sessao server-side protegendo /dashboard.",
	"Logout no cabecalho mantendo o fluxo do Better Auth.",
] as const;

export default async function DashboardPage() {
	const session = await requireCurrentSession();

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
			<section className="flex flex-col gap-2">
				<p className="text-muted-foreground text-sm">Workspace</p>
				<h1 className="font-semibold text-2xl tracking-tight">CRM dashboard</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					{session.user.name}, a base de autenticacao esta estavel e o app foi
					reduzido para um ponto de partida limpo. A partir daqui, o foco pode
					ir para modulos de CRM em vez de template e boilerplate.
				</p>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
				{crmModules.map((module) => {
					return (
						<Card key={module.title}>
							<CardHeader>
								<CardTitle>{module.title}</CardTitle>
								<CardDescription>{module.description}</CardDescription>
							</CardHeader>
						</Card>
					);
				})}
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
				<Card>
					<CardHeader>
						<CardTitle>Checklist inicial</CardTitle>
						<CardDescription>
							Ordem sugerida para comecar a construcao do produto.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-3 text-muted-foreground text-sm">
							{setupChecklist.map((item) => {
								return <li key={item}>{item}</li>;
							})}
						</ul>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Status da autenticacao</CardTitle>
						<CardDescription>{session.user.email}</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col gap-3 text-muted-foreground text-sm">
							{authChecklist.map((item) => {
								return <li key={item}>{item}</li>;
							})}
						</ul>
					</CardContent>
				</Card>
			</section>
		</main>
	);
}
