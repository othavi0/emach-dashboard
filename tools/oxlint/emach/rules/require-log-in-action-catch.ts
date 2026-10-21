import type { ESTree, SourceCode } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";
import { resolveVariable } from "../../anti-slop/shared/scope.ts";

const LOGGER_SOURCE = "@/lib/logger";
const ACTION_ERROR_SOURCE = "@/lib/action-error";

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

// Corpo de função e membro de classe rodam em outro momento (ou nunca): log ou
// throw ali dentro não cobre o catch.
const BOUNDARY_TYPES = new Set([
	...FUNCTION_TYPES,
	"ClassDeclaration",
	"ClassExpression",
	"TSModuleDeclaration",
]);

type AnyNode = ESTree.Node & Record<string, unknown>;

function hasUseServerDirective(statements: readonly ESTree.Node[]): boolean {
	for (const statement of statements) {
		if (statement.type !== "ExpressionStatement") {
			return false;
		}

		if (statement.directive === undefined || statement.directive === null) {
			return false;
		}

		if (statement.directive === "use server") {
			return true;
		}
	}

	return false;
}

/** O catch está num arquivo "use server" ou dentro de uma função com a diretiva inline. */
function isInServerAction(node: ESTree.Node): boolean {
	let current: ESTree.Node | null = node.parent;

	while (current !== null) {
		if (current.type === "Program") {
			return hasUseServerDirective(current.body);
		}

		if (
			(current.type === "FunctionDeclaration" ||
				current.type === "FunctionExpression" ||
				current.type === "ArrowFunctionExpression") &&
			current.body?.type === "BlockStatement" &&
			hasUseServerDirective(current.body.body)
		) {
			return true;
		}

		current = current.parent;
	}

	return false;
}

function isNode(value: unknown): value is AnyNode {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { type?: unknown }).type === "string"
	);
}

function childNodes(node: ESTree.Node): AnyNode[] {
	const children: AnyNode[] = [];

	for (const [key, value] of Object.entries(node)) {
		if (key === "parent") {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				if (isNode(item)) {
					children.push(item);
				}
			}
		} else if (isNode(value)) {
			children.push(value);
		}
	}

	return children;
}

function importsFrom(specifier: ESTree.Node, source: string): boolean {
	const declaration = specifier.parent;

	return (
		declaration !== null &&
		declaration.type === "ImportDeclaration" &&
		declaration.source.value === source
	);
}

function importBindings(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference
): ESTree.Node[] {
	const variable = resolveVariable(sourceCode, identifier);

	if (variable === null) {
		return [];
	}

	const bindings: ESTree.Node[] = [];

	for (const definition of variable.defs) {
		if (definition.type === "ImportBinding") {
			bindings.push(definition.node);
		}
	}

	return bindings;
}

/** O identificador é `name` importado de `source`, mesmo com nome local trocado. */
function isNamedImport(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference,
	name: string,
	source: string
): boolean {
	for (const specifier of importBindings(sourceCode, identifier)) {
		if (specifier.type !== "ImportSpecifier") {
			continue;
		}

		const imported = specifier.imported;
		const importedName =
			imported.type === "Identifier" ? imported.name : imported.value;

		if (importedName === name && importsFrom(specifier, source)) {
			return true;
		}
	}

	return false;
}

/** `import * as l from "@/lib/logger"`. */
function isLoggerNamespace(
	sourceCode: SourceCode,
	identifier: ESTree.IdentifierReference
): boolean {
	for (const specifier of importBindings(sourceCode, identifier)) {
		if (
			specifier.type === "ImportNamespaceSpecifier" &&
			importsFrom(specifier, LOGGER_SOURCE)
		) {
			return true;
		}
	}

	return false;
}

/** Nome estático da propriedade: `a.b`, `a["b"]` ou `` a[`b`] ``. */
function staticPropertyName(member: ESTree.MemberExpression): string | null {
	const property = member.property;

	if (!member.computed) {
		return property.type === "Identifier" ? property.name : null;
	}

	if (property.type === "Literal" && typeof property.value === "string") {
		return property.value;
	}

	if (
		property.type === "TemplateLiteral" &&
		property.expressions.length === 0 &&
		property.quasis.length === 1
	) {
		return property.quasis[0]?.value.cooked ?? null;
	}

	return null;
}

