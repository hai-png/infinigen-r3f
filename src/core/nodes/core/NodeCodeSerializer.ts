/**
 * Node Code Serializer / Transpiler
 *
 * Converts a NodeWrangler instance's node graph into valid TypeScript code
 * that, when executed, recreates the same graph using the NodeWrangler API.
 *
 * This enables:
 * - Persisting graphs as executable code (not just JSON)
 * - Generating reproducible procedural material/geometry setups
 * - Round-trip testing: build graph → serialize → execute → verify
 *
 * Usage:
 *   const nw = new NodeWrangler();
 *   const node1 = nw.newNode(NodeTypes.TextureCoord);
 *   const node2 = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 5.0 });
 *   nw.connect(node1, 'UV', node2, 'Vector');
 *
 *   const serializer = new NodeCodeSerializer();
 *   const code = serializer.serialize(nw);
 *   // code is a TypeScript function that recreates this graph
 */

import {
  NodeWrangler,
  NodeInstance,
  NodeLink,
  NodeGroup,
} from './node-wrangler';
import { NodeTypes } from './node-types';
import { NodeSocket } from './socket-types';
import { nodeDefinitionRegistry } from './node-definition-registry';

// ============================================================================
// Types
// ============================================================================

export interface CodeSerializerOptions {
  /** Function name for the generated builder function */
  functionName?: string;
  /** Include comments in the generated code */
  includeComments?: boolean;
  /** Include node location information */
  includeLocations?: boolean;
  /** Indent string (default: 2 spaces) */
  indent?: string;
  /** Import path for NodeWrangler and NodeTypes */
  importPath?: string;
  /** Name of the NodeWrangler parameter in the generated function */
  wranglerParamName?: string;
}

const DEFAULT_OPTIONS: Required<CodeSerializerOptions> = {
  functionName: 'buildGraph',
  includeComments: true,
  includeLocations: false,
  indent: '  ',
  importPath: './core/nodes',
  wranglerParamName: 'nw',
};

// ============================================================================
// Reverse mapping: type string → NodeTypes enum key
// ============================================================================

const typeStringToEnumKey = new Map<string, string>();

(function buildReverseMap() {
  // Set of keys that are aliases (SCREAMING_SNAKE_CASE, CamelCase aliases,
  // or duplicate references). We want to prefer the primary PascalCase key
  // that matches the enum string value pattern (e.g. 'TextureNoise' for 'TextureNoiseNode').
  const aliasKeys = new Set([
    // SCREAMING_SNAKE_CASE aliases
    'VECTOR_MATH', 'TEX_COORD', 'TEX_NOISE', 'NORMAL_MAP', 'MAPPING',
    'LINE_OUTPUT', 'LOD_GROUP_OUTPUT', 'LAYER_WEIGHT', 'BUMP',
    'COMPOSITE_OUTPUT', 'AMBIENT_OCCLUSION_OUTPUT', 'COLOR_RAMP',
    'OUTPUT_NORMAL', 'OUTPUT_COLOR', 'OUTPUT_VECTOR', 'OUTPUT_MATERIAL',
    'OUTPUT_VALUE', 'BSDF_PRINCIPLED', 'INVERT', 'BOOLEAN_MATH',
    // CamelCase aliases pointing to other keys
    'NoiseTexture', 'VoronoiTexture', 'MusgraveTexture',
    'CompositeOutput', 'LODGroupOutput', 'AmbientOcclusionOutput', 'LineOutput',
    // Input aliases
    'PositionInput', 'NormalInput', 'TangentInput',
    'UVMapInput', 'ColorInput', 'RadiusInput', 'IdInput', 'IndexInput',
  ]);

  for (const [key, value] of Object.entries(NodeTypes)) {
    // value is the string like 'TextureNoiseNode'
    // key is the enum key like 'TextureNoise'
    // Skip aliases – prefer the primary key
    if (aliasKeys.has(key)) continue;
    typeStringToEnumKey.set(String(value), key);
  }

  // Now fill in aliases only if no primary key exists yet
  for (const [key, value] of Object.entries(NodeTypes)) {
    if (!typeStringToEnumKey.has(String(value))) {
      typeStringToEnumKey.set(String(value), key);
    }
  }
})();

// ============================================================================
// NodeCodeSerializer
// ============================================================================

export class NodeCodeSerializer {
  private options: Required<CodeSerializerOptions>;

