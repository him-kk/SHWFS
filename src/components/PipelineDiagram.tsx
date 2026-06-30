import { useState } from "react";
import {
  Camera,
  Filter,
  Crosshair,
  GitBranch,
  Waves,
  Wind,
  Settings2,
  Gauge,
  Shield,
  BarChart3,
  ChevronRight,
  Info,
  CheckCircle2,
  FlaskConical,
  Microscope,
} from "lucide-react";

interface PipelineNode {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
  details: string[];
  trl: string;
  status: "complete" | "partial" | "research";
}

const pipelineNodes: PipelineNode[] = [
  {
    id: "wfs",
    label: "SH-WFS Frames",
    icon: <Camera className="w-5 h-5" />,
    color: "text-[hsl(25,75%,47%)]",
    bgColor: "bg-gradient-to-br from-[hsl(25,85%,55%)]/15 to-[hsl(20,80%,50%)]/10",
    description: "Shack-Hartmann wavefront sensor input frames (.bmp, ms dt)",
    details: ["Scientific CMOS/EMCCD readout", "<1ms frame transfer", "16-bit depth"],
    trl: "TRL 9",
    status: "complete",
  },
  {
    id: "preproc",
    label: "Preprocessing",
    icon: <Filter className="w-5 h-5" />,
    color: "text-[hsl(200,60%,50%)]",
    bgColor: "bg-gradient-to-br from-[hsl(200,60%,50%)]/15 to-[hsl(190,55%,45%)]/10",
    description: "Dark frame subtraction, flat field correction, bad pixel masking",
    details: [
      "I_corr = I_raw - I_dark",
      "I_norm = I_corr / I_flat",
      "3x3 median bad pixel interpolation",
      "Adaptive thresholding per sub-aperture",
    ],
    trl: "TRL 9",
    status: "complete",
  },
  {
    id: "centroid",
    label: "Hybrid Centroiding",
    icon: <Crosshair className="w-5 h-5" />,
    color: "text-[hsl(150,50%,45%)]",
    bgColor: "bg-gradient-to-br from-[hsl(150,50%,45%)]/15 to-[hsl(140,45%,40%)]/10",
    description: "Weighted CoG + Autocorrelation matched filter",
    details: [
      "Tier 1: WCoG with Gaussian weighting",
      "Tier 2: FFT-based autocorrelation (Wang 2022)",
      "62-184% dynamic range improvement",
      "Hungarian spot assignment",
    ],
    trl: "TRL 6-7",
    status: "complete",
  },
  {
    id: "slopes",
    label: "Slope Vector G",
    icon: <GitBranch className="w-5 h-5" />,
    color: "text-[hsl(260,50%,55%)]",
    bgColor: "bg-gradient-to-br from-[hsl(260,50%,55%)]/15 to-[hsl(250,45%,50%)]/10",
    description: "Centroid-to-slope conversion with focal length scaling",
    details: ["Gx, Gy arrays per sub-aperture", "Angular slope units", "Reference position tracking"],
    trl: "TRL 9",
    status: "complete",
  },
  {
    id: "recon",
    label: "Wavefront Reconstruction",
    icon: <Waves className="w-5 h-5" />,
    color: "text-[hsl(45,70%,50%)]",
    bgColor: "bg-gradient-to-br from-[hsl(45,70%,50%)]/15 to-[hsl(35,65%,45%)]/10",
    description: "Modal SVD + FRiM + Compressive Sensing",
    details: [
      "Modal: Zernike SVD with Tikhonov regularization",
      "Zonal: FRiM O(N) PCG (Thiebaut 2010)",
      "Compressive: OMP sparse reconstruction",
      "Adaptive lambda based on real-time r0",
    ],
    trl: "TRL 5-9",
    status: "complete",
  },
  {
    id: "turb",
    label: "Turbulence Characterization",
    icon: <Wind className="w-5 h-5" />,
    color: "text-[hsl(180,50%,45%)]",
    bgColor: "bg-gradient-to-br from-[hsl(180,50%,45%)]/15 to-[hsl(170,45%,40%)]/10",
    description: "r0 from Zernike variance, tau0 from temporal autocorrelation",
    details: [
      "r0: Weighted least-squares on modal variance",
      "tau0: Exponential fit to ACF",
      "Layer-resolved: ground + high altitude",
      "Structure function validation",
    ],
    trl: "TRL 8-9",
    status: "complete",
  },
  {
    id: "dm",
    label: "DM Actuator Mapping",
    icon: <Settings2 className="w-5 h-5" />,
    color: "text-[hsl(340,50%,55%)]",
    bgColor: "bg-gradient-to-br from-[hsl(340,50%,55%)]/15 to-[hsl(330,45%,50%)]/10",
    description: "Fried geometry, influence functions, regularized inversion",
    details: [
      "Fried geometry alignment (~1.03x magnification)",
      "Gaussian influence functions",
      "Tikhonov + Laplacian regularization",
      "Waffle mode suppression",
      "Stroke constraints + QP minimization",
    ],
    trl: "TRL 8-9",
    status: "complete",
  },
  {
    id: "control",
    label: "Real-Time Control",
    icon: <Gauge className="w-5 h-5" />,
    color: "text-[hsl(120,45%,45%)]",
    bgColor: "bg-gradient-to-br from-[hsl(120,45%,45%)]/15 to-[hsl(110,40%,40%)]/10",
    description: "LQG with correlation-locking adaptive gain",
    details: [
      "Kalman filter state estimation",
      "LQR optimal control",
      "Correlation-locking for non-stationarity",
      "<3ms total latency",
      "PI fallback mode",
    ],
    trl: "TRL 7-8",
    status: "complete",
  },
  {
    id: "hysteresis",
    label: "Hysteresis Compensation",
    icon: <Microscope className="w-5 h-5" />,
    color: "text-[hsl(280,45%,55%)]",
    bgColor: "bg-gradient-to-br from-[hsl(280,45%,55%)]/15 to-[hsl(270,40%,50%)]/10",
    description: "Preisach model with inverse feedforward",
    details: [
      "Discrete Preisach operator (M=20)",
      "Constrained LS identification",
      "Inverse model feedforward compensation",
      "Combined FF + FB: 20% -> 3% RMS error",
    ],
    trl: "TRL 8",
    status: "complete",
  },
  {
    id: "spgd",
    label: "Sophia-SPGD Backup",
    icon: <Shield className="w-5 h-5" />,
    color: "text-[hsl(30,60%,50%)]",
    bgColor: "bg-gradient-to-br from-[hsl(30,60%,50%)]/15 to-[hsl(25,55%,45%)]/10",
    description: "Second-order sensorless optimization for WFS failure",
    details: [
      "Stochastic parallel gradient descent",
      "Sophia optimizer: second-order clipped",
      "Adaptive learning rate + bound",
      "35-80% convergence speedup",
      "Image sharpness metric",
    ],
    trl: "TRL 5-6",
    status: "partial",
  },
  {
    id: "metrics",
    label: "Quality Metrics",
    icon: <BarChart3 className="w-5 h-5" />,
    color: "text-[hsl(25,75%,47%)]",
    bgColor: "bg-gradient-to-br from-[hsl(25,75%,47%)]/15 to-[hsl(20,70%,42%)]/10",
    description: "Strehl ratio, RMS, bandwidth, latency monitoring",
    details: [
      "Strehl: S = exp(-sigma^2)",
      "RMS wavefront error",
      "Centroid precision",
      "Loop bandwidth >50Hz",
      "Latency <3ms",
    ],
    trl: "TRL 9",
    status: "complete",
  },
];

