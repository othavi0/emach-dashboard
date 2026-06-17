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
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro desconhecido";
}
