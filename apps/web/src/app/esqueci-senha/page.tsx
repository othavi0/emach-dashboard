import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getCurrentSession } from "@/lib/session";

export default async function ForgotPasswordPage() {
	const session = await getCurrentSession();
	if (session?.user) {
		redirect("/dashboard");
	}

	return (
		<AuthShell>
			<ForgotPasswordForm />
		</AuthShell>
	);
}
