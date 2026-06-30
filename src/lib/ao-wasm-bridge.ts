import type {
  AOConfig,
  SubapConfig,
  FrameMeta,
  PipelineResult,
} from "./ao-sim";
import {
  createDefaultConfig,
  processFrame,
  processTimeSeries,
  generateSyntheticFrame,
  generateDarkFrame,
  generateFlatFrame,
  version,
} from "./ao-sim";

export type { AOConfig, SubapConfig, FrameMeta, PipelineResult };

export {
  createDefaultConfig,
  processFrame as ao_process_pipeline,
  processTimeSeries as ao_process_timeseries,
  generateSyntheticFrame,
  generateDarkFrame,
  generateFlatFrame,
  version,
};

// Full Emscripten module interface including bound C++ classes
export interface AOProModule {
  ccall: (name: string, returnType: string, argTypes: string[], args: unknown[]) => unknown;
  cwrap: (name: string, returnType: string, argTypes: string[]) => (...args: unknown[]) => unknown;
  getValue: (ptr: number, type: string) => number;
  setValue: (ptr: number, value: number, type: string) => void;
  HEAPU16: Uint16Array;
  HEAPF64: Float64Array;
  // Emscripten bound C++ classes
  AOConfig: new () => {
    setCentroidMethod(v: number): void;
    setReconMethod(v: number): void;
    setControlMethod(v: number): void;
    setNZernikeModes(v: number): void;
    setLambda(v: number): void;
    setTelescopeD(v: number): void;
    setWavelength(v: number): void;
    setSampleRate(v: number): void;
    setMaxStroke(v: number): void;
    setCoupling(v: number): void;
    setLatency(v: number): void;
    setTargetStrehl(v: number): void;
    setEnableHysteresis(v: number): void;
    setEnableSPGD(v: number): void;
    delete(): void;
  };
  AOSubapConfig: new () => {
    setup(gridX: number, gridY: number, subapSize: number, pitchPixels: number, pitchMeters: number, focalLength: number): void;
    delete(): void;
  };
  AOFrameMeta: new () => {
    setup(width: number, height: number, exposureMs: number, gain: number): void;
    delete(): void;
  };
  AOPipelineResult: new () => {
    getStrehl(): number;
    getRMS(): number;
    getBandwidth(): number;
    getLatency(): number;
    getNValid(): number;
    getStatus(): number;
    getWavefront(nx: number, ny: number): number[];
    getDMCommands(nAct: number): number[];
    getCentroids(nSubaps: number): number[];
    getSlopes(nSubaps: number): number[];
    delete(): void;
  };
  AOPipeline: new () => {
    processFrame(
      frame: Uint16Array,
      meta: any,
      subap: any,
      config: any,
      result: any
    ): void;
    delete(): void;
  };
}

let wasmModule: AOProModule | null = null;

export async function initWASM(): Promise<boolean> {
  try {
    const module = await Function('return import("/ao-pro.js")')();
    if (module && typeof module.default === "function") {
      wasmModule = await module.default() as AOProModule;
      // Verify the module has the expected constructors
      if (wasmModule && typeof (wasmModule as any).AOConfig === "function") {
        console.log("AO-Pro WASM module loaded with C++ bindings");
        return true;
      }
    }
  } catch {
    console.log("WASM module not available, using TypeScript simulation");
  }
  return false;
}

export function isWASMAvailable(): boolean {
  return wasmModule !== null && typeof (wasmModule as any).AOConfig === "function";
}

export function getWASMModule(): AOProModule | null {
  return wasmModule;
}