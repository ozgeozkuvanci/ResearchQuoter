import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "transfer-staging-*/**",
      ".desktop-cache/**",
      "apps/desktop/vendor/**",
      "apps/web/public/**",
      "packages/db/src/generated/**",
      "**/playwright-report/**",
      "**/test-results/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ["scripts/**/*.mjs", "*.config.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["apps/desktop/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: "readonly",
        URL: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }]
    }
  }
);
