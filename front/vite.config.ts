import { defineConfig } from "vite";

let outDir = "../dist/front";
if (process.env.NODE_ENV === "development") {
  outDir = "../.cache/dist/front";
}

export default defineConfig({
  build: {
    outDir,
  },
});
