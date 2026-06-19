import { createDb } from "@emach/db";
import { account, session, user, verification } from "@emach/db/schema/auth";
import { sendPasswordResetEmail } from "@emach/email/send";
import { env } from "@emach/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";

const db = createDb();
const schema = { account, session, user, verification };

const isProd = env.NODE_ENV === "production";

// Em produção a URL é fixa e determinística (segurança: evita inferir host
// arbitrário da request — vetor de host-header injection; a doc do Better Auth
// recomenda baseURL explícito em prod). Em dev o host é derivado da request e
// validado contra `localhost:*`, permitindo rodar em qualquer porta sem editar
// o .env (útil quando a 3001 está ocupada por outro projeto). Dashboard é
// email/senha apenas — sem OAuth, então não há redirect URIs a registrar.
const dashboardBaseURL = isProd
	? env.BETTER_AUTH_URL
	: { allowedHosts: ["localhost:*"], protocol: "http" as const };

export const authDashboard = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	trustedOrigins: isProd ? [env.CORS_ORIGIN] : ["http://localhost:*"],
	emailAndPassword: {
		enabled: true,
		disableSignUp: true,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user: target, url }) => {
			await sendPasswordResetEmail({ to: target.email, url });
		},
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "user",
				input: false,
			},
			status: {
				type: "string",
				required: false,
				defaultValue: "pending",
				input: false,
			},
		},
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: dashboardBaseURL,
	// Sessão lida do Postgres em todo request (sem cookieCache). A medição de
	// produção do #223 (ADR-0021, supersede ADR-0020) mostrou que o cookieCache
	// não entregava no caminho SSR — o render RSC do layout lê mas não escreve o
	// cookie `session_data`, e sem middleware nada o refresca, então o hard load
	// caía no DB de qualquer forma. Em prod warm o read é barato (~178ms ≈ rede),
	// e remover o cache devolve o gate de status/role a leitura sempre fresca
	// (sem janela de staleness P0).
	plugins: [nextCookies()],
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					if (session.userId) {
						await db
							.update(user)
							.set({ lastLoginAt: new Date() })
							.where(eq(user.id, session.userId));
					}
				},
			},
		},
	},
});

export type DashboardSession = typeof authDashboard.$Infer.Session;
