/**
 * Vector Nodes Module Export
 * Includes both basic and extended vector operations (36 total nodes)
 */
export { 
// Basic Node Classes (6)
VectorMathNode, VectorRotateNode, CombineXYZNode, SeparateXYZNode, NormalizeNode, MappingNode, 
// Extended Node Classes (30)
VectorTransformNode, NormalMapNode, BumpNode, DisplacementNode, AlignEulerToVectorNode, RotateEulerNode, QuaternionNode, MatrixTransformNode, DirectionToPointNode, ReflectNode, RefractNode, FaceForwardNode, WrapNode, SnapNode, FloorCeilNode, ModuloNode, FractionNode, AbsoluteNode, MinMaxNode, TrigonometryNode, PowerLogNode, SignNode, CompareNode, SmoothMinMaxNode, AngleBetweenNode, SlerpNode, PolarToCartNode, CartToPolarNode, 
// Factory Functions (Basic)
createVectorMathNode, createVectorRotateNode, createCombineXYZNode, createSeparateXYZNode, createNormalizeNode, createMappingNode, } from './VectorNodes';
// Re-export extended nodes
export { VectorTransformNode, NormalMapNode, BumpNode, DisplacementNode, AlignEulerToVectorNode, RotateEulerNode, QuaternionNode, MatrixTransformNode, DirectionToPointNode, ReflectNode, RefractNode, FaceForwardNode, WrapNode, SnapNode, FloorCeilNode, ModuloNode, FractionNode, AbsoluteNode, MinMaxNode, TrigonometryNode, PowerLogNode, SignNode, CompareNode, SmoothMinMaxNode, AngleBetweenNode, SlerpNode, PolarToCartNode, CartToPolarNode, } from './VectorNodesExtended';
//# sourceMappingURL=index.js.map