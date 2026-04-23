import { createDb } from "@emach/db";
import { account, session, user, verification } from "@emach/db/schema/auth";
import { env } from "@emach/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

const db = createDb();
const schema = { account, session, user, verification };

export const authDashboard = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN],
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				required: false,
				defaultValue: "user",
				input: false,
			},
		},
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	plugins: [nextCookies()],
});

export type DashboardSession = typeof authDashboard.$Infer.Session;
