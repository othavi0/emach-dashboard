// Mock for vitest — @emach/db is a server-only DB client, not needed in pure helper tests
export const db = {};
export const sql = Object.assign(
	(strings: TemplateStringsArray, ...values: unknown[]) => ({
		_sql: strings,
		_values: values,
	}),
	{ raw: (s: string) => s }
);
