import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api se redirige al back (evita CORS).
// En Docker lo hace nginx (ver nginx.conf).
// Con "npm run dev:docker" (modo docker) el puerto del back y del front salen del .env.docker de la raíz.
export default defineConfig(({ mode }) => {
  const docker = mode === "docker" ? loadEnv(mode, "..", "") : null;

  return {
    plugins: [react()],
    build: {
      // Se parte el bundle en archivos aparte: la app cambia seguido pero las librerías no,
      // así el navegador las guarda en caché y no las vuelve a bajar en cada versión.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return "react";
            if (/node_modules\/(antd|@ant-design|rc-[^/]+|@rc-component|dayjs)\//.test(id)) return "antd";
            return undefined;
          },
        },
      },
    },
    server: {
      port: docker?.FRONTEND_URL ? Number(new URL(docker.FRONTEND_URL).port) : 5173,
      proxy: {
        "/api": process.env.VITE_PROXY_TARGET || `http://localhost:${docker?.PORT || 3000}`,
      },
    },
  };
});
