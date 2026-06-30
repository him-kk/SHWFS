import { useState } from "react";
import {
  Code2,
  FileCode,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Download,
  Cpu,
  BookOpen,
  GitBranch,
} from "lucide-react";

interface FileNode {
  name: string;
  type: "file" | "folder";
  language?: string;
  content?: string;
  children?: FileNode[];
}

const fileTree: FileNode[] = [
  {
    name: "cpp/",
    type: "folder",
    children: [
      { name: "include/", type: "folder", children: [
        { name: "ao_core.h", type: "file", language: "cpp" },
      ]},
      { name: "src/", type: "folder", children: [
        { name: "preprocessing.c", type: "file", language: "c" },
        { name: "centroiding.c", type: "file", language: "c" },
        { name: "wavefront_recon.c", type: "file", language: "c" },
        { name: "turbulence.c", type: "file", language: "c" },
        { name: "dm_control.c", type: "file", language: "c" },
        { name: "hysteresis.c", type: "file", language: "c" },
        { name: "control.c", type: "file", language: "c" },
        { name: "spgd_backup.c", type: "file", language: "c" },
        { name: "pipeline.c", type: "file", language: "c" },
      ]},
      { name: "wasm/", type: "folder", children: [
        { name: "exports.c", type: "file", language: "c" },
        { name: "bindings.cpp", type: "file", language: "cpp" },
      ]},
      { name: "CMakeLists.txt", type: "file", language: "cmake" },
    ],
  },
  {
    name: "src/",
    type: "folder",
    children: [
      { name: "lib/", type: "folder", children: [
        { name: "ao-sim.ts", type: "file", language: "typescript" },
        { name: "ao-wasm-bridge.ts", type: "file", language: "typescript" },
      ]},
      { name: "components/", type: "folder", children: [
        { name: "WavefrontVisualizer.tsx", type: "file", language: "tsx" },
        { name: "PipelineDiagram.tsx", type: "file", language: "tsx" },
      ]},
      { name: "pages/", type: "folder", children: [
        { name: "Dashboard.tsx", type: "file", language: "tsx" },
        { name: "Processing.tsx", type: "file", language: "tsx" },
        { name: "Results.tsx", type: "file", language: "tsx" },
      ]},
    ],
  },
];

const moduleDescriptions: Record<string, string> = {
  "preprocessing.c": `/* Module 1: Preprocessing (TRL 9)
 * 
 * Dark frame subtraction, flat field correction, bad pixel
 * masking with 3x3 median filter, photon noise estimation,
 * and adaptive thresholding per sub-aperture.
 */`,
  "centroiding.c": `/* Module 2: Hybrid Centroid Detection (TRL 6-7)
 * 
 * Weighted Center-of-Gravity (WCoG) with Gaussian weighting
 * Autocorrelation matched filter for large aberrations
 * Hungarian algorithm for spot-to-lenslet assignment
 * 
 * Reference: Wang et al. (2022) - Dynamic range expansion
 */`,
  "wavefront_recon.c": `/* Module 3: Wavefront Reconstruction
 * 
 * Modal: Zernike SVD with Tikhonov regularization
 * Zonal: Southwell least-squares integration
 * FRiM: O(N) fractal iterative PCG (Thiebaut 2010)
 * Compressive Sensing: OMP sparse reconstruction (TRL 4)
 */`,
  "turbulence.c": `/* Module 4: Turbulence Characterization
 * 
 * r0 estimation from Zernike coefficient variance
 * r0 estimation from phase structure function
 * tau0 estimation from temporal autocorrelation
 * Layer-resolved tau0 (ground + high altitude)
 */`,
  "dm_control.c": `/* Module 5: DM Actuator Mapping (TRL 9)
 * 
 * Fried geometry alignment, Gaussian influence functions
 * Regularized inversion with modal covariance + Laplacian
 * Stroke constraints, waffle mode suppression
 * 
 * Reference: Dubra (2007) - WFS/DM matching
 */`,
  "hysteresis.c": `/* Module 6: Hysteresis Compensation (TRL 8)
 * 
 * Preisach model with M=20 discretization
 * Inverse model for feedforward compensation
 * Combined FF + FB: 20% RMS error -> ~3%
 * 
 * Reference: Dubra et al. (2005)
 */`,
  "control.c": `/* Module 7: Real-Time Control (TRL 7-8)
 * 
 * PI control with anti-windup
 * LQG with Kalman filter + LQR
 * Correlation-locking for non-stationarity (Deo 2021)
 * Turbulence AR1 state-space model
 */`,
  "spgd_backup.c": `/* Module 8: Sensorless Backup - Sophia-SPGD (TRL 6)
 * 
 * Stochastic Parallel Gradient Descent optimization
 * Sophia optimizer: second-order clipped stochastic
 * Adaptive learning rate + bound scheduling
 * Image sharpness metric (Tenengrad)
 * 
 * Reference: Chen et al. (2025)
 */`,
  "pipeline.c": `/* Module 9: Complete Pipeline Orchestration
 * 
 * Configuration management, single frame processing
 * Time-series processing with turbulence characterization
 * Result management and memory cleanup
 */`,
  "ao_core.h": `/* AO-Pro Core Header - Data Structures & Function Declarations
 * 
 * All modules share these definitions:
 *   - Constants and configuration
 *   - Data structures (frames, centroids, wavefronts, DM)
 *   - Function declarations for all 9 modules
 *   - Complete pipeline interface
 */`,
  "exports.c": `/* WebAssembly C Exports for Browser Integration
 * 
 * Simple C API callable from JavaScript via ccall/cwrap:
 *   - Memory management (alloc/free)
 *   - Configuration (create/set/destroy)
 *   - Pipeline processing
 *   - Result accessors (Strehl, RMS, wavefront, DM commands)
 */`,
  "bindings.cpp": `/* Emscripten C++ Embind (Alternative Interface)
 * 
 * Provides class-based wrappers for:
 *   - AOConfig, AOSubapConfig, AOFrameMeta
 *   - AOPipelineResult with typed getters
 *   - AOPipeline.processFrame() method
 */`,
};

