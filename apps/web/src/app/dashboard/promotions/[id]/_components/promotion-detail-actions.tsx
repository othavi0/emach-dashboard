"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useActiveTab } from "@/components/entity/entity-client-tabs";
import type { PromotionDetail } from "../../data";
import { PromotionHeaderActions } from "./promotion-header-actions";

interface Props {
	canDelete: boolean;
	detail: PromotionDetail;
}

/**
 * Ação contextual do header. Na tab "tools" mostra "Gerenciar ferramentas"
 * (rota /edit); nas demais, as ações de promoção. A tab ativa vem do contexto
 * client do EntityClientTabs (sem re-render do servidor ao trocar de tab).
 */
export function PromotionDetailActions({ canDelete, detail }: Props) {
	const tab = useActiveTab();
	if (tab === "tools") {
		return (
			<Link
				className={buttonVariants({ variant: "default" })}
				href={`/dashboard/promotions/${detail.id}/edit`}
			>
				<Settings2 aria-hidden className="mr-1.5 size-4" />
				Gerenciar ferramentas
			</Link>
		);
	}
	return <PromotionHeaderActions canDelete={canDelete} promotion={detail} />;
}