  constructor(options: Partial<CodeSerializerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Serialize a NodeWrangler's active group graph to a TypeScript string.
   *
   * Produces a self-contained TypeScript module with a single exported function
   * that, when called with a NodeWrangler instance, recreates the graph.
   */
  serialize(wrangler: NodeWrangler): string {
    const group = wrangler.getActiveGroup();
    return this.serializeGroup(group);
  }

  /**
   * Serialize only the nodes (no connections) to a TypeScript string.
   * Useful for generating node creation snippets.
   */
  serializeNodesOnly(wrangler: NodeWrangler): string {
    const group = wrangler.getActiveGroup();
    const lines: string[] = [];
    const varNames = new Map<string, string>();
    const nw = this.options.wranglerParamName;

    const sortedNodeIds = this.topologicalSort(group);

    for (const nodeId of sortedNodeIds) {
      const node = group.nodes.get(nodeId);
      if (!node) continue;

      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);

      lines.push(this.generateNodeDeclaration(node, varName, nw));
    }

    return lines.join('\n');
  }

  /**
   * Generate the function body only (no imports, no function wrapper, no TypeScript
   * type annotations). This is suitable for runtime evaluation with `new Function()`.
   */
  generateFunctionBody(wrangler: NodeWrangler): string {
    const group = wrangler.getActiveGroup();
    const lines: string[] = [];
    const nw = this.options.wranglerParamName;
    const varNames = new Map<string, string>();

    // Topological sort for correct ordering
    const sortedNodeIds = this.topologicalSort(group);

    // Node declarations
    for (const nodeId of sortedNodeIds) {
      const node = group.nodes.get(nodeId);
      if (!node) continue;

      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);

      if (this.options.includeComments) {
        lines.push(`// ${node.name} (${node.type})`);
      }

      lines.push(this.generateNodeDeclaration(node, varName, nw));
    }

    lines.push('');

    // Input value overrides
    const inputOverrides = this.collectInputOverrides(group, varNames);
    for (const override of inputOverrides) {
      lines.push(override);
    }

    if (inputOverrides.length > 0) {
      lines.push('');
    }

    // Connections
    if (this.options.includeComments && group.links.size > 0) {
      lines.push('// Connections');
    }

    for (const link of group.links.values()) {
      const fromVar = varNames.get(link.fromNode);
      const toVar = varNames.get(link.toNode);
      if (!fromVar || !toVar) continue;

      lines.push(
        `${nw}.connect(${fromVar}, '${link.fromSocket}', ${toVar}, '${link.toSocket}');`
      );
    }

