import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

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
};

export default withBundleAnalyzer(nextConfig);
