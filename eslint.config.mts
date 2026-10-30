/**
 * The ESLint rules Biome cannot express, with every formatting rule off so the two never fight: TSDoc on every module
 * and every export, arrow functions instead of function declarations, no barrels, and a size limit per module.
 *
 * @remarks
 * The parser runs on TypeScript 6 of its own (typescript-eslint does not support TypeScript 7, which has no JS API):
 * these rules read syntax only, so the version that type-checks the package stays 7.
 *
 * @module
 */
import tsParser from "@typescript-eslint/parser";
import type { Linter } from "eslint";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

/** Files these rules apply to. */
const TYPESCRIPT = ["**/*.ts", "**/*.mts", "**/*.cts"];

/** A barrel re-exports what other files define: import from the file that defines it instead. */
const NO_BARRELS = [
  { selector: "ExportAllDeclaration", message: "No barrels: import from the file that defines it." },
  {
    selector: "ExportNamedDeclaration[source]",
    message: "No re-exports: import from the file that defines it."
  }
];

/** The configuration. */
const config: Linter.Config[] = [
  { ignores: ["**/node_modules/**", "dist/**"] },
  {
    files: TYPESCRIPT,
    languageOptions: { parser: tsParser, parserOptions: { tsconfigRootDir: import.meta.dirname } },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    plugins: { jsdoc, tsdoc },
    settings: { jsdoc: { mode: "typescript" } },
    rules: {
      // every module says what it is for: a TSDoc block tagged @module before the imports
      "jsdoc/require-file-overview": [
        "error",
        { tags: { module: { mustExist: true, preventDuplicates: true, initialCommentsOnly: true } } }
      ],
      // every export is documented: functions, types and their members
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { ClassDeclaration: true, FunctionDeclaration: true },
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "TSInterfaceBody > TSPropertySignature",
            "TSInterfaceBody > TSMethodSignature",
            "TSTypeAliasDeclaration > TSTypeLiteral > TSPropertySignature"
          ]
        }
      ],
      "tsdoc/syntax": "error",
      // arrow functions everywhere; `function` only where an arrow cannot do the job
      "func-style": ["error", "expression"],
      "no-restricted-syntax": ["error", ...NO_BARRELS],
      // a module past ~400 lines of code is split by what it does
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }]
    }
  },
  {
    // tests are long on purpose: one case after another
    files: ["**/*.test.ts", "test/**"],
    rules: { "max-lines": "off" }
  }
];

export default config;
