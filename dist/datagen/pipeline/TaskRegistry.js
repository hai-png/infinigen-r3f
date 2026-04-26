/**
 * Task Registry System for Infinigen R3F
 *
 * Provides a centralized registry for task functions with configuration support,
 * discovery mechanisms, and validation.
 *
 * @module pipeline
 */
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
export class TaskRegistry {
    constructor() {
        this.tasks = new Map();
        this.configs = new Map();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TaskRegistry.instance) {
            TaskRegistry.instance = new TaskRegistry();
        }
        return TaskRegistry.instance;
    }
    /**
     * Register a new task function
     *
     * @param taskId - Unique identifier for the task
     * @param fn - Task implementation function
     * @param metadata - Task metadata
     * @throws Error if task already exists or metadata is invalid
     */
    register(taskId, fn, metadata) {
        if (this.tasks.has(taskId)) {
            throw new Error(`Task "${taskId}" is already registered`);
        }
        this.validateMetadata(metadata);
        this.tasks.set(taskId, {
            metadata,
            fn,
            createdAt: new Date(),
            executionCount: 0
        });
        console.log(`[TaskRegistry] Registered task: ${taskId}`);
    }
    /**
     * Unregister a task
     *
     * @param taskId - ID of task to unregister
     * @returns true if task was removed, false if not found
     */
    unregister(taskId) {
        return this.tasks.delete(taskId);
    }
    /**
     * Check if a task is registered
     */
    has(taskId) {
        return this.tasks.has(taskId);
    }
    /**
     * Get task metadata
     *
     * @throws Error if task not found
     */
    getMetadata(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task "${taskId}" not found`);
        }
        return task.metadata;
    }
    /**
     * Get all registered task IDs
     */
    getAllTaskIds() {
        return Array.from(this.tasks.keys());
    }
    /**
     * Get tasks by category
     */
    getByCategory(category) {
        return Array.from(this.tasks.entries())
            .filter(([_, task]) => task.metadata.category === category)
            .map(([id, _]) => id);
    }
    /**
     * Search tasks by keyword
     */
    search(keyword) {
        const lowerKeyword = keyword.toLowerCase();
        return Array.from(this.tasks.entries())
            .filter(([_, task]) => task.metadata.name.toLowerCase().includes(lowerKeyword) ||
            task.metadata.description.toLowerCase().includes(lowerKeyword) ||
            task.metadata.category.toLowerCase().includes(lowerKeyword))
            .map(([id, _]) => id);
    }
    /**
     * Configure a task with parameters
     */
    configure(taskId, config) {
        if (!this.tasks.has(taskId)) {
            throw new Error(`Task "${taskId}" not found`);
        }
        const existing = this.configs.get(taskId) || {
            taskId,
            params: {},
            enabled: true,
            priority: 0
        };
        this.configs.set(taskId, { ...existing, ...config });
    }
    /**
     * Get task configuration
     */
    getConfig(taskId) {
        return this.configs.get(taskId);
    }
    /**
     * Execute a registered task
     *
     * @param taskId - ID of task to execute
     * @param scene - Three.js scene
     * @param params - Task parameters
     * @returns Task execution result
     * @throws Error if task not found or validation fails
     */
    async execute(taskId, scene, params) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return {
                success: false,
                error: `Task "${taskId}" not found`,
                executionTime: 0,
                warnings: [],
                metadata: {}
            };
        }
        // Validate parameters
        const validationError = this.validateParams(taskId, params);
        if (validationError) {
            return {
                success: false,
                error: validationError,
                executionTime: 0,
                warnings: [],
                metadata: {}
            };
        }
        const startTime = performance.now();
        const warnings = [];
        try {
            const result = await task.fn(scene, params);
            const executionTime = performance.now() - startTime;
            task.executionCount++;
            task.lastExecuted = new Date();
            return {
                success: true,
                data: result.data,
                executionTime,
                warnings: [...warnings, ...(result.warnings || [])],
                metadata: {
                    ...result.metadata,
                    taskId,
                    executedAt: new Date().toISOString()
                }
            };
        }
        catch (error) {
            const executionTime = performance.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: errorMessage,
                executionTime,
                warnings,
                metadata: {
                    taskId,
                    executedAt: new Date().toISOString()
                }
            };
        }
    }
    /**
     * Execute multiple tasks in sequence
     */
    async executeBatch(taskIds, scene, paramsMap = {}) {
        const results = new Map();
        for (const taskId of taskIds) {
            const params = paramsMap[taskId] || {};
            const result = await this.execute(taskId, scene, params);
            results.set(taskId, result);
            if (!result.success) {
                console.error(`[TaskRegistry] Batch execution failed at task: ${taskId}`);
                break;
            }
        }
        return results;
    }
    /**
     * Get execution statistics
     */
    getStats() {
        const stats = {
            totalTasks: this.tasks.size,
            configuredTasks: this.configs.size,
            tasks: []
        };
        this.tasks.forEach((task, id) => {
            stats.tasks.push({
                id,
                category: task.metadata.category,
                executionCount: task.executionCount,
                lastExecuted: task.lastExecuted?.toISOString(),
                isAsync: task.metadata.isAsync
            });
        });
        return stats;
    }
    /**
     * Clear all registered tasks (useful for testing)
     */
    clear() {
        this.tasks.clear();
        this.configs.clear();
    }
    /**
     * Export registry state to JSON
     */
    export() {
        const state = {
            tasks: Array.from(this.tasks.entries()).map(([id, task]) => ({
                id,
                metadata: task.metadata,
                executionCount: task.executionCount,
                lastExecuted: task.lastExecuted?.toISOString()
            })),
            configs: Array.from(this.configs.entries())
        };
        return JSON.stringify(state, null, 2);
    }
    /**
     * Import registry state from JSON
     */
    import(json) {
        const state = JSON.parse(json);
        // Note: This only restores metadata and configs, not actual functions
        state.tasks.forEach((taskData) => {
            if (this.tasks.has(taskData.id)) {
                const task = this.tasks.get(taskData.id);
                task.executionCount = taskData.executionCount;
                if (taskData.lastExecuted) {
                    task.lastExecuted = new Date(taskData.lastExecuted);
                }
            }
        });
        state.configs.forEach(([id, config]) => {
            this.configs.set(id, config);
        });
    }
    /**
     * Validate task metadata
     */
    validateMetadata(metadata) {
        if (!metadata.name || metadata.name.trim() === '') {
            throw new Error('Task metadata must include a non-empty name');
        }
        if (!metadata.description) {
            throw new Error('Task metadata must include a description');
        }
        if (!metadata.category) {
            throw new Error('Task metadata must include a category');
        }
        if (!metadata.version) {
            throw new Error('Task metadata must include a version');
        }
        // Validate parameter types
        const validTypes = ['number', 'string', 'boolean', 'array', 'object', 'scene', 'camera', 'path'];
        for (const [param, type] of Object.entries(metadata.requiredParams)) {
            if (!validTypes.includes(type)) {
                throw new Error(`Invalid type "${type}" for required parameter "${param}"`);
            }
        }
        for (const [param, config] of Object.entries(metadata.optionalParams)) {
            if (!validTypes.includes(config.type)) {
                throw new Error(`Invalid type "${config.type}" for optional parameter "${param}"`);
            }
        }
    }
    /**
     * Validate task parameters against metadata
     */
    validateParams(taskId, params) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return `Task "${taskId}" not found`;
        }
        const { requiredParams, optionalParams } = task.metadata;
        // Check required parameters
        for (const [param, type] of Object.entries(requiredParams)) {
            if (!(param in params)) {
                return `Missing required parameter: "${param}"`;
            }
            const typeError = this.checkType(params[param], type, param);
            if (typeError) {
                return typeError;
            }
        }
        // Check optional parameter types
        for (const [param, config] of Object.entries(optionalParams)) {
            if (param in params) {
                const typeError = this.checkType(params[param], config.type, param);
                if (typeError) {
                    return typeError;
                }
            }
        }
        return null;
    }
    /**
     * Check if value matches expected type
     */
    checkType(value, expectedType, paramName) {
        switch (expectedType) {
            case 'number':
                if (typeof value !== 'number') {
                    return `Parameter "${paramName}" must be a number`;
                }
                break;
            case 'string':
                if (typeof value !== 'string') {
                    return `Parameter "${paramName}" must be a string`;
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    return `Parameter "${paramName}" must be a boolean`;
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    return `Parameter "${paramName}" must be an array`;
                }
                break;
            case 'object':
                if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                    return `Parameter "${paramName}" must be an object`;
                }
                break;
            case 'path':
                if (typeof value !== 'string') {
                    return `Parameter "${paramName}" must be a path (string)`;
                }
                break;
            case 'scene':
            case 'camera':
                // These are validated at runtime
                break;
        }
        return null;
    }
}
// Export singleton instance
export const taskRegistry = TaskRegistry.getInstance();
//# sourceMappingURL=TaskRegistry.js.map