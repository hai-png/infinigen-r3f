/**
 * Collection Nodes Module Export
 * Collection instancing, object information, and hierarchy access
 */

export {
  // Node Classes
  CollectionInfoNode,
  ObjectInfoNode,
  InstanceOnPointsNode,
  DuplicateElementsNode,
  ChildrenOfSceneNode,

  // Type Definitions
  type CollectionNodeBase,
  type CollectionInfoInputs,
  type CollectionInfoOutputs,
  type ObjectInfoInputs,
  type ObjectInfoOutputs,
  type InstanceOnPointsInputs,
  type InstanceOnPointsOutputs,
  type DuplicateElementsInputs,
  type DuplicateElementsOutputs,
  type ChildrenOfSceneInputs,
  type ChildrenOfSceneOutputs,

  // Factory Functions
  createCollectionInfoNode,
  createObjectInfoNode,
  createInstanceOnPointsNode,
  createDuplicateElementsNode,
  createChildrenOfSceneNode,
} from './CollectionNodes';
