import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api se redirige al back (evita CORS).
// En Docker lo hace nginx (ver nginx.conf).
export default defineConfig({
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
    port: 5173,
    proxy: {
      "/api": process.env.VITE_PROXY_TARGET || "http://localhost:3000",
    },
  },
});
