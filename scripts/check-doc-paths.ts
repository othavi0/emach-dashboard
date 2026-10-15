import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";

const EXCLUDED_FILE =
	/(^|\/)skills\/|^docs\/superpowers\/|^plans\/|^tools\/oxlint\/anti-slop\//;

const WARN_ONLY_FILE = /^docs\/(adr|audits)\//;

const SKIP_LINE_CITING_OTHER_REPO = /ecommerce/i;

const DELIBERATE_MISSING =
	/removid|apagad|não usa|não existe|histórico do git|<!-- check-docs: ignore -->/i;

const LINK = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const CODE = /`([^`\n]+)`/g;
const FENCE = /^(```|~~~)/;

const EXT =
	/\.(ts|tsx|js|mjs|cjs|json|jsonc|md|yml|yaml|sql|css|sh|toml|html|png|svg|env)$/;

const PREFIX =
	/^(\.\/)?(apps|packages|docs|scripts|tooling|tools|\.github|\.claude)\//;

const SKIP =
	/(^|\/)\.env(\.|$)|[*<>{}$\s|]|^https?:|^mailto:|^@|^#|^~|^\/|\.\.\.|^[a-z]+:\/\//;

const ANCHOR = /#.*$/;
const LINE_OR_SYMBOL = /:(L?\d+([-–,]L?\d+)*(:\d+)?|[A-Za-z_]\w*)$/;
const LINE_NUMBER = /:L?\d+([-–,]L?\d+)*(:\d+)?$/;
const TRAILING_SLASH = /\/$/;
const LEADING_DOT_SLASH = /^\.\//;

const WHITESPACE = /\s+/;
const ENV_ASSIGNMENT = /^[A-Z_][A-Z0-9_]*=/;
const NOT_A_SCRIPT_NAME = /[/<>{}$]/;

const BUN_SUBCOMMANDS = new Set([
	"add",
	"build",
	"create",
	"exec",
	"i",
	"init",
	"install",
	"link",
	"outdated",
	"pm",
	"remove",
	"rm",
	"test",
	"unlink",
	"update",
	"upgrade",
	"x",
]);

const BUN_FLAG_FIELD = new Map<string, "cwd" | "filter">([
	["--cwd", "cwd"],
	["-F", "filter"],
	["--filter", "filter"],
]);

const CONTRACT = "docs/integration/admin-ecommerce.md";
const SCHEMA_DIR = "packages/db/src/schema/";
const OWNERSHIP_HEADER = /^\|\s*Tabela\b/;
const TABLE_ROW_NAME = /^\|\s*`([a-z_]+)`/;
const PG_TABLE = /pgTable\(\s*"([a-z_]+)"/g;

const SYNC_WORKFLOW = ".github/workflows/sync-db-schema.yml";
const SYNC_MARKER = "<!-- sync-paths -->";
const SYNC_ROOT = /^packages\/db\/src\//;
const GLOB_SUFFIX = /\/\*\*$/;
const BRACES = /^([^{]*)\{([^}]*)\}(.*)$/;
const YAML_KEY = /^(\s*)([\w-]+):/;
const YAML_LIST_ITEM = /^\s*-\s+"?([^"\s]+)"?\s*$/;

const DB_PACKAGE = "packages/db/package.json";
const DB_CLAUDE_MD = "packages/db/CLAUDE.md";
const DB_SCRIPT = /db:[a-z][\w:-]*/g;

type Severity = "erro" | "aviso";

interface Finding {
	detail: string;
	file: string;
	kind: string;
	line: number;
	severity: Severity;
}

interface Ref {
	file: string;
	kind: "link" | "code";
	line: number;
	raw: string;
}

interface BunCall {
	cwd?: string;
	filter?: string;
	name: string;
}

interface YamlList {
	items: string[];
	line: number;
}

interface WorkspacePackage {
	dir: string;
	name: string;
	scripts: Set<string>;
}

const root = process.argv[2] ?? process.cwd();

