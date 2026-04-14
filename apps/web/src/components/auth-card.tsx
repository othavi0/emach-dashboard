"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

const authCopy = {
	"sign-in": {
		title: "Entrar",
		description: "Acesse a base inicial do CRM com email e senha.",
		submitLabel: "Entrar",
		pendingLabel: "Entrando...",
		switchLabel: "Criar conta",
		switchPrompt: "Ainda nao tem acesso?",
	},
	"sign-up": {
		title: "Criar conta",
		description:
			"Cadastre o primeiro usuario para comecar a montar o dashboard.",
		submitLabel: "Criar conta",
		pendingLabel: "Criando conta...",
		switchLabel: "Ja tenho conta",
		switchPrompt: "Ja possui acesso?",
	},
} as const;

export default function AuthCard() {
	const [mode, setMode] = useState<AuthMode>("sign-in");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const router = useRouter();

	const copy = authCopy[mode];

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");
		const name = String(formData.get("name") ?? "").trim();

		setIsSubmitting(true);

		try {
			if (mode === "sign-up") {
				await authClient.signUp.email(
					{
						email,
						password,
						name,
					},
					{
						onSuccess: () => {
							toast.success("Conta criada com sucesso.");
							router.replace("/dashboard");
							router.refresh();
						},
						onError: (error) => {
							toast.error(error.error.message || error.error.statusText);
						},
					}
				);

				return;
			}

			await authClient.signIn.email(
				{
					email,
					password,
				},
				{
					onSuccess: () => {
						toast.success("Login realizado com sucesso.");
						router.replace("/dashboard");
						router.refresh();
					},
					onError: (error) => {
						toast.error(error.error.message || error.error.statusText);
					},
				}
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>{copy.title}</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>

			<CardContent>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					{mode === "sign-up" ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor="name">Nome</Label>
							<Input
								autoComplete="name"
								id="name"
								minLength={2}
								name="name"
								required
							/>
						</div>
					) : null}

					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							autoComplete="email"
							id="email"
							name="email"
							required
							type="email"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="password">Senha</Label>
						<Input
							autoComplete={
								mode === "sign-up" ? "new-password" : "current-password"
							}
							id="password"
							minLength={8}
							name="password"
							required
							type="password"
						/>
					</div>

					<Button disabled={isSubmitting} type="submit">
						{isSubmitting ? copy.pendingLabel : copy.submitLabel}
					</Button>
				</form>
			</CardContent>

			<CardFooter className="justify-between gap-3">
				<p className="text-muted-foreground text-sm">{copy.switchPrompt}</p>
				<Button
					onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
					type="button"
					variant="outline"
				>
					{copy.switchLabel}
				</Button>
			</CardFooter>
		</Card>
	);
}
