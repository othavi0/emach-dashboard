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
			bodySizeLimit: "5mb",
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
