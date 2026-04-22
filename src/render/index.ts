/**
 * Render Module - Multi-pass Rendering System for Infinigen R3F
 * 
 * This module provides comprehensive multi-pass rendering capabilities including:
 * - Multi-pass renderer with 12+ pass types
 * - AOV (Arbitrary Output Variable) management system
 * - Integration with Three.js renderers
 * 
 * @module render
 */

export {
  MultiPassRenderer,
  RenderPassType,
  PassConfig,
  RenderPassResult,
  MultiPassRenderResult,
  DEFAULT_PASS_CONFIGS,
} from './multi-pass-renderer';

export {
  AOVSystem,
  AOVDataType,
  AOVChannelConfig,
  AOVMetadata,
  AOVDescriptor,
  AOVConfig,
} from './aov-system';
