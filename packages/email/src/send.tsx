import { env } from "@emach/env/server";

import { resend } from "./client";
import { ChangeEmailConfirmation } from "./templates/change-email-confirmation";
import { InviteEmail } from "./templates/invite";
import { PasswordResetEmail } from "./templates/password-reset";
import {
	StockAlertEmail,
	type StockAlertEmailProps,
} from "./templates/stock-alert";
import { VerifyNewEmail } from "./templates/verify-new-email";

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

export async function sendChangeEmailConfirmation({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Confirme a troca do seu e-mail — E-mach",
		react: <ChangeEmailConfirmation url={url} />,
	});
}

export async function sendVerifyNewEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: "Verifique seu novo e-mail — E-mach",
		react: <VerifyNewEmail url={url} />,
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

export async function sendStockAlertEmail({
	to,
	branchName,
	dashboardUrl,
	items,
}: {
	to: string[];
	branchName: string;
	dashboardUrl: string;
	items: StockAlertEmailProps["items"];
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: `Alerta de estoque — ${branchName} — E-mach`,
		react: (
			<StockAlertEmail
				branchName={branchName}
				dashboardUrl={dashboardUrl}
				items={items}
			/>
		),
	});
}
