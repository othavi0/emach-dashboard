"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { logger } from "@/lib/logger";

export default function RouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		logger.error("route-error-boundary", error);
	}, [error]);

	return (
		<main className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
			<div className="flex size-12 items-center justify-center rounded-[14px] bg-destructive/12 text-destructive">
				<TriangleAlert aria-hidden className="size-6" />
			</div>

			<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
				Erro inesperado
			</p>
			<h1 className="mt-3 font-medium font-serif text-3xl tracking-tight">
				Algo deu errado
			</h1>
			<p className="mt-2 max-w-[42ch] text-muted-foreground text-sm leading-relaxed">
				Encontramos um problema ao carregar esta página. Tente novamente ou
				volte para o início.
			</p>

			<div className="mt-6 flex items-center gap-3">
				<Button onClick={reset}>Tentar de novo</Button>
				<Link
					className={buttonVariants({ variant: "outline" })}
					href="/dashboard"
				>
					Voltar ao dashboard
				</Link>
			</div>

			{error.digest ? (
				<p className="mt-6 font-mono text-[11px] text-muted-foreground/70">
					Código do erro: {error.digest}
				</p>
			) : null}
		</main>
	);
}
