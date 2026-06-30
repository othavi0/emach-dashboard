"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		const formData = new FormData(event.currentTarget);
		const password = String(formData.get("password") ?? "");
		const confirm = String(formData.get("confirm") ?? "");

		if (password !== confirm) {
			setErrorMessage("As senhas não coincidem.");
			return;
		}

		setIsSubmitting(true);
		await authClient.resetPassword(
			{ newPassword: password, token },
			{
				onSuccess: () => {
					router.replace("/login");
					router.refresh();
				},
				onError: () => {
					setErrorMessage(
						"Não foi possível redefinir. O link pode ter expirado — solicite um novo."
					);
					setIsSubmitting(false);
				},
			}
		);
	};

	return (
		<div>
			<h1 className="font-medium font-serif text-3xl uppercase tracking-[0.015em]">
				Nova senha
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Defina uma senha para sua conta.
			</p>

			<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
				{errorMessage ? (
					<p
						className="rounded-md border border-destructive/55 bg-destructive/12 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{errorMessage}
					</p>
				) : null}

				<div className="flex flex-col gap-2">
					<Label htmlFor="password">Nova senha</Label>
					<div className="relative">
						<Input
							autoComplete="new-password"
							className="pr-10"
							id="password"
							minLength={8}
							name="password"
							placeholder="Mínimo 8 caracteres"
							required
							type={showPassword ? "text" : "password"}
						/>
						<Button
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							className="absolute top-1/2 right-1 -translate-y-1/2"
							onClick={() => setShowPassword((v) => !v)}
							size="icon-sm"
							type="button"
							variant="ghost"
						>
							{showPassword ? (
								<EyeOff aria-hidden className="size-4" />
							) : (
								<Eye aria-hidden className="size-4" />
							)}
						</Button>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Label htmlFor="confirm">Confirmar senha</Label>
					<Input
						autoComplete="new-password"
						id="confirm"
						minLength={8}
						name="confirm"
						placeholder="Repita a senha"
						required
						type={showPassword ? "text" : "password"}
					/>
				</div>

				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Salvando..." : "Salvar nova senha"}
				</Button>
			</form>

			<Link
				className="mt-4 block text-center text-muted-foreground text-sm hover:text-foreground"
				href="/login"
			>
				← Voltar para o login
			</Link>
		</div>
	);
}
