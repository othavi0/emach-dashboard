"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";
import { deleteUser } from "../../actions";

interface Props {
	canDelete: boolean;
	user: { id: string; name: string };
}

export function DangerZone({ user, canDelete }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [submitting, startTransition] = useTransition();

	const onDelete = (reason: string) => {
		startTransition(async () => {
			const res = await deleteUser({ userId: user.id, reason });
			if (res.ok) {
				toast.success("Usuário excluído");
				router.push("/dashboard/users");
			} else {
				toast.error(res.error);
			}
		});
	};

	if (!canDelete) {
		return null;
	}

	return (
		<>
			<Card className="border-destructive/40">
				<CardHeader>
					<CardTitle className="text-base text-destructive">
						Zona de perigo
					</CardTitle>
					<CardDescription>
						Excluir é irreversível: o cadastro do usuário some. O histórico de
						ações dele permanece com identidade preservada via snapshot.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => setOpen(true)} variant="destructive">
						<Trash2 aria-hidden className="mr-1.5 size-3.5" />
						Excluir usuário
					</Button>
				</CardContent>
			</Card>
			<DestructiveActionDialog
				confirmLabel="Excluir definitivamente"
				description={`O usuário ${user.name} será removido. Você precisa explicar o motivo.`}
				onCancel={() => setOpen(false)}
				onConfirm={onDelete}
				open={open}
				submitting={submitting}
				title="Excluir usuário"
			/>
		</>
	);
}
