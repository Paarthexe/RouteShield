import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");
  const cartoKey =
    env.CARTO_API_KEY || env.VITE_CARTO_API_KEY || env.MAP_API_KEY || "";

  return {
    plugins: [react()],
    envDir: "../",
    define: {
      "import.meta.env.VITE_CARTO_API_KEY": JSON.stringify(cartoKey),
    },
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
