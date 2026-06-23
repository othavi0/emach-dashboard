"use client";

import { Button } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

interface ShippingHeaderActionProps {
	tab: string;
}

export function ShippingHeaderAction({ tab }: ShippingHeaderActionProps) {
	const router = useRouter();

	if (tab === "caixas" || tab === "config") {
		return null;
	}

	// Default and "transportadoras" tab
	const handleClick = () => {
		router.push("/dashboard/shipping/carriers/new");
	};

	return (
		<Button onClick={handleClick} size="sm">
			<Plus aria-hidden className="mr-1.5 size-3.5" />
			Nova transportadora
		</Button>
	);
}