    // Return the last node (or output node)
    const outputNodeId = this.findOutputNode(group);
    if (outputNodeId) {
      const returnVar = varNames.get(outputNodeId);
      if (returnVar) {
        lines.push('');
        lines.push(`return ${returnVar};`);
      }
    } else if (sortedNodeIds.length > 0) {
      const lastVar = varNames.get(sortedNodeIds[sortedNodeIds.length - 1]);
      if (lastVar) {
        lines.push('');
        lines.push(`return ${lastVar};`);
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Core Serialization
  // ==========================================================================

  private serializeGroup(group: NodeGroup): string {
    const lines: string[] = [];
    const ind = this.options.indent;
    const nw = this.options.wranglerParamName;
    const varNames = new Map<string, string>();

    // --- Import statements ---
    lines.push(`import { NodeWrangler, NodeTypes } from '${this.options.importPath}';`);
    lines.push('');

    // --- Function signature ---
    if (this.options.includeComments) {
      lines.push('/**');
      lines.push(` * Build a node graph programmatically.`);
      lines.push(` * @param ${nw} - NodeWrangler instance to build the graph on`);
      lines.push(' */');
    }
    lines.push(`export function ${this.options.functionName}(${nw}: NodeWrangler) {`);

    // --- Topological sort for correct ordering ---
    const sortedNodeIds = this.topologicalSort(group);

    // --- Node declarations ---
    for (const nodeId of sortedNodeIds) {
      const node = group.nodes.get(nodeId);
      if (!node) continue;

      const varName = this.deriveVarName(node, varNames);
      varNames.set(nodeId, varName);

      if (this.options.includeComments) {
        lines.push(`${ind}// ${node.name} (${node.type})`);
      }

      lines.push(this.indent(this.generateNodeDeclaration(node, varName, nw)));
    }

    lines.push('');

    // --- Input value overrides ---
    const inputOverrides = this.collectInputOverrides(group, varNames);
    for (const override of inputOverrides) {
      lines.push(this.indent(override));
    }

    if (inputOverrides.length > 0) {
      lines.push('');
    }

    // --- Connections ---
    if (this.options.includeComments && group.links.size > 0) {
      lines.push(this.indent('// Connections'));
    }

    for (const link of group.links.values()) {
      const fromVar = varNames.get(link.fromNode);
      const toVar = varNames.get(link.toNode);
      if (!fromVar || !toVar) continue;

      lines.push(
        this.indent(
          `${nw}.connect(${fromVar}, '${link.fromSocket}', ${toVar}, '${link.toSocket}');`
        )
      );
    }

    // --- Return the last node (or output node) ---
    const outputNodeId = this.findOutputNode(group);
    if (outputNodeId) {
      const returnVar = varNames.get(outputNodeId);
      if (returnVar) {
        lines.push('');
        lines.push(this.indent(`return ${returnVar};`));
      }
    } else if (sortedNodeIds.length > 0) {
      const lastVar = varNames.get(sortedNodeIds[sortedNodeIds.length - 1]);
      if (lastVar) {
        lines.push('');
        lines.push(this.indent(`return ${lastVar};`));
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  // ==========================================================================
  // Topological Sort (Kahn's algorithm)
  // ==========================================================================

  private topologicalSort(group: NodeGroup): string[] {
    const nodeIds = Array.from(group.nodes.keys());
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, Set<string>>();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      dependents.set(id, new Set());
    }

    for (const link of group.links.values()) {
      inDegree.set(link.toNode, (inDegree.get(link.toNode) || 0) + 1);
      dependents.get(link.fromNode)?.add(link.toNode);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const depId of dependents.get(id) || []) {
        const nd = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, nd);
        if (nd === 0) queue.push(depId);
      }
    }

    // If cycle detected, fall back to insertion order
    if (order.length !== nodeIds.length) {
      return nodeIds;
    }

    return order;
  }

  // ==========================================================================
  // Node Declaration Generation
  // ==========================================================================

  private generateNodeDeclaration(
    node: NodeInstance,
    varName: string,
    nw: string
  ): string {
    const enumKey = this.resolveNodeTypesEnumKey(node.type);
    const args: string[] = [`NodeTypes.${enumKey}`];

    // Name (if non-default)
    if (node.name && node.name !== String(node.type)) {
      args.push(`'${this.escapeString(node.name)}'`);
    } else {
      args.push('undefined');
    }

    // Location
    if (this.options.includeLocations && (node.location[0] !== 0 || node.location[1] !== 0)) {
      args.push(`[${node.location[0]}, ${node.location[1]}]`);
    } else {
      args.push('undefined');
    }

    // Properties – only non-empty
    const props = this.filterSerializableProperties(node);
    if (Object.keys(props).length > 0) {
      args.push(this.serializeValue(props));
    }

    return `const ${varName} = ${nw}.newNode(${args.join(', ')});`;
  }

  // ==========================================================================
  // Input Value Overrides
  // ==========================================================================

  /**
   * Collect setInputValue calls for input sockets that have non-default values
   * and are not connected via a link (connected values come from links).
   */
  private collectInputOverrides(
    group: NodeGroup,
    varNames: Map<string, string>
  ): string[] {
    const lines: string[] = [];
    const nw = this.options.wranglerParamName;

    // Build a set of (toNode, toSocket) that are connected
    const connectedInputs = new Set<string>();
    for (const link of group.links.values()) {
      connectedInputs.add(`${link.toNode}::${link.toSocket}`);
    }

    for (const [nodeId, node] of group.nodes) {
      const varName = varNames.get(nodeId);
      if (!varName) continue;

      for (const [socketName, socket] of node.inputs) {
        // Skip connected inputs – the link will provide the value
        if (connectedInputs.has(`${nodeId}::${socketName}`)) continue;

        // Only emit if the socket has a value that differs from the default
        if (!this.shouldEmitInputValue(node, socketName, socket)) continue;

        const valueExpr = this.serializeValue(socket.value);
        lines.push(
          `${nw}.setInputValue(${varName}, '${socketName}', ${valueExpr});`
        );
      }
    }

    return lines;
  }

  /**
   * Determine whether an input socket value differs from its default
   * and should be emitted as a setInputValue call.
   */
  private shouldEmitInputValue(
    node: NodeInstance,
    socketName: string,
    socket: NodeSocket
  ): boolean {
    const value = socket.value;
    if (value === undefined || value === null) return false;

    // Skip values that are NodeInstance references (they become connections, not values)
    if (typeof value === 'object' && value !== null && 'id' in value && 'type' in value && 'inputs' in value) {
      return false;
    }

    // Look up the default from the node definition registry
    const entry = nodeDefinitionRegistry.get(String(node.type));
    if (entry) {
      const inputDef = entry.inputs.find(i => i.name === socketName);
      if (inputDef) {
        const defVal = inputDef.defaultValue ?? inputDef.default;
        if (defVal !== undefined) {
          // Compare: if they're the same, skip
          if (this.valuesEqual(value, defVal)) return false;
        }
      }
    }

    return true;
  }

  // ==========================================================================
  // Value Serialization
  // ==========================================================================

  /**
   * Serialize a JavaScript value to a TypeScript expression string.
   */
  serializeValue(value: any): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return this.serializeNumber(value);
    if (typeof value === 'string') return `'${this.escapeString(value)}'`;
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map(v => this.serializeValue(v));
      return `[${items.join(', ')}]`;
    }
    if (typeof value === 'object') {
      // Check for NodeInstance references – skip them
      if ('id' in value && 'type' in value && 'inputs' in value && 'outputs' in value) {
        return `/* node ref: ${value.name || value.id} */ undefined`;
      }
      // Check for typed arrays
      if (value instanceof Float32Array) {
        return `[${Array.from(value).map(v => this.serializeNumber(v)).join(', ')}]`;
      }
      if (value instanceof Uint8Array) {
        return `[${Array.from(value).join(', ')}]`;
      }
      // Plain object
      const entries = Object.entries(value as Record<string, any>);
      if (entries.length === 0) return '{}';
      const pairs = entries.map(
        ([k, v]) =>
          `${this.isValidIdentifier(k) ? k : `'${this.escapeString(k)}'`}: ${this.serializeValue(v)}`
      );
      return `{ ${pairs.join(', ')} }`;
    }
    if (typeof value === 'function') {
      return `/* function */ undefined`;
    }
    return String(value);
  }

