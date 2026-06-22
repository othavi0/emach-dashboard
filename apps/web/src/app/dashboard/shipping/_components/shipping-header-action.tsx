"use client";

import { Button } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface ShippingHeaderActionProps {
	tab: string;
}

export function ShippingHeaderAction({ tab }: ShippingHeaderActionProps) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	if (tab === "caixas" || tab === "config") {
		return null;
	}

	// Default and "transportadoras" tab
	const handleClick = () => {
		const sp = new URLSearchParams(params);
		sp.set("newCarrier", "1");
		router.push(`${pathname}?${sp.toString()}`, { scroll: false });
	};

	return (
		<Button onClick={handleClick} size="sm">
			<Plus aria-hidden className="mr-1.5 size-3.5" />
			Nova transportadora
		</Button>
	);
}
