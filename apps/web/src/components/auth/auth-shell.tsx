import Image from "next/image";

export function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="grid min-h-svh flex-1 md:grid-cols-[1.05fr_0.95fr]">
			<aside className="relative hidden flex-col justify-between bg-surface-deep px-10 py-12 md:flex">
				<Image
					alt="Emach"
					className="h-8 w-auto"
					height={32}
					priority
					src="/emach-nome-branco.svg"
					width={132}
				/>
				<div>
					<h1 className="font-medium font-serif text-5xl text-foreground uppercase tracking-[0.015em]">
						Painel de <span className="text-primary">gestão</span>
					</h1>
					<span
						aria-hidden
						className="mt-4 block h-[3px] w-14 rounded-full bg-primary"
					/>
					<p className="mt-4 max-w-[32ch] text-muted-foreground text-sm leading-relaxed">
						Estoque, pedidos e catálogo da E-mach em um só lugar.
					</p>
				</div>
				<p className="text-[11px] text-muted-foreground uppercase tracking-wider">
					Acesso restrito · equipe interna
				</p>
			</aside>

			<main className="flex items-center justify-center bg-background px-6 py-12">
				<div className="w-full max-w-sm">
					<Image
						alt="Emach"
						className="mb-8 h-7 w-auto md:hidden"
						height={29}
						priority
						src="/emach-nome-branco.svg"
						width={120}
					/>
					{children}
				</div>
			</main>
		</div>
	);
}
