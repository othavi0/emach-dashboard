import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["__tests__/**/*.test.ts", "src/**/*.test.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "src"),
			"server-only": path.resolve(
				import.meta.dirname,
				"src/__mocks__/server-only.ts"
			),
			"@emach/db": path.resolve(
				import.meta.dirname,
				"src/__mocks__/emach-db.ts"
			),
		},
	},
});
