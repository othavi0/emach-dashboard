import { formatDate, formatRelative } from "@/lib/format/datetime";

interface AgeSource {
	createdAt: Date;
	deliveredAt: Date | null;
	paidAt: Date | null;
	shippedAt: Date | null;
}

const HA_PREFIX = /^há /;

// `formatRelative` usa `Intl.RelativeTimeFormat` com `numeric: "auto"`, que
// troca formas numéricas ("há 1 dia") por palavras idiomáticas ("ontem",
// "anteontem", "este minuto", "mês passado", "ano passado") sem o prefixo
// "há" — quebra a gramática do label fixo "Pago há"/"Enviado há"/"Criado há"
// (ex: "pago há anteontem"). Mapeia essas formas de volta pra uma contagem
// numérica antes do strip, mantendo o label gramatical.
const RELATIVE_WORD_MAP: Record<string, string> = {
	"este minuto": "instantes",
	ontem: "1 dia",
	anteontem: "2 dias",
	"mês passado": "1 mês",
	"ano passado": "1 ano",
};

function normalizeRelative(value: string): string {
	return RELATIVE_WORD_MAP[value] ?? value.replace(HA_PREFIX, "");
}

export function ageMetaForTab(
	tabKey: string,
	item: AgeSource
): { label: string; value: string } {
	switch (tabKey) {
		case "paid":
		case "preparing":
		case "late":
			return {
				label: "Pago há",
				value: normalizeRelative(formatRelative(item.paidAt ?? item.createdAt)),
			};
		case "shipped":
			return {
				label: "Enviado há",
				value: normalizeRelative(
					formatRelative(item.shippedAt ?? item.createdAt)
				),
			};
		case "delivered":
			return {
				label: "Entregue em",
				value: formatDate(item.deliveredAt ?? item.createdAt),
			};
		default:
			return {
				label: "Criado há",
				value: normalizeRelative(formatRelative(item.createdAt)),
			};
	}
}
