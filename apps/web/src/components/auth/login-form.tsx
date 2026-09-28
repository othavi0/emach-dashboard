"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { ArrowRight, Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";

const INPUT_CLASS =
	"h-[42px] rounded-lg px-3 text-[15px] caret-primary hover:border-muted-foreground/60 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/22 focus-visible:ring-offset-0 md:text-[15px] dark:bg-input/18";

export function LoginForm() {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [capsLock, setCapsLock] = useState(false);
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

	const trackCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
		setCapsLock(event.getModifierState("CapsLock"));
	};

	return (
		<div>
			<h2 className="font-sans font-semibold text-2xl tracking-tight">
				Entrar
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				Acesse com seu email corporativo.
			</p>

			<form className="mt-7 flex flex-col gap-4.5" onSubmit={handleSubmit}>
				{errorMessage ? (
					<p
						className="rounded-md border border-destructive/55 bg-destructive/12 px-3 py-2 text-destructive text-sm"
						role="alert"
					>
						{errorMessage}
					</p>
				) : null}

				<div className="flex flex-col gap-2">
					<Label className="font-medium text-sm" htmlFor="email">
						Email
					</Label>
					<Input
						autoComplete="email"
						className={INPUT_CLASS}
						id="email"
						name="email"
						placeholder="voce@emach.com.br"
						required
						type="email"
					/>
				</div>

				<div className="flex flex-col gap-2">
					<div className="flex items-baseline justify-between">
						<Label className="font-medium text-sm" htmlFor="password">
							Senha
						</Label>
						<Link
							className="text-primary text-sm underline-offset-3 hover:underline"
							href="/esqueci-senha"
						>
							Esqueci minha senha
						</Link>
					</div>
					<div className="relative">
						<Input
							autoComplete="current-password"
							className={`${INPUT_CLASS} pr-11`}
							id="password"
							name="password"
							onBlur={() => setCapsLock(false)}
							onKeyDown={trackCapsLock}
							onKeyUp={trackCapsLock}
							placeholder="Sua senha"
							required
							type={showPassword ? "text" : "password"}
						/>
						<Button
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							onClick={() => setShowPassword((v) => !v)}
							size="icon"
							type="button"
							variant="ghost"
						>
							{showPassword ? (
								<EyeOff aria-hidden className="size-4.5" />
							) : (
								<Eye aria-hidden className="size-4.5" />
							)}
						</Button>
					</div>
					{/* A região fica montada vazia para o leitor de tela anunciar o aviso quando ele aparece. */}
					<p
						className="flex items-center gap-1.5 font-medium text-[13px] text-warning empty:-mt-2"
						role="status"
					>
						{capsLock ? (
							<>
								<TriangleAlert aria-hidden className="size-[15px]" />
								Caps Lock ativado
							</>
						) : null}
					</p>
				</div>

				<Button
					className="mt-1.5 h-[42px] w-full gap-2 rounded-lg font-semibold text-[15px] hover:bg-[color-mix(in_oklab,var(--primary)_90%,var(--foreground))]"
					disabled={isSubmitting}
					type="submit"
				>
					{isSubmitting ? "Entrando..." : "Entrar"}
					<ArrowRight
						aria-hidden
						className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-safe:group-hover/button:translate-x-[3px]"
					/>
				</Button>
			</form>

			<p className="mt-7 flex gap-2 border-border border-t pt-4 text-[13px] text-muted-foreground">
				<Lock aria-hidden className="mt-[3px] size-[15px] flex-none" />
				Acesso restrito à equipe interna. Sem conta? Peça um convite a um
				administrador.
			</p>
		</div>
	);
}
