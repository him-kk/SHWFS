import { useMemo } from "react";

interface WavefrontVisualizerProps {
  nx?: number;
  ny?: number;
  phase?: Float64Array | null;
  height?: number;
  showGrid?: boolean;
}

export function WavefrontVisualizer({
  nx = 16,
  ny = 16,
  phase,
  height = 240,
  showGrid = true,
}: WavefrontVisualizerProps) {
  const canvasData = useMemo(() => {
    // Generate synthetic phase data if none provided
    const data = phase || generateSyntheticPhase(nx, ny);
    
    // Normalize to [0, 1]
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;
    
    const normalized = new Float64Array(nx * ny);
    for (let i = 0; i < data.length; i++) {
      normalized[i] = (data[i] - min) / range;
    }
    
    return { data: normalized, min, max };
  }, [phase, nx, ny]);

  // Color mapping: cool (blue) -> neutral -> warm (orange/red)
  const getColor = (value: number): string => {
    // Interpolate between colors based on normalized value
    const t = Math.max(0, Math.min(1, value));
    
    // Color stops: blue (0) -> cyan (0.25) -> green (0.5) -> yellow (0.75) -> orange (1)
    if (t < 0.25) {
      const s = t / 0.25;
      return `rgb(${Math.round(100 + s * 50)}, ${Math.round(150 + s * 105)}, ${Math.round(220 - s * 50)})`;
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      return `rgb(${Math.round(150 - s * 100)}, ${Math.round(255 - s * 55)}, ${Math.round(170 - s * 120)})`;
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      return `rgb(${Math.round(50 + s * 180)}, ${Math.round(200 - s * 100)}, ${Math.round(50 + s * 20)})`;
    } else {
      const s = (t - 0.75) / 0.25;
      return `rgb(${Math.round(230 + s * 25)}, ${Math.round(100 + s * 80)}, ${Math.round(70 + s * 10)})`;
    }
  };

  const cellSize = Math.floor(height / ny);
  const width = cellSize * nx;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="rounded-lg overflow-hidden shadow-sm border border-[hsl(30,15%,90%)]"
      >
        {Array.from({ length: ny }, (_, iy) =>
          Array.from({ length: nx }, (_, ix) => {
            const idx = iy * nx + ix;
            const value = canvasData.data[idx] || 0;
            
            return (
              <rect
                key={idx}
                x={ix * cellSize}
                y={iy * cellSize}
                width={cellSize}
                height={cellSize}
                fill={getColor(value)}
                stroke={showGrid ? "rgba(255,255,255,0.15)" : "none"}
                strokeWidth={0.5}
              />
            );
          })
        )}
        
        {/* Contour lines */}
        {Array.from({ length: 5 }, (_, i) => {
          const contourLevel = (i + 1) / 6;
          return (
            <g key={`contour-${i}`} opacity={0.3}>
              {Array.from({ length: ny - 1 }, (_, iy) =>
                Array.from({ length: nx - 1 }, (_, ix) => {
                  const idx = iy * nx + ix;
                  const v00 = canvasData.data[idx];
                  const v10 = canvasData.data[idx + 1];
                  const v01 = canvasData.data[idx + nx];
                  const v11 = canvasData.data[idx + nx + 1];
                  
                  // Simple marching squares for contours
                  const points: string[] = [];
                  
                  if ((v00 < contourLevel) !== (v10 < contourLevel)) {
                    const t = (contourLevel - v00) / (v10 - v00 || 1);
                    points.push(`${(ix + t) * cellSize},${iy * cellSize}`);
                  }
                  if ((v10 < contourLevel) !== (v11 < contourLevel)) {
                    const t = (contourLevel - v10) / (v11 - v10 || 1);
                    points.push(`${(ix + 1) * cellSize},${(iy + t) * cellSize}`);
                  }
                  if ((v01 < contourLevel) !== (v11 < contourLevel)) {
                    const t = (contourLevel - v01) / (v11 - v01 || 1);
                    points.push(`${(ix + t) * cellSize},${(iy + 1) * cellSize}`);
                  }
                  if ((v00 < contourLevel) !== (v01 < contourLevel)) {
                    const t = (contourLevel - v00) / (v01 - v00 || 1);
                    points.push(`${ix * cellSize},${(iy + t) * cellSize}`);
                  }
                  
                  if (points.length >= 2) {
                    return (
                      <line
                        key={`c-${i}-${idx}`}
                        x1={parseFloat(points[0].split(",")[0])}
                        y1={parseFloat(points[0].split(",")[1])}
                        x2={parseFloat(points[1].split(",")[0])}
                        y2={parseFloat(points[1].split(",")[1])}
                        stroke="white"
                        strokeWidth={1}
                      />
                    );
                  }
                  return null;
                })
              )}
            </g>
          );
        })}
      </svg>
      
      {/* Color bar */}
      <div className="flex items-center gap-2 w-full max-w-[300px]">
        <span className="text-[10px] text-muted-foreground">
          {(canvasData.min * 1000).toFixed(1)}nm
        </span>
        <div
          className="flex-1 h-3 rounded-full"
          style={{
            background: `linear-gradient(to right, 
              rgb(100,150,220), 
              rgb(150,255,170), 
              rgb(50,200,50), 
              rgb(230,100,70), 
              rgb(255,180,80))`,
          }}
        />
        <span className="text-[10px] text-muted-foreground">
          {(canvasData.max * 1000).toFixed(1)}nm
        </span>
      </div>
    </div>
  );
}

function generateSyntheticPhase(nx: number, ny: number): Float64Array {
  const phase = new Float64Array(nx * ny);
  
  // Generate Kolmogorov-like phase screen
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = (ix - nx / 2) / (nx / 2);
      const y = (iy - ny / 2) / (ny / 2);
      const r = Math.sqrt(x * x + y * y);
      const theta = Math.atan2(y, x);
      
      // Tip + tilt + defocus + astigmatism + higher order
      let phi = 0;
      phi += 0.1 * x;                    // Tip
      phi += 0.08 * y;                    // Tilt
      phi += 0.05 * (2 * r * r - 1);     // Defocus
      phi += 0.03 * r * r * Math.cos(2 * theta);  // Astig
      phi += 0.02 * r * r * Math.sin(2 * theta);
      phi += 0.015 * (3 * r * r * r - 2 * r) * Math.cos(theta);  // Coma
      phi += 0.01 * Math.sin(4 * theta) * r * r;  // Higher order
      
      // Add some random turbulence
      phi += (Math.random() - 0.5) * 0.02;
      
      phase[iy * nx + ix] = phi;
    }
  }
  
  return phase;
}
