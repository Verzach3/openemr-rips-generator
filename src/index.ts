import { serve } from "bun";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { router } from "./server/router";
import index from "./index.html";

const rpcHandler = new RPCHandler(router, {
  plugins: [new CORSPlugin()],
});

const server = serve({
  routes: {
    "/*": index,
    "/rpc/*": async (req: Request) => {
      const { matched, response } = await rpcHandler.handle(req, {
        prefix: "/rpc",
        context: {},
      });

      if (matched) {
        return response;
      }

      return new Response("Not found", { status: 404 });
    },
  },



  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
