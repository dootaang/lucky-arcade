import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { include: ["phaser", "melonjs", "excalibur", "littlejsengine"] },
  build: { target: "es2022", sourcemap: true, manifest: true },
});
