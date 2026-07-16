// Helpers puros da tab Produtividade (issue #324). Sem imports server-only:
// testável em vitest node e importável de Server Component.

const HOUR = 3600;
const MINUTE = 60;

/** Duração de sessão legível: "—" (null), "<1min", "9min", "1h 12min", "2h". */
export function formatSessionDuration(seconds: number | null): string {
	if (seconds === null || Number.isNaN(seconds)) {
		return "—";
	}
	if (seconds < MINUTE) {
		return "<1min";
	}
	if (seconds < HOUR) {
		return `${Math.round(seconds / MINUTE)}min`;
	}
	let hours = Math.floor(seconds / HOUR);
	let minutes = Math.round((seconds % HOUR) / MINUTE);
	if (minutes === MINUTE) {
		hours += 1;
		minutes = 0;
	}
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

/**
 * Percentual de exceção com 1 casa FIXA em pt-BR ("4,6%", "5,0%") — casa fixa
 * mantém a coluna alinhada entre linhas; 0 ou denominador 0 → "0%" seco.
 */
export function formatExceptionRate(exceptions: number, total: number): string {
	if (total === 0 || exceptions === 0) {
		return "0%";
	}
	const pct = (exceptions / total) * 100;
	return `${pct.toLocaleString("pt-BR", {
		maximumFractionDigits: 1,
		minimumFractionDigits: 1,
	})}%`;
}

export type ExceptionTone = "muted" | "success" | "warning";

/**
 * Tom da célula de exceções. A taxa mistura qualidade do estoque físico
 * (item sumido da prateleira) com comportamento do operador — o warning é
 * sinal de investigação, não veredito sobre a pessoa.
 */
export function exceptionTone(
	exceptions: number,
	total: number
): ExceptionTone {
	if (total === 0 || exceptions === 0) {
		return "muted";
	}
	return exceptions / total >= 0.05 ? "warning" : "success";
}
