// apps/web/src/app/dashboard/promotions/_lib/featured-message.ts
import { formatDate } from "@/lib/format/datetime";

/** Mensagem de bloqueio quando já existe um destaque vivo no home. */
export function featuredConflictMessage(existing: {
	endsAt: Date | null;
}): string {
	if (existing.endsAt) {
		return `Já existe um destaque ativo até ${formatDate(existing.endsAt)} — remova-o ou aguarde o fim para destacar esta.`;
	}
	return "Já existe um destaque ativo sem prazo de fim — remova-o para destacar esta.";
}
