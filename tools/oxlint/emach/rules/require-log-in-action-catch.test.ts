import { RuleTester } from "oxlint/plugins-dev";

import { requireLogInActionCatchRule } from "./require-log-in-action-catch.ts";

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

const error = { messageId: "missingLog" };
const header = '"use server";\nimport { logger } from "@/lib/logger";\n';
const roleHeader = `${header}import { isCapabilityError, safeRequireRole } from "@/lib/action-error";\n`;

function action(catchClause: string): string {
	return `${header}export async function a() { try { await x(); } ${catchClause} }`;
}

tester.run("emach/require-log-in-action-catch", requireLogInActionCatchRule, {
	valid: [
		{
			name: "logger.error no catch",
			code: action(
				'catch (e) { logger.error("a", e); return { ok: false, error: "x" }; }'
			),
		},
		{
			name: "import renomeado",
			code: '"use server";\nimport { logger as log } from "@/lib/logger";\nexport async function a() { try { await x(); } catch (e) { log.error("a", e); return { ok: false, error: "x" }; } }',
		},
		{
			name: "import de namespace",
			code: '"use server";\nimport * as l from "@/lib/logger";\nexport async function a() { try { await x(); } catch (e) { l.logger.error("a", e); return { ok: false }; } }',
		},
		{
			name: "namespace com chave computada",
			code: '"use server";\nimport * as l from "@/lib/logger";\nexport async function a() { try { await x(); } catch (e) { l["logger"].error("a", e); return { ok: false }; } }',
		},
		{
			name: "chave computada literal",
			code: action(
				'catch (e) { logger["error"]("a", e); return { ok: false }; }'
			),
		},
		{
			name: "chave computada em template sem expressão",
			code: action(
				'catch (e) { logger[`error`]("a", e); return { ok: false }; }'
			),
		},
		{
			name: "optional chaining",
			code: action(
				'catch (e) { logger?.error("a", e); return { ok: false }; }'
			),
		},
		{
			name: "catch sem parâmetro com logger.error",
			code: action('catch { logger.error("a", null); return { ok: false }; }'),
		},
		{
			name: "só relança",
			code: action("catch (e) { throw e; }"),
		},
		{
			name: "relança com cause",
			code: action('catch (e) { throw new Error("x", { cause: e }); }'),
		},
		{
			name: "rethrow condicional antes do logger.error",
			code: action(
				'catch (e) { if (e instanceof Z) throw e; logger.error("a", e); return { ok: false }; }'
			),
		},
		{
			name: "logger.error nos dois ramos do if",
			code: action(
				'catch (e) { if (e) { logger.error("a", e); } else { logger.error("b", e); } return { ok: false }; }'
			),
		},
		{
			name: "logger.error antes do return condicional",
			code: action(
				'catch (e) { logger.error("a", e); if (e) { return { ok: false, a: 1 }; } return { ok: false }; }'
			),
		},
		{
			name: "logger.error no finally de try aninhado",
			code: action(
				'catch (e) { try { y(); } finally { logger.error("a", e); } return { ok: false }; }'
			),
		},
		{
			name: "throw e em try aninhado só com finally",
			code: action("catch (e) { try { throw e; } finally { z(); } }"),
		},
		{
			name: "retorno de safeRequireRole",
			code: `${roleHeader}export async function a() { try { await x(); } catch (e) { return safeRequireRole(e); } }`,
		},
		{
			name: "safeRequireRole condicional antes do logger.error",
			code: `${roleHeader}export async function a() { try { await x(); } catch (e) { if (isCapabilityError(e)) { return safeRequireRole(e); } logger.error("a", e); return { ok: false }; } }`,
		},
		{
			name: "safeRequireRole importado com outro nome",
			code: '"use server";\nimport { safeRequireRole as deny } from "@/lib/action-error";\nexport async function a() { try { await x(); } catch (e) { return deny(e); } }',
		},
		{
			name: "arquivo sem diretiva não é analisado",
			code: "export async function a() { try { await x(); } catch {} }",
		},
		{
			name: "diretiva que não é use server",
			code: '"use client";\nexport function a() { try { x(); } catch {} }',
		},
		{
			name: "string use server fora do topo não é diretiva",
			code: 'const a = 1;\n"use server";\nexport function b() { try { x(); } catch {} }',
		},
		{
			name: "função sem diretiva em arquivo comum",
			code: 'import { logger } from "@/lib/logger";\nfunction outer() { try { x(); } catch {} }\nfunction action() { "use server"; try { x(); } catch (e) { logger.error("a", e); } }',
		},
	],
	invalid: [
		{
			name: "catch vazio",
			code: action("catch {}"),
			errors: [error],
		},
		{
			name: "retorna ok false sem log",
			code: action('catch (e) { return { ok: false, error: "x" }; }'),
			errors: [error],
		},
		{
			name: "retorna actionErrorMessage sem log",
			code: action(
				'catch (e) { return { ok: false, error: actionErrorMessage(e, "Erro ao salvar.") }; }'
			),
			errors: [error],
		},
		{
			name: "logger.info não basta",
			code: action(
				'catch (e) { logger.info("a"); return { ok: false, error: "x" }; }'
			),
			errors: [error],
		},
		{
			name: "log do evlog do ecommerce não conta",
			code: '"use server";\nimport { log } from "@/lib/evlog";\nexport async function a() { try { await x(); } catch (e) { log.error({ action: "a" }); return { ok: false }; } }',
			errors: [error],
		},
		{
			name: "logger de outro módulo não conta",
			code: '"use server";\nimport { logger } from "pino";\nexport async function a() { try { await x(); } catch (e) { logger.error("a", e); } }',
			errors: [error],
		},
		{
			name: "namespace de outro módulo não conta",
			code: '"use server";\nimport * as l from "pino";\nexport async function a() { try { await x(); } catch (e) { l.logger.error("a", e); } }',
			errors: [error],
		},
		{
			name: "logger sem import não conta",
			code: `"use server";\nexport async function a() { try { await x(); } catch (e) { logger.error("a", e); } }`,
			errors: [error],
		},
		{
			name: "logger local que sombreia o import não conta",
			code: `${header}export async function a() { const logger = { error() {} }; try { await x(); } catch (e) { logger.error("a", e); } }`,
			errors: [error],
		},
		{
			name: "console.error não conta",
			code: action("catch (e) { console.error(e); }"),
			errors: [error],
		},
		{
			name: "logger.error sem chamada não conta",
			code: action("catch (e) { logger.error; return { ok: false }; }"),
			errors: [error],
		},
		{
			name: "logger.error no default da desestruturação do parâmetro não conta",
			code: action(
				'catch ({ m = logger.error("a", null) }) { return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "logger.error em função aninhada não conta",
			code: action(
				'catch (e) { const later = () => logger.error("a", e); return { ok: false, error: "x" }; }'
			),
			errors: [error],
		},
		{
			name: "throw em função aninhada não conta",
			code: action(
				"catch (e) { const later = () => { throw e; }; return later; }"
			),
			errors: [error],
		},
		{
			name: "throw e engolido por try aninhado",
			code: action(
				"catch (e) { try { throw e; } catch {} return { ok: false }; }"
			),
			errors: [error, error],
		},
		{
			name: "logger.error do catch interno não cobre o externo",
			code: action(
				'catch (e) { try { y(); } catch (f) { logger.error("a", f); } return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "logger.error depois do return é código morto",
			code: action('catch (e) { return { ok: false }; logger.error("a", e); }'),
			errors: [error],
		},
		{
			name: "logger.error em campo de classe não conta",
			code: action(
				'catch (e) { class C { f = logger.error("a", e); } return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "throw em static block não conta",
			code: action(
				"catch (e) { class C { static { throw e; } } return { ok: false }; }"
			),
			errors: [error],
		},
		{
			name: "rethrow condicional com return sem log",
			code: action(
				"catch (e) { if (e instanceof Z) throw e; return { ok: false }; }"
			),
			errors: [error],
		},
		{
			name: "rethrow condicional e queda no fim do catch",
			code: action("catch (e) { if (e instanceof Z) throw e; }"),
			errors: [error],
		},
		{
			name: "logger.error só dentro de if",
			code: action(
				'catch (e) { if (e) { logger.error("a", e); } return { ok: false, error: "x" }; }'
			),
			errors: [error],
		},
		{
			name: "return condicional antes do logger.error",
			code: action(
				'catch (e) { if (dup(e)) { return { ok: false, a: 1 }; } logger.error("a", e); return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "logger.error só em um case do switch",
			code: action(
				'catch (e) { switch (k) { case 1: logger.error("a", e); break; default: } return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "logger.error no lado direito de &&",
			code: action(
				'catch (e) { e && logger.error("a", e); return { ok: false }; }'
			),
			errors: [error],
		},
		{
			name: "throw dentro de laço não garante",
			code: action(
				"catch (e) { for (const i of [1]) { if (i) throw e; } return { ok: false }; }"
			),
			errors: [error],
		},
		{
			name: "throw new Error sem cause descarta o erro",
			code: action('catch (e) { throw new Error("x"); }'),
			errors: [error],
		},
		{
			name: "throw de outro valor não relança",
			code: action("catch (e) { throw other; }"),
			errors: [error],
		},
		{
			name: "catch sem parâmetro não tem como relançar",
			code: action('catch { throw new Error("x"); }'),
			errors: [error],
		},
		{
			name: "diretiva inline em função",
			code: 'import { logger } from "@/lib/logger";\nexport async function page() { async function act() { "use server"; try { await x(); } catch { return { ok: false }; } } return act; }',
			errors: [error],
		},
		{
			name: "diretiva inline em arrow",
			code: 'const act = async () => { "use server"; try { await x(); } catch {} };',
			errors: [error],
		},
		{
			name: "diretiva inline em método de classe",
			code: 'class K { async m() { "use server"; try { x(); } catch {} } }',
			errors: [error],
		},
		{
			name: "diretiva inline em método de objeto",
			code: 'const o = { async m() { "use server"; try { x(); } catch {} } };',
			errors: [error],
		},
		{
			name: "catch em função auxiliar dentro de action inline",
			code: 'function page() { async function act() { "use server"; function h() { try { x(); } catch {} } } }',
			errors: [error],
		},
		{
			name: "use server depois de use strict ainda é diretiva",
			code: '"use strict";\n"use server";\nasync function a() { try { await x(); } catch {} }',
			errors: [error],
		},
		{
			name: "safeRequireRole de outro módulo não conta",
			code: '"use server";\nimport { safeRequireRole } from "./helpers";\nexport async function a() { try { await x(); } catch (e) { return safeRequireRole(e); } }',
			errors: [error],
		},
		{
			name: "safeRequireRole sem return não basta",
			code: `${roleHeader}export async function a() { try { await x(); } catch (e) { safeRequireRole(e); return { ok: false }; } }`,
			errors: [error],
		},
		{
			name: "safeRequireRole condicional e return sem log",
			code: `${roleHeader}export async function a() { try { await x(); } catch (e) { if (isCapabilityError(e)) { return safeRequireRole(e); } return { ok: false }; } }`,
			errors: [error],
		},
		{
			name: "dois catch, um sem log",
			code: `${header}export async function a() { try { await x(); } catch (e) { logger.error("a", e); } try { await y(); } catch {} }`,
			errors: [error],
		},
	],
});
