"use client";

import { Button } from "@emach/ui/components/button";
import { UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DestructiveActionDialog } from "@/app/dashboard/users/_components/destructive-action-dialog";
import { notify } from "@/lib/notify";
import { anonymizeClient } from "../actions";

interface Props {
	clientId: string;
	clientName: string;
}

export function AnonymizeClientDialog({ clientId, clientName }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const onConfirm = (reason: string) => {
		startTransition(async () => {
			const result = await anonymizeClient({ clientId, reason });

			if (result.ok) {
				setOpen(false);
				notify.success("Cliente anonimizado");
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	};

	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm" variant="destructive">
				<UserX aria-hidden className="mr-1.5 size-3.5" />
				Anonimizar cliente
			</Button>
			<DestructiveActionDialog
				confirmLabel="Anonimizar"
				description={`Os dados pessoais de ${clientName} serão apagados para sempre: nome, email, telefone, documento, endereços e notas. O cliente perde o acesso à loja. Os pedidos ficam como estão. Esta ação não pode ser desfeita.`}
				onCancel={() => setOpen(false)}
				onConfirm={onConfirm}
				open={open}
				reasonRequired
				submitting={isPending}
				title="Anonimizar cliente"
			/>
		</>
	);
}
