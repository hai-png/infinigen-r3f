/**
 * Task Registry System for Infinigen R3F
 *
 * Provides a centralized registry for task functions with configuration support,
 * discovery mechanisms, and validation.
 *
 * @module pipeline
 */
import type { Scene } from 'three';
/**
 * Metadata associated with a registered task
 */
export interface TaskMetadata {
    /** Unique identifier for the task */
    name: string;
    /** Human-readable description */
    description: string;
    /** Category (rendering, export, analysis, etc.) */
    category: string;
    /** Required parameters with types */
    requiredParams: Record<string, TaskParamType>;
    /** Optional parameters with defaults */
    optionalParams: Record<string, {
        type: TaskParamType;
        default: any;
    }>;
    /** Whether task supports async execution */
    isAsync: boolean;
    /** Estimated execution time in seconds */
    estimatedDuration?: number;
    /** Dependencies on other tasks */
    dependencies?: string[];
    /** Version of the task implementation */
    version: string;
}
/**
 * Supported parameter types for tasks
 */
export type TaskParamType = 'number' | 'string' | 'boolean' | 'array' | 'object' | 'scene' | 'camera' | 'path';
/**
 * Configuration binding for a task
 */
export interface TaskConfig {
    taskId: string;
    params: Record<string, any>;
    enabled: boolean;
    priority: number;
}
/**
 * Function signature for task implementations
 */
export type TaskFunction<T extends Record<string, any> = Record<string, any>> = (scene: Scene, config: T) => Promise<TaskResult> | TaskResult;
/**
 * Result returned by task execution
 */
export interface TaskResult {
    /** Success status */
    success: boolean;
    /** Output data from the task */
    data?: any;
    /** Error message if failed */
    error?: string;
    /** Execution time in milliseconds */
    executionTime: number;
    /** Warnings generated during execution */
    warnings: string[];
    /** Metadata about the execution */
    metadata: Record<string, any>;
}
/**
 * Singleton Task Registry for managing task functions
 *
 * Features:
 * - Task registration and discovery
 * - Configuration binding
 * - Type validation
 * - Execution tracking
 *
 * @example
 * ```typescript
 * // Register a task
 * TaskRegistry.register('render', renderTask, {
 *   name: 'render',
 *   description: 'Render scene frames',
 *   category: 'rendering',
 *   requiredParams: { outputFolder: 'path' },
 *   optionalParams: { frameRange: { type: 'array', default: [1, 100] } },
 *   isAsync: true,
 *   version: '1.0.0'
 * });
 *
 * // Execute a task
 * const result = await TaskRegistry.execute('render', scene, {
 *   outputFolder: '/output/render',
 *   frameRange: [1, 50]
 * });
 * ```
 */
export declare class TaskRegistry {
    private static instance;
    private tasks;
    private configs;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TaskRegistry;
    /**
     * Register a new task function
     *
     * @param taskId - Unique identifier for the task
     * @param fn - Task implementation function
     * @param metadata - Task metadata
     * @throws Error if task already exists or metadata is invalid
     */
    register(taskId: string, fn: TaskFunction, metadata: TaskMetadata): void;
    /**
     * Unregister a task
     *
     * @param taskId - ID of task to unregister
     * @returns true if task was removed, false if not found
     */
    unregister(taskId: string): boolean;
    /**
     * Check if a task is registered
     */
    has(taskId: string): boolean;
    /**
     * Get task metadata
     *
     * @throws Error if task not found
     */
    getMetadata(taskId: string): TaskMetadata;
    /**
     * Get all registered task IDs
     */
    getAllTaskIds(): string[];
    /**
     * Get tasks by category
     */
    getByCategory(category: string): string[];
    /**
     * Search tasks by keyword
     */
    search(keyword: string): string[];
    /**
     * Configure a task with parameters
     */
    configure(taskId: string, config: Partial<TaskConfig>): void;
    /**
     * Get task configuration
     */
    getConfig(taskId: string): TaskConfig | undefined;
    /**
     * Execute a registered task
     *
     * @param taskId - ID of task to execute
     * @param scene - Three.js scene
     * @param params - Task parameters
     * @returns Task execution result
     * @throws Error if task not found or validation fails
     */
    execute<T extends Record<string, any>>(taskId: string, scene: Scene, params: T): Promise<TaskResult>;
    /**
     * Execute multiple tasks in sequence
     */
    executeBatch(taskIds: string[], scene: Scene, paramsMap?: Record<string, any>): Promise<Map<string, TaskResult>>;
    /**
     * Get execution statistics
     */
    getStats(): Record<string, any>;
    /**
     * Clear all registered tasks (useful for testing)
     */
    clear(): void;
    /**
     * Export registry state to JSON
     */
    export(): string;
    /**
     * Import registry state from JSON
     */
    import(json: string): void;
    /**
     * Validate task metadata
     */
    private validateMetadata;
    /**
     * Validate task parameters against metadata
     */
    private validateParams;
    /**
     * Check if value matches expected type
     */
    private checkType;
}
export declare const taskRegistry: TaskRegistry;
export type { TaskFunction, TaskResult, TaskConfig, TaskMetadata, TaskParamType };
//# sourceMappingURL=TaskRegistry.d.ts.map