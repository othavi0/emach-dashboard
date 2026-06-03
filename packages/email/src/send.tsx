import { env } from "@emach/env/server";

import { resend } from "./client";
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
