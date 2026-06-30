import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { processingRuns, processingResults } from "../../db/schema";
import { eq, desc } from "drizzle-orm";

export const processingRouter = createRouter({
  /* Create a new processing run */
  createRun: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        centroidMethod: z.string().default("hybrid"),
        reconMethod: z.string().default("frim"),
        controlMethod: z.string().default("lqg"),
        nZernikeModes: z.number().int().min(1).max(65).default(36),
        regularizationLambda: z.number().min(0).max(1).default(0.01),
        telescopeDiameter: z.number().positive().default(8.0),
        wavelength: z.number().positive().default(550e-9),
        sampleRateHz: z.number().positive().default(1000),
        dmMaxStroke: z.number().positive().default(2.0),
        dmCoupling: z.number().min(0).max(1).default(0.15),
        subapGridX: z.number().int().min(2).max(32).default(16),
        subapGridY: z.number().int().min(2).max(32).default(16),
        subapSize: z.number().int().min(4).max(64).default(16),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [run] = await db.insert(processingRuns).values({
        name: input.name,
        description: input.description,
        centroidMethod: input.centroidMethod,
        reconMethod: input.reconMethod,
        controlMethod: input.controlMethod,
        nZernikeModes: input.nZernikeModes,
        regularizationLambda: input.regularizationLambda,
        telescopeDiameter: input.telescopeDiameter,
        wavelength: input.wavelength,
        sampleRateHz: input.sampleRateHz,
        dmMaxStroke: input.dmMaxStroke,
        dmCoupling: input.dmCoupling,
        subapGridX: input.subapGridX,
        subapGridY: input.subapGridY,
        subapSize: input.subapSize,
      });
      return { id: Number(run.insertId) };
    }),

  /* List all processing runs */
  listRuns: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(processingRuns).orderBy(desc(processingRuns.createdAt));
  }),

  /* Get a single run */
  getRun: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [run] = await db
        .select()
        .from(processingRuns)
        .where(eq(processingRuns.id, input.id));
      return run || null;
    }),

  /* Update run status */
  updateRunStatus: publicQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["running", "completed", "error"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(processingRuns)
        .set({
          status: input.status,
          updatedAt: new Date(),
          completedAt: input.status === "completed" ? new Date() : undefined,
        })
        .where(eq(processingRuns.id, input.id));
      return { success: true };
    }),

  /* Save processing result */
  saveResult: publicQuery
    .input(
      z.object({
        runId: z.number(),
        frameIndex: z.number(),
        strehlRatio: z.number().optional(),
        rmsError: z.number().optional(),
        latencyMs: z.number().optional(),
        bandwidthHz: z.number().optional(),
        nValidCentroids: z.number().optional(),
        friedR0: z.number().optional(),
        coherenceTime: z.number().optional(),
        windSpeed: z.number().optional(),
        cn2: z.number().optional(),
        fwhmSeeing: z.number().optional(),
        wavefrontData: z.array(z.number()).optional(),
        zernikeCoefficients: z.array(z.number()).optional(),
        dmCommands: z.array(z.number()).optional(),
        centroids: z.array(z.number()).optional(),
        slopes: z.array(z.number()).optional(),
        status: z.string().default("ok"),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [result] = await db.insert(processingResults).values({
        runId: input.runId,
        frameIndex: input.frameIndex,
        strehlRatio: input.strehlRatio,
        rmsError: input.rmsError,
        latencyMs: input.latencyMs,
        bandwidthHz: input.bandwidthHz,
        nValidCentroids: input.nValidCentroids,
        friedR0: input.friedR0,
        coherenceTime: input.coherenceTime,
        windSpeed: input.windSpeed,
        cn2: input.cn2,
        fwhmSeeing: input.fwhmSeeing,
        wavefrontData: input.wavefrontData,
        zernikeCoefficients: input.zernikeCoefficients,
        dmCommands: input.dmCommands,
        centroids: input.centroids,
        slopes: input.slopes,
        status: input.status,
      });
      return { id: Number(result.insertId) };
    }),

  /* Get results for a run */
  getResults: publicQuery
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      return db
        .select()
        .from(processingResults)
        .where(eq(processingResults.runId, input.runId))
        .orderBy(processingResults.frameIndex);
    }),
});
