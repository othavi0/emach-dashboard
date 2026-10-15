import { RuleTester } from "oxlint/plugins-dev";

import { noRegexpInLoopRule } from "./no-regexp-in-loop.ts";

const tester = new RuleTester({
	languageOptions: { parserOptions: { lang: "ts" } },
});

const error = { messageId: "regexpInLoop" };

tester.run("emach/no-regexp-in-loop", noRegexpInLoopRule, {
	valid: [
		{
			name: "topo do módulo",
			code: "const PATTERN = new RegExp(source, 'g');",
		},
		{
			name: "corpo de função fora de laço",
			code: "function build(source: string) { return new RegExp(source); }",
		},
		{
			name: "test() de RegExp criado fora do laço",
			code: "const PATTERN = new RegExp(source); for (const item of items) { PATTERN.test(item); }",
		},
		{
			name: "RegExp criado antes do laço",
			code: "function scan(items: string[]) { const re = new RegExp(source); for (const item of items) re.test(item); }",
		},
		{
			name: "init do for roda uma vez",
			code: "for (let re = new RegExp(source); re.test(text); ) { text = next(); }",
		},
		{
			name: "iterável do for-of roda uma vez",
			code: "for (const part of text.split(new RegExp(source))) use(part);",
		},
		{
			name: "iterável do for-in roda uma vez",
			code: "for (const key in build(new RegExp(source))) use(key);",
		},
		{
			name: "função declarada no laço e chamada fora",
			code: "let make; for (const item of items) { make = () => new RegExp(item); } make();",
		},
		{
			name: "função declarada dentro do laço",
			code: "for (const item of items) { function make() { return new RegExp(item); } register(make); }",
		},
		{
			name: "callback de método fora da lista",
			code: "items.sort((a, b) => new RegExp(a).source.length - b.length);",
		},
		{
			name: "valor inicial do reduce",
			code: "items.reduce((acc, item) => acc + item, new RegExp(source).source);",
		},
		{
			name: "Array.from sem callback",
			code: "const list = Array.from(build(new RegExp(source)));",
		},
		{
			name: "binding local chamado RegExp",
			code: "const RegExp = (s: string) => s; for (const item of items) { RegExp(item); }",
		},
		{
			name: "parâmetro chamado RegExp",
			code: "function scan(RegExp: (s: string) => string) { items.map((item) => new RegExp(item)); }",
		},
		{
			name: "literal de regex no laço",
			code: "for (const item of items) { /a+/.test(item); }",
		},
		{
			name: "binding local chamado Array",
			code: "{ const Array = { from: (a: unknown, cb: (x: string) => unknown) => cb('a') }; Array.from(items, (x) => new RegExp(x)); }",
		},
		{
			name: "arrow declarada no while e chamada fora",
			code: "let make; while (more()) { make = () => new RegExp(next()); } make();",
		},
		{
			name: "campo de instância de classe declarada no laço",
			code: "for (const item of items) { class C { m = new RegExp(item); } register(C); }",
		},
		{
			name: "método de classe declarada no laço",
			code: "for (const item of items) { class C { m() { return new RegExp(item); } } register(C); }",
		},
	],
	invalid: [
		{
			name: "new RegExp no corpo do for",
			code: "for (let i = 0; i < n; i++) { new RegExp(items[i]); }",
			errors: [error],
		},
		{
			name: "RegExp() no teste do for",
			code: "for (let i = 0; RegExp(items[i]).test(text); i++) {}",
			errors: [error],
		},
		{
			name: "RegExp no update do for",
			code: "for (let i = 0; i < n; i = RegExp(items[i]).source.length) {}",
			errors: [error],
		},
		{
			name: "corpo do for-of",
			code: "for (const item of items) { const re = new RegExp(item); }",
			errors: [error],
		},
		{
			name: "corpo do for-in",
			code: "for (const key in map) { new RegExp(key); }",
			errors: [error],
		},
		{
			name: "corpo do while",
			code: "while (more()) { new RegExp(next()); }",
			errors: [error],
		},
		{
			name: "teste do while",
			code: "while (new RegExp(source).test(read())) {}",
			errors: [error],
		},
		{
			name: "corpo do do-while",
			code: "do { new RegExp(next()); } while (more());",
			errors: [error],
		},
		{
			name: "teste do do-while",
			code: "do { step(); } while (RegExp(source).test(read()));",
			errors: [error],
		},
		{
			name: "laço aninhado em função",
			code: "function scan() { for (const item of items) { if (item) new RegExp(item); } }",
			errors: [error],
		},
		{
			name: "callback de map",
			code: "items.map((item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "callback de forEach",
			code: "items.forEach(function (item) { new RegExp(item); });",
			errors: [error],
		},
		{
			name: "callback de filter",
			code: "items.filter((item) => RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de reduce",
			code: "items.reduce((acc, item) => acc + new RegExp(item).source, '');",
			errors: [error],
		},
		{
			name: "callback de reduceRight",
			code: "items.reduceRight((acc, item) => acc + new RegExp(item).source, '');",
			errors: [error],
		},
		{
			name: "callback de some",
			code: "items.some((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de every",
			code: "items.every((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de find",
			code: "items.find((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de findIndex",
			code: "items.findIndex((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de findLast",
			code: "items.findLast((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de findLastIndex",
			code: "items.findLastIndex((item) => new RegExp(item).test(text));",
			errors: [error],
		},
		{
			name: "callback de flatMap",
			code: "items.flatMap((item) => [new RegExp(item)]);",
			errors: [error],
		},
		{
			name: "callback do Array.from",
			code: "Array.from(items, (item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "optional chaining",
			code: "items?.map((item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "callback de iteração aninhado em callback",
			code: "groups.forEach((group) => { group.items.map((item) => new RegExp(item)); });",
			errors: [error],
		},
		{
			name: "callback de iteração dentro de função comum",
			code: "function scan(items: string[]) { return items.some((item) => new RegExp(item).test(text)); }",
			errors: [error],
		},
		{
			name: "callback de iteração dentro de laço",
			code: "for (const group of groups) { group.map((item) => new RegExp(item)); }",
			errors: [error],
		},
		{
			name: "valor padrão no cabeçalho do for-of",
			code: "for (const { a = new RegExp('x') } of list) { use(a); }",
			errors: [error],
		},
		{
			name: "valor padrão no cabeçalho do for-in",
			code: "for (const [a = new RegExp('x')] in map) { use(a); }",
			errors: [error],
		},
		{
			name: "for await",
			code: "async function scan() { for await (const item of items) { new RegExp(item); } }",
			errors: [error],
		},
		{
			name: "laço com rótulo",
			code: "outer: for (const item of items) { new RegExp(item); continue outer; }",
			errors: [error],
		},
		{
			name: "callback async",
			code: "items.map(async (item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "callback envolto em as",
			code: "items.map(((item: string) => new RegExp(item)) as (item: string) => RegExp);",
			errors: [error],
		},
		{
			name: "callback envolto em satisfies",
			code: "items.map(((item: string) => new RegExp(item)) satisfies (item: string) => RegExp);",
			errors: [error],
		},
		{
			name: "callback envolto em !",
			code: "items.map(((item: string) => new RegExp(item))!);",
			errors: [error],
		},
		{
			name: "nome do método como string computada",
			code: "items['map']((item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "nome do método como template literal",
			code: "items[`map`]((item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "chamada opcional do método",
			code: "items.map?.((item) => new RegExp(item));",
			errors: [error],
		},
		{
			name: "RegExp entre parênteses",
			code: "for (const item of items) { new (RegExp)(item); }",
			errors: [error],
		},
		{
			name: "chamada opcional de RegExp",
			code: "for (const item of items) { RegExp?.(item); }",
			errors: [error],
		},
		{
			name: "campo estático de classe declarada no laço",
			code: "for (const item of items) { class C { static m = new RegExp(item); } register(C); }",
			errors: [error],
		},
		{
			name: "static block de classe declarada no laço",
			code: "for (const item of items) { class C { static { new RegExp(item); } } register(C); }",
			errors: [error],
		},
		{
			name: "chave computada de campo em classe declarada no laço",
			code: "for (const item of items) { class C { [new RegExp(item).source] = 1; } register(C); }",
			errors: [error],
		},
	],
});
