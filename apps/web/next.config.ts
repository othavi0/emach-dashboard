import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

// Fontes externas para a CSP.
// next/font/google auto-hospeda Inter/Barlow/Cormorant em build time —
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
