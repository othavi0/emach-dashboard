import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { getPgError } from "@/lib/db-error";
import { logger } from "@/lib/logger";

/**
 * Converte qualquer erro capturado em `catch` numa string segura para o toast
 * do usuário.
 *
 * - Erro do Postgres (drizzle embrulha em `.cause`): nunca vazar SQL+params.
 * - Erro de domínio (`instanceof Error`): a mensagem é controlada, segura.
 * - Qualquer outro valor: fallback genérico.
 */
export function actionErrorMessage(cause: unknown): string {
	if (getPgError(cause)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}

	// ZodError passa no instanceof Error, mas seu .message é genérico/JSON — preserva
	// o feedback field-level (issues[0].message) antes do fallback de Error comum.
	if (cause instanceof ZodError) {
		return cause.issues[0]?.message ?? "Entrada inválida";
	}

	if (cause instanceof Error) {
		return cause.message;
	}

	return "Erro desconhecido";
}

/**
 * Capability guards throw `Error("Forbidden: ...")` — detect those here.
 * Use in `catch` blocks after `requireCapability*` calls.
 */
export function isCapabilityError(cause: unknown): boolean {
	return cause instanceof Error && cause.message.startsWith("Forbidden:");
}

/**
 * Catch de `requireCapability*`: a negação de capability vira `logger.warn` e
 * "Acesso negado"; qualquer outro erro é relançado.
 */
export function safeRequireRole(
	scope: string,
	cause: unknown
): ActionResult<never> {
	if (isCapabilityError(cause)) {
		logger.warn(scope, cause);

		return { ok: false, error: "Acesso negado" };
	}

	throw cause;
}
