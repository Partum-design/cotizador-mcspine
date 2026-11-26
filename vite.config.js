import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import noraHandler from "./api/nora.js";

function noraLocalApi() {
  return {
    name: "nora-local-api",
    configureServer(server) {
      server.middlewares.use("/api/nora", async (request, nativeResponse) => {
        let rawBody = "";
        for await (const chunk of request) rawBody += chunk;

        try {
          request.body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          request.body = {};
        }

        const response = {
          setHeader: (...args) => nativeResponse.setHeader(...args),
          status(code) {
            nativeResponse.statusCode = code;
            return response;
          },
          json(payload) {
            nativeResponse.setHeader("Content-Type", "application/json; charset=utf-8");
            nativeResponse.end(JSON.stringify(payload));
          },
        };

        await noraHandler(request, response);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const name of ["GOOGLE_API_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"]) {
    if (env[name]) process.env[name] = env[name];
  }

  return {
    plugins: [react(), noraLocalApi()],
    
  };
});
