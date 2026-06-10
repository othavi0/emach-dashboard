"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
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
			<div className="grid gap-3 md:grid-cols-2">
				<AccessStatusCard
					user={{ id: user.id, name: user.name, status: user.status }}
				/>
				<Card className="h-full">
					<CardHeader className="flex flex-row items-center justify-between gap-2">
						<CardTitle className="text-base">E-mail & verificação</CardTitle>
						{user.emailVerified ? (
							<Badge variant="success">
								<CheckCircle2 className="size-3.5" />
								Verificado
							</Badge>
						) : (
							<Badge variant="warning">
								<AlertCircle className="size-3.5" />
								Não verificado
							</Badge>
						)}
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							{user.emailVerified
								? "O usuário confirmou o e-mail de cadastro."
								: "O usuário ainda não confirmou o e-mail de cadastro."}
						</p>
					</CardContent>
				</Card>
				<Card className="h-full">
					<CardHeader className="flex flex-row items-center justify-between gap-2">
						<CardTitle className="text-base">Reset de senha</CardTitle>
						<Button
							disabled={pending}
							onClick={sendReset}
							size="sm"
							variant="outline"
						>
							<KeyRound className="size-3.5" />
							Enviar e-mail de reset
						</Button>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Envia um e-mail com link para o usuário trocar a senha. Você não
							terá acesso à senha nova.
						</p>
					</CardContent>
				</Card>
				<Card className="h-full">
					<CardHeader className="flex flex-row items-center justify-between gap-2">
						<CardTitle className="text-base">Sessões</CardTitle>
						<Button
							disabled={pending}
							onClick={forceLogout}
							size="sm"
							variant="outline"
						>
							<LogOut className="size-3.5" />
							Forçar logout em tudo
						</Button>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Revoga todas as sessões ativas — o usuário será forçado a logar de
							novo em todos os dispositivos.
						</p>
					</CardContent>
				</Card>
			</div>
			{canDelete && (
				<>
					<Card className="border-destructive/40">
						<CardHeader className="flex flex-row items-center justify-between gap-2">
							<CardTitle className="text-base text-destructive">
								Zona de perigo
							</CardTitle>
							<Button
								onClick={() => setOpen(true)}
								size="sm"
								variant="destructive"
							>
								<Trash2 aria-hidden className="mr-1.5 size-3.5" />
								Excluir usuário
							</Button>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								Excluir é irreversível: o cadastro do usuário some. O histórico
								de ações dele permanece com identidade preservada via snapshot.
							</p>
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
