import { eslintCompatPlugin } from "@oxlint/plugins";
import { noRegexpInLoopRule } from "./rules/no-regexp-in-loop.ts";
import { requireLogInActionCatchRule } from "./rules/require-log-in-action-catch.ts";

/** Proibições do CLAUDE.md que nem o Biome nem o anti-slop cobrem. */
const emachPlugin = eslintCompatPlugin({
	meta: { name: "emach" },
	rules: {
		"no-regexp-in-loop": noRegexpInLoopRule,
		"require-log-in-action-catch": requireLogInActionCatchRule,
	},
});

export default emachPlugin;
