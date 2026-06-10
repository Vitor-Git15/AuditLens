// Simulated MCTS evolution data for streaming testing
export interface EvolutionDataPoint {
  iteration: number;
  top1Quality: number;
  top10AvgQuality: number;
  top1Contrast: number;
  top10AvgContrast: number;
}

export const mockEvolutionData: EvolutionDataPoint[] = Array.from({ length: 50 }, (_, i) => {
  // Simulate logarithmic growth with some noise for quality
  const progress = i / 50;
  const baseQuality = 0.3 + (0.6 * Math.log(1 + progress * 5) / Math.log(6));
  
  // Contrast has more variance
  const baseContrast = 0.1 + (0.4 * progress) + (Math.random() * 0.1);

  return {
    iteration: i + 1,
    top1Quality: Math.min(1.0, baseQuality + Math.random() * 0.05),
    top10AvgQuality: Math.min(1.0, baseQuality - 0.05 + Math.random() * 0.02),
    top1Contrast: baseContrast,
    top10AvgContrast: Math.max(0, baseContrast - 0.1)
  };
});

export interface SliceData {
  id: string;
  mu0: number; // Mean error class 0
  mu1: number; // Mean error class 1
  sigma0: number; // Variance/Std error class 0
  sigma1: number; // Variance/Std error class 1
}

export const mockSlicesData: Record<string, SliceData> = {
  'slice-a': { id: 'slice-a', mu0: 0.15, mu1: 0.85, sigma0: 0.05, sigma1: 0.10 },
  'slice-b': { id: 'slice-b', mu0: 0.40, mu1: 0.50, sigma0: 0.12, sigma1: 0.08 },
  'slice-c': { id: 'slice-c', mu0: 0.80, mu1: 0.20, sigma0: 0.07, sigma1: 0.05 },
};
