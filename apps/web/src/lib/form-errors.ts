"use client";

import type { ZodError } from "zod";

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
		const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
		if (out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out as Partial<Record<keyof T & string, string>> & { _form?: string };
}

/** Texto do toast — conta os CAMPOS destacados (chaves), não os issues do Zod. */
export function errorToastMessage(
	fieldErrors: Record<string, unknown>
): string {
	const count = Object.keys(fieldErrors).length;
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
