"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	AlertCircle,
	CheckCircle2,
	KeyRound,
	LogOut,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DestructiveActionDialog } from "../../_components/destructive-action-dialog";
import {
	deleteUser,
	forceLogoutAllSessions,
	triggerPasswordReset,
} from "../../actions";
import { AccessStatusCard } from "./access-status-card";

interface Props {
	canDelete: boolean;
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean | null;
		status: "active" | "pending" | "suspended";
	};
}

export function SecurityTab({ user, canDelete }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const [submitting, startDeleteTransition] = useTransition();

	const sendReset = () =>
		startTransition(async () => {
			const res = await triggerPasswordReset({ userId: user.id });
			if (res.ok) {
				toast.success("E-mail de reset enviado");
			} else {
				toast.error(res.error);
			}
		});

	const forceLogout = () =>
		startTransition(async () => {
			const res = await forceLogoutAllSessions({ userId: user.id });
			if (res.ok) {
				toast.success("Todas as sessões foram revogadas");
			} else {
				toast.error(res.error);
			}
		});

	const onDelete = (reason: string) => {
		startDeleteTransition(async () => {
			const res = await deleteUser({ userId: user.id, reason });
			if (res.ok) {
				toast.success("Usuário excluído");
				router.push("/dashboard/users");
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<div className="flex flex-col gap-3">
			<AccessStatusCard
				user={{ id: user.id, name: user.name, status: user.status }}
			/>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">E-mail & verificação</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center gap-2">
					{user.emailVerified ? (
						<>
							<CheckCircle2 className="size-4 text-success" />
							<span className="text-sm">Email verificado</span>
						</>
					) : (
						<>
							<AlertCircle className="size-4 text-warning" />
							<span className="text-sm">Email não verificado</span>
						</>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Reset de senha</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">
						Envia um e-mail com link para o usuário trocar a senha. Você não
						terá acesso à senha nova.
					</p>
					<Button
						className="self-start"
						disabled={pending}
						onClick={sendReset}
						variant="outline"
					>
						<KeyRound className="size-3.5" />
						Enviar e-mail de reset
					</Button>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Sessões</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">
						Revoga todas as sessões ativas — o usuário será forçado a logar de
						novo em todos os dispositivos.
					</p>
					<Button
						className="self-start"
						disabled={pending}
						onClick={forceLogout}
						variant="outline"
					>
						<LogOut className="size-3.5" />
						Forçar logout em tudo
					</Button>
				</CardContent>
			</Card>
			{canDelete && (
				<>
					<Card className="border-destructive/40">
						<CardHeader>
							<CardTitle className="text-base text-destructive">
								Zona de perigo
							</CardTitle>
							<CardDescription>
								Excluir é irreversível: o cadastro do usuário some. O histórico
								de ações dele permanece com identidade preservada via snapshot.
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
			)}
		</div>
	);
}
