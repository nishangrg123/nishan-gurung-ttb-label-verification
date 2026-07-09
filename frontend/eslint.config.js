import js from "@eslint/js";
import tseslint from "typescript-eslint";

const browserGlobals = {
  console: "readonly",
  document: "readonly",
  File: "readonly",
  FormData: "readonly",
  HTMLTextAreaElement: "readonly",
  requestAnimationFrame: "readonly",
  Response: "readonly",
  URL: "readonly",
  window: "readonly",
};

export default tseslint.config(
  {
    ignores: ["dist", "node_modules"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: browserGlobals,
    },
  },
);
