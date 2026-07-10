"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { notify } from "@/lib/notify";

export function LateOrdersToast({ count }: { count: number }) {
	const router = useRouter();
	useEffect(() => {
		if (count <= 0) {
			return;
		}
		notify.warning(
			`${count} ${count === 1 ? "pedido atrasado" : "pedidos atrasados"} aguardando expedição`,
			{
				id: "late-orders",
				action: {
					label: "Ver atrasados",
					onClick: () => router.push("/dashboard/orders?tab=late"),
				},
			}
		);
	}, [count, router]);
	return null;
}
