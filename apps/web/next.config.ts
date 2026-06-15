import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

const nextConfig: NextConfig = {
	// typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
	// criadas antes de seus pages existirem (stock, categories, suppliers, branches).
	// Re-habilitar na Phase 2 quando todos os pages estiverem populados.
	typedRoutes: false,
	reactCompiler: true,
	experimental: {
		serverActions: {
			// Banners aceitam master de alta qualidade (fundo/produto até 4MB).
			// Margem para o overhead do multipart FormData acima do maior cap.
			bodySizeLimit: "8mb",
		},
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
};

export default nextConfig;
