import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
	// criadas antes de seus pages existirem (stock, categories, suppliers, branches).
	// Re-habilitar na Phase 2 quando todos os pages estiverem populados.
	typedRoutes: false,
	reactCompiler: true,
};

export default nextConfig;
