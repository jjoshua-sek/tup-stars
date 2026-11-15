// Lets vite-node run the app's own AI modules outside Next.js:
// "@/..." resolves to src/, and "server-only" (a Next.js guard) is a no-op.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  resolve: {
    alias: {
      "@": path.resolve(here, "../src"),
      "server-only": path.resolve(here, "server-only.js"),
    },
  },
};