  private serializeNumber(n: number): string {
    if (Number.isInteger(n)) return String(n);
    const s = n.toPrecision(10);
    return parseFloat(s).toString();
  }

  // ==========================================================================
  // Variable Name Derivation
  // ==========================================================================

  private deriveVarName(
    node: NodeInstance,
    existing: Map<string, string>
  ): string {
    const base = this.typeToVarBase(String(node.type));
    let name = base;
    let counter = 2;
    while (Array.from(existing.values()).includes(name)) {
      name = `${base}${counter}`;
      counter++;
    }
    return name;
  }

  /**
   * Convert a node type string like 'TextureNoiseNode' or 'PrincipledBSDFNode'
   * into a camelCase variable name like 'noiseTex' or 'principled'.
   */
  private typeToVarBase(typeStr: string): string {
    const preferredNames: Record<string, string> = {
      'TextureCoordNode': 'texCoord',
      'TextureNoiseNode': 'noiseTex',
      'TextureVoronoiNode': 'voronoiTex',
      'TextureMusgraveNode': 'musgraveTex',
      'TextureGradientNode': 'gradientTex',
      'TextureMagicNode': 'magicTex',
      'TextureBrickNode': 'brickTex',
      'TextureCheckerNode': 'checkerTex',
      'TextureWaveNode': 'waveTex',
      'TextureWhiteNoiseNode': 'whiteNoiseTex',
      'TextureGaborNode': 'gaborTex',
      'PrincipledBSDFNode': 'principled',
      'DiffuseBSDFNode': 'diffuse',
      'GlossyBSDFNode': 'glossy',
      'GlassBSDFNode': 'glass',
      'EmissionNode': 'emission',
      'MixShaderNode': 'mixShader',
      'AddShaderNode': 'addShader',
      'GroupInputNode': 'groupInput',
      'GroupOutputNode': 'groupOutput',
      'MaterialOutputNode': 'materialOutput',
      'ValueNode': 'value',
      'RGBNode': 'rgb',
      'VectorNode': 'vec',
      'BooleanNode': 'boolVal',
      'IntegerNode': 'intVal',
      'RandomValueNode': 'random',
      'IndexNode': 'index',
      'NormalNode': 'normal',
      'InputPositionNode': 'position',
      'InputNormalNode': 'normalInput',
      'InputIDNode': 'id',
      'MathNode': 'math',
      'VectorMathNode': 'vecMath',
      'MapRangeNode': 'mapRange',
      'ColorRampNode': 'colorRamp',
      'MixRGBNode': 'mixRGB',
      'CombineXYZNode': 'combineXYZ',
      'SeparateXYZNode': 'separateXYZ',
      'MappingNode': 'mapping',
      'NormalMapNode': 'normalMap',
      'BumpNode': 'bump',
      'SwitchNode': 'switchNode',
      'CompareNode': 'compare',
      'FloatCurveNode': 'floatCurve',
      'SetShadeSmoothNode': 'setShadeSmooth',
      'CaptureAttributeNode': 'captureAttr',
      'StoreNamedAttributeNode': 'storeAttr',
      'NamedAttributeNode': 'namedAttr',
      'ObjectInfoNode': 'objectInfo',
      'CollectionInfoNode': 'collectionInfo',
      'InstanceOnPointsNode': 'instanceOnPts',
      'RealizeInstancesNode': 'realizeInst',
      'SetPositionNode': 'setPosition',
      'JoinGeometryNode': 'joinGeom',
      'TransformNode': 'transform',
      'MergeByDistanceNode': 'mergeDist',
      'BoundingBoxNode': 'bbox',
      'DeleteGeometryNode': 'deleteGeom',
      'ProximityNode': 'proximity',
      'RaycastNode': 'raycast',
      'ConvexHullNode': 'convexHull',
      'DuplicateElementsNode': 'dupElems',
      'TriangulateNode': 'triangulate',
      'SubdivideMeshNode': 'subdivide',
      'ExtrudeMeshNode': 'extrude',
      'MeshToPointsNode': 'meshToPts',
      'MeshToCurveNode': 'meshToCurve',
      'CurveToMeshNode': 'curveToMesh',
      'CurveToPointsNode': 'curveToPts',
      'ResampleCurveNode': 'resampleCurve',
      'TrimCurveNode': 'trimCurve',
      'FillCurveNode': 'fillCurve',
      'SubdivideCurveNode': 'subdivideCurve',
      'SetCurveRadiusNode': 'setCurveRadius',
      'DistributePointsOnFacesNode': 'distributePts',
      'UVMapNode': 'uvMap',
      'AmbientOcclusionNode': 'ao',
      'HueSaturationNode': 'hsv',
      'BlackBodyNode': 'blackBody',
      'BooleanMathNode': 'boolMath',
      'InvertNode': 'invert',
      'TexCoordNode': 'texCoord',
      'MeshCubeNode': 'cube',
      'MeshUVSphereNode': 'sphere',
      'MeshIcoSphereNode': 'icoSphere',
      'MeshCylinderNode': 'cylinder',
      'MeshConeNode': 'cone',
      'MeshGridNode': 'grid',
      'MeshLineNode': 'line',
      'MeshTorusNode': 'torus',
      'SubdivisionSurfaceNode': 'subSurf',
    };

    if (preferredNames[typeStr]) {
      return preferredNames[typeStr];
    }

    // Fallback: strip 'Node' suffix and camelCase
    let base = typeStr;
    if (base.endsWith('Node')) base = base.slice(0, -4);
    if (base.endsWith('Texture')) base = base.slice(0, -7) + 'Tex';
    if (base.endsWith('BSDF')) base = base.slice(0, -4);

    // Convert PascalCase to camelCase
    return base.charAt(0).toLowerCase() + base.slice(1);
  }

