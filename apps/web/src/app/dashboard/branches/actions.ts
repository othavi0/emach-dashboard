"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/session";
import {
	type BranchFormValues,
	branchSchema,
} from "./_components/branch-schema";

const BRANCHES_PATH = "/dashboard/branches";

export type BranchListItem = typeof branch.$inferSelect;

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function normalizePayload(input: BranchFormValues) {
	const address = input.address?.trim();
	return {
		name: input.name,
		address: address ? address : null,
	};
}

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

export async function listBranches(): Promise<BranchListItem[]> {
	return await db.select().from(branch).orderBy(asc(branch.name));
}

export async function getBranch(id: string): Promise<BranchListItem | null> {
	const rows = await db.select().from(branch).where(eq(branch.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function createBranch(
	input: BranchFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = branchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const id = crypto.randomUUID();
	const payload = normalizePayload(parsed.data);

	try {
		await db.insert(branch).values({ id, ...payload });
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	revalidatePath(BRANCHES_PATH);
	return { ok: true, data: { id } };
}

export async function updateBranch(
	id: string,
	input: BranchFormValues
): Promise<ActionResult<{ id: string }>> {
	await requireRole("admin");

	const parsed = branchSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const payload = normalizePayload(parsed.data);

	try {
		await db.update(branch).set(payload).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	revalidatePath(BRANCHES_PATH);
	revalidatePath(`${BRANCHES_PATH}/${id}/edit`);
	return { ok: true, data: { id } };
}

export async function deleteBranch(id: string): Promise<ActionResult> {
	await requireRole("admin");

	try {
		await db.delete(branch).where(eq(branch.id, id));
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	revalidatePath(BRANCHES_PATH);
	revalidatePath("/dashboard/stock");
	revalidatePath("/dashboard/tools", "layout");
	return { ok: true, data: undefined };
}
