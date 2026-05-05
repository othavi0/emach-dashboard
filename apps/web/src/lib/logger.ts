const isDev = process.env.NODE_ENV !== "production";

export const logger = {
	error(scope: string, error: unknown): void {
		if (isDev) {
			console.error(`[${scope}]`, error);
		}
	},
	info(scope: string, payload?: unknown): void {
		if (isDev) {
			console.info(`[${scope}]`, payload ?? "");
		}
	},
};
