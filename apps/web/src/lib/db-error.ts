import { z } from "zod";

export interface PgError {
	code: string;
	constraint?: string;
	message: string;
}

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/** Nó no formato node-postgres (`DatabaseError`): SQLSTATE de 5 caracteres. */
const pgErrorNodeSchema = z.object({
	code: z.string().regex(SQLSTATE_RE),
	constraint: z.string().optional().catch(undefined),
	message: z
		.unknown()
		.optional()
		.transform((message) => String(message ?? "")),
});

/** Qualquer nó da cadeia (Error ou objeto) que possa embrulhar outro em `.cause`. */
const causeNodeSchema = z.object({ cause: z.unknown().optional() });

/**
 * Drizzle 0.45.x embrulha o erro do driver numa `DrizzleQueryError` cujo
 * `.message` é "Failed query: …" — o erro real do Postgres (com `code`,
 * `constraint` e a mensagem "violates …") fica em `.cause`. Esta função anda
 * na cadeia `.cause` e devolve o primeiro nó no formato node-postgres
 * (`DatabaseError`), ou `null` se não houver erro de banco.
 */
export function getPgError(cause: unknown): PgError | null {
	let current = cause;
	const seen = new Set<unknown>();

	while (!seen.has(current)) {
		seen.add(current);
		const pgNode = pgErrorNodeSchema.safeParse(current);

		if (pgNode.success) {
			return {
				code: pgNode.data.code,
				message: pgNode.data.message,
				constraint: pgNode.data.constraint,
			};
		}

		const causeNode = causeNodeSchema.safeParse(current);

		if (!causeNode.success) {
			return null;
		}

		current = causeNode.data.cause;
	}

	return null;
}
