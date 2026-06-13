"use client";

import type { ZodError } from "zod";

/**
 * Converte um ZodError em erros por campo, chaveados pela primeira parte do
 * path (path[0]). Erros aninhados (ex: businessHours.weekdays.opensAt) ficam
 * sob a chave top-level (businessHours), mostrados no nível do bloco. Mantém o
 * primeiro erro de cada chave.
 */
export function zodIssuesToFieldErrors<T = Record<string, string>>(
	error: ZodError
): Partial<Record<keyof T & string, string>> {
	const out: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.length > 0 ? String(issue.path[0]) : "";
		if (key && out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out as Partial<Record<keyof T & string, string>>;
}

/** Texto padrão do toast de validação (substitui o antigo "veja detalhes acima"). */
export function errorToastMessage(count: number): string {
	return `${count} ${count === 1 ? "erro" : "erros"} — corrija os campos destacados`;
}

/**
 * Foca e rola até o primeiro elemento com `aria-invalid="true"`. Em
 * requestAnimationFrame para rodar após o React pintar os erros. Opcionalmente
 * restrito a um container.
 */
export function focusFirstError(container?: HTMLElement | null): void {
	requestAnimationFrame(() => {
		const root: ParentNode = container ?? document;
		const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" });
			el.focus({ preventScroll: true });
		}
	});
}
