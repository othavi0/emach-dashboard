import { formatDate, formatDateTime } from "@/lib/format/datetime";
import type { PromotionStatus } from "../../actions";

const NUMBER_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const BRL_FMT = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export function fmtDate(d: Date): string {
	return formatDate(d);
}

export function fmtDateTime(d: Date): string {
	return formatDateTime(d);
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

export function formatDiscount(type: string, value: string): string {
	const num = Number(value);
	if (type === "fixed") {
		return BRL_FMT.format(num);
	}
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

export function daysUntil(
	d: Date | null,
	now: Date = new Date()
): number | null {
	if (!d) {
		return null;
	}
	const MS_PER_DAY = 86_400_000;
	return Math.ceil((d.getTime() - now.getTime()) / MS_PER_DAY);
}

export interface RemainingDisplay {
	tone: "default" | "warning" | "danger";
	value: string;
}

export function daysRemainingDisplay(
	status: PromotionStatus,
	endsAt: Date | null,
	now: Date = new Date()
): RemainingDisplay {
	if (status === "expired") {
		return { value: "0", tone: "danger" };
	}
	if (!endsAt) {
		return { value: "—", tone: "default" };
	}
	const d = daysUntil(endsAt, now) ?? 0;
	const clamped = d < 0 ? 0 : d;
	return { value: String(clamped), tone: clamped <= 7 ? "warning" : "default" };
}
