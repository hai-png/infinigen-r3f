import { PerformanceMetrics } from '../types';
/**
 * usePerformanceMetrics - Hook for monitoring real-time performance metrics
 */
export declare function usePerformanceMetrics(options?: {
    autoStart?: boolean;
    samplingInterval?: number;
}): {
    metrics: PerformanceMetrics;
    isMonitoring: boolean;
    updateMetrics: (updates: Partial<PerformanceMetrics>) => void;
    startMonitoring: () => void;
    stopMonitoring: () => void;
    toggleMonitoring: () => void;
    resetMetrics: () => void;
    getPerformanceRating: () => "excellent" | "good" | "fair" | "poor";
    isBelowThreshold: (threshold: number) => boolean;
};
//# sourceMappingURL=usePerformanceMetrics.d.ts.map