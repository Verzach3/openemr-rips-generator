import { os } from "@orpc/server";
import { z } from "zod";

const greet = os
    .input(z.object({ name: z.string() }))
    .handler(async ({ input }) => {
        return { message: `Hello, ${input.name}!` };
    });

const ping = os.handler(async () => {
    return { pong: true as const, timestamp: new Date().toISOString() };
});

export const router = {
    hello: { greet, ping },
};
