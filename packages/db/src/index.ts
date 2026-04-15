import { env } from "@emach/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import { apiKey, apiKeyRelations } from "./schema/api-keys";
import {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
} from "./schema/auth";
import {
	branch,
	branchRelations,
	stockLevel,
	stockLevelRelations,
} from "./schema/inventory";
import { promotion, promotionRelations } from "./schema/promotions";
import {
	stockMovement,
	stockMovementRelations,
} from "./schema/stock-movements";
import {
	category,
	categoryRelations,
	supplier,
	supplierRelations,
	tool,
	toolRelations,
} from "./schema/tools";

const schema = {
	account,
	accountRelations,
	apiKey,
	apiKeyRelations,
	branch,
	branchRelations,
	category,
	categoryRelations,
	promotion,
	promotionRelations,
	session,
	sessionRelations,
	stockLevel,
	stockLevelRelations,
	stockMovement,
	stockMovementRelations,
	supplier,
	supplierRelations,
	tool,
	toolRelations,
	user,
	userRelations,
};

export function createDb() {
	return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
