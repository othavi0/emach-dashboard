import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Acesse o dashboard administrativo da Emach Ferramentas para gerenciar ferramentas, pedidos, estoque e clientes.",
	title: "Entrar",
};

async function LoginRedirectGate() {
	const session = await getCurrentSession();
	if (session?.user) {
		const status = getUserStatus(session);
		if (status === "pending") {
			redirect("/pending");
		}
		if (status === "suspended") {
			redirect("/suspended");
		}
		redirect("/dashboard");
	}
	return null;
}

export default function LoginPage() {
	return (
		<>
			<Suspense fallback={null}>
				<LoginRedirectGate />
			</Suspense>
			<AuthShell>
				<LoginForm />
			</AuthShell>
		</>
	);
}
