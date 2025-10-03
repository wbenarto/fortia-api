import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // ===== CRITICAL RULES (Errors - Block Deployment) =====
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn", // Allow deployment but warn about unused variables
      "@typescript-eslint/no-inferrable-types": "error", // Best practice: remove unnecessary types
      
      // ===== CODE QUALITY RULES (Warnings - Allow Deployment) =====
      "prefer-const": "warn",
      "no-var": "warn",
      "no-console": "warn", // Warn about console statements in production
      "no-debugger": "error",
      "no-duplicate-imports": "warn",
      
      // ===== SECURITY RULES =====
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      
      // ===== BEST PRACTICES =====
      "eqeqeq": "warn", // Prefer === over ==
      "curly": "warn", // Require curly braces for control statements
      "@typescript-eslint/no-non-null-assertion": "warn",
      
      // ===== FORMATTING RULES (Disabled for existing codebase) =====
      "quotes": "off",
      "comma-dangle": "off",
      "semi": "off",
      "no-trailing-spaces": "off",
      "eol-last": "off",
      "no-multiple-empty-lines": "off",
      
      // ===== NEXT.JS SPECIFIC =====
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      
      // ===== MAINTAINABILITY =====
      "complexity": ["warn", { "max": 15 }], // Warn about complex functions
      "max-lines-per-function": ["warn", { "max": 80 }], // Warn about long functions
      "max-params": ["warn", { "max": 5 }], // Warn about too many parameters
    },
  },
  {
    // Override rules for API routes
    files: ["**/api/**/*.ts"],
    rules: {
      "no-console": "off", // Allow console for API debugging
      "max-lines-per-function": ["warn", { "max": 120 }], // Allow longer API functions
    },
  }
];

export default eslintConfig;