function isLoggerReference(
	sourceCode: SourceCode,
	node: ESTree.Expression
): boolean {
	if (node.type === "Identifier") {
		return isNamedImport(sourceCode, node, "logger", LOGGER_SOURCE);
	}

	return (
		node.type === "MemberExpression" &&
		staticPropertyName(node) === "logger" &&
		node.object.type === "Identifier" &&
		isLoggerNamespace(sourceCode, node.object)
	);
}

function isLogErrorCall(
	sourceCode: SourceCode,
	node: ESTree.CallExpression
): boolean {
	const callee = node.callee;

	if (callee.type !== "MemberExpression") {
		return false;
	}

	if (staticPropertyName(callee) !== "error") {
		return false;
	}

	return isLoggerReference(sourceCode, callee.object);
}

/**
 * `return safeRequireRole(e)`, com o helper de @/lib/action-error: ele loga a negação
 * de capability com logger.warn e relança qualquer outro erro.
 */
function isSafeRequireRoleReturn(
	sourceCode: SourceCode,
	node: AnyNode
): boolean {
	if (node.type !== "ReturnStatement") {
		return false;
	}

	const argument = (node as ESTree.ReturnStatement).argument;

	return (
		argument !== null &&
		argument.type === "CallExpression" &&
		argument.callee.type === "Identifier" &&
		isNamedImport(
			sourceCode,
			argument.callee,
			"safeRequireRole",
			ACTION_ERROR_SOURCE
		)
	);
}

/**
 * Throw que relança: `throw e` ou `throw new X(..., { cause: e })`, com `e` o
 * parâmetro do catch. Um `throw new Error("x")` sem cause descarta o erro original.
 */
function isRethrow(
	throwNode: ESTree.ThrowStatement,
	param: ESTree.Node | null
): boolean {
	if (param === null || param.type !== "Identifier") {
		return false;
	}

	const argument = throwNode.argument;

	if (argument.type === "Identifier") {
		return argument.name === param.name;
	}

	if (argument.type !== "NewExpression") {
		return false;
	}

	for (const arg of argument.arguments) {
		if (arg.type !== "ObjectExpression") {
			continue;
		}

		for (const property of arg.properties) {
			if (
				property.type === "Property" &&
				!property.computed &&
				property.key.type === "Identifier" &&
				property.key.name === "cause" &&
				property.value.type === "Identifier" &&
				property.value.name === param.name
			) {
				return true;
			}
		}
	}

	return false;
}

interface Context {
	param: ESTree.Node | null;
	sourceCode: SourceCode;
}

/**
 * A expressão sempre chama logger.error quando avaliada. Lado direito de `&&`/`||`/`??`
 * e ramos de ternário são condicionais e não contam.
 */
function expressionAlwaysLogs(ctx: Context, node: AnyNode): boolean {
	if (BOUNDARY_TYPES.has(node.type)) {
		return false;
	}

	if (node.type === "CallExpression" && isLogErrorCall(ctx.sourceCode, node)) {
		return true;
	}

	if (node.type === "LogicalExpression") {
		return expressionAlwaysLogs(ctx, node.left as AnyNode);
	}

	if (node.type === "ConditionalExpression") {
		return expressionAlwaysLogs(ctx, node.test as AnyNode);
	}

	for (const child of childNodes(node)) {
		if (expressionAlwaysLogs(ctx, child)) {
			return true;
		}
	}

	return false;
}

/**
 * Todo caminho que passa pelo statement chama logger.error ou relança antes de sair dele.
 * Laço não conta (o corpo pode não rodar); `if` só conta com os dois ramos.
 */
