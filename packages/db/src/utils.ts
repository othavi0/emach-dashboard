export function toDate(value: Date | string): Date;
export function toDate(value: Date | string | null | undefined): Date | null;
export function toDate(value: Date | string | null | undefined): Date | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		return value;
	}
	return new Date(value);
}

/**
 * Coerce multiple timestamp-typed keys on a raw `db.execute` result object
 * from string to Date. Mutates `obj` in place and returns it.
 *
 * Background: `db.execute()` bypasses Drizzle's column mapper and returns
 * timestamps as raw strings from the Postgres driver. Use this at every
 * `db.execute` boundary where the shape type declares Date fields.
 * See `packages/db/CLAUDE.md` — "Armadilha: db.execute() raw devolve
 * timestamp como string".
 */
export function coerceDates<T extends object>(
	obj: T,
	keys: readonly (keyof T)[]
): T {
	for (const k of keys) {
		const v = obj[k];
		if (v !== null && v !== undefined && !(v instanceof Date)) {
			(obj as Record<keyof T, unknown>)[k] = new Date(v as string);
		}
	}
	return obj;
}