export function PipelineDiagram() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const selected = pipelineNodes.find((n) => n.id === selectedNode);

  return (
    <div className="flex gap-6">
      {/* Pipeline Flow */}
      <div className="flex-1 space-y-3">
        {pipelineNodes.map((node, index) => (
          <div key={node.id}>
            {index > 0 && (
              <div className="flex justify-center -my-1 relative z-10">
                <div className="w-6 h-6 rounded-full bg-white border-2 border-[hsl(30,15%,85%)] flex items-center justify-center shadow-sm">
                  <ChevronRight className="w-3 h-3 text-[hsl(30,15%,60%)]" />
                </div>
              </div>
            )}
            <div
              onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
              className={`
                flex items-center gap-4 p-4 rounded-xl cursor-pointer
                transition-all duration-300 border-2
                ${node.bgColor}
                ${selectedNode === node.id 
                  ? "border-[hsl(25,75%,47%)] shadow-md scale-[1.01]" 
                  : "border-transparent hover:border-[hsl(30,15%,85%)] hover:shadow-sm"
                }
              `}
            >
              <div className={`flex items-center justify-center w-11 h-11 rounded-lg bg-white/80 shadow-sm ${node.color}`}>
                {node.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-foreground/90">{node.label}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    node.status === "complete" 
                      ? "bg-[hsl(150,40%,92%)] text-[hsl(150,50%,35%)]" 
                      : "bg-[hsl(45,50%,92%)] text-[hsl(35,55%,40%)]"
                  }`}>
                    {node.trl}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{node.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {node.status === "complete" && <CheckCircle2 className="w-4 h-4 text-[hsl(150,50%,45%)]" />}
                {node.status === "partial" && <FlaskConical className="w-4 h-4 text-[hsl(45,60%,50%)]" />}
                {node.status === "research" && <FlaskConical className="w-4 h-4 text-[hsl(260,50%,55%)]" />}
                <Info className={`w-4 h-4 transition-transform duration-200 ${selectedNode === node.id ? "rotate-180" : ""} text-muted-foreground`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Panel */}
      <div className="w-80 shrink-0">
        <div className="sticky top-4">
          {selected ? (
            <div className="ao-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${selected.bgColor} ${selected.color}`}>
                  {selected.icon}
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{selected.label}</h4>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    selected.status === "complete" 
                      ? "bg-[hsl(150,40%,92%)] text-[hsl(150,50%,35%)]" 
                      : "bg-[hsl(45,50%,92%)] text-[hsl(35,55%,40%)]"
                  }`}>
                    {selected.trl}
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                {selected.description}
              </p>
              
              <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Implementation Details
              </h5>
              <ul className="space-y-2">
                {selected.details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <ChevronRight className="w-3 h-3 mt-0.5 text-[hsl(25,75%,47%)] shrink-0" />
                    {detail}
                  </li>
                ))}
              </ul>
              
              <div className="mt-4 pt-4 border-t border-[hsl(30,12%,92%)]">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    selected.status === "complete" 
                      ? "bg-[hsl(150,60%,45%)]" 
                      : selected.status === "partial"
                      ? "bg-[hsl(45,70%,55%)]"
                      : "bg-[hsl(260,50%,55%)]"
                  }`} />
                  <span className="text-[11px] text-muted-foreground">
                    {selected.status === "complete" 
                      ? "Fully implemented" 
                      : selected.status === "partial"
                      ? "Partially implemented"
                      : "Research direction"
                    }
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="ao-card p-5 text-center">
              <Info className="w-8 h-8 text-[hsl(30,15%,75%)] mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Select a pipeline stage to view implementation details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
