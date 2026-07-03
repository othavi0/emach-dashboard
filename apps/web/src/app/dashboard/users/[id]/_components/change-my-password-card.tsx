"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { authClient } from "@/lib/auth-client";
import { notify } from "@/lib/notify";

export function ChangeMyPasswordCard() {
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [pending, start] = useTransition();

	const submit = () =>
		start(async () => {
			if (next.length < 8) {
				notify.error("Nova senha: mínimo 8 caracteres");
				return;
			}
			const res = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
				revokeOtherSessions: true,
			});
			if (res.error) {
				notify.error("Não foi possível trocar a senha");
				return;
			}
			notify.success("Senha alterada");
			setCurrent("");
			setNext("");
		});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="text-base">Trocar minha senha</CardTitle>
				<Button disabled={pending} onClick={submit} size="sm" variant="outline">
					<KeyRound className="size-3.5" />
					Salvar
				</Button>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<LabeledField id="cur-pass" label="Senha atual">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setCurrent(e.target.value)}
							type="password"
							value={current}
						/>
					)}
				</LabeledField>
				<LabeledField id="new-pass" label="Nova senha">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setNext(e.target.value)}
							type="password"
							value={next}
						/>
					)}
				</LabeledField>
			</CardContent>
		</Card>
	);
}
