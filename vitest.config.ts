import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

export default defineConfig({
  plugins: [
    devServer({
      entry: "api/boot.ts",
      exclude: [
        /^\/(?!api\/).*\.(js|ts|tsx|jsx|css|wasm|png|jpg|svg|ico|json)$/,
        /^\/@.*/,
        /^\/node_modules\/.*/,
        /^\/ao-pro\..*/,
      ],
    }),
    inspectAttr(),
    react(),
    {
      name: "wasm-mime",
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          if (req.url?.endsWith(".wasm")) {
            res.setHeader("Content-Type", "application/wasm");
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  assetsInclude: ["**/*.wasm"],
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      external: ["/ao-pro.js"],
    },
  },
});