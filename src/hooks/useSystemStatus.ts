import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/providers/trpc";

export function useSystemStatus() {
  const { data: status, isLoading } = trpc.system.getStatus.useQuery();

  return {
    status: status || {
      loopOpen: true,
      frameRate: 1000,
      currentStrehl: 0.84,
      currentRms: 0.142,
      estimatedR0: 0.152,
      estimatedTau0: 0.0084,
      estimatedWind: 12.3,
      dmVoltageRms: 0.5,
      nActuatorsClipped: 2,
      spgdActive: false,
      spgdIteration: 0,
      spgdPerformance: 0,
    },
    isLoading,
  };
}
