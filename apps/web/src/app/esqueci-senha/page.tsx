import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Solicite a recuperação de senha da sua conta no dashboard administrativo da Emach Ferramentas.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Esqueci minha senha",
};

async function ForgotRedirectGate() {
	const session = await getCurrentSession();
	if (session?.user) {
		redirect("/dashboard");
	}
	return null;
}

export default function ForgotPasswordPage() {
	return (
		<>
			<Suspense fallback={null}>
				<ForgotRedirectGate />
			</Suspense>
			<AuthShell>
				<ForgotPasswordForm />
			</AuthShell>
		</>
	);
}
