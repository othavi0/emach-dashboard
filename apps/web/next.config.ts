import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

// Fontes externas para a CSP.
// next/font/google auto-hospeda Barlow/Barlow Condensed/IBM Plex Mono em build time —
// nenhuma requisição a fonts.googleapis.com ou fonts.gstatic.com em runtime.
// Supabase Storage é a única origem externa de imagens e conexões API.
const cspConnectSrc = supabaseHostname
	? `'self' https://${supabaseHostname}`
	: "'self'";
const cspImgSrc = supabaseHostname
	? `'self' data: https://${supabaseHostname} https://i.pravatar.cc`
	: "'self' data: https://i.pravatar.cc";

// Content-Security-Policy em Report-Only: não bloqueia nada, só reporta
// violações no DevTools (aba Console / Network). Permite mapear inline scripts
// do Next.js e outras fontes antes de habilitar enforce.
// ATENÇÃO: 'unsafe-inline' em script-src é necessário para o Next.js 16
// (injeta scripts inline de hydration). Não remover sem nonce/hash strategy.
const cspDirectives = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'`,
	`style-src 'self' 'unsafe-inline'`,
	`img-src ${cspImgSrc}`,
	`font-src 'self'`,
	`connect-src ${cspConnectSrc}`,
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
	// Impede que o dashboard seja embutido em iframe em qualquer origem
	// (clickjacking). Redundante com frame-ancestors na CSP, mas frame-ancestors
	// não é suportado por IE11 — manter ambos por defesa em profundidade.
	{ key: "X-Frame-Options", value: "DENY" },
	// Impede que o browser infira Content-Type de respostas (MIME sniffing).
	// Crítico para uploads servidos pelo bucket Supabase sem tipo forçado.
	{ key: "X-Content-Type-Options", value: "nosniff" },
	// Envia apenas origem (sem path/query) em requisições cross-origin.
	// Protege URLs internas do dashboard de vazar em referer para terceiros.
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	// CSP em modo report-only: não bloqueia, apenas reporta no DevTools.
	// Habilitar enforce (Content-Security-Policy) é tarefa separada após
	// analisar os relatórios de violação.
	{ key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];

const nextConfig: NextConfig = {
	// typedRoutes desabilitado — habilitar requer auditoria de todos os hrefs do codebase.
	typedRoutes: false,
	reactCompiler: true,
	experimental: {
		// Router Cache client-side: o default do Next 16 é `dynamic: 0`, e como
		// toda rota /dashboard/* é dinâmica (validação de sessão chama `headers()`),
		// nenhum RSC payload era reaproveitado — cada troca de tab/navegação na
		// sidebar, e até voltar a uma rota já vista, refazia o round-trip completo
		// (sessão + 7-12 queries + RTT). Medido empiricamente: revisita disparava
		// `?_rsc=` novo. Com `dynamic: 30`, revisita soft dentro da janela é servida
		// do cache (instantânea, sem servidor). Mutações invalidam via
		// `router.refresh()`/`revalidatePath`; hard load / F5 / rota nova continuam
		// sempre frescos. Trade-off P0 consciente: o gate de status/role tem
		// staleness ≤30s SÓ em revisita soft a rota já renderizada — versão branda
		// da janela que o ADR-0020 já aceitava (60s); suspender já apaga as sessões
		// no DB e qualquer hard load/rota nova revalida. Distinto do cookieCache
		// rejeitado pelo ADR-0021 (que cacheava a própria sessão).
		staleTimes: {
			dynamic: 30,
			static: 180,
		},
		serverActions: {
			// Banners aceitam master de alta qualidade (fundo/produto até 4MB).
			// Margem para o overhead do multipart FormData acima do maior cap.
			bodySizeLimit: "8mb",
		},
		optimizePackageImports: [
			"recharts",
			"motion",
			"lucide-react",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
		],
	},
	images: supabaseHostname
		? {
				remotePatterns: [
					{
						protocol: "https",
						hostname: supabaseHostname,
						pathname: "/storage/v1/object/public/**",
					},
				],
			}
		: undefined,
	async headers() {
		return [
			{
				// Aplicar a todas as rotas
				source: "/(.*)",
				headers: securityHeaders,
			},
		];
	},
};

export default withBundleAnalyzer(nextConfig);
