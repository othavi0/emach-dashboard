import { env } from "@emach/env/server";

import { resend } from "./client";
import { InviteEmail } from "./templates/invite";
import { PasswordResetEmail } from "./templates/password-reset";

export async function sendPasswordResetEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Redefinir sua senha — E-mach",
		react: <PasswordResetEmail url={url} />,
	});
}

export async function sendInviteEmail({
	to,
	inviterName,
	acceptUrl,
}: {
	to: string;
	inviterName: string;
	acceptUrl: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Convite para o painel E-mach",
		react: <InviteEmail acceptUrl={acceptUrl} inviterName={inviterName} />,
	});
}
