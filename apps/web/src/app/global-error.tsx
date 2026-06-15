"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import "../index.css";
import { logger } from "@/lib/logger";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		logger.error("global-error-boundary", error);
	}, [error]);

	return (
		<html className="dark" lang="pt-BR">
			<body className="min-h-svh antialiased">
				<main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-20 text-center">
					<div className="flex size-12 items-center justify-center rounded-[14px] bg-destructive/12 text-destructive">
						<TriangleAlert aria-hidden className="size-6" />
					</div>

					<p className="mt-6 text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
						Erro inesperado
					</p>
					<h1 className="mt-3 font-medium text-3xl tracking-tight">
						Algo deu errado
					</h1>
					<p className="mt-2 max-w-[42ch] text-muted-foreground text-sm leading-relaxed">
						Encontramos um problema ao carregar a aplicação. Tente novamente.
					</p>

					<button
						className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
						onClick={reset}
						type="button"
					>
						Tentar de novo
					</button>

					{error.digest ? (
						<p className="mt-6 font-mono text-[11px] text-muted-foreground/70">
							Código do erro: {error.digest}
						</p>
					) : null}
				</main>
			</body>
		</html>
	);
}
