import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { readFileSync } from "fs";
import { join } from "path";

const app = new Hono<{ Bindings: HttpBindings }>();

// Allow up to 100MB for FITS file uploads
app.use(bodyLimit({ maxSize: 100 * 1024 * 1024 }));

// Serve WASM with correct MIME type
app.get("/ao-pro.wasm", (c) => {
  try {
    const wasmPath = join(process.cwd(), "public", "ao-pro.wasm");
    const wasmBuffer = readFileSync(wasmPath);
    return new Response(wasmBuffer, {
      headers: { "Content-Type": "application/wasm" },
    });
  } catch { return c.notFound(); }
});

app.get("/ao-pro.js", (c) => {
  try {
    const jsPath = join(process.cwd(), "public", "ao-pro.js");
    const jsContent = readFileSync(jsPath, "utf-8");
    return new Response(jsContent, {
      headers: { "Content-Type": "application/javascript" },
    });
  } catch { return c.notFound(); }
});

// FITS file parser endpoint
app.post("/api/fits/parse", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return c.json({ error: "No file uploaded" }, 400);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate FITS magic bytes
    const magic = buffer.slice(0, 6).toString("ascii");
    if (!magic.startsWith("SIMPLE")) {
      return c.json({ error: "Not a valid FITS file — must start with SIMPLE" }, 400);
    }

    const hdus = parseFITS(buffer);
    const primaryHDU = hdus[0];

    // AOT format HDU detection for CIAO/NAOMI/GALACSI/ERIS
    const gradientsHDU = hdus.find(h => h.extname?.toUpperCase().includes("GRADIENT"));
    const intensitiesHDU = hdus.find(h => h.extname?.toUpperCase().includes("INTENSIT"));
    const pixelsHDU = hdus.find(h => h.extname?.toUpperCase() === "PIXELS");
    const slopesHDU = gradientsHDU || hdus.find(h =>
      h.extname?.toUpperCase().includes("SLOPE") ||
      h.extname?.toUpperCase().includes("WFS") ||
      h.extname?.toUpperCase().includes("SUBAP")
    );
    const dmHDU = hdus.find(h =>
      h.extname?.toUpperCase().includes("DM") ||
      h.extname?.toUpperCase().includes("COMMAND") ||
      h.extname?.toUpperCase().includes("ACTUATOR") ||
      h.extname?.toUpperCase().includes("CORRECTOR")
    );
    const dataHDU = slopesHDU || pixelsHDU || intensitiesHDU || hdus.find(h => h.naxis >= 2 && h.dataLength > 10);

    // Use INTENSITIES for nFrames if available (15000 frames in CIAO)
    const nFrames = intensitiesHDU?.naxis2 || (dataHDU?.naxis2) || 1;
    const nSubaps = (gradientsHDU?.naxis1 || dataHDU?.naxis1 || 68);

    // Merge slopes from GRADIENTS + intensities from INTENSITIES
    const slopesData = gradientsHDU?.data || dataHDU?.data || [];
    const intensData = intensitiesHDU?.data || null;

    // GRADIENTS HDU in AOT format is 3D: (nFrames, 2, nSubaps)
    // naxis1=68 (subaps), naxis2=2 (gx/gy), naxis3=15000 (frames)
    // Flattened: [frame0_gx0..gx67, frame0_gy0..gy67, frame1_gx0..gx67, ...]
    const nSubapsReal = gradientsHDU?.naxis1 || 68;
    const nFramesReal = gradientsHDU ? (gradientsHDU.header?.["NAXIS3"] || gradientsHDU.naxis2 || 1) : (intensitiesHDU?.naxis2 || 1);
    const sampleRate = primaryHDU?.header?.["HIERARCH ESO AOS LOOP FREQUENCY"] ||
                       primaryHDU?.header?.["LOOPFREQ"] || 500;

    // Send max 500 frames to browser (500 * 2 * 68 = 68000 values — manageable)
    const maxSendFrames = Math.min(nFramesReal, 500);
    const slopesSlice = slopesData ? slopesData.slice(0, maxSendFrames * 2 * nSubapsReal) : [];

    let aoData = null;
    if (slopesSlice.length > 0 || (intensData && intensData.length > 0)) {
      aoData = {
        source: "ESO Real Telescope Data",
        instrument: primaryHDU?.header?.["INSTRUME"] || file.name.split("_")[0] || "CIAO",
        telescope: primaryHDU?.header?.["TELESCOP"] || "VLT/VLTI",
        date: primaryHDU?.header?.["DATE-OBS"] || primaryHDU?.header?.["DATE"] || "2019-12-06",
        nFrames: nFramesReal,
        nSentFrames: maxSendFrames,
        nSubaps: nSubapsReal,
        nSlopes: nSubapsReal,
        sampleRateHz: sampleRate,
        // slopes: interleaved as [frame0_gx..., frame0_gy..., frame1_gx..., frame1_gy..., ...]
        // Each frame: first nSubaps values = gx, next nSubaps = gy
        slopes: slopesSlice,
        intensities: intensData ? intensData.slice(0, maxSendFrames * nSubapsReal) : null,
        dmCommands: dmHDU?.data || null,
        dmShape: dmHDU ? [dmHDU.naxis2 || 1, dmHDU.naxis1 || 1] : null,
      };
    }

    return c.json({
      filename: file.name,
      fileSize: buffer.length,
      nHDUs: hdus.length,
      hdus: hdus.map(h => ({
        extname: h.extname,
        naxis: h.naxis,
        shape: h.naxis > 0 ? [h.naxis2, h.naxis1].filter(Boolean) : [],
        bitpix: h.bitpix,
        dataLength: h.dataLength,
        header: Object.fromEntries(Object.entries(h.header).slice(0, 20)),
      })),
      aoData,
    });
  } catch (err: any) {
    console.error("FITS parse error:", err);
    return c.json({ error: err.message || "Failed to parse FITS file" }, 500);
  }
});

