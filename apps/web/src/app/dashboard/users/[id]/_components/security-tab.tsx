"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { AlertCircle, CheckCircle2, KeyRound, LogOut } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { forceLogoutAllSessions, triggerPasswordReset } from "../../actions";

interface Props {
	user: { id: string; email: string; emailVerified: boolean | null };
}

export function SecurityTab({ user }: Props) {
	const [pending, startTransition] = useTransition();
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

	return (
		<div className="flex flex-col gap-3">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Email</CardTitle>
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
					<Button disabled={pending} onClick={sendReset} variant="outline">
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
					<Button disabled={pending} onClick={forceLogout} variant="outline">
						<LogOut className="size-3.5" />
						Forçar logout em tudo
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