function statementGuarantees(ctx: Context, node: AnyNode): boolean {
	switch (node.type) {
		case "ThrowStatement":
			return isRethrow(node as ESTree.ThrowStatement, ctx.param);
		case "BlockStatement":
			return sequenceGuarantees(ctx, node.body as AnyNode[]);
		case "IfStatement":
			return (
				expressionAlwaysLogs(ctx, node.test as AnyNode) ||
				(statementGuarantees(ctx, node.consequent as AnyNode) &&
					node.alternate !== null &&
					statementGuarantees(ctx, node.alternate as AnyNode))
			);
		case "TryStatement": {
			const finalizer = node.finalizer as AnyNode | null;

			if (finalizer !== null && statementGuarantees(ctx, finalizer)) {
				return true;
			}

			const handler = node.handler as ESTree.CatchClause | null;

			// Throw no bloco do try cai no handler: o try só garante se o handler também garantir.
			return (
				statementGuarantees(ctx, node.block as AnyNode) &&
				(handler === null || statementGuarantees(ctx, handler.body as AnyNode))
			);
		}
		case "LabeledStatement":
			return statementGuarantees(ctx, node.body as AnyNode);
		case "DoWhileStatement":
			return statementGuarantees(ctx, node.body as AnyNode);
		case "ExpressionStatement":
			return expressionAlwaysLogs(ctx, node.expression as AnyNode);
		case "ReturnStatement":
			return (
				isSafeRequireRoleReturn(ctx.sourceCode, node) ||
				expressionAlwaysLogs(ctx, node)
			);
		case "VariableDeclaration":
			return expressionAlwaysLogs(ctx, node);
		case "ForStatement":
			return (
				node.init !== null && expressionAlwaysLogs(ctx, node.init as AnyNode)
			);
		case "ForOfStatement":
		case "ForInStatement":
			return expressionAlwaysLogs(ctx, node.right as AnyNode);
		case "WhileStatement":
		case "SwitchStatement":
			return expressionAlwaysLogs(
				ctx,
				(node.test ?? node.discriminant) as AnyNode
			);
		default:
			return false;
	}
}

/** O statement tem um caminho que sai do catch sem log: `return` ou throw que não relança. */
function hasUnloggedExit(ctx: Context, node: AnyNode): boolean {
	if (BOUNDARY_TYPES.has(node.type)) {
		return false;
	}

	if (node.type === "ReturnStatement") {
		return !isSafeRequireRoleReturn(ctx.sourceCode, node);
	}

	if (
		node.type === "ThrowStatement" &&
		!isRethrow(node as ESTree.ThrowStatement, ctx.param)
	) {
		return true;
	}

	for (const child of childNodes(node)) {
		if (hasUnloggedExit(ctx, child)) {
			return true;
		}
	}

	return false;
}

/**
 * Percorre os statements em ordem: o primeiro que garante log ou relançamento fecha
 * o bloco; um `return` ou throw sem relançar antes dele deixa um caminho sem log.
 */
function sequenceGuarantees(ctx: Context, statements: AnyNode[]): boolean {
	for (const statement of statements) {
		if (statementGuarantees(ctx, statement)) {
			return true;
		}

		if (hasUnloggedExit(ctx, statement)) {
			return false;
		}
	}

	return false;
}

/** Catch de server action sem logger.error esconde a falha: o cliente vê { ok: false } e ninguém vê a causa. */
export const requireLogInActionCatchRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Exige logger.error (de @/lib/logger), relançamento do erro ou return safeRequireRole(e) (de @/lib/action-error) em todo caminho de catch de server action.",
		},
		messages: {
			missingLog:
				'Em catch de server action: sempre logger.error("nomeDaAction", err) antes de retornar { ok: false } (apps/web/CLAUDE.md, seção "Server actions"). Chame logger.error de @/lib/logger no início deste catch, antes de qualquer return, ou relance o erro (throw e, ou throw new X(..., { cause: e })). Negação de capability: return safeRequireRole("nomeDaAction", e) de @/lib/action-error.',
		},
	},
	createOnce(context) {
		return {
			CatchClause(node) {
				if (!isInServerAction(node)) {
					return;
				}

				const ctx: Context = {
					sourceCode: context.sourceCode,
					param: node.param,
				};

				if (sequenceGuarantees(ctx, node.body.body as AnyNode[])) {
					return;
				}

				context.report({ node, messageId: "missingLog" });
			},
		};
	},
});
