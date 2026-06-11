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
