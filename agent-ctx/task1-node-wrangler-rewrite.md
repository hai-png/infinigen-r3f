# Task 1: NodeWrangler `new_node()` API Rewrite

## Summary

Added the full Python-compatible `new_node()` API to the TypeScript NodeWrangler at
`/home/z/my-project/infinigen-r3f/src/core/nodes/node-wrangler.ts`.

## Changes Made

### 1. New Imports
- `applyCompatibility`, `resolveAllDeferred`, `isSocketReference`, `CompatibilityResult`, `DeferredNodeSpec`
  from `./compatibility/CompatibilityLayer`

### 2. New Constants & Types (module-level)
- **`SINGLETON_NODES`**: `ReadonlySet<string>` containing node types that should only have one instance
  per group (`NodeGroupInput`, `NodeGroupOutput`, `ShaderNodeOutputMaterial`, `ShaderNodeOutputWorld`,
  `ShaderNodeOutputLight`, `CompositorNodeComposite`, `CompositorNodeViewer`)
- **`NodeInputItem`**: Exported union type for duck-typed input values (`NodeInstance | NodeSocket |
  [NodeInstance, string] | number | string | boolean | null | undefined | NodeInputItem[]`)

### 3. New Public Methods on `NodeWrangler`

#### `new_node()` — Full Python API parity
```typescript
new_node(
  nodeType: string,
  inputArgs?: NodeInputItem[],
  attrs?: Record<string, any>,
  inputKwargs?: Record<string, NodeInputItem>,
  label?: string,
  exposeInput?: Record<string, any> | boolean,
  compatMode?: boolean,
): NodeInstance
```
- **compatMode**: Applies CompatibilityLayer for deprecated nodes (MixRGB→Mix, etc.)
- **Singleton reuse**: Reuses existing GroupInput/GroupOutput/etc. instances
- **attrs**: Dot-path property assignment (e.g. `{operation: 'ADD'}`)
- **inputArgs**: Positional input connections by index
- **inputKwargs**: Named input connections
- **label**: Display label for the node
- **exposeInput**: Exposes inputs to the group interface

#### `new_value(v, label?)` — Value node with default
Creates a `ShaderNodeValue` with the output's `default_value` set.

#### `find_from(socket)` — Python `find_from()` parity
Traces connections backwards from an input socket.

#### `find_to(socket)` — Python `find_to()` parity
Traces connections forwards from an output socket.

### 4. New Private Methods

| Method | Purpose |
|--------|---------|
| `_makeNode(canonicalType)` | Create or reuse singleton node |
| `_inferInputSocket(node, socketRef)` | Resolve socket by name or index |
| `connectInput(inputSocket, inputItem)` | Duck-typed input resolution & connection |
| `_resolveInputItem(item)` | Classify input as link/value/none |
| `_findNodeForSocket(socket)` | Find owning node ID for a socket |
| `_isNodeInstance(value)` | Type guard for NodeInstance |
| `_isNodeSocket(value)` | Type guard for NodeSocket |
| `_exposeInputToGroup(node, name, val?)` | Create group interface input |

### Backward Compatibility
- All existing methods preserved: `newNode()`, `connect()`, `disconnect()`, `add()`, `multiply()`,
  `scalarAdd()`, `scalarMultiply()`, `sub()`, `scalarSub()`, `divide()`, `scalarDivide()`, `scale()`,
  `dot()`, `math()`, `vectorMath()`, `bernoulli()`, `uniform()`, `buildFloatCurve()`, `switch()`,
  `vectorSwitch()`, `compare()`, `compareDirection()`, `capture()`, `musgrave()`, `combine()`,
  `separate()`, `curve2mesh()`, `buildCase()`, `buildIndexCase()`, `find()`, `findRecursive()`,
  `findFrom()`, `findTo()`, `newValue()`, `booleanMath()`, `power()`, `scalarMax()`, `groupInput()`,
  `addNode()`, `link()`, `setInputValue()`, `findNodesByType()`, `topologicalSort()`, `evaluate()`,
  `getOutput()`, `evaluatePerVertex()`, `toJSON()`, `fromJSON()`, plus private helpers.

### Compilation
- `npx tsc --noEmit` passes with exit code 0
- All new code has full JSDoc documentation
