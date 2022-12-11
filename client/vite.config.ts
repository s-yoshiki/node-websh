import { defineConfig } from "vite";

let outDir = "../dist/client";
if (process.env.NODE_ENV === "development") {
  outDir = "../.cache/dist/client";
}

export default defineConfig({
  build: {
    outDir,
  },
});