// core.quotepath=off: sem ele o git escapa acento em octal e o readFileSync falha.
function gitLsFiles(pattern = ""): string[] {
	return execSync(`git -c core.quotepath=off ls-files ${pattern}`, {
		cwd: root,
		encoding: "utf8",
	})
		.split("\n")
		.filter(Boolean);
}

const exists = (p: string) => existsSync(join(root, p));
const read = (p: string) => readFileSync(join(root, p), "utf8");

function strip(p: string): string {
	return p
		.replace(ANCHOR, "")
		.replace(LINE_OR_SYMBOL, "")
		.replace(TRAILING_SLASH, "");
}

const tracked = gitLsFiles();
const trackedPathSuffixes = new Set<string>();

for (const t of tracked) {
	const parts = t.split("/");

	for (let i = 0; i < parts.length; i++) {
		for (let j = i + 1; j <= parts.length; j++) {
			trackedPathSuffixes.add(parts.slice(i, j).join("/"));
		}
	}
}

const docFiles = tracked.filter(
	(f) =>
		f.endsWith(".md") && !(f.includes("node_modules") || EXCLUDED_FILE.test(f))
);

function readManifest(path: string): WorkspacePackage {
	// SAFETY: package.json rastreado é manifest npm; name e scripts são opcionais e caem no ?? abaixo.
	const manifest = JSON.parse(read(path)) as {
		name?: string;
		scripts?: Record<string, string>;
	};

	return {
		dir: dirname(path),
		name: manifest.name ?? "",
		scripts: new Set(Object.keys(manifest.scripts ?? {})),
	};
}

const workspacePackages = tracked
	.filter((f) => basename(f) === "package.json")
	.map(readManifest);

const findings: Finding[] = [];
let refsChecked = 0;

function report(
	file: string,
	line: number,
	kind: string,
	detail: string,
	severity: Severity = WARN_ONLY_FILE.test(file) ? "aviso" : "erro"
) {
	const repeated = findings.some(
		(f) => f.file === file && f.line === line && f.detail === detail
	);

	if (!repeated) {
		findings.push({ file, line, kind, detail, severity });
	}
}

function lineOf(text: string, index: number): number {
	return text.slice(0, index).split("\n").length;
}

function resolves(r: Ref, p: string): boolean {
	const fromFile = normalize(join(dirname(r.file), p));

	if (r.kind === "link") {
		return exists(fromFile);
	}

	return (
		exists(p) ||
		exists(fromFile) ||
		trackedPathSuffixes.has(p.replace(LEADING_DOT_SLASH, ""))
	);
}

function checkPath(r: Ref) {
	const p = SKIP.test(r.raw) ? "" : strip(r.raw);

	if (!p) {
		return;
	}

	refsChecked++;

	if (!resolves(r, p)) {
		report(r.file, r.line, "caminho", `${r.raw} não existe no repo`);
	}
}

function isPathRef(code: string): boolean {
	const p = strip(code);

	if (code.includes("/")) {
		return EXT.test(p) || PREFIX.test(code);
	}

	return EXT.test(p) && !p.startsWith(".");
}

function scriptCall(
	call: Partial<BunCall>,
	name: string,
	viaRun: boolean
): BunCall | null {
	const isFile = NOT_A_SCRIPT_NAME.test(name) || EXT.test(name);
	const isSubcommand = !viaRun && BUN_SUBCOMMANDS.has(name);

	return isFile || isSubcommand ? null : { ...call, name };
}

function parseBunCall(code: string): BunCall | null {
	const tokens = code
		.trim()
		.split(WHITESPACE)
		.filter((t) => !ENV_ASSIGNMENT.test(t));

	if (tokens.shift() !== "bun") {
		return null;
	}

	const call: Partial<BunCall> = {};
	let viaRun = false;

	while (tokens.length > 0) {
		const t = tokens.shift() ?? "";
		const [flag = "", inline] = t.split("=", 2);
		const field = BUN_FLAG_FIELD.get(flag);

		if (field) {
			call[field] = inline ?? tokens.shift();
		} else if (t === "run") {
			viaRun = true;
		} else if (!t.startsWith("-")) {
			return scriptCall(call, t, viaRun);
		}
	}

	return null;
}

function hasBin(dir: string, name: string): boolean {
	return (
		exists(join(dir, "node_modules/.bin", name)) ||
		exists(join("node_modules/.bin", name))
	);
}

function bunCallResolves(call: BunCall): boolean {
	if (call.cwd) {
		const dir = normalize(call.cwd).replace(TRAILING_SLASH, "");
		const pkg = workspacePackages.find((w) => w.dir === dir);

		return Boolean(pkg?.scripts.has(call.name)) || hasBin(dir, call.name);
	}

	if (call.filter) {
		const pkg = workspacePackages.find(
			(w) => w.name === call.filter || basename(w.dir) === call.filter
		);

		return (
			Boolean(pkg?.scripts.has(call.name)) ||
			(pkg !== undefined && hasBin(pkg.dir, call.name))
		);
	}

	return (
		workspacePackages.some((w) => w.scripts.has(call.name)) ||
		hasBin(".", call.name)
	);
}

function describeBunCall(call: BunCall): string {
	if (call.cwd) {
		return `${call.name} não é script de ${call.cwd}/package.json`;
	}

	if (call.filter) {
		return `${call.name} não é script do pacote ${call.filter}`;
	}

	return `${call.name} não é script de nenhum package.json nem binário de node_modules/.bin`;
}

function checkCode(file: string, line: number, code: string, l: string) {
	const lineNumber = code.match(LINE_NUMBER);

	if (lineNumber && EXT.test(code.slice(0, lineNumber.index))) {
		report(
			file,
			line,
			"linha",
			`${code}: cite a função ou o símbolo, não a linha`
		);
	}

	if (SKIP_LINE_CITING_OTHER_REPO.test(l)) {
		return;
	}

	const call = parseBunCall(code);

	if (call) {
		refsChecked++;

		if (!bunCallResolves(call)) {
			report(file, line, "bun-script", describeBunCall(call));
		}

		return;
	}

	if (!DELIBERATE_MISSING.test(l) && isPathRef(code)) {
		checkPath({ file, line, raw: code, kind: "code" });
	}
}

function checkDoc(file: string) {
	let inFence = false;

	for (const [i, l] of read(file).split("\n").entries()) {
		if (FENCE.test(l.trim())) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			continue;
		}

		const skipLinks =
			SKIP_LINE_CITING_OTHER_REPO.test(l) || DELIBERATE_MISSING.test(l);

		for (const [, raw] of l.matchAll(LINK)) {
			if (raw && !skipLinks) {
				checkPath({ file, line: i + 1, raw, kind: "link" });
			}
		}

		for (const [, code] of l.replace(LINK, "").matchAll(CODE)) {
			checkCode(file, i + 1, (code ?? "").trim(), l);
		}
	}
}

function ownershipRows(): Map<string, number> {
	const documented = new Map<string, number>();
	let inOwnershipTable = false;

	for (const [i, l] of read(CONTRACT).split("\n").entries()) {
		if (OWNERSHIP_HEADER.test(l)) {
			inOwnershipTable = true;
			continue;
		}

		if (!l.startsWith("|")) {
			inOwnershipTable = false;
			continue;
		}

		const name = inOwnershipTable ? l.match(TABLE_ROW_NAME)?.[1] : undefined;

		if (name) {
			documented.set(name, i + 1);
		}
	}

	return documented;
}

function checkOwnership() {
	const schemaFiles = tracked.filter(
		(f) => f.startsWith(SCHEMA_DIR) && f.endsWith(".ts")
	);

	if (!exists(CONTRACT) || schemaFiles.length === 0) {
		return;
	}

	const documented = ownershipRows();
	const declared = new Set<string>();

	for (const f of schemaFiles) {
		const text = read(f);

		for (const m of text.matchAll(PG_TABLE)) {
			const name = m[1] ?? "";
			declared.add(name);

			if (!documented.has(name)) {
				report(
					f,
					lineOf(text, m.index),
					"ownership",
					`tabela ${name} falta na tabela de ownership de ${CONTRACT}`
				);
			}
		}
	}

	for (const [name, line] of documented) {
		if (!declared.has(name)) {
			report(
				CONTRACT,
				line,
				"ownership",
				`tabela ${name} não tem pgTable em ${SCHEMA_DIR}`
			);
		}
	}
}

function expandBraces(p: string): string[] {
	const m = p.match(BRACES);

	if (!m) {
		return [p];
	}

	const [, head = "", options = "", tail = ""] = m;

	return options.split(",").flatMap((o) => expandBraces(`${head}${o}${tail}`));
}

function normalizeSyncPath(p: string): string {
	return p
		.replace(GLOB_SUFFIX, "")
		.replace(TRAILING_SLASH, "")
		.replace(SYNC_ROOT, "");
}

function covers(listed: string[], entry: string): boolean {
	return listed.some((p) => p === entry || entry.startsWith(`${p}/`));
}

function yamlBlock(lines: string[], key: string): YamlList {
	const start = lines.findIndex((l) => l.match(YAML_KEY)?.[2] === key);

	if (start < 0) {
		return { line: 0, items: [] };
	}

	const indent = lines[start]?.match(YAML_KEY)?.[1]?.length ?? 0;
	const items: string[] = [];

	for (const l of lines.slice(start + 1)) {
		const keyIndent = l.match(YAML_KEY)?.[1]?.length;

		if (keyIndent !== undefined && keyIndent <= indent) {
			break;
		}

		const item = l.match(YAML_LIST_ITEM)?.[1];

		if (item) {
			items.push(normalizeSyncPath(item));
		}
	}

	return { line: start + 1, items };
}

function checkSyncSurface() {
	if (!exists(SYNC_WORKFLOW)) {
		return;
	}

	const workflow = read(SYNC_WORKFLOW).split("\n");
	const surface = yamlBlock(workflow, "paths").items;
	const body = yamlBlock(workflow, "body");

	const missing = (listed: string[]) =>
		surface.filter((entry) => !covers(listed, entry));

	for (const entry of missing(body.items)) {
		report(
			SYNC_WORKFLOW,
			body.line,
			"sync-paths",
			`body do PR sem ${entry}, que está no paths:`
		);
	}

	for (const file of docFiles) {
		for (const [i, l] of read(file).split("\n").entries()) {
			if (!l.trimEnd().endsWith(SYNC_MARKER)) {
				continue;
			}

			const listed = [...l.matchAll(CODE)].flatMap(([, code]) =>
				expandBraces((code ?? "").trim()).map(normalizeSyncPath)
			);

			for (const entry of missing(listed)) {
				report(
					file,
					i + 1,
					"sync-paths",
					`lista da superfície do sync sem ${entry}, que está no paths: de ${SYNC_WORKFLOW}`
				);
			}
		}
	}
}

function checkDbScripts() {
	if (!(exists(DB_PACKAGE) && exists(DB_CLAUDE_MD))) {
		return;
	}

	const pkgText = read(DB_PACKAGE);
	const { scripts } = readManifest(DB_PACKAGE);
	const documented = new Set(read(DB_CLAUDE_MD).match(DB_SCRIPT));

	for (const name of scripts) {
		if (name.startsWith("db:") && !documented.has(name)) {
			report(
				DB_PACKAGE,
				lineOf(pkgText, pkgText.indexOf(`"${name}"`)),
				"db-script",
				`${name} não aparece em ${DB_CLAUDE_MD}`
			);
		}
	}
}

for (const file of docFiles) {
	checkDoc(file);
}

checkOwnership();

checkSyncSurface();

checkDbScripts();

const broken = findings.filter((f) => f.severity === "erro");
const warned = findings.filter((f) => f.severity === "aviso");

for (const f of [...broken, ...warned]) {
	const kind = f.severity === "aviso" ? `aviso:${f.kind}` : f.kind;
	console.log(`${f.file}:${f.line}\t${kind}\t${f.detail}`);
}

console.log(
	`files=${docFiles.length} refs=${refsChecked} broken=${broken.length} warned=${warned.length}`
);

process.exit(broken.length ? 1 : 0);
