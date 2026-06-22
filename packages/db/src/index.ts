import { env } from "@emach/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import {
	attributeDefinition,
	attributeDefinitionRelations,
	toolAttributeAssignment,
	toolAttributeAssignmentRelations,
	toolAttributeValue,
	toolAttributeValueRelations,
} from "./schema/attributes";
import {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./schema/auth";
import {
	category,
	categoryRelations,
	toolCategory,
	toolCategoryRelations,
} from "./schema/categories";
import {
	client,
	clientAccount,
	clientAccountRelations,
	clientAddress,
	clientAddressRelations,
	clientRelations,
	clientSession,
	clientSessionRelations,
	clientVerification,
} from "./schema/client";
import { clientAuditLog, clientAuditLogRelations } from "./schema/client-audit";
import {
	clientExportLog,
	clientExportLogRelations,
} from "./schema/client-export";
import { consentLog, consentLogRelations } from "./schema/consent-log";
import {
	branch,
	branchRelations,
	stockLevel,
	stockLevelRelations,
} from "./schema/inventory";
import {
	order,
	orderItem,
	orderItemRelations,
	orderNote,
	orderNoteRelations,
	orderRelations,
	orderStatusHistory,
	orderStatusHistoryRelations,
} from "./schema/orders";
import {
	promotion,
	promotionRelations,
	promotionTool,
	promotionToolRelations,
} from "./schema/promotions";
import { review, reviewRelations } from "./schema/reviews";
import {
	carrier,
	carrierRate,
	carrierRateRelations,
	carrierRelations,
	carrierZone,
	carrierZoneRelations,
	shippingBox,
} from "./schema/shipping";
import {
	stockMovement,
	stockMovementRelations,
} from "./schema/stock-movements";
import {
	supplier,
	tool,
	toolImage,
	toolImageRelations,
	toolRelations,
	toolVariant,
	toolVariantRelations,
} from "./schema/tools";

const schema = {
	account,
	accountRelations,
	attributeDefinition,
	attributeDefinitionRelations,
	branch,
	branchRelations,
	category,
	categoryRelations,
	client,
	clientAccount,
	clientAccountRelations,
	clientAddress,
	clientAddressRelations,
	clientRelations,
	clientSession,
	clientSessionRelations,
	clientAuditLog,
	clientAuditLogRelations,
	clientExportLog,
	clientExportLogRelations,
	clientVerification,
	consentLog,
	consentLogRelations,
	order,
	orderItem,
	orderItemRelations,
	orderNote,
	orderNoteRelations,
	orderRelations,
	orderStatusHistory,
	orderStatusHistoryRelations,
	promotion,
	promotionRelations,
	promotionTool,
	promotionToolRelations,
	review,
	reviewRelations,
	carrier,
	carrierRate,
	carrierRateRelations,
	carrierRelations,
	carrierZone,
	carrierZoneRelations,
	shippingBox,
	session,
	sessionRelations,
	stockLevel,
	stockLevelRelations,
	stockMovement,
	stockMovementRelations,
	supplier,
	tool,
	toolAttributeAssignment,
	toolAttributeAssignmentRelations,
	toolAttributeValue,
	toolAttributeValueRelations,
	toolCategory,
	toolCategoryRelations,
	toolImage,
	toolImageRelations,
	toolRelations,
	toolVariant,
	toolVariantRelations,
	user,
	userRelations,
	verification,
};

export function createDb() {
	return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
