import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const SCRIPT = join(import.meta.dir, "check-doc-paths.ts");
const roots: string[] = [];

afterAll(() => {
	for (const r of roots) {
		rmSync(r, { recursive: true, force: true });
	}
});

function check(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), "check-docs-"));
	roots.push(root);

	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}

	spawnSync("git", ["init", "-q"], { cwd: root });
	spawnSync("git", ["add", "-A"], { cwd: root });

	const run = spawnSync(process.execPath, [SCRIPT, root], {
		encoding: "utf8",
	});

	return { code: run.status, lines: run.stdout.trim().split("\n") };
}

const PKG = JSON.stringify({ scripts: { "db:sync": "x" } });

describe("(a) arquivos da raiz e de tools/", () => {
	test("arquivo da raiz citado sem barra existe", () => {
		expect(
			check({ "turbo.json": "{}", "README.md": "Veja `turbo.json`." })
		).toEqual({ code: 0, lines: ["files=1 refs=1 broken=0 warned=0"] });
	});

	test("arquivo da raiz e pasta de tools/ que não existem", () => {
		expect(
			check({ "README.md": "Veja `lefthook.yml` e `tools/lint/`." })
		).toEqual({
			code: 1,
			lines: [
				"README.md:1\tcaminho\tlefthook.yml não existe no repo",
				"README.md:1\tcaminho\ttools/lint/ não existe no repo",
				"files=1 refs=2 broken=2 warned=0",
			],
		});
	});

	test("menção deliberada a arquivo removido não acusa", () => {
		expect(check({ "README.md": "O `old.ts` foi removido em julho." })).toEqual(
			{ code: 0, lines: ["files=1 refs=0 broken=0 warned=0"] }
		);
	});

	test("palavra de remoção em doc viva não pula caminho com barra nem link", () => {
		expect(
			check({
				"README.md":
					"O `old.ts` foi apagado; ver `apps/web/gone.ts` e [doc](docs/gone.md).",
			})
		).toEqual({
			code: 1,
			lines: [
				"README.md:1\tcaminho\tdocs/gone.md não existe no repo",
				"README.md:1\tcaminho\tapps/web/gone.ts não existe no repo",
				"files=1 refs=2 broken=2 warned=0",
			],
		});
	});

	test("palavra de remoção em ADR pula caminho com barra e link", () => {
		expect(
			check({
				"docs/adr/0001-x.md":
					"O `apps/web/gone.ts` foi removido; ver [doc](gone.md).",
			})
		).toEqual({ code: 0, lines: ["files=1 refs=0 broken=0 warned=0"] });
	});
});

describe("(b) bun <script>", () => {
	test("script da raiz, do --cwd e subcomando do bun", () => {
		expect(
			check({
				"package.json": PKG,
				"packages/db/package.json": JSON.stringify({
					scripts: { "db:read": "x" },
				}),
				"README.md":
					"`bun db:sync`, `bun run --cwd packages/db db:read` e `bun install`.",
			})
		).toEqual({ code: 0, lines: ["files=1 refs=2 broken=0 warned=0"] });
	});

	test("script que não existe", () => {
		expect(
			check({ "package.json": PKG, "README.md": "Rode `bun db:synk`." })
		).toEqual({
			code: 1,
			lines: [
				"README.md:1\tbun-script\tdb:synk não é script de nenhum package.json nem binário de node_modules/.bin",
				"files=1 refs=1 broken=1 warned=0",
			],
		});
	});
});

describe("(c) ADR e auditoria em modo aviso", () => {
	test("caminho quebrado em ADR avisa e sai 0", () => {
		expect(
			check({ "docs/adr/0001-x.md": "Ver `packages/db/src/gone.ts`." })
		).toEqual({
			code: 0,
			lines: [
				"docs/adr/0001-x.md:1\taviso:caminho\tpackages/db/src/gone.ts não existe no repo",
				"files=1 refs=1 broken=0 warned=1",
			],
		});
	});

	test("o mesmo caminho em doc viva é erro", () => {
		expect(check({ "README.md": "Ver `packages/db/src/gone.ts`." }).code).toBe(
			1
		);
	});
});

