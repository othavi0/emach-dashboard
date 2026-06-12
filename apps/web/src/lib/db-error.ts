export interface PgError {
	code: string;
	constraint?: string;
	message: string;
}

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/**
 * Drizzle 0.45.x embrulha o erro do driver numa `DrizzleQueryError` cujo
 * `.message` é "Failed query: …" — o erro real do Postgres (com `code`,
 * `constraint` e a mensagem "violates …") fica em `.cause`. Esta função anda
 * na cadeia `.cause` e devolve o primeiro nó no formato node-postgres
 * (`DatabaseError`), ou `null` se não houver erro de banco.
 */
export function getPgError(error: unknown): PgError | null {
	let current: unknown = error;
	const seen = new Set<unknown>();
	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		const code = (current as { code?: unknown }).code;
		if (typeof code === "string" && SQLSTATE_RE.test(code)) {
			const constraint = (current as { constraint?: unknown }).constraint;
			return {
				code,
				message: String((current as { message?: unknown }).message ?? ""),
				constraint: typeof constraint === "string" ? constraint : undefined,
			};
		}
		current = (current as { cause?: unknown }).cause;
	}
	return null;
}
