import type { Metadata } from "next";
import { getInviteByToken } from "@/app/dashboard/users/data";
import { AuthShell } from "@/components/auth/auth-shell";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	description:
		"Aceite seu convite para acessar o dashboard administrativo da Emach Ferramentas.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Convite",
};

export default async function InvitePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;
	const invite = token ? await getInviteByToken(token) : null;

	return (
		<AuthShell>
			{invite && token ? (
				<InviteAcceptForm email={invite.email} token={token} />
			) : (
				<div>
					<h1 className="font-medium font-serif text-3xl tracking-tight">
						Convite inválido
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						Este convite não é válido ou expirou. Peça para um administrador
						enviar um novo.
					</p>
				</div>
			)}
		</AuthShell>
	);
}