describe("(d) arquivo.ext:N", () => {
	const files = { "packages/db/src/schema/tools.ts": "" };

	test("citar símbolo passa", () => {
		expect(
			check({
				...files,
				"CLAUDE.md": "Ver `packages/db/src/schema/tools.ts:tool`.",
			})
		).toEqual({ code: 0, lines: ["files=1 refs=1 broken=0 warned=0"] });
	});

	test("citar linha em doc viva é erro, em auditoria é aviso", () => {
		expect(
			check({
				...files,
				"CLAUDE.md": "Ver `packages/db/src/schema/tools.ts:10`.",
				"docs/audits/a.md": "Ver `tools.ts:10-12`.",
			})
		).toEqual({
			code: 1,
			lines: [
				"CLAUDE.md:1\tlinha\tpackages/db/src/schema/tools.ts:10: cite a função ou o símbolo, não a linha",
				"docs/audits/a.md:1\taviso:linha\ttools.ts:10-12: cite a função ou o símbolo, não a linha",
				"files=2 refs=2 broken=1 warned=1",
			],
		});
	});
});

describe("(e) tabela de ownership do contrato", () => {
	const contract = [
		"| Tabela | Dono |",
		"| ------ | ---- |",
		"| `user` | Dashboard |",
		"",
		"| Coluna | Tipo |",
		"| ------ | ---- |",
		"| `id` | text |",
	].join("\n");

	test("contrato e pgTable batem", () => {
		expect(
			check({
				"docs/integration/admin-ecommerce.md": contract,
				"packages/db/src/schema/auth.ts": 'pgTable(\n\t"user", {})',
			}).code
		).toBe(0);
	});

	test("tabela do schema fora do contrato", () => {
		expect(
			check({
				"docs/integration/admin-ecommerce.md": contract,
				"packages/db/src/schema/auth.ts":
					'pgTable("user", {});\npgTable("session", {});',
			})
		).toEqual({
			code: 1,
			lines: [
				"packages/db/src/schema/auth.ts:2\townership\ttabela session falta na tabela de ownership de docs/integration/admin-ecommerce.md",
				"files=1 refs=0 broken=1 warned=0",
			],
		});
	});
});

describe("(f) superfície do sync", () => {
	const workflow = (body: string) =>
		[
			"on:",
			"  push:",
			"    paths:",
			'      - "packages/db/src/schema/**"',
			'      - "packages/db/src/utils.ts"',
			"jobs:",
			"  sync:",
			"    steps:",
			"      - with:",
			"          body: |",
			body,
			"          commit: x",
		].join("\n");

	const fullBody =
		"            - packages/db/src/schema/\n            - packages/db/src/utils.ts";

	test("lista marcada e body cobrem o paths:", () => {
		expect(
			check({
				".github/workflows/sync-db-schema.yml": workflow(fullBody),
				"packages/db/src/schema/a.ts": "",
				"packages/db/src/utils.ts": "",
				"README.md":
					"Espelha `packages/db/src/{schema,utils.ts}`. <!-- sync-paths -->",
			}).code
		).toBe(0);
	});

	test("lista marcada e body sem utils.ts", () => {
		expect(
			check({
				".github/workflows/sync-db-schema.yml": workflow(
					"            - packages/db/src/schema/"
				),
				"packages/db/src/schema/a.ts": "",
				"README.md": "Espelha `schema/`. <!-- sync-paths -->",
			})
		).toEqual({
			code: 1,
			lines: [
				".github/workflows/sync-db-schema.yml:10\tsync-paths\tbody do PR sem utils.ts, que está no paths:",
				"README.md:1\tsync-paths\tlista da superfície do sync sem utils.ts, que está no paths: de .github/workflows/sync-db-schema.yml",
				"files=1 refs=0 broken=2 warned=0",
			],
		});
	});
});

describe("(g) scripts db:* no packages/db/CLAUDE.md", () => {
	const pkg = JSON.stringify(
		{ scripts: { "db:read": "x", "db:studio": "y", test: "z" } },
		null,
		2
	);

	test("todo db:* documentado", () => {
		expect(
			check({
				"packages/db/package.json": pkg,
				"packages/db/CLAUDE.md": "`db:read` lê e `db:studio` abre o Studio.",
			}).code
		).toBe(0);
	});

	test("db:* sem menção", () => {
		expect(
			check({
				"packages/db/package.json": pkg,
				"packages/db/CLAUDE.md": "`db:read` lê.",
			})
		).toEqual({
			code: 1,
			lines: [
				"packages/db/package.json:4\tdb-script\tdb:studio não aparece em packages/db/CLAUDE.md",
				"files=1 refs=0 broken=1 warned=0",
			],
		});
	});
});
