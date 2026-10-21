import type { JsonValue } from "@emach/db/utils";

type Level = "error" | "warn";

function logCause(
	level: Level,
	scope: string,
	cause: unknown,
	context?: JsonValue
): void {
	const write = level === "error" ? console.error : console.warn;

	if (process.env.NODE_ENV === "production") {
		write(
			JSON.stringify({
				level,
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
		write(`[${scope}]`, cause);
	} else {
		write(`[${scope}]`, cause, context);
	}
}

export const logger = {
	error(scope: string, cause: unknown, context?: JsonValue): void {
		logCause("error", scope, cause, context);
	},
	warn(scope: string, cause: unknown, context?: JsonValue): void {
		logCause("warn", scope, cause, context);
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
