import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
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
