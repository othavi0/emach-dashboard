"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();

		setIsSubmitting(true);
		await authClient.requestPasswordReset({
			email,
			redirectTo: `${window.location.origin}/redefinir-senha`,
		});
		// Resposta constante (não revela se o email existe).
		setSent(true);
		setIsSubmitting(false);
	};

	if (sent) {
		return (
			<div>
				<h2 className="font-sans font-semibold text-2xl tracking-tight">
					Verifique seu email
				</h2>
				<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
					Se houver uma conta com esse email, enviamos um link para redefinir a
					senha. O link expira em 1 hora.
				</p>
				<Link
					className="mt-6 block text-muted-foreground text-sm hover:text-foreground"
					href="/login"
				>
					← Voltar para o login
				</Link>
			</div>
		);
	}

	return (
		<div>
			<h2 className="font-sans font-semibold text-2xl tracking-tight">
				Recuperar acesso
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				Enviaremos um link de redefinição para o seu email.
			</p>

			<form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
				<div className="flex flex-col gap-2">
					<Label htmlFor="email">Email</Label>
					<Input
						autoComplete="email"
						id="email"
						name="email"
						placeholder="voce@emach.com.br"
						required
						type="email"
					/>
				</div>
				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Enviando..." : "Enviar link"}
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