function parseFITS(buffer: Buffer) {
  const BLOCK_SIZE = 2880;
  const CARD_SIZE = 80;
  let offset = 0;
  const hdus: any[] = [];

  while (offset < buffer.length && hdus.length < 20) {
    const header: Record<string, any> = {};
    let headerEnd = false;

    while (!headerEnd && offset + BLOCK_SIZE <= buffer.length) {
      const block = buffer.slice(offset, offset + BLOCK_SIZE);
      offset += BLOCK_SIZE;

      for (let i = 0; i < BLOCK_SIZE; i += CARD_SIZE) {
        const card = block.slice(i, i + CARD_SIZE).toString("ascii");
        const key = card.slice(0, 8).trim();
        const valueComment = card.slice(10).trim();

        if (key === "END") { headerEnd = true; break; }

        if (card[8] === "=" || card[8] === " ") {
          const valuePart = valueComment.split("/")[0].trim();
          if (valuePart.startsWith("'")) {
            header[key] = valuePart.replace(/'/g, "").trim();
          } else if (valuePart === "T") { header[key] = true; }
          else if (valuePart === "F") { header[key] = false; }
          else if (valuePart !== "") {
            const num = parseFloat(valuePart);
            header[key] = isNaN(num) ? valuePart : num;
          }
        }
      }
    }

    if (!headerEnd) break;

    const naxis = header["NAXIS"] || 0;
    let dataSize = 0;

    if (naxis > 0) {
      const bitpix = header["BITPIX"] || 8;
      const bytesPerElem = Math.abs(bitpix) / 8;
      let nElements = 1;
      for (let i = 1; i <= naxis; i++) nElements *= header[`NAXIS${i}`] || 1;
      dataSize = Math.ceil((nElements * bytesPerElem) / BLOCK_SIZE) * BLOCK_SIZE;
    }

    let data: number[] | null = null;
    const naxis1 = header["NAXIS1"] || 0;
    const naxis2 = header["NAXIS2"] || 1;
    const nElements = naxis1 * naxis2;
    const bitpix = header["BITPIX"] || 8;
    const bscale = header["BSCALE"] || 1.0;
    const bzero = header["BZERO"] || 0.0;
    const MAX_ELEMENTS = 1_000_000;

    if (dataSize > 0 && offset + dataSize <= buffer.length && nElements > 0 && nElements <= MAX_ELEMENTS) {
      const rawData = buffer.slice(offset, offset + dataSize);
      data = new Array(nElements);

      for (let i = 0; i < nElements; i++) {
        let raw = 0;
        try {
          if (bitpix === -32 && i * 4 + 4 <= rawData.length) raw = rawData.readFloatBE(i * 4);
          else if (bitpix === -64 && i * 8 + 8 <= rawData.length) raw = rawData.readDoubleBE(i * 8);
          else if (bitpix === 16 && i * 2 + 2 <= rawData.length) raw = rawData.readInt16BE(i * 2);
          else if (bitpix === 32 && i * 4 + 4 <= rawData.length) raw = rawData.readInt32BE(i * 4);
          else if (bitpix === 8 && i < rawData.length) raw = rawData[i];
        } catch {}
        data[i] = raw * bscale + bzero;
      }
    }

    hdus.push({
      header,
      extname: header["EXTNAME"] || (hdus.length === 0 ? "PRIMARY" : `HDU${hdus.length}`),
      naxis,
      naxis1,
      naxis2,
      bitpix,
      data,
      dataLength: nElements,
    });

    if (dataSize > 0) offset += dataSize;
    if (!headerEnd || offset >= buffer.length) break;
  }

  return hdus;
}

// tRPC
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}