/**
 * Formatação de datas/horas para EXIBIÇÃO. Fuso fixo em `America/Sao_Paulo`
 * (horário de Brasília) para garantir que server (Vercel = UTC) e client
 * (browser BR) produzam sempre o mesmo texto — sem isso, datas próximas da
 * meia-noite divergem e causam hydration mismatch. Ver issue #137.
 *
 * NÃO usar para inputs de data editáveis (o valor ali é do usuário, não
 * display) nem para colunas date-only (`::date` → usar `localDate`).
 */

const TZ = "America/Sao_Paulo";

const make = (opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat("pt-BR", { ...opts, timeZone: TZ });

const SHORT = make({ day: "2-digit", month: "2-digit" });
const FULL = make({ day: "2-digit", month: "2-digit", year: "numeric" });
const DATETIME = make({
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});
const TIME = make({ hour: "2-digit", minute: "2-digit" });
const DAY_TIME = make({
	day: "2-digit",
	month: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});
const MONTH_YEAR = make({ month: "2-digit", year: "numeric" });
const MONTH_YEAR_SHORT = make({ month: "short", year: "numeric" });
const DAY_MONTH_SHORT = make({ day: "2-digit", month: "short" });
const DAY_MONTH_SHORT_YEAR = make({
	day: "2-digit",
	month: "short",
	year: "numeric",
});

/** 18/05 */
export const formatDateShort = (date: Date): string => SHORT.format(date);
/** 18/05/2026 */
export const formatDate = (date: Date): string => FULL.format(date);
/** 18/05/2026 14:30 */
export const formatDateTime = (date: Date): string => DATETIME.format(date);
/** 14:30 */
export const formatTime = (date: Date): string => TIME.format(date);
/** 18/05 14:30 */
export const formatDayTime = (date: Date): string => DAY_TIME.format(date);
/** 05/2026 */
export const formatMonthYear = (date: Date): string => MONTH_YEAR.format(date);
/** mai. de 2026 */
export const formatMonthYearShort = (date: Date): string =>
	MONTH_YEAR_SHORT.format(date);
/** 18 de mai. */
export const formatDayMonthShort = (date: Date): string =>
	DAY_MONTH_SHORT.format(date);
/** 18 de mai. de 2026 */
export const formatDayMonthShortYear = (date: Date): string =>
	DAY_MONTH_SHORT_YEAR.format(date);

/**
 * True se as duas datas caem no mesmo dia no fuso de Brasília. Estável entre
 * server e client (ambos comparam em `America/Sao_Paulo`) — ao contrário de
 * `Date.toDateString()`, que usa o fuso do runtime e diverge perto da meia-noite.
 */
export const isSameDay = (a: Date, b: Date): boolean =>
	FULL.format(a) === FULL.format(b);

/**
 * Data relativa ("há 5 min", "há 2 meses", "ano passado"). Deriva de `Date.now()`,
 * arredondada em min/h/dia/mês/ano — estável entre SSR e cliente exceto na virada
 * exata de um limite (mesmo trade-off já aceito antes em order-card). Para o valor
 * exato, pareie com `title={formatDateTime(date)}`.
 */
const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});
export const formatRelative = (date: Date): string => {
	const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
	if (Math.abs(diffMinutes) < 60) {
		return RELATIVE.format(diffMinutes, "minute");
	}
	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return RELATIVE.format(diffHours, "hour");
	}
	const diffDays = Math.round(diffHours / 24);
	if (Math.abs(diffDays) < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	const diffMonths = Math.round(diffDays / 30);
	if (Math.abs(diffMonths) < 12) {
		return RELATIVE.format(diffMonths, "month");
	}
	return RELATIVE.format(Math.round(diffMonths / 12), "year");
};

/**
 * Início do dia (00:00) em America/Sao_Paulo, como instante (Date). Para
 * cutoffs de filtro ("hoje") — NÃO é display. Robusto a DST: computa o offset
 * real do fuso no instante (Brasil hoje não tem DST, mas não hard-coda -03:00).
 */
export const startOfDaySaoPaulo = (now: Date): Date => {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-US", {
			timeZone: TZ,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
			.formatToParts(now)
			.map((p) => [p.type, p.value])
	);
	const y = Number(parts.year);
	const mo = Number(parts.month);
	const d = Number(parts.day);
	// offset (ms) que o fuso está à frente do UTC neste instante
	const asIfUtc = Date.UTC(
		y,
		mo - 1,
		d,
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second)
	);
	const offsetMs = asIfUtc - now.getTime();
	// meia-noite SP (como instante UTC) = Date.UTC(data SP) − offset
	return new Date(Date.UTC(y, mo - 1, d) - offsetMs);
};
