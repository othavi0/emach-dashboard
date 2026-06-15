import "server-only";
import { db } from "@emach/db";
import { supplier } from "@emach/db/schema/tools";
import { asc, eq } from "drizzle-orm";

export interface ActiveSupplierOption {
	id: string;
	name: string;
}

export async function getActiveSuppliers(): Promise<ActiveSupplierOption[]> {
	return await db
		.select({ id: supplier.id, name: supplier.name })
		.from(supplier)
		.where(eq(supplier.status, "active"))
		.orderBy(asc(supplier.name));
}
