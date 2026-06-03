import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function LoginPage() {
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

	return (
		<AuthShell>
			<LoginForm />
		</AuthShell>
	);
}
