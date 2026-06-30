import { useState, useCallback, useRef } from "react";
import {
  Upload, FileSearch, Telescope, Activity,
  CheckCircle, AlertCircle, Loader2, Database,
  BarChart3, Waves, Cpu, ChevronRight, Info
} from "lucide-react";

interface FITSData {
  filename: string;
  fileSize: number;
  nHDUs: number;
  hdus: Array<{
    extname: string;
    naxis: number;
    shape: number[];
    bitpix: number;
    dataLength: number;
    header: Record<string, any>;
  }>;
  aoData: {
    source: string;
    instrument: string;
    telescope: string;
    date: string;
    nFrames: number;
    nSlopes: number;
    nSubaps: number;
    sampleRateHz: number;
    slopes: number[];
    dmCommands: number[] | null;
    dmShape: number[] | null;
  } | null;
}

interface FITSLoaderProps {
  onDataLoaded: (data: FITSData) => void;
}

export function FITSLoader({ onDataLoaded }: FITSLoaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fitsData, setFitsData] = useState<FITSData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".fits") && !file.name.endsWith(".fit")) {
      setError("Please upload a .fits or .fit file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/fits/parse", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse FITS file");
      }

      const data: FITSData = await response.json();
      setFitsData(data);
      onDataLoaded(data);
    } catch (err: any) {
      setError(err.message || "Failed to process FITS file");
    } finally {
      setIsLoading(false);
    }
  }, [onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      {!fitsData && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
            ${isDragging
              ? "border-[hsl(25,75%,47%)] bg-[hsl(30,50%,97%)]"
              : "border-[hsl(30,15%,85%)] hover:border-[hsl(25,75%,47%)] hover:bg-[hsl(30,50%,98%)]"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".fits,.fit"
            className="hidden"
            onChange={handleFileChange}
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-[hsl(25,75%,47%)] animate-spin" />
              <p className="text-sm font-medium text-foreground/70">Parsing real telescope data...</p>
              <p className="text-xs text-muted-foreground">Extracting WFS slopes & DM commands</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[hsl(30,50%,95%)] flex items-center justify-center">
                <Upload className="w-7 h-7 text-[hsl(25,75%,47%)]" />
              </div>
              <div>
                <p className="font-semibold text-foreground/80">Drop your FITS file here</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Real ESO telescope data (.fits) — CIAO, NAOMI, GALACSI, ERIS
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[hsl(30,12%,95%)] px-3 py-1.5 rounded-full">
                <Info className="w-3.5 h-3.5" />
                Download from: zenodo.org/records/8192742
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* FITS Data Summary */}
      {fitsData && (
        <div className="space-y-3">
          {/* File info */}
          <div className="ao-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground/80">{fitsData.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(fitsData.fileSize)} · {fitsData.nHDUs} HDUs
                </p>
              </div>
            </div>
            <button
              onClick={() => { setFitsData(null); setError(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change file
            </button>
          </div>

          {/* AO Data info */}
          {fitsData.aoData && (
            <div className="ao-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Telescope className="w-4 h-4 text-[hsl(25,75%,47%)]" />
                <h3 className="font-semibold text-sm">Real Telescope Data Extracted</h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InfoRow icon={<Database className="w-3.5 h-3.5" />} label="Source" value={fitsData.aoData.source} />
                <InfoRow icon={<Telescope className="w-3.5 h-3.5" />} label="Instrument" value={fitsData.aoData.instrument} />
                <InfoRow icon={<Activity className="w-3.5 h-3.5" />} label="Date" value={fitsData.aoData.date} />
                <InfoRow icon={<Cpu className="w-3.5 h-3.5" />} label="Loop Rate" value={`${fitsData.aoData.sampleRateHz} Hz`} />
                <InfoRow icon={<BarChart3 className="w-3.5 h-3.5" />} label="Total Frames" value={fitsData.aoData.nFrames.toLocaleString()} />
                <InfoRow icon={<Waves className="w-3.5 h-3.5" />} label="Sub-apertures" value={fitsData.aoData.nSubaps.toString()} />
              </div>

              {fitsData.aoData.dmCommands && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5" />
                  DM commands found — {fitsData.aoData.dmShape?.join("×")} actuator array
                </div>
              )}
            </div>
          )}

          {/* HDU List */}
          <div className="ao-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              FITS HDU Structure
            </h3>
            <div className="space-y-1.5">
              {fitsData.hdus.map((hdu, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="font-mono font-semibold w-32 truncate text-[hsl(25,75%,40%)]">
                    {hdu.extname}
                  </span>
                  <span className="text-muted-foreground">
                    {hdu.shape.length > 0 ? hdu.shape.join("×") : "no data"}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    BITPIX={hdu.bitpix}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-[hsl(30,12%,96%)] rounded-lg px-2.5 py-1.5">
      <span className="text-[hsl(25,75%,47%)]">{icon}</span>
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className="text-xs font-medium truncate">{value}</span>
    </div>
  );
}