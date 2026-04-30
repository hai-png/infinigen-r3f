/**
 * Rendering Task Registry - Re-export from datagen/pipeline for compatibility
 * 
 * Files importing from './TaskRegistry' in the rendering module
 * will find the task registry types here.
 */

export {
  TaskRegistry,
  taskRegistry,
  TaskFunction,
  TaskResult,
  TaskConfig,
  TaskMetadata,
  TaskParamType,
} from '../../datagen/pipeline/TaskRegistry';
