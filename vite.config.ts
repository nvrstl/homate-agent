import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Local dev middleware so that /api/chat works under `npm run dev` too,
// without needing `vercel dev`. In production on Vercel, the Edge function
// in api/chat.ts serves the same endpoint.
function apiChatDevMiddleware(): Plugin {
  return {
    name: "api-chat-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const bodyText = Buffer.concat(chunks).toString("utf8");

          const mod = await server.ssrLoadModule("/api/chat.ts");
          const handler = mod.default as (req: Request) => Promise<Response>;

          const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/api/chat"}`;
          const request = new Request(url, {
            method: "POST",
            body: bodyText,
            headers: { "content-type": "application/json" },
          });

          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (err) {
          console.error("[api/chat dev middleware] error:", err);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Surface non-VITE_ env vars (ANTHROPIC_API_KEY, RESEND_API_KEY, …) into
  // process.env so the Edge handler can read them during `vite dev`.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [react(), tailwindcss(), apiChatDevMiddleware()],
    server: {
      port: 5177,
    },
  };
});
