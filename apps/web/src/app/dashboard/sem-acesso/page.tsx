import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Acesso negado",
};

interface PageProps {
	searchParams: Promise<{ recurso?: string }>;
}

export default function SemAcessoPage({ searchParams }: PageProps) {
	return (
		<Suspense>
			<SemAcessoPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function SemAcessoPageContent({ searchParams }: PageProps) {
	const { recurso } = await searchParams;
	const alvo = recurso ? `a seção "${recurso}"` : "esta seção";

	return (
		<div className="flex flex-col gap-6">
			<Empty>
				<EmptyHeader>
					<ShieldAlert aria-hidden className="size-8 text-muted-foreground" />
					<EmptyTitle>Acesso negado</EmptyTitle>
					<EmptyDescription>
						Você não tem permissão para acessar {alvo}. Se acha que precisa
						desse acesso, fale com um administrador.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/dashboard"
					>
						Voltar ao painel
					</Link>
				</EmptyContent>
			</Empty>
		</div>
	);
}
