type AuthErrorLike =
	| { code?: string; message?: string; statusText?: string }
	| null
	| undefined;

const AUTH_ERROR_PT: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD:
		"Email ou senha incorretos. Verifique e tente de novo.",
	USER_NOT_FOUND: "Não encontramos uma conta com esse email.",
	INVALID_EMAIL: "Informe um email válido.",
	USER_ALREADY_EXISTS: "Já existe uma conta com esse email.",
};

const FALLBACK = "Não foi possível entrar agora. Tente novamente em instantes.";

export function authErrorMessage(error: AuthErrorLike): string {
	const code = error?.code;
	if (code && AUTH_ERROR_PT[code]) {
		return AUTH_ERROR_PT[code];
	}
	return FALLBACK;
}
