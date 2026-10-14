import type { JsonValue } from "@emach/db/utils";

export const logger = {
	error(scope: string, cause: unknown, context?: JsonValue): void {
		if (process.env.NODE_ENV === "production") {
			console.error(
				JSON.stringify({
					level: "error",
					scope,
					ts: new Date().toISOString(),
					payload:
						cause instanceof Error
							? { name: cause.name, message: cause.message, stack: cause.stack }
							: cause,
					context,
				})
			);
		} else if (context === undefined) {
			console.error(`[${scope}]`, cause);
		} else {
			console.error(`[${scope}]`, cause, context);
		}
	},
	info(scope: string, payload?: JsonValue): void {
		if (process.env.NODE_ENV === "production") {
			console.log(
				JSON.stringify({
					level: "info",
					scope,
					ts: new Date().toISOString(),
					payload,
				})
			);
		} else {
			console.info(`[${scope}]`, payload ?? "");
		}
	},
};
