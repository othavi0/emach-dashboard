"use client";

import { Button } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActiveTab } from "@/components/entity/entity-client-tabs";

/**
 * Ação contextual do header. Só aparece na tab "sobretaxas" — é onde os
 * dados editáveis (nome, CNPJ, sobretaxas) são exibidos. A tab ativa vem
 * do contexto client do EntityClientTabs (sem re-render do servidor).
 */
export function EditCarrierButton() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const tab = useActiveTab();

	const handleEdit = () => {
		const sp = new URLSearchParams(params);
		sp.set("edit", "1");
		router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
	};

	if (tab !== "sobretaxas") {
		return null;
	}

	return (
		<Button onClick={handleEdit} size="sm" variant="outline">
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar transportadora
		</Button>
	);
}
