"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useActiveTab } from "@/components/entity/entity-client-tabs";
import type { SupplierDetail } from "../../data";
import { ArchiveSupplierDialog } from "./archive-supplier-dialog";

interface Props {
	canManage: boolean;
	detail: SupplierDetail;
}

/**
 * Ação contextual do header. "Editar" + arquivar/restaurar aparecem só na
 * Visão geral. A tab ativa vem do contexto client do EntityClientTabs (sem
 * re-render do servidor ao trocar de tab).
 */
export function SupplierDetailActions({ canManage, detail }: Props) {
	const tab = useActiveTab();
	if (!(canManage && tab === "overview")) {
		return null;
	}
	return (
		<div className="flex items-center gap-2">
			<Link
				className={buttonVariants({ size: "sm", variant: "outline" })}
				href={`/dashboard/suppliers/${detail.id}?edit=1`}
			>
				<Pencil aria-hidden className="mr-1.5 size-3.5" />
				Editar
			</Link>
			<ArchiveSupplierDialog
				status={detail.status}
				supplierId={detail.id}
				supplierName={detail.name}
			/>
		</div>
	);
}
