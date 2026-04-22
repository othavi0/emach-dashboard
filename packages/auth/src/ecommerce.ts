import { createDb } from "@emach/db";
import {
	client,
	clientAccount,
	clientSession,
	clientVerification,
} from "@emach/db/schema/client";
import { env } from "@emach/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

const db = createDb();
const schema = { client, clientSession, clientAccount, clientVerification };

export const authEcommerce = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	trustedOrigins: env.ECOMMERCE_ORIGIN ? [env.ECOMMERCE_ORIGIN] : [],
	emailAndPassword: {
		enabled: true,
	},
	user: {
		modelName: "client",
		additionalFields: {
			phone: {
				type: "string",
				required: false,
				input: true,
			},
			document: {
				type: "string",
				required: false,
				input: true,
			},
		},
	},
	session: {
		modelName: "clientSession",
	},
	account: {
		modelName: "clientAccount",
	},
	verification: {
		modelName: "clientVerification",
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL_ECOMMERCE ?? env.BETTER_AUTH_URL,
	advanced: {
		cookiePrefix: "ecommerce",
	},
	plugins: [nextCookies()],
});

export type EcommerceSession = typeof authEcommerce.$Infer.Session;
