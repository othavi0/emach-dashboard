import Image from "next/image";

const TOOL_SIZES = "(min-width: 900px) 562px, 193px";

export function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="auth-wall relative isolate grid min-h-svh flex-1 grid-rows-[280px_auto] overflow-hidden min-[900px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)] min-[900px]:grid-rows-none">
			<div aria-hidden className="auth-holes" />
			<div aria-hidden className="auth-holes-lit" />
			<div aria-hidden className="auth-vignette" />

			<main className="relative z-2 mx-3 mb-4 flex flex-col rounded-[14px] border border-border/60 bg-card px-5 py-7 shadow-[0_30px_60px_-20px_oklch(0_0_0/0.6)] min-[900px]:m-6 min-[900px]:p-10">
				<Image
					alt="Emach"
					className="h-7 w-auto self-start"
					height={28}
					priority
					src="/emach-nome-branco.svg"
					width={152}
				/>
				<h1 className="mt-7 mb-6 font-semibold font-serif text-[40px] uppercase leading-[0.95] tracking-[0.015em] min-[900px]:mt-12 min-[900px]:mb-8 min-[900px]:text-[52px]">
					Painel de <span className="text-primary">gestão</span>
				</h1>
				{children}
			</main>

			<section
				aria-hidden
				className="relative z-1 order-first grid place-items-center min-[900px]:order-none"
			>
				<div className="auth-tool">
					<div className="auth-tool-shadow" />
					<Image
						alt=""
						className="auth-scan-line object-contain"
						fill
						priority
						sizes={TOOL_SIZES}
						src="/login/eci900-contorno.webp"
					/>
					<Image
						alt=""
						className="auth-scan-photo object-contain"
						fill
						priority
						sizes={TOOL_SIZES}
						src="/login/eci900.webp"
					/>
					<div className="auth-scan-beam" />
					<div className="auth-dims">
						<span className="absolute -top-4.5 -left-4.5 size-3.5 border-primary border-t-[1.5px] border-l-[1.5px]" />
						<span className="absolute -top-4.5 -right-4.5 size-3.5 border-primary border-t-[1.5px] border-r-[1.5px]" />
						<span className="absolute -bottom-4.5 -left-4.5 size-3.5 border-primary border-b-[1.5px] border-l-[1.5px]" />
						<span className="absolute -right-4.5 -bottom-4.5 size-3.5 border-primary border-r-[1.5px] border-b-[1.5px]" />
						<div className="auth-dim-h">
							<span className="auth-dim-label">ECI900</span>
						</div>
						<div className="auth-dim-v" />
					</div>
				</div>
				<p className="absolute top-4 right-4 z-2 text-right text-muted-foreground text-xs min-[900px]:top-auto min-[900px]:right-8 min-[900px]:bottom-7 min-[900px]:text-[13px]">
					<span className="block font-medium font-mono text-[13px] text-foreground tracking-[0.04em]">
						ECI900
					</span>
					<span className="hidden min-[900px]:inline">
						Chave de impacto brushless com 2 baterias
					</span>
				</p>
			</section>
		</div>
	);
}
