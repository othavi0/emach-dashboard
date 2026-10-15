import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";
import { defineRule } from "@oxlint/plugins";

const ITERATION_METHODS = new Set([
	"map",
	"forEach",
	"filter",
	"reduce",
	"reduceRight",
	"some",
	"every",
	"find",
	"findIndex",
	"findLast",
	"findLastIndex",
	"flatMap",
]);

function isGlobalIdentifier(
	sourceCode: SourceCode,
	node: ESTree.Node,
	name: string
): boolean {
	if (node.type !== "Identifier" || node.name !== name) {
		return false;
	}

	if (sourceCode.isGlobalReference(node)) {
		return true;
	}

	let scope: Scope | null = sourceCode.getScope(node);

	while (scope !== null) {
		const variable = scope.set.get(node.name);

		// Binding declarado no arquivo (const, parâmetro, import) não é o global.
		if (variable !== undefined) {
			return variable.defs.length === 0;
		}

		scope = scope.upper;
	}

	return true;
}

function unwrapExpression(node: ESTree.Node): ESTree.Node {
	let current = node;

	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "ChainExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSSatisfiesExpression"
	) {
		current = current.expression;
	}

	return current;
}

function methodName(callee: ESTree.Node): string | null {
	const target = unwrapExpression(callee);

	if (target.type !== "MemberExpression") {
		return null;
	}

	const property = target.property;

	if (!target.computed && property.type === "Identifier") {
		return property.name;
	}

	if (target.computed && property.type === "Literal") {
		return String(property.value);
	}

	if (
		target.computed &&
		property.type === "TemplateLiteral" &&
		property.expressions.length === 0 &&
		property.quasis.length === 1
	) {
		return property.quasis[0].value.cooked ?? null;
	}

	return null;
}

function isArrayFrom(sourceCode: SourceCode, callee: ESTree.Node): boolean {
	const target = unwrapExpression(callee);

	return (
		target.type === "MemberExpression" &&
		isGlobalIdentifier(sourceCode, target.object, "Array") &&
		methodName(target) === "from"
	);
}

/** O callback só roda por item quando é o argumento de iteração da chamada, não o valor inicial do reduce. */
function isIterationCallback(sourceCode: SourceCode, fn: ESTree.Node): boolean {
	let argument: ESTree.Node = fn;
	let parent = fn.parent;

	while (
		parent !== null &&
		(parent.type === "ParenthesizedExpression" ||
			parent.type === "TSAsExpression" ||
			parent.type === "TSNonNullExpression" ||
			parent.type === "TSSatisfiesExpression")
	) {
		argument = parent;
		parent = parent.parent;
	}

	if (parent === null || parent.type !== "CallExpression") {
		return false;
	}

	const name = methodName(parent.callee);

	if (name !== null && ITERATION_METHODS.has(name)) {
		return parent.arguments[0] === argument;
	}

	return (
		isArrayFrom(sourceCode, parent.callee) && parent.arguments[1] === argument
	);
}

/** Sobe até a primeira fronteira de função; `init` do for e o iterável do for-of/for-in rodam uma vez só. */
function runsEachIteration(sourceCode: SourceCode, node: ESTree.Node): boolean {
	let child: ESTree.Node = node;
	let current = node.parent;

	while (current !== null) {
		switch (current.type) {
			case "ForStatement":
				if (
					current.body === child ||
					current.test === child ||
					current.update === child
				) {
					return true;
				}

				break;
			case "ForInStatement":
			case "ForOfStatement":
				// O `left` (inclusive valor padrão de desestruturação) roda a cada item.
				if (current.body === child || current.left === child) {
					return true;
				}

				break;
			case "WhileStatement":
			case "DoWhileStatement":
				return true;
			case "FunctionDeclaration":
			case "FunctionExpression":
			case "ArrowFunctionExpression":
				return isIterationCallback(sourceCode, current);
			case "PropertyDefinition":
				// Campo de instância roda no `new`, não na iteração; campo estático e
				// chave computada rodam quando a classe é definida, e isso pode ser no laço.
				if (!current.static && current.value === child) {
					return false;
				}

				break;
			case "StaticBlock":
				break;
			default:
				break;
		}

		child = current;
		current = current.parent;
	}

	return false;
}

/** Proíbe compilar RegExp a cada iteração de laço ou de callback de array. */
export const noRegexpInLoopRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Proíbe new RegExp(...) e RegExp(...) dentro de laço ou de callback de iteração.",
		},
		messages: {
			regexpInLoop:
				"Este RegExp é recompilado a cada iteração. Crie o RegExp uma vez, no topo do módulo ou antes do laço, e reuse a constante (CLAUDE.md: new RegExp(...) em loops, extrair top-level).",
		},
	},
	createOnce(context) {
		return {
			NewExpression(node) {
				if (
					isGlobalIdentifier(context.sourceCode, node.callee, "RegExp") &&
					runsEachIteration(context.sourceCode, node)
				) {
					context.report({ node, messageId: "regexpInLoop" });
				}
			},
			CallExpression(node) {
				if (
					isGlobalIdentifier(context.sourceCode, node.callee, "RegExp") &&
					runsEachIteration(context.sourceCode, node)
				) {
					context.report({ node, messageId: "regexpInLoop" });
				}
			},
		};
	},
});
