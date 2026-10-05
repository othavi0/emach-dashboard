// packages/db/scripts/db-read.ts
// Consulta ao banco único sem MCP, sem risco de escrita:
//   bun run scripts/db-read.ts "<sql>" [--limit N] [--timeout S]
// Roda dentro de BEGIN READ ONLY com statement_timeout e sempre termina em
// ROLLBACK. A consulta vira um cursor (DECLARE ... FOR <sql>) mandado pelo
// protocolo estendido, que o Postgres recusa com mais de um comando:
// "SELECT 1; COMMIT; DELETE ..." não escapa da transação. O FETCH de limit+1
// faz o servidor parar ali; `rows` do pg não serve, ele pagina até o fim.

import { Client } from "pg";

const DEFAULT_LIMIT = 200;
const DEFAULT_TIMEOUT_S = 15;
const USAGE = '[db-read] uso: db-read.ts "<sql>" [--limit N] [--timeout S]';

const FLAGS = ["--limit", "--timeout"] as const;
type Flag = (typeof FLAGS)[number];

export interface ReadArgs {
	limit: number;
	statement: string;
	timeoutSeconds: number;
}

function isFlag(value: string): value is Flag {
	return (FLAGS as readonly string[]).includes(value);
}

function positiveInt(flag: Flag, raw: string | undefined): number {
	const value = Number(raw);
	if (raw === undefined || !Number.isInteger(value) || value < 1) {
		throw new Error(
			`[db-read] ${flag} exige inteiro >= 1, veio "${raw ?? ""}"`
		);
	}
	return value;
}

export function parseArgs(argv: string[]): ReadArgs {
	const values: Partial<Record<Flag, number>> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? "";
		if (isFlag(arg)) {
			values[arg] = positiveInt(arg, argv[i + 1]);
			i++;
		} else if (arg.startsWith("--")) {
			throw new Error(`[db-read] flag desconhecida: ${arg}. ${USAGE}`);
		} else {
			positional.push(arg);
		}
	}
	const [statement] = positional;
	if (!statement?.trim() || positional.length > 1) {
		throw new Error(USAGE);
	}
	return {
		statement,
		limit: values["--limit"] ?? DEFAULT_LIMIT,
		timeoutSeconds: values["--timeout"] ?? DEFAULT_TIMEOUT_S,
	};
}

export async function readOnly(
	client: Client,
	{ limit, statement, timeoutSeconds }: ReadArgs
): Promise<{ rows: unknown[]; truncated: boolean }> {
	await client.query("BEGIN READ ONLY");
	try {
		await client.query("SELECT set_config('statement_timeout', $1, true)", [
			`${timeoutSeconds * 1000}`,
		]);
		// Statement nomeado força Parse/Bind (protocolo estendido); o @types/pg
		// não declara `queryMode`. Nome único porque o prepared statement
		// sobrevive ao ROLLBACK e o pooler pode reusar a conexão do servidor.
		await client.query({
			name: `db-read-${crypto.randomUUID()}`,
			text: `DECLARE db_read NO SCROLL CURSOR FOR ${statement}`,
		});
		const { rows } = await client.query(`FETCH ${limit + 1} FROM db_read`);
		return { rows: rows.slice(0, limit), truncated: rows.length > limit };
	} finally {
		await client.query("ROLLBACK");
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const { env } = await import("@emach/env/server");
	const client = new Client({ connectionString: env.DATABASE_URL });
	await client.connect();
	try {
		const { rows, truncated } = await readOnly(client, args);
		console.log(
			JSON.stringify({ rowCount: rows.length, truncated, rows }, null, 2)
		);
	} finally {
		await client.end();
	}
}

if (import.meta.main) {
	main().catch((err) => {
		console.error("[db-read] FAIL", err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
