/**
 * Unit tests for Task Registry System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRegistry } from '../../pipeline/TaskRegistry';
import type { TaskMetadata, TaskFunction } from '../../pipeline/TaskRegistry';
import { Scene } from 'three';

describe('TaskRegistry', () => {
  let registry: TaskRegistry;
  let mockScene: Scene;

  beforeEach(() => {
    registry = TaskRegistry.getInstance();
    registry.clear();
    mockScene = new Scene();
  });

  describe('Registration', () => {
    it('should register a task successfully', () => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      const metadata: TaskMetadata = {
        name: 'testTask',
        description: 'Test task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      };

      registry.register('testTask', mockFn, metadata);
      
      expect(registry.has('testTask')).toBe(true);
    });

    it('should throw error when registering duplicate task', () => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      const metadata: TaskMetadata = {
        name: 'duplicateTask',
        description: 'Duplicate task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      };

      registry.register('duplicateTask', mockFn, metadata);
      
      expect(() => registry.register('duplicateTask', mockFn, metadata))
        .toThrow('already registered');
    });

    it('should reject task with invalid metadata (missing name)', () => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      const metadata = {
        name: '',
        description: 'Invalid task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      } as TaskMetadata;

      expect(() => registry.register('invalidTask', mockFn, metadata))
        .toThrow('non-empty name');
    });

    it('should unregister a task', () => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      const metadata: TaskMetadata = {
        name: 'unregisterTask',
        description: 'Task to unregister',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      };

      registry.register('unregisterTask', mockFn, metadata);
      expect(registry.has('unregisterTask')).toBe(true);

      const result = registry.unregister('unregisterTask');
      expect(result).toBe(true);
      expect(registry.has('unregisterTask')).toBe(false);
    });
  });

  describe('Discovery', () => {
    beforeEach(() => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      
      registry.register('renderTask', mockFn, {
        name: 'renderTask',
        description: 'Render scene frames',
        category: 'rendering',
        requiredParams: { outputFolder: 'path' },
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      registry.register('exportTask', mockFn, {
        name: 'exportTask',
        description: 'Export meshes',
        category: 'export',
        requiredParams: { outputFolder: 'path' },
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      registry.register('analyzeTask', mockFn, {
        name: 'analyzeTask',
        description: 'Analyze scene',
        category: 'analysis',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });
    });

    it('should get all task IDs', () => {
      const ids = registry.getAllTaskIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('renderTask');
      expect(ids).toContain('exportTask');
      expect(ids).toContain('analyzeTask');
    });

    it('should get tasks by category', () => {
      const renderingTasks = registry.getByCategory('rendering');
      expect(renderingTasks).toHaveLength(1);
      expect(renderingTasks[0]).toBe('renderTask');
    });

    it('should search tasks by keyword', () => {
      const results = registry.search('render');
      expect(results).toHaveLength(1);
      expect(results[0]).toBe('renderTask');
    });

    it('should get task metadata', () => {
      const metadata = registry.getMetadata('renderTask');
      expect(metadata.name).toBe('renderTask');
      expect(metadata.category).toBe('rendering');
    });
  });

  describe('Configuration', () => {
    beforeEach(() => {
      const mockFn: TaskFunction = async () => ({ data: {} });
      registry.register('configurableTask', mockFn, {
        name: 'configurableTask',
        description: 'Configurable task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });
    });

    it('should configure a task', () => {
      registry.configure('configurableTask', {
        params: { testParam: 'value' },
        enabled: true,
        priority: 5
      });

      const config = registry.getConfig('configurableTask');
      expect(config).toBeDefined();
      expect(config?.params.testParam).toBe('value');
      expect(config?.priority).toBe(5);
    });

    it('should throw error configuring non-existent task', () => {
      expect(() => registry.configure('nonExistent', {}))
        .toThrow('not found');
    });
  });

  describe('Execution', () => {
    it('should execute a task successfully', async () => {
      const mockFn: TaskFunction<{ value: number }> = async (scene, config) => ({
        data: { result: config.value * 2 }
      });

      registry.register('mathTask', mockFn, {
        name: 'mathTask',
        description: 'Math operation',
        category: 'test',
        requiredParams: { value: 'number' },
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const result = await registry.execute('mathTask', mockScene, { value: 5 });

      expect(result.success).toBe(true);
      expect(result.data.result).toBe(10);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should fail execution for missing required param', async () => {
      const mockFn: TaskFunction = async () => ({ data: {} });

      registry.register('requiredParamTask', mockFn, {
        name: 'requiredParamTask',
        description: 'Requires param',
        category: 'test',
        requiredParams: { input: 'string' },
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const result = await registry.execute('requiredParamTask', mockScene, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });

    it('should fail execution for wrong param type', async () => {
      const mockFn: TaskFunction = async () => ({ data: {} });

      registry.register('typeCheckTask', mockFn, {
        name: 'typeCheckTask',
        description: 'Type checking',
        category: 'test',
        requiredParams: { count: 'number' },
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const result = await registry.execute('typeCheckTask', mockScene, { count: 'not a number' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a number');
    });

    it('should handle task execution errors', async () => {
      const mockFn: TaskFunction = async () => {
        throw new Error('Task failed intentionally');
      };

      registry.register('failingTask', mockFn, {
        name: 'failingTask',
        description: 'Always fails',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const result = await registry.execute('failingTask', mockScene, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task failed intentionally');
    });

    it('should track execution count', async () => {
      const mockFn: TaskFunction = async () => ({ data: {} });

      registry.register('trackedTask', mockFn, {
        name: 'trackedTask',
        description: 'Tracked task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      await registry.execute('trackedTask', mockScene, {});
      await registry.execute('trackedTask', mockScene, {});

      const stats = registry.getStats();
      const task = stats.tasks.find((t: any) => t.id === 'trackedTask');
      expect(task.executionCount).toBe(2);
    });
  });

  describe('Batch Execution', () => {
    it('should execute multiple tasks in sequence', async () => {
      const mockFn1: TaskFunction = async () => ({ data: { step: 1 } });
      const mockFn2: TaskFunction = async () => ({ data: { step: 2 } });

      registry.register('step1', mockFn1, {
        name: 'step1',
        description: 'Step 1',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      registry.register('step2', mockFn2, {
        name: 'step2',
        description: 'Step 2',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const results = await registry.executeBatch(['step1', 'step2'], mockScene);

      expect(results.size).toBe(2);
      expect(results.get('step1')?.success).toBe(true);
      expect(results.get('step2')?.success).toBe(true);
    });

    it('should stop batch on failure', async () => {
      const successFn: TaskFunction = async () => ({ data: {} });
      const failFn: TaskFunction = async () => {
        throw new Error('Failure');
      };

      registry.register('success', successFn, {
        name: 'success',
        description: 'Success',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      registry.register('failure', failFn, {
        name: 'failure',
        description: 'Failure',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      const results = await registry.executeBatch(['success', 'failure'], mockScene);

      expect(results.get('success')?.success).toBe(true);
      expect(results.get('failure')?.success).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should export and import registry state', () => {
      const mockFn: TaskFunction = async () => ({ data: {} });

      registry.register('persistTask', mockFn, {
        name: 'persistTask',
        description: 'Persistent task',
        category: 'test',
        requiredParams: {},
        optionalParams: {},
        isAsync: true,
        version: '1.0.0'
      });

      registry.configure('persistTask', {
        params: { saved: true },
        enabled: true,
        priority: 10
      });

      const exported = registry.export();
      expect(exported).toContain('persistTask');

      registry.clear();
      registry.import(exported);

      const config = registry.getConfig('persistTask');
      expect(config?.params.saved).toBe(true);
    });
  });
});
