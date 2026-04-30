/**
 * Vector Nodes Module Export
 * Includes both basic and extended vector operations (36 total nodes)
 */

// Basic nodes and all type definitions from VectorNodes
export {
  // Basic Node Classes (6)
  VectorMathNode,
  VectorRotateNode,
  CombineXYZNode,
  SeparateXYZNode,
  NormalizeNode,
  MappingNode,
  
  // Factory Functions (Basic)
  createVectorMathNode,
  createVectorRotateNode,
  createCombineXYZNode,
  createSeparateXYZNode,
  createNormalizeNode,
  createMappingNode,
} from './VectorNodes';

export type {
  // Type Definitions (Basic)
  VectorNodeBase,
  VectorMathInputs,
  VectorMathOutputs,
  VectorRotateInputs,
  VectorRotateOutputs,
  MappingInputs,
  MappingOutputs,
  CombineXYZInputs,
  CombineXYZOutputs,
  SeparateXYZInputs,
  SeparateXYZOutputs,
  NormalizeInputs,
  NormalizeOutputs,
  // Note: VectorTransformInputs/Outputs, NormalMapInputs/Outputs etc defined in VectorNodes
  // but also used/extended in VectorNodesExtended — export from VectorNodes only for base types
} from './VectorNodes';

// Extended Node Classes (30) - from VectorNodesExtended
export {
  VectorTransformNode,
  NormalMapNode,
  BumpNode,
  DisplacementNode,
  AlignEulerToVectorNode,
  RotateEulerNode,
  QuaternionNode,
  MatrixTransformNode,
  DirectionToPointNode,
  ReflectNode,
  RefractNode,
  FaceForwardNode,
  WrapNode,
  SnapNode,
  FloorCeilNode,
  ModuloNode,
  FractionNode,
  AbsoluteNode,
  MinMaxNode,
  TrigonometryNode,
  PowerLogNode,
  SignNode,
  CompareNode,
  SmoothMinMaxNode,
  AngleBetweenNode,
  SlerpNode,
  PolarToCartNode,
  CartToPolarNode,
} from './VectorNodesExtended';

// Extended Type Definitions
export type {
  MatrixTransformInputs,
  MatrixTransformOutputs,
  DirectionToPointInputs,
  DirectionToPointOutputs,
  ReflectInputs,
  ReflectOutputs,
  RefractInputs,
  RefractOutputs,
  FaceForwardInputs,
  FaceForwardOutputs,
  WrapInputs,
  WrapOutputs,
  SnapInputs,
  SnapOutputs,
  FloorCeilInputs,
  FloorCeilOutputs,
  ModuloInputs,
  ModuloOutputs,
  FractionInputs,
  FractionOutputs,
  AbsoluteInputs,
  AbsoluteOutputs,
  MinMaxInputs,
  MinMaxOutputs,
  TrigonometryInputs,
  TrigonometryOutputs,
  PowerLogInputs,
  PowerLogOutputs,
  SignInputs,
  SignOutputs,
  CompareInputs,
  CompareOutputs,
  SmoothMinMaxInputs,
  SmoothMinMaxOutputs,
  AngleBetweenInputs,
  AngleBetweenOutputs,
  SlerpInputs,
  SlerpOutputs,
  PolarToCartInputs,
  PolarToCartOutputs,
  CartToPolarInputs,
  CartToPolarOutputs,
} from './VectorNodesExtended';
