import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@emach/ui/components/alert";
import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";

interface Palette {
	hex: string;
	id: string;
	name: string;
	tagline: string;
	tokens: Record<string, string>;
}

const SHARED_TOKENS: Record<string, string> = {
	"--background": "oklch(0.16 0.005 70)",
	"--foreground": "oklch(0.97 0.008 85)",
	"--card": "oklch(0.20 0.005 70)",
	"--card-foreground": "oklch(0.97 0.008 85)",
	"--muted": "oklch(0.18 0.004 70)",
	"--muted-foreground": "oklch(0.70 0.010 75)",
	"--secondary": "oklch(0.42 0.020 70)",
	"--secondary-foreground": "oklch(0.97 0.008 85)",
	"--accent": "oklch(0.20 0.005 70)",
	"--accent-foreground": "oklch(0.97 0.008 85)",
	"--popover": "oklch(0.20 0.005 70)",
	"--popover-foreground": "oklch(0.97 0.008 85)",
	"--border": "oklch(0.36 0.008 70)",
	"--input": "oklch(0.42 0.010 70)",
	"--destructive": "oklch(0.55 0.20 15)",
	"--destructive-foreground": "oklch(0.99 0 0)",
};

const PALETTES: Palette[] = [
	{
		id: "amber",
		name: "Amber / Ochre",
		tagline: "primary hue 65 — âmbar queimado neutro, tom de oficina mecânica",
		hex: "#c08a3e",
		tokens: {
			...SHARED_TOKENS,
			"--primary": "oklch(0.68 0.16 65)",
			"--primary-foreground": "oklch(0.14 0.005 70)",
			"--ring": "oklch(0.68 0.16 65 / 0.55)",
		},
	},
	{
		id: "copper",
		name: "Copper / Burnt",
		tagline:
			"primary hue 45 — cobre oxidado, iteração anterior (substituído por coral)",
		hex: "#c2724a",
		tokens: {
			...SHARED_TOKENS,
			"--primary": "oklch(0.65 0.15 45)",
			"--primary-foreground": "oklch(0.99 0 0)",
			"--ring": "oklch(0.65 0.15 45 / 0.55)",
		},
	},
	{
		id: "brass",
		name: "Brass / Old gold",
		tagline: "primary hue 85 — latão fosco, leitura mais amarela e fria",
		hex: "#b69540",
		tokens: {
			...SHARED_TOKENS,
			"--primary": "oklch(0.72 0.14 85)",
			"--primary-foreground": "oklch(0.14 0.005 70)",
			"--ring": "oklch(0.72 0.14 85 / 0.55)",
		},
	},
	{
		id: "coral",
		name: "Coral / Anthropic",
		tagline: "primary hue 38 — coral Anthropic literal #cc785c, voz editorial",
		hex: "#cc785c",
		tokens: {
			...SHARED_TOKENS,
			"--primary": "oklch(0.65 0.13 38)",
			"--primary-foreground": "oklch(0.99 0 0)",
			"--ring": "oklch(0.65 0.13 38 / 0.55)",
		},
	},
];

const ROLES = [
	{
		id: "warning",
		label: "Aviso",
		bg: "oklch(0.78 0.15 85)",
		fg: "oklch(0.16 0.005 70)",
		alertTitle: "Estoque mínimo atingido",
		alertBody: "Variante DCD771-220V abaixo do mínimo na filial Centro.",
	},
	{
		id: "info",
		label: "Info",
		bg: "oklch(0.65 0.10 200)",
		fg: "oklch(0.99 0 0)",
		alertTitle: "Pedido atualizado",
		alertBody: "Status alterado para 'Em separação' por João.",
	},
	{
		id: "success",
		label: "OK",
		bg: "oklch(0.62 0.13 155)",
		fg: "oklch(0.99 0 0)",
		alertTitle: "Movimento registrado",
		alertBody: "+12 unidades em DCD771-127V (filial Sul).",
	},
];

