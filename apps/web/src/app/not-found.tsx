import { buttonVariants } from "@emach/ui/components/button";
import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
			<div className="flex size-12 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
				<Compass aria-hidden className="size-6" />
			</div>

			<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
				Erro 404
			</p>
			<h1 className="mt-3 font-medium font-serif text-3xl uppercase tracking-[0.015em]">
				Página não encontrada
			</h1>
			<p className="mt-2 max-w-[42ch] text-muted-foreground text-sm leading-relaxed">
				O endereço que você acessou não existe ou foi movido. Verifique o link
				ou volte para o início.
			</p>

			<Link
				className={`${buttonVariants({ variant: "default" })} mt-6`}
				href="/dashboard"
			>
				Voltar ao dashboard
			</Link>
		</main>
	);
}
