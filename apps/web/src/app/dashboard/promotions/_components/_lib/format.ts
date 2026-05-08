import type { PromotionStatus } from "../../actions";

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

const NUMBER_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

export function fmtDate(d: Date): string {
	return DATE_FMT.format(d);
}

export function fmtDateTime(d: Date): string {
	return DATETIME_FMT.format(d);
}

export function formatJanela(
	startsAt: Date | null,
	endsAt: Date | null
): string {
	if (startsAt && endsAt) {
		return `${fmtDate(startsAt)} – ${fmtDate(endsAt)}`;
	}
	if (startsAt) {
		return `A partir de ${fmtDate(startsAt)}`;
	}
	if (endsAt) {
		return `Até ${fmtDate(endsAt)}`;
	}
	return "Sem janela definida";
}

export function formatDesconto(discountPct: string): string {
	const num = Number(discountPct);
	return `${NUMBER_FMT.format(num)}%`;
}

export function statusLabel(status: PromotionStatus): string {
	switch (status) {
		case "active":
			return "Ativa agora";
		case "scheduled":
			return "Agendada";
		case "expired":
			return "Expirada";
		case "inactive":
			return "Inativa";
		default:
			return "—";
	}
}
