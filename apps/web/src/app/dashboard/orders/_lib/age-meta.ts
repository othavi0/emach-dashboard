import { formatDate, formatRelative } from "@/lib/format/datetime";

interface AgeSource {
	createdAt: Date;
	deliveredAt: Date | null;
	paidAt: Date | null;
	shippedAt: Date | null;
}

const HA_PREFIX = /^há /;

function stripHaPrefix(value: string): string {
	return value.replace(HA_PREFIX, "");
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
				value: stripHaPrefix(formatRelative(item.paidAt ?? item.createdAt)),
			};
		case "shipped":
			return {
				label: "Enviado há",
				value: stripHaPrefix(formatRelative(item.shippedAt ?? item.createdAt)),
			};
		case "delivered":
			return {
				label: "Entregue em",
				value: formatDate(item.deliveredAt ?? item.createdAt),
			};
		default:
			return {
				label: "Criado há",
				value: stripHaPrefix(formatRelative(item.createdAt)),
			};
	}
}