function PaletteColumn({ palette }: { palette: Palette }) {
	return (
		<div
			className="flex flex-col gap-6 rounded-lg p-6"
			style={{
				...palette.tokens,
				background: "var(--background)",
				color: "var(--foreground)",
				border: "1px solid var(--border)",
			}}
		>
			<header className="flex flex-col gap-1">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<h2 className="font-medium text-lg tracking-tight">
							{palette.name}
						</h2>
						{palette.id === "coral" ? (
							<span
								className="inline-flex h-5 items-center rounded-md px-2 font-medium text-[10px] uppercase tracking-wider"
								style={{
									background: "var(--primary)",
									color: "var(--primary-foreground)",
								}}
							>
								Vencedor
							</span>
						) : null}
						{palette.id === "copper" ? (
							<span
								className="inline-flex h-5 items-center rounded-md border px-2 font-medium text-[10px] uppercase tracking-wider"
								style={{
									borderColor: "var(--border)",
									color: "var(--muted-foreground)",
								}}
							>
								Iteração anterior
							</span>
						) : null}
					</div>
					<span
						aria-hidden
						className="size-6 rounded-full"
						style={{
							background: "var(--primary)",
							boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.1)",
						}}
					/>
				</div>
				<p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
					{palette.tagline}
				</p>
				<code
					className="font-mono text-[10px]"
					style={{ color: "var(--muted-foreground)" }}
				>
					{palette.hex}
				</code>
			</header>

			<section className="flex flex-col gap-3">
				<SectionLabel>Botões</SectionLabel>
				<div className="flex flex-wrap gap-2">
					<Button size="sm">Primário</Button>
					<Button size="sm" variant="secondary">
						Secundário
					</Button>
					<Button size="sm" variant="outline">
						Outline
					</Button>
					<Button size="sm" variant="ghost">
						Ghost
					</Button>
					<Button size="sm" variant="destructive">
						Destrutivo
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>Badges (sistema atual)</SectionLabel>
				<div className="flex flex-wrap gap-2">
					<Badge>Novo</Badge>
					<Badge variant="secondary">Rascunho</Badge>
					<Badge variant="outline">Arquivado</Badge>
					<Badge variant="destructive">Cancelado</Badge>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>Roles propostos (warning / info / success)</SectionLabel>
				<div className="flex flex-wrap gap-2">
					{ROLES.map((r) => (
						<span
							className="inline-flex h-6 items-center rounded-md px-2 font-medium text-xs"
							key={r.id}
							style={{ background: r.bg, color: r.fg }}
						>
							{r.label}
						</span>
					))}
				</div>
				<div className="flex flex-col gap-2">
					{ROLES.map((r) => (
						<div
							className="flex items-start gap-3 rounded-md p-3 text-xs"
							key={`alert-${r.id}`}
							style={{
								background: "var(--card)",
								border: `1px solid ${r.bg}`,
							}}
						>
							<span
								aria-hidden
								className="mt-0.5 inline-block size-2 rounded-full"
								style={{ background: r.bg }}
							/>
							<div className="flex flex-col gap-0.5">
								<strong className="font-medium">{r.alertTitle}</strong>
								<span style={{ color: "var(--muted-foreground)" }}>
									{r.alertBody}
								</span>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>Inputs + foco</SectionLabel>
				<div className="grid gap-2">
					<Label htmlFor={`sku-${palette.id}`}>SKU</Label>
					<Input
						defaultValue="DCD771-127V-AZ"
						id={`sku-${palette.id}`}
						placeholder="ex: DCD771-127V-AZ"
					/>
					<p
						className="text-[11px]"
						style={{ color: "var(--muted-foreground)" }}
					>
						Click no campo pra ver focus ring (2px, sólido)
					</p>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>Alert (variantes shadcn)</SectionLabel>
				<Alert>
					<AlertTitle>Sincronização concluída</AlertTitle>
					<AlertDescription>
						432 variantes atualizadas em 1.2s.
					</AlertDescription>
				</Alert>
				<Alert variant="destructive">
					<AlertTitle>SKU duplicado</AlertTitle>
					<AlertDescription>
						Variante 2 usa "DCD771-127V" (já em variante 1).
					</AlertDescription>
				</Alert>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>Combinação real (linha de pedido)</SectionLabel>
				<div
					className="flex items-center justify-between gap-4 rounded-md p-3"
					style={{
						background: "var(--card)",
						border: "1px solid var(--border)",
					}}
				>
					<div className="flex flex-col">
						<strong className="font-medium text-sm">
							Furadeira DCD771 — 127V
						</strong>
						<span
							className="text-xs"
							style={{ color: "var(--muted-foreground)" }}
						>
							SKU DCD771-127V-AZ · Filial Centro
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Badge variant="secondary">12 un.</Badge>
						<Button size="sm">Ajustar</Button>
					</div>
				</div>
			</section>
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="font-medium font-mono text-[10px] uppercase tracking-widest"
			style={{ color: "var(--muted-foreground)" }}
		>
			{children}
		</span>
	);
}

export default function DesignPreviewPage() {
	return (
		<div className="mx-auto max-w-[1600px] px-6 py-12">
			<header className="mb-8 flex flex-col gap-2">
				<span className="font-medium font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
					/design/preview · histórico
				</span>
				<h1 className="font-normal font-serif text-3xl tracking-tight">
					Histórico: 4 variantes de primary testadas
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm leading-relaxed">
					Comparação preservada da decisão de paleta. Mesmo canvas warm-dark e
					mesmas cores semânticas (pure red, mustard, teal, jade) — diferença só
					no <strong>primary</strong>. <strong>Coral venceu</strong> (hue 38,
					Anthropic literal) na iteração 2026-05-20, substituindo o copper (hue
					45) da iteração anterior. Aplicado em{" "}
					<code className="font-mono text-xs">
						packages/ui/src/styles/globals.css
					</code>
					. Página fica como referência histórica.
				</p>
			</header>

			<div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
				{PALETTES.map((p) => (
					<PaletteColumn key={p.id} palette={p} />
				))}
			</div>

			<footer className="mt-12 border-border border-t pt-6 text-muted-foreground text-xs leading-relaxed">
				<p className="mb-2">
					<strong className="text-foreground">Razão da escolha (atual):</strong>{" "}
					coral hue 38 (Anthropic literal #cc785c) traz voz editorial mantendo
					dark-only e voz workshop. Destructive movido para hue 15 (pure red,
					era oxide 25) preservando 23° de separação. Copper hue 45 ficou
					documentado como iteração anterior — boa cor, mas menos personalidade
					vs. a referência Anthropic.
				</p>
				<p>
					Resultado vivo em{" "}
					<code className="font-mono text-[11px]">/design</code>. Tokens em{" "}
					<code className="font-mono text-[11px]">
						packages/ui/src/styles/globals.css
					</code>
					. Roles warning/info/success já fazem parte do sistema.
				</p>
			</footer>
		</div>
	);
}
