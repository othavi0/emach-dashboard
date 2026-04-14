import { env } from "@emach/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import { account, session, user, verification } from "./schema/auth";

const schema = { account, session, user, verification };

export function createDb() {
	return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
