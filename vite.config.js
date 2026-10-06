import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
  },
  test: {
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
  },
});
