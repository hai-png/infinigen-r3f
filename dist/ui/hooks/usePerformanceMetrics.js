import { useState, useEffect, useCallback } from 'react';
/**
 * usePerformanceMetrics - Hook for monitoring real-time performance metrics
 */
export function usePerformanceMetrics(options) {
    const { autoStart = true, samplingInterval = 1000 } = options || {};
    const [metrics, setMetrics] = useState({
        fps: 60,
        frameTime: 16.67,
        memoryUsage: 0,
        objectCount: 0,
        drawCalls: 0,
        triangleCount: 0,
        solverIterationTime: 0,
        constraintEvaluationTime: 0,
    });
    const [isMonitoring, setIsMonitoring] = useState(autoStart);
    // FPS tracking
    const frameCountRef = useState(0)[0];
    const lastFpsUpdateRef = useState(Date.now())[0];
    // Update metrics
    const updateMetrics = useCallback((updates) => {
        setMetrics((prev) => ({ ...prev, ...updates }));
    }, []);
    // Simulate metrics collection (in real implementation, this would hook into Three.js renderer)
    useEffect(() => {
        if (!isMonitoring)
            return;
        const interval = setInterval(() => {
            // In a real implementation, these would come from actual measurements
            setMetrics((prev) => ({
                ...prev,
                fps: Math.round(55 + Math.random() * 10),
                frameTime: +(16 + Math.random() * 5).toFixed(2),
                memoryUsage: Math.round(50 + Math.random() * 20),
                objectCount: Math.round(100 + Math.random() * 50),
                drawCalls: Math.round(100 + Math.random() * 50),
                triangleCount: Math.round(10000 + Math.random() * 5000),
                solverIterationTime: +(0.5 + Math.random() * 2).toFixed(2),
                constraintEvaluationTime: +(0.1 + Math.random() * 0.5).toFixed(2),
            }));
        }, samplingInterval);
        return () => clearInterval(interval);
    }, [isMonitoring, samplingInterval]);
    // Start monitoring
    const startMonitoring = useCallback(() => {
        setIsMonitoring(true);
    }, []);
    // Stop monitoring
    const stopMonitoring = useCallback(() => {
        setIsMonitoring(false);
    }, []);
    // Toggle monitoring
    const toggleMonitoring = useCallback(() => {
        setIsMonitoring((prev) => !prev);
    }, []);
    // Reset metrics
    const resetMetrics = useCallback(() => {
        setMetrics({
            fps: 60,
            frameTime: 16.67,
            memoryUsage: 0,
            objectCount: 0,
            drawCalls: 0,
            triangleCount: 0,
            solverIterationTime: 0,
            constraintEvaluationTime: 0,
        });
    }, []);
    // Get performance rating
    const getPerformanceRating = useCallback(() => {
        if (metrics.fps >= 55)
            return 'excellent';
        if (metrics.fps >= 30)
            return 'good';
        if (metrics.fps >= 15)
            return 'fair';
        return 'poor';
    }, [metrics.fps]);
    // Check if performance is below threshold
    const isBelowThreshold = useCallback((threshold) => {
        return metrics.fps < threshold;
    }, [metrics.fps]);
    return {
        metrics,
        isMonitoring,
        updateMetrics,
        startMonitoring,
        stopMonitoring,
        toggleMonitoring,
        resetMetrics,
        getPerformanceRating,
        isBelowThreshold,
    };
}
//# sourceMappingURL=usePerformanceMetrics.js.map