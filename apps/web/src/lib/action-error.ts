import { ZodError } from "zod";
import { getPgError } from "@/lib/db-error";

/**
 * Converte qualquer erro capturado em `catch` numa string segura para o toast
 * do usuário.
 *
 * - Erro do Postgres (drizzle embrulha em `.cause`): nunca vazar SQL+params.
 * - Erro de domínio (`instanceof Error`): a mensagem é controlada, segura.
 * - Qualquer outro valor: fallback genérico.
 */
export function actionErrorMessage(error: unknown): string {
	if (getPgError(error)) {
		return "Não foi possível concluir a operação. Tente novamente.";
	}
	// ZodError passa no instanceof Error, mas seu .message é genérico/JSON — preserva
	// o feedback field-level (issues[0].message) antes do fallback de Error comum.
	if (error instanceof ZodError) {
		return error.issues[0]?.message ?? "Entrada inválida";
	}
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}

/**
 * Capability guards throw `Error("Forbidden: ...")` — detect those here.
 * Use in `catch` blocks after `requireCapability*` calls.
 */
export function isCapabilityError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Forbidden:");
}
