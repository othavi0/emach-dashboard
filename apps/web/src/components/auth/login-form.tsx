"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";

export function LoginForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		const formData = new FormData(event.currentTarget);
		const email = String(formData.get("email") ?? "").trim();
		const password = String(formData.get("password") ?? "");

		setIsSubmitting(true);
		await authClient.signIn.email(
			{ email, password },
			{
				onSuccess: () => {
					router.replace("/dashboard");
					router.refresh();
				},
				onError: (ctx) => {
					setErrorMessage(authErrorMessage(ctx.error));
					setIsSubmitting(false);
				},
			}
		);
	};

	return (
		<div>
			<h1 className="font-medium font-serif text-3xl tracking-tight">Entrar</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Acesse com seu email corporativo.
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

				<div className="flex flex-col gap-2">
					<Label htmlFor="password">Senha</Label>
					<div className="relative">
						<Input
							autoComplete="current-password"
							className="pr-10"
							id="password"
							name="password"
							placeholder="••••••••"
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

				<Button disabled={isSubmitting} type="submit">
					{isSubmitting ? "Entrando..." : "Entrar"}
				</Button>
			</form>

			<Link
				className="mt-4 block text-right text-primary text-sm hover:underline"
				href="/esqueci-senha"
			>
				Esqueci minha senha
			</Link>
		</div>
	);
}
