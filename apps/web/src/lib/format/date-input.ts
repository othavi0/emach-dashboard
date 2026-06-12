/**
 * Bordas de dia no fuso America/Sao_Paulo para INPUTS de data (não display).
 * Brasil não observa DST desde 2019 → offset fixo -03:00.
 * Para formatação de exibição use `datetime.ts`.
 */

const SP_OFFSET = "-03:00";

const DAY_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Sao_Paulo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** "2026-06-12" — dia civil de `d` no fuso de Brasília. Comparável lexicograficamente. */
export const saoPauloDayKey = (d: Date): string => DAY_KEY_FMT.format(d);

/** Instante 00:00:00.000 do dia SP de `d`. */
export const startOfDaySaoPaulo = (d: Date): Date =>
	new Date(`${saoPauloDayKey(d)}T00:00:00.000${SP_OFFSET}`);

/** Instante 23:59:59.999 do dia SP de `d`. */
export const endOfDaySaoPaulo = (d: Date): Date =>
	new Date(`${saoPauloDayKey(d)}T23:59:59.999${SP_OFFSET}`);
