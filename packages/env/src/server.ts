import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnv } from "@t3-oss/env-core";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dotenvPaths = [
	resolve(process.cwd(), ".env"),
	resolve(process.cwd(), "apps/web/.env"),
	resolve(currentDir, "../../../apps/web/.env"),
];

for (const dotenvPath of new Set(dotenvPaths)) {
	if (existsSync(dotenvPath)) {
		dotenv.config({ path: dotenvPath, quiet: true });
	}
}

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		BETTER_AUTH_URL_ECOMMERCE: z.url().optional(),
		ECOMMERCE_ORIGIN: z.url().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
		NEXT_PUBLIC_SUPABASE_URL: z.url(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