function FileTree({ nodes, level = 0, onSelect, selected }: {
  nodes: FileNode[];
  level?: number;
  onSelect: (node: FileNode) => void;
  selected: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["cpp/", "src/"]));

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <div key={node.name}>
          <button
            onClick={() => {
              if (node.type === "folder") {
                toggle(node.name);
              } else {
                onSelect(node);
              }
            }}
            className={`
              flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-xs
              transition-colors duration-150
              ${selected === node.name ? "bg-[hsl(25,75%,47%)]/10 text-[hsl(25,75%,47%)] font-medium" : "text-foreground/70 hover:bg-[hsl(30,12%,95%)]"}
            `}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {node.type === "folder" ? (
              <>
                {expanded.has(node.name) ? (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                )}
                <FolderOpen className="w-3.5 h-3.5 text-[hsl(45,60%,50%)] shrink-0" />
              </>
            ) : (
              <>
                <span className="w-3" />
                <FileCode className="w-3.5 h-3.5 text-[hsl(200,50%,50%)] shrink-0" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {node.type === "folder" && expanded.has(node.name) && node.children && (
            <FileTree
              nodes={node.children}
              level={level + 1}
              onSelect={onSelect}
              selected={selected}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function SourceCode() {
  const [selectedFile, setSelectedFile] = useState<string>("ao_core.h");
  const [copied, setCopied] = useState(false);

  const description = moduleDescriptions[selectedFile] || "/* Select a file to view its description */";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 p-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground/90">
            Source Code
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete C/C++ implementation with TypeScript simulation layer
          </p>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="ao-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[hsl(200,30%,95%)] flex items-center justify-center">
            <Code2 className="w-5 h-5 text-[hsl(200,50%,45%)]" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground/90">9</p>
            <p className="text-xs text-muted-foreground">C Source Modules</p>
          </div>
        </div>
        <div className="ao-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[hsl(25,30%,95%)] flex items-center justify-center">
            <Cpu className="w-5 h-5 text-[hsl(25,70%,45%)]" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground/90">~3,000</p>
            <p className="text-xs text-muted-foreground">Lines of C/C++</p>
          </div>
        </div>
        <div className="ao-card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[hsl(150,30%,95%)] flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-[hsl(150,45%,40%)]" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground/90">WebAssembly</p>
            <p className="text-xs text-muted-foreground">Browser compatible</p>
          </div>
        </div>
      </div>

      {/* File Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* File Tree */}
        <div className="ao-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[hsl(45,60%,50%)]" />
            File Explorer
          </h3>
          <FileTree nodes={fileTree} onSelect={(n) => setSelectedFile(n.name)} selected={selectedFile} />
        </div>

        {/* Code Preview */}
        <div className="lg:col-span-2 ao-card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[hsl(30,12%,95%)]">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-[hsl(200,50%,50%)]" />
              <span className="text-sm font-semibold">{selectedFile}</span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="p-4 bg-[hsl(30,8%,97%)] overflow-auto max-h-[500px]">
            <pre className="text-xs font-mono leading-relaxed text-foreground/80 whitespace-pre">
              {description}
            </pre>
            <div className="mt-4 p-3 bg-white rounded-lg border border-[hsl(30,12%,90%)]">
              <p className="text-xs text-muted-foreground">
                The complete source code is available in the project directory. 
                Each module implements algorithms from peer-reviewed literature 
                with experimentally validated performance targets.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Module Overview */}
      <div className="ao-card p-5">
        <h3 className="ao-section-title mb-4 flex items-center gap-2">
          <BookOpen className="w-4.5 h-4.5 text-[hsl(25,75%,47%)]" />
          Module Architecture
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: "preprocessing.c", desc: "Dark/flat correction, bad pixel masking, adaptive thresholding", trl: "TRL 9" },
            { name: "centroiding.c", desc: "WCoG + autocorrelation matched filter + Hungarian assignment", trl: "TRL 6-7" },
            { name: "wavefront_recon.c", desc: "Modal SVD, FRiM O(N) PCG, compressive sensing OMP", trl: "TRL 4-9" },
            { name: "turbulence.c", desc: "r0 from Zernike variance, tau0 from ACF, layer-resolved", trl: "TRL 8-9" },
            { name: "dm_control.c", desc: "Fried geometry, influence functions, regularized inversion", trl: "TRL 8-9" },
            { name: "hysteresis.c", desc: "Preisach model, inverse feedforward, combined FF+FB", trl: "TRL 8" },
            { name: "control.c", desc: "PI control, LQG Kalman, correlation-locking adaptation", trl: "TRL 7-8" },
            { name: "spgd_backup.c", desc: "Sophia-SPGD second-order sensorless optimization", trl: "TRL 6" },
            { name: "pipeline.c", desc: "Pipeline orchestration, time-series processing, results", trl: "TRL 9" },
          ].map((mod) => (
            <button
              key={mod.name}
              onClick={() => setSelectedFile(mod.name)}
              className={`text-left p-3 rounded-lg border transition-all duration-200 ${
                selectedFile === mod.name
                  ? "border-[hsl(25,75%,47%)] bg-[hsl(25,75%,47%)]/5"
                  : "border-[hsl(30,12%,90%)] hover:border-[hsl(30,12%,80%)] hover:bg-[hsl(30,12%,97%)]"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground/80">{mod.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  mod.trl.includes("9") ? "bg-[hsl(150,40%,92%)] text-[hsl(150,50%,30%)]" :
                  mod.trl.includes("8") ? "bg-[hsl(150,35%,93%)] text-[hsl(150,45%,32%)]" :
                  mod.trl.includes("7") ? "bg-[hsl(100,35%,93%)] text-[hsl(100,40%,32%)]" :
                  "bg-[hsl(45,50%,93%)] text-[hsl(35,55%,35%)]"
                }`}>
                  {mod.trl}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{mod.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Build Instructions */}
      <div className="ao-card p-5">
        <h3 className="ao-section-title mb-4">Build Instructions</h3>
        <div className="space-y-3 text-sm text-foreground/80">
          <div>
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Native Build (CMake)</p>
            <pre className="bg-[hsl(30,8%,97%)] p-3 rounded-lg text-xs font-mono overflow-x-auto">
{`mkdir build && cd build
cmake ..
make -j$(nproc)
# Produces: libao_pro_native.a (static library)`}
            </pre>
          </div>
          <div>
            <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1.5">WebAssembly Build (Emscripten)</p>
            <pre className="bg-[hsl(30,8%,97%)] p-3 rounded-lg text-xs font-mono overflow-x-auto">
{`# Requires Emscripten SDK
emcc -O3 -I include src/*.c wasm/exports.c \
  -s EXPORT_ES6=1 -s MODULARIZE=1 \
  -s EXPORT_NAME="'AOProModule'" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o public/ao-pro.js
# Produces: ao-pro.js + ao-pro.wasm`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
