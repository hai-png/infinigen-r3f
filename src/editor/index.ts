/**
 * Editor Module Exports
 *
 * Only the unified editor and scene wireup are exported.
 * The legacy standalone editors (SceneEditor, NodeGraphEditor, etc.)
 * have been removed — their functionality is in the unified editor.
 */

// Scene Wireup (used by unified EditorContext)
export { SceneWireup, applyMaterialToScene, applyGeometryToScene, applyTextureToScene } from './SceneWireup';
export type { ApplyResult, AppliedEntry, TextureMapSlot } from './SceneWireup';

// ---- Unified Editor ----
export { EditorProvider, useEditor } from './unified/EditorContext';
export type {
  CenterViewMode,
  LeftTab,
  RightTab,
  BottomTab,
  SceneObject as UnifiedSceneObject,
  PBRMaterialState,
  TerrainParams,
  ConstraintEntry,
  Keyframe,
  ParticleSystemConfig,
  CameraRig,
  PerformanceMetrics as EditorPerformanceMetrics,
  LogEntry,
  EditorState,
  EditorContextValue,
} from './unified/EditorContext';

export { default as InfinigenEditor } from './unified/InfinigenEditor';

// Node graph constants (category colors, socket colors, node data type)
export {
  CATEGORY_COLORS,
  SOCKET_COLORS,
  type InfinigenNodeData,
} from './unified/nodeGraphConstants';
