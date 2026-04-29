/**
 * Render Task Implementation for Infinigen R3F
 *
 * Implements the main render task with multi-frame support,
 * matching the functionality of the original Python render() function.
 *
 * @module rendering
 */
import { Scene } from 'three';
import { TaskFunction, TaskResult } from './TaskRegistry';
import type { TaskMetadata } from './TaskRegistry';
/**
 * Configuration parameters for the render task
 */
export interface RenderConfig {
    /** Output folder path for rendered frames */
    outputFolder: string;
    /** Frame range [start, end] */
    frameRange?: [number, number];
    /** Current frame number (for animation) */
    currentFrame?: number;
    /** Resample index for stochastic resampling */
    resampleIdx?: number | null;
    /** Whether to hide water during render */
    hideWater?: boolean;
    /** Resolution [width, height] */
    resolution?: [number, number];
    /** File format ('png', 'jpg', 'exr') */
    format?: string;
    /** Quality settings */
    quality?: number;
}
/**
 * Main render task function registered with TaskRegistry
 */
export declare const renderTask: TaskFunction<RenderConfig>;
/**
 * Task metadata for registration
 */
export declare const renderTaskMetadata: TaskMetadata;
/**
 * Register the render task with the global registry
 */
export declare function registerRenderTask(): void;
/**
 * Convenience function to execute render task directly
 */
export declare function executeRender(scene: Scene, config: RenderConfig): Promise<TaskResult>;
export type { RenderConfig };
//# sourceMappingURL=RenderTask.d.ts.map