// Falha quando um .md versionado cita um caminho do repo que não existe mais.
//   bun scripts/check-doc-paths.ts [raiz]
// Pontos cegos: um sufixo curto ("orders/data.ts") passa se existir em qualquer
// lugar; linha com "ecommerce" é pulada inteira; âncora #secao não é validada;
// nome sem "/" entre crases não é checado.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

// Skills de terceiros citam o layout do upstream; ADR, auditoria e plano são
// registro datado ou proposta, então caminho que existia na época não é deriva.
const EXCLUDED_FILE =
	/(^|\/)skills\/|^docs\/superpowers\/|^docs\/(adr|audits)\/|^plans\//;
// Linha que cita o outro repo usa caminhos dele.
const CROSS_REPO = /ecommerce/i;
const LINK = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const CODE = /`([^`\n]+)`/g;
const FENCE = /^(```|~~~)/;
const EXT =
	/\.(ts|tsx|js|mjs|cjs|json|jsonc|md|yml|yaml|sql|css|sh|toml|html|png|svg|env)$/;
const PREFIX =
	/^(\.\/)?(apps|packages|docs|scripts|tooling|\.github|\.claude)\//;
const SKIP =
	/(^|\/)\.env(\.|$)|[*<>{}$\s|]|^https?:|^mailto:|^@|^#|^~|^\/|\.\.\.|^[a-z]+:\/\//;
const ANCHOR = /#.*$/;
const LINE_OR_SYMBOL = /:(L?\d+([-–,]L?\d+)*(:\d+)?|[A-Za-z_]\w*)$/;
const TRAILING_SLASH = /\/$/;
const LEADING_DOT_SLASH = /^\.\//;

interface Ref {
	file: string;
	kind: "link" | "code";
	line: number;
	raw: string;
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

function strip(p: string): string {
	return p
		.replace(ANCHOR, "")
		.replace(LINE_OR_SYMBOL, "")
		.replace(TRAILING_SLASH, "");
}

const exists = (p: string) => existsSync(join(root, p));

// Doc cita sufixo curto ("orders/data.ts" por
// apps/web/src/app/(dashboard)/dashboard/orders/data.ts): aceita o caminho entre
// crases quando ele é sufixo de algum arquivo ou diretório rastreado.
const tails = new Set<string>();
for (const t of gitLsFiles()) {
	const parts = t.split("/");
	for (let i = 0; i < parts.length; i++) {
		for (let j = i + 1; j <= parts.length; j++) {
			tails.add(parts.slice(i, j).join("/"));
		}
	}
}

const files = gitLsFiles('"*.md"').filter(
	(f) => !(f.includes("node_modules") || EXCLUDED_FILE.test(f))
);

function refsOf(file: string): Ref[] {
	const out: Ref[] = [];
	let inFence = false;
	const lines = readFileSync(join(root, file), "utf8").split("\n");
	for (const [i, l] of lines.entries()) {
		if (FENCE.test(l.trim())) {
			inFence = !inFence;
			continue;
		}
		if (inFence || CROSS_REPO.test(l)) {
			continue;
		}
		for (const m of l.matchAll(LINK)) {
			out.push({ file, line: i + 1, raw: m[1], kind: "link" });
		}
		for (const m of l.replace(LINK, "").matchAll(CODE)) {
			const t = m[1].trim();
			if (t.includes("/") && (EXT.test(strip(t)) || PREFIX.test(t))) {
				out.push({ file, line: i + 1, raw: t, kind: "code" });
			}
		}
	}
	return out;
}

function resolves(r: Ref, p: string): boolean {
	const fromFile = normalize(join(dirname(r.file), p));
	if (r.kind === "link") {
		return exists(fromFile);
	}
	return (
		exists(p) || exists(fromFile) || tails.has(p.replace(LEADING_DOT_SLASH, ""))
	);
}

const broken: Ref[] = [];
let checked = 0;
for (const r of files.flatMap(refsOf)) {
	const p = SKIP.test(r.raw) ? "" : strip(r.raw);
	if (!p) {
		continue;
	}
	checked++;
	if (!resolves(r, p)) {
		broken.push(r);
	}
}

console.log(`files=${files.length} refs=${checked} broken=${broken.length}`);
for (const b of broken) {
	console.log(`${b.file}:${b.line}\t${b.kind}\t${b.raw}`);
}
process.exit(broken.length ? 1 : 0);
