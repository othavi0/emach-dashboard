import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
	description:
		"Redefina com segurança a senha da sua conta no dashboard administrativo da Emach Ferramentas.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Redefinir senha",
};

export default function ResetPasswordPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	return (
		<Suspense>
			<ResetPasswordPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function ResetPasswordPageContent({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	return (
		<AuthShell>
			{token ? (
				<ResetPasswordForm token={token} />
			) : (
				<div>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Link inválido
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Este link de redefinição não é válido. Solicite um novo na tela de
						recuperação.
					</p>
				</div>
			)}
		</AuthShell>
	);
}
