import tsParser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    ".agents/**",
    ".claude/**",
    "coverage/**",
    "data/**",
    "dist/**",
    "node_modules/**",
  ]),
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-warning-comments": [
        "error",
        {
          terms: ["@ts-ignore", "@ts-expect-error"],
          location: "anywhere",
        },
      ],
    },
  },
]);
