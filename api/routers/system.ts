import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { systemStatus } from "../../db/schema";
import { eq, desc } from "drizzle-orm";

export const systemRouter = createRouter({
  /* Get current system status */
  getStatus: publicQuery.query(async () => {
    const db = getDb();
    const [status] = await db
      .select()
      .from(systemStatus)
      .orderBy(desc(systemStatus.updatedAt))
      .limit(1);
    return status || null;
  }),

  /* Update system status */
  updateStatus: publicQuery
    .input(
      z.object({
        loopOpen: z.boolean().optional(),
        frameRate: z.number().optional(),
        currentStrehl: z.number().optional(),
        currentRms: z.number().optional(),
        estimatedR0: z.number().optional(),
        estimatedTau0: z.number().optional(),
        estimatedWind: z.number().optional(),
        dmVoltageRms: z.number().optional(),
        nActuatorsClipped: z.number().optional(),
        spgdActive: z.boolean().optional(),
        spgdIteration: z.number().optional(),
        spgdPerformance: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      
      /* Check if any status exists */
      const [existing] = await db
        .select()
        .from(systemStatus)
        .orderBy(desc(systemStatus.updatedAt))
        .limit(1);
      
      if (existing) {
        await db
          .update(systemStatus)
          .set({
            ...(input.loopOpen !== undefined && { loopOpen: input.loopOpen }),
            ...(input.frameRate !== undefined && { frameRate: input.frameRate }),
            ...(input.currentStrehl !== undefined && { currentStrehl: input.currentStrehl }),
            ...(input.currentRms !== undefined && { currentRms: input.currentRms }),
            ...(input.estimatedR0 !== undefined && { estimatedR0: input.estimatedR0 }),
            ...(input.estimatedTau0 !== undefined && { estimatedTau0: input.estimatedTau0 }),
            ...(input.estimatedWind !== undefined && { estimatedWind: input.estimatedWind }),
            ...(input.dmVoltageRms !== undefined && { dmVoltageRms: input.dmVoltageRms }),
            ...(input.nActuatorsClipped !== undefined && { nActuatorsClipped: input.nActuatorsClipped }),
            ...(input.spgdActive !== undefined && { spgdActive: input.spgdActive }),
            ...(input.spgdIteration !== undefined && { spgdIteration: input.spgdIteration }),
            ...(input.spgdPerformance !== undefined && { spgdPerformance: input.spgdPerformance }),
            updatedAt: new Date(),
          })
          .where(eq(systemStatus.id, existing.id));
        return { id: existing.id };
      } else {
        const [newStatus] = await db.insert(systemStatus).values({
          loopOpen: input.loopOpen ?? true,
          frameRate: input.frameRate ?? 0,
          currentStrehl: input.currentStrehl,
          currentRms: input.currentRms,
          estimatedR0: input.estimatedR0,
          estimatedTau0: input.estimatedTau0,
          estimatedWind: input.estimatedWind,
          dmVoltageRms: input.dmVoltageRms,
          nActuatorsClipped: input.nActuatorsClipped ?? 0,
          spgdActive: input.spgdActive ?? false,
          spgdIteration: input.spgdIteration ?? 0,
          spgdPerformance: input.spgdPerformance,
        });
        return { id: Number(newStatus.insertId) };
      }
    }),
});
