function serializePayload(value: unknown): unknown {
	if (value instanceof Error) {
		return { name: value.name, message: value.message, stack: value.stack };
	}
	return value;
}

export const logger = {
	error(scope: string, error: unknown): void {
		if (process.env.NODE_ENV === "production") {
			console.error(
				JSON.stringify({
					level: "error",
					scope,
					ts: new Date().toISOString(),
					payload: serializePayload(error),
				})
			);
		} else {
			console.error(`[${scope}]`, error);
		}
	},
	info(scope: string, payload?: unknown): void {
		if (process.env.NODE_ENV === "production") {
			console.log(
				JSON.stringify({
					level: "info",
					scope,
					ts: new Date().toISOString(),
					payload: serializePayload(payload),
				})
			);
		} else {
			console.info(`[${scope}]`, payload ?? "");
		}
	},
};
