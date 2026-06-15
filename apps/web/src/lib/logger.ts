const isDev = process.env.NODE_ENV !== "production";

export const logger = {
	error(scope: string, error: unknown): void {
		// Erros logam sempre — em produção o stderr é capturado pela observabilidade
		// do host (Vercel). É o canal permitido pelo CLAUDE.md (não console cru).
		console.error(`[${scope}]`, error);
	},
	info(scope: string, payload?: unknown): void {
		if (isDev) {
			console.info(`[${scope}]`, payload ?? "");
		}
	},
};