  // ==========================================================================
  // NodeTypes Enum Key Resolution
  // ==========================================================================

  /**
   * Given a node type string value (e.g. 'TextureNoiseNode'),
   * find the NodeTypes enum key (e.g. 'TextureNoise') to use in generated code.
   *
   * Falls back to using the string directly if no enum key is found.
   */
  resolveNodeTypesEnumKey(typeStr: string): string {
    // Direct lookup in our reverse map
    const key = typeStringToEnumKey.get(String(typeStr));
    if (key) return key;

    // Try trimming 'Node' suffix and looking for aliases
    const withoutNode = String(typeStr).endsWith('Node') ? String(typeStr).slice(0, -4) : String(typeStr);

    // Check if there's an enum key matching the type string directly
    if ((NodeTypes as any)[withoutNode] !== undefined) {
      return withoutNode;
    }

    // Check common aliases
    const aliasMap: Record<string, string> = {
      'PrincipledBSDFNode': 'PrincipledBSDF',
      'TextureNoiseNode': 'TextureNoise',
      'TextureVoronoiNode': 'TextureVoronoi',
      'TextureMusgraveNode': 'TextureMusgrave',
      'TexCoordNode': 'TexCoord',
      'BooleanMathNode': 'BooleanMath',
    };

    if (aliasMap[String(typeStr)]) return aliasMap[String(typeStr)];

    // Last resort: use the string value directly as a quoted string literal
    return `'${typeStr}'`;
  }

