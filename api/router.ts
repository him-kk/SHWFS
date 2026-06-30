import { createRouter, publicQuery } from "./middleware";
import { processingRouter } from "./routers/processing";
import { systemRouter } from "./routers/system";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  processing: processingRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
