import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Agent worktrees under .claude/ are separate checkouts of this repo. Without
    // this, vitest walks into them and runs their half-finished tests as if they
    // were ours.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.claude/**"],
  },
});
