import { type ZodError, z } from "zod";

// Chave de campo vinda de issue.path[0] (PropertyKey). Symbol e path vazio
// não passam e caem em `_form`. Índice de array é inteiro, então o z.number()
// (que recusa NaN e Infinity) aceita todo índice real.
const fieldKeySchema = z.union([z.string(), z.number()]);

/**
 * Converte um ZodError em erros por campo (chave = path[0]). Issues de path
 * vazio (refinements de raiz) caem na chave especial `_form`, para nunca
 * sumirem. Mantém o primeiro erro de cada chave.
 */
export function zodIssuesToFieldErrors<T = Record<string, string>>(
	error: ZodError
): Partial<Record<keyof T & string, string>> & { _form?: string } {
	const out: Record<string, string> = {};

	for (const issue of error.issues) {
		// Path vazio ou key symbol (raro/exótico) → erro de nível de formulário.
		const parsedKey = fieldKeySchema.safeParse(issue.path[0]);
		const key = parsedKey.success ? String(parsedKey.data) : "_form";

		if (out[key] === undefined) {
			out[key] = issue.message;
		}
	}

	// SAFETY: `out` só recebe valores string, então ler qualquer chave dá string
	// ou undefined, que é tudo o que o Partial<Record<K, string>> promete para
	// qualquer K. O TS só não aceita Record<string> em um K genérico.
	return out as Partial<Record<keyof T & string, string>> & { _form?: string };
}

/**
 * Texto do toast — conta os CAMPOS destacados (chaves), excluindo a chave
 * `_form` (erro de nível de formulário, que não destaca um campo). Quando só
 * há `_form`, mostra a própria mensagem em vez de "0 erros".
 */
export function errorToastMessage(
	fieldErrors: Partial<Record<string, string>>
): string {
	const fieldKeys = Object.keys(fieldErrors).filter((k) => k !== "_form");

	if (fieldKeys.length === 0 && fieldErrors._form !== undefined) {
		return fieldErrors._form;
	}

	const count = fieldKeys.length;

	return `${count} ${count === 1 ? "erro" : "erros"} — corrija os campos destacados`;
}

/**
 * Rola/foca o primeiro campo inválido. Para foco usa `[aria-invalid="true"]`
 * (a11y, inputs nativos); para rolagem aceita também `[data-error="true"]`
 * (o `<FieldError>`), garantindo scroll mesmo em inputs custom que não
 * repassam aria-invalid. Double-rAF cobre o commit de um novo passo do wizard.
 */
export function focusFirstError(container?: HTMLElement | null): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			const root: ParentNode = container ?? document;

			const focusable = root.querySelector<HTMLElement>(
				'[aria-invalid="true"]'
			);

			const scrollTarget =
				focusable ?? root.querySelector<HTMLElement>('[data-error="true"]');

			scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
			focusable?.focus({ preventScroll: true });
		});
	});
}

/** Mapa de erros por campo tipado pelo schema do form (+ chave `_form`). */
export type FieldErrorMap<T> = Partial<Record<keyof T & string, string>> & {
	_form?: string;
};