  // ==========================================================================
  // Property Filtering
  // ==========================================================================

  /**
   * Filter a node's properties to only include those that should be serialized.
   * Removes internal/ephemeral properties and default values.
   */
  private filterSerializableProperties(node: NodeInstance): Record<string, any> {
    const props: Record<string, any> = { ...node.properties };

    // Remove internal/ephemeral keys
    const internalKeys = new Set([
      '_anchors', '_handle', '_presets',
    ]);
    for (const key of internalKeys) {
      delete props[key];
    }

    // Remove properties that match the registry defaults
    const entry = nodeDefinitionRegistry.get(String(node.type));
    if (entry?.properties) {
      for (const [propKey, propDef] of Object.entries(entry.properties)) {
        if (props[propKey] !== undefined && this.valuesEqual(props[propKey], propDef.default)) {
          delete props[propKey];
        }
      }
    }

    return props;
  }

  // ==========================================================================
  // Output Node Detection
  // ==========================================================================

  private findOutputNode(group: NodeGroup): string | null {
    // Look for GroupOutput or MaterialOutput
    for (const [nodeId, node] of group.nodes) {
      const t = String(node.type);
      if (
        t === 'GroupOutputNode' ||
        t === 'GroupOutput' ||
        t === 'MaterialOutputNode' ||
        t === 'MaterialOutput' ||
        node.name === 'Group Output' ||
        node.name === 'Material Output' ||
        node.name === 'Output'
      ) {
        return nodeId;
      }
    }

    // Look for any node whose type contains 'Output'
    for (const [nodeId, node] of group.nodes) {
      if (String(node.type).toLowerCase().includes('output')) {
        return nodeId;
      }
    }

    return null;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private indent(code: string): string {
    const ind = this.options.indent;
    return code
      .split('\n')
      .map(line => (line.trim() ? ind + line : line))
      .join('\n');
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private isValidIdentifier(s: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
  }

  /**
   * Deep-equal comparison for values, handling objects and arrays.
   */
  private valuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.valuesEqual(v, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(k => this.valuesEqual(a[k], b[k]));
    }

    // Handle NaN
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
      return true;
    }

    return false;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Serialize a NodeWrangler's graph to TypeScript code.
 */
export function serializeToTypeScript(
  wrangler: NodeWrangler,
  options: Partial<CodeSerializerOptions> = {}
): string {
  const serializer = new NodeCodeSerializer(options);
  return serializer.serialize(wrangler);
}

// ============================================================================
// Round-Trip Test
// ============================================================================

export interface RoundTripResult {
  success: boolean;
  generatedCode: string;
  differences: string[];
  errors: string[];
}

/**
 * Execute a round-trip test:
 * 1. Serialize the graph to TypeScript code
 * 2. Execute the generated code to recreate the graph
 * 3. Compare the resulting graph with the original
 *
 * Returns a result object indicating success/failure and any differences.
 */
export function roundTripTest(
  originalWrangler: NodeWrangler,
  options: Partial<CodeSerializerOptions> = {}
): RoundTripResult {
  const result: RoundTripResult = {
    success: true,
    generatedCode: '',
    differences: [],
    errors: [],
  };

  const serializer = new NodeCodeSerializer({
    ...options,
    includeComments: false,  // Simpler code for execution
  });

  // Step 1: Serialize to TypeScript module
  try {
    result.generatedCode = new NodeCodeSerializer(options).serialize(originalWrangler);
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Serialization error: ${err.message}`);
    return result;
  }

  // Step 2: Generate pure-JS function body and execute it
  const newWrangler = new NodeWrangler();
  try {
    const bodyCode = serializer.generateFunctionBody(originalWrangler);
    const execFn = new Function('nw', 'NodeTypes', bodyCode);
    execFn(newWrangler, NodeTypes);
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Execution error: ${err.message}`);
    // Continue to comparison – partial graph may still be comparable
  }

  // Step 3: Compare the two graphs
  const originalGroup = originalWrangler.getActiveGroup();
  const newGroup = newWrangler.getActiveGroup();

  // Compare node count
  if (originalGroup.nodes.size !== newGroup.nodes.size) {
    result.differences.push(
      `Node count mismatch: original=${originalGroup.nodes.size}, recreated=${newGroup.nodes.size}`
    );
    result.success = false;
  }

  // Compare link count
  if (originalGroup.links.size !== newGroup.links.size) {
    result.differences.push(
      `Link count mismatch: original=${originalGroup.links.size}, recreated=${newGroup.links.size}`
    );
    result.success = false;
  }

  // Compare node types (order may differ, so compare by type counts)
  const originalTypes = new Map<string, number>();
  for (const node of originalGroup.nodes.values()) {
    const t = String(node.type);
    originalTypes.set(t, (originalTypes.get(t) || 0) + 1);
  }

  const newTypes = new Map<string, number>();
  for (const node of newGroup.nodes.values()) {
    const t = String(node.type);
    newTypes.set(t, (newTypes.get(t) || 0) + 1);
  }

  for (const [type, count] of originalTypes) {
    const newCount = newTypes.get(type) || 0;
    if (newCount !== count) {
      result.differences.push(
        `Node type "${type}" count mismatch: original=${count}, recreated=${newCount}`
      );
      result.success = false;
    }
  }

  // Compare connection topology (by type and socket names, not IDs)
  const originalLinkSignatures = new Set<string>();
  for (const link of originalGroup.links.values()) {
    const fromNode = originalGroup.nodes.get(link.fromNode);
    const toNode = originalGroup.nodes.get(link.toNode);
    if (fromNode && toNode) {
      originalLinkSignatures.add(
        `${fromNode.type}.${link.fromSocket}->${toNode.type}.${link.toSocket}`
      );
    }
  }

  const newLinkSignatures = new Set<string>();
  for (const link of newGroup.links.values()) {
    const fromNode = newGroup.nodes.get(link.fromNode);
    const toNode = newGroup.nodes.get(link.toNode);
    if (fromNode && toNode) {
      newLinkSignatures.add(
        `${fromNode.type}.${link.fromSocket}->${toNode.type}.${link.toSocket}`
      );
    }
  }

  for (const sig of originalLinkSignatures) {
    if (!newLinkSignatures.has(sig)) {
      result.differences.push(`Missing connection in recreated graph: ${sig}`);
      result.success = false;
    }
  }

  for (const sig of newLinkSignatures) {
    if (!originalLinkSignatures.has(sig)) {
      result.differences.push(`Extra connection in recreated graph: ${sig}`);
      result.success = false;
    }
  }

  // Compare node properties – match nodes by type + name combination
  const originalNodeMap = new Map<string, NodeInstance>();
  for (const node of originalGroup.nodes.values()) {
    const key = `${node.type}::${node.name}`;
    originalNodeMap.set(key, node);
  }

  for (const node of newGroup.nodes.values()) {
    const key = `${node.type}::${node.name}`;
    const origNode = originalNodeMap.get(key);
    if (!origNode) continue;

    // Compare serializable properties
    const origProps = filterPropsForComparison(origNode.properties);
    const newProps = filterPropsForComparison(node.properties);
    const origJSON = JSON.stringify(origProps, Object.keys(origProps).sort());
    const newJSON = JSON.stringify(newProps, Object.keys(newProps).sort());
    if (origJSON !== newJSON) {
      result.differences.push(
        `Property mismatch for node "${key}": original=${origJSON}, recreated=${newJSON}`
      );
      result.success = false;
    }
  }

  return result;
}

/**
 * Filter properties for comparison – remove internal/ephemeral keys.
 */
function filterPropsForComparison(props: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = { ...props };
  const internalKeys = new Set(['_anchors', '_handle', '_presets']);
  for (const key of internalKeys) {
    delete filtered[key];
  }
  return filtered;
}

export default NodeCodeSerializer;
