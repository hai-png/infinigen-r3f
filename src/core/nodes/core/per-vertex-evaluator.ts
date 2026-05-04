/**
 * PerVertexEvaluator - Evaluates a node graph per-vertex.
 *
 * Instead of calling each node's execute() once (producing a single scalar
 * value), it evaluates every vertex in the input geometry, producing
 * per-vertex output AttributeStreams.
 *
 * This matches Blender's geometry node execution model where:
 *   1. Input nodes like Position, Normal, Index produce per-vertex streams
 *   2. Texture / Noise nodes sample at each vertex position
 *   3. Math nodes operate element-wise on streams
 *   4. Output nodes write streams back to the geometry
 *
 * Port of: Princeton Infinigen's per-vertex evaluation model
 */

import { NodeWrangler, NodeInstance, NodeLink } from './node-wrangler';
import { AttributeStream, AttributeDataType, AttributeDomain } from './attribute-stream';
import { GeometryContext } from './geometry-context';
import { NodeTypes } from './node-types';

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export interface EvaluationContext {
  /** nodeId → outputName → AttributeStream */
  results: Map<string, Map<string, AttributeStream>>;
  /** The geometry being evaluated */
  geometry: GeometryContext;
}

// ---------------------------------------------------------------------------
// Built-in per-vertex executor map
// ---------------------------------------------------------------------------

/**
 * A PerVertexExecutor receives:
 *  - inputs: map of input-name → AttributeStream (or a single-value stream)
 *  - properties: node properties
 *  - geometry: the GeometryContext being evaluated
 *  - vertexCount: number of vertices to produce
 *
 * It must return a map of output-name → AttributeStream.
 */
export type PerVertexExecutor = (
  inputs: Map<string, AttributeStream>,
  properties: Record<string, any>,
  geometry: GeometryContext,
  vertexCount: number,
) => Map<string, AttributeStream>;

/** Registry of per-vertex executors, keyed by node type string */
export const perVertexExecutors: Map<string, PerVertexExecutor> = new Map();

// ---------------------------------------------------------------------------
// Register built-in geometry input nodes
// ---------------------------------------------------------------------------

// Position input → produces a VECTOR stream from geometry positions
perVertexExecutors.set(String(NodeTypes.InputPosition), (_inputs, _props, geometry, _vc) => {
  const outputs = new Map<string, AttributeStream>();
  outputs.set('Position', geometry.getAttribute('position')!.clone());
  return outputs;
});

// Normal input → produces a VECTOR stream from geometry normals
perVertexExecutors.set(String(NodeTypes.InputNormal), (_inputs, _props, geometry, _vc) => {
  const outputs = new Map<string, AttributeStream>();
  outputs.set('Normal', geometry.getAttribute('normal')!.clone());
  return outputs;
});

// Index input → produces a FLOAT stream with vertex indices
perVertexExecutors.set(String(NodeTypes.Index), (_inputs, _props, geometry, _vc) => {
  const outputs = new Map<string, AttributeStream>();
  const indexStream = new AttributeStream('index', 'point', 'INT', geometry.vertexCount);
  for (let i = 0; i < geometry.vertexCount; i++) {
    indexStream.setInt(i, i);
  }
  outputs.set('Index', indexStream);
  return outputs;
});

// ID input → same as index for now
perVertexExecutors.set(String(NodeTypes.InputID), (_inputs, _props, geometry, _vc) => {
  const outputs = new Map<string, AttributeStream>();
  const idStream = new AttributeStream('id', 'point', 'INT', geometry.vertexCount);
  for (let i = 0; i < geometry.vertexCount; i++) {
    idStream.setInt(i, i);
  }
  outputs.set('ID', idStream);
  return outputs;
});

// Value input → produces a constant FLOAT stream
perVertexExecutors.set(String(NodeTypes.Value), (_inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const val = (props.value as number) ?? 0;
  const stream = new AttributeStream('value', 'point', 'FLOAT', vertexCount);
  stream.fill(val);
  outputs.set('Value', stream);
  return outputs;
});

// Vector input → produces a constant VECTOR stream
perVertexExecutors.set(String(NodeTypes.Vector), (_inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const x = (props.x as number) ?? 0;
  const y = (props.y as number) ?? 0;
  const z = (props.z as number) ?? 0;
  const stream = new AttributeStream('vector', 'point', 'VECTOR', vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    stream.setVector(i, [x, y, z]);
  }
  outputs.set('Vector', stream);
  return outputs;
});

// Boolean input → produces a constant BOOLEAN stream
perVertexExecutors.set(String(NodeTypes.Boolean), (_inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const val = props.boolean ?? props.value ?? false;
  const stream = new AttributeStream('boolean', 'point', 'BOOLEAN', vertexCount);
  stream.fill(val ? 1 : 0);
  outputs.set('Boolean', stream);
  return outputs;
});

// Integer input → produces a constant INT stream
perVertexExecutors.set(String(NodeTypes.Integer), (_inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const val = (props.integer as number) ?? (props.value as number) ?? 0;
  const stream = new AttributeStream('integer', 'point', 'INT', vertexCount);
  stream.fill(val);
  outputs.set('Integer', stream);
  return outputs;
});

// RGB / Color input → produces a constant COLOR stream
perVertexExecutors.set(String(NodeTypes.RGB), (_inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const r = (props.r as number) ?? 0;
  const g = (props.g as number) ?? 0;
  const b = (props.b as number) ?? 0;
  const a = (props.a as number) ?? 1;
  const stream = new AttributeStream('color', 'point', 'COLOR', vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    stream.setColor(i, { r, g, b, a });
  }
  outputs.set('Color', stream);
  return outputs;
});

// Group input → passthrough (resolved at higher level)
perVertexExecutors.set(String(NodeTypes.GroupInput), (_inputs, props, geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  // In a real implementation, this would pull from the parent group's inputs
  // For now, output a default geometry stream
  const geomStream = new AttributeStream('Geometry', 'point', 'FLOAT', vertexCount);
  outputs.set('Geometry', geomStream);
  return outputs;
});

// Group output → receives geometry and marks evaluation end
perVertexExecutors.set(String(NodeTypes.GroupOutput), (inputs, _props, _geometry, _vc) => {
  // Pass through all inputs as outputs
  return new Map(inputs);
});

// SetPosition → modifies the position attribute on the geometry
perVertexExecutors.set(String(NodeTypes.SetPosition), (inputs, _props, geometry, _vc) => {
  const outputs = new Map<string, AttributeStream>();

  // Clone the current position stream (clone preserves the 'position' name)
  const newPositions = geometry.getAttribute('position')!.clone();

  // If a "Position" input is provided, use it to override positions
  const posInput = inputs.get('Position');
  if (posInput) {
    const srcData = posInput.getRawData();
    const dstData = newPositions.getRawData();
    const len = Math.min(srcData.length, dstData.length);
    for (let i = 0; i < len; i++) {
      dstData[i] = srcData[i];
    }
  }

  // If an "Offset" input is provided, add it to positions
  const offsetInput = inputs.get('Offset');
  if (offsetInput && offsetInput.dataType === 'VECTOR') {
    const posData = newPositions.getRawData();
    const offData = offsetInput.getRawData();
    const len = Math.min(posData.length, offData.length);
    for (let i = 0; i < len; i++) {
      posData[i] += offData[i];
    }
  }

  outputs.set('Geometry', newPositions);
  return outputs;
});

// Math node → element-wise float math
perVertexExecutors.set(String(NodeTypes.Compare), (inputs, _props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const a = inputs.get('A');
  const b = inputs.get('B');

  const resultStream = new AttributeStream('result', 'point', 'FLOAT', vertexCount);

  if (a && b) {
    const aData = a.getRawData();
    const bData = b.getRawData();
    const rData = resultStream.getRawData();
    const aCC = a.componentCount;
    const bCC = b.componentCount;

    for (let i = 0; i < vertexCount; i++) {
      const aVal = aData[i * aCC];
      const bVal = bData[i * bCC];
      rData[i] = aVal < bVal ? 1 : 0; // Default comparison: less-than
    }
  }

  outputs.set('Result', resultStream);
  return outputs;
});

// Mix node → per-element interpolation between two streams
perVertexExecutors.set(String(NodeTypes.Mix), (inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const a = inputs.get('A');
  const b = inputs.get('B');
  const factor = inputs.get('Factor');

  // Determine data type from inputs
  const dataType: AttributeDataType = a?.dataType === 'VECTOR' ? 'VECTOR' : a?.dataType === 'COLOR' ? 'COLOR' : 'FLOAT';
  const resultStream = new AttributeStream('result', 'point', dataType, vertexCount);

  if (a && b) {
    const aData = a.getRawData();
    const bData = b.getRawData();
    const rData = resultStream.getRawData();
    const fData = factor ? factor.getRawData() : null;
    const fCC = factor?.componentCount ?? 1;
    const cc = a.componentCount;

    for (let i = 0; i < vertexCount; i++) {
      const t = fData ? fData[i * fCC] : (props.factor as number) ?? 0.5;
      for (let c = 0; c < cc; c++) {
        rData[i * cc + c] = aData[i * cc + c] * (1 - t) + bData[i * cc + c] * t;
      }
    }
  }

  outputs.set('Result', resultStream);
  return outputs;
});

// Random value → per-element random values
perVertexExecutors.set(String(NodeTypes.RandomValue), (inputs, props, _geometry, vertexCount) => {
  const outputs = new Map<string, AttributeStream>();
  const min = (props.min as number) ?? 0;
  const max = (props.max as number) ?? 1;
  const seed = (props.seed as number) ?? 0;

  const resultStream = new AttributeStream('value', 'point', 'FLOAT', vertexCount);
  const rData = resultStream.getRawData();

  // Simple seeded pseudo-random (LCG)
  let s = seed;
  for (let i = 0; i < vertexCount; i++) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const t = s / 0x7fffffff;
    rData[i] = min + t * (max - min);
  }

  outputs.set('Value', resultStream);
  return outputs;
});

// ---------------------------------------------------------------------------
// PerVertexEvaluator class
// ---------------------------------------------------------------------------

export class PerVertexEvaluator {
  private wrangler: NodeWrangler;

  constructor(wrangler: NodeWrangler) {
    this.wrangler = wrangler;
  }

  /**
   * Evaluate the node graph for each vertex in the geometry.
   * Returns a new GeometryContext with the results applied.
   */
  evaluate(geometry: GeometryContext): GeometryContext {
    const group = this.wrangler.getActiveGroup();
    const order = this.wrangler.topologicalSort(group);

    const context: EvaluationContext = {
      results: new Map(),
      geometry,
    };

    // Process nodes in topological order
    for (const nodeId of order) {
      const node = group.nodes.get(nodeId);
      if (!node) continue;

      const nodeOutputs = this.evaluateNode(nodeId, geometry, context);
      context.results.set(nodeId, nodeOutputs);
    }

    // Apply results to a cloned geometry
    return this.applyResults(geometry, context);
  }

  /**
   * Evaluate a single node per-vertex.
   * Called internally during the topological traversal.
   */
  private evaluateNode(
    nodeId: string,
    geometry: GeometryContext,
    context: EvaluationContext,
  ): Map<string, AttributeStream> {
    const group = this.wrangler.getActiveGroup();
    const node = group.nodes.get(nodeId);
    if (!node) return new Map();

    // Resolve all input streams
    const inputStreams = new Map<string, AttributeStream>();
    for (const [inputName, socket] of node.inputs.entries()) {
      const resolved = this.resolveInput(nodeId, inputName, geometry, context);
      if (resolved instanceof AttributeStream) {
        inputStreams.set(inputName, resolved);
      }
    }

    // Look up the per-vertex executor for this node type
    const typeStr = String(node.type);
    const executor = perVertexExecutors.get(typeStr);

    if (executor) {
      try {
        return executor(inputStreams, node.properties, geometry, geometry.vertexCount);
      } catch (err) {
        console.warn(
          `[PerVertexEvaluator] Error executing node ${nodeId} (type=${node.type}):`,
          err,
        );
        return new Map();
      }
    }

    // Fallback: check if there's a regular executor that can be vectorized
    const regularExecutor = NodeWrangler.executors.get(typeStr);
    if (regularExecutor) {
      return this.vectorizeRegularExecutor(
        regularExecutor,
        inputStreams,
        node,
        geometry,
      );
    }

    // No executor found – pass through inputs to outputs
    return this.passthrough(inputStreams, node);
  }

  /**
   * Resolve a node input – either from a connected output stream or a default
   * value.  If from a connection, returns the AttributeStream from the source
   * node.  If a default value, returns an AttributeStream filled with that
   * value (or the scalar itself for constant propagation).
   */
  private resolveInput(
    nodeId: string,
    inputName: string,
    geometry: GeometryContext,
    context: EvaluationContext,
  ): AttributeStream | number {
    const group = this.wrangler.getActiveGroup();

    // Find a link targeting this input
    for (const link of group.links.values()) {
      if (link.toNode === nodeId && link.toSocket === inputName) {
        const sourceResults = context.results.get(link.fromNode);
        if (sourceResults && sourceResults.has(link.fromSocket)) {
          return sourceResults.get(link.fromSocket)!;
        }
      }
    }

    // No connection – use default / socket value
    const node = group.nodes.get(nodeId);
    if (node) {
      const socket = node.inputs.get(inputName);
      if (socket) {
        const value = socket.value ?? socket.defaultValue ?? socket.default;
        if (value !== undefined && value !== null) {
          // Create a constant stream filled with the default value
          return this.createConstantStream(value, geometry.vertexCount, 'point');
        }
      }
    }

    // Return a zero-filled float stream as ultimate fallback
    return new AttributeStream(inputName, 'point', 'FLOAT', geometry.vertexCount);
  }

  /**
   * Try to run a regular (scalar) executor per-vertex by feeding it
   * scalar values extracted from each vertex's streams.
   *
   * This is slow (O(vertices) scalar calls) but provides compatibility
   * with nodes that only have scalar executors registered.
   */
  private vectorizeRegularExecutor(
    executor: (inputs: Record<string, any>, properties: Record<string, any>) => Record<string, any>,
    inputStreams: Map<string, AttributeStream>,
    node: NodeInstance,
    geometry: GeometryContext,
  ): Map<string, AttributeStream> {
    const vertexCount = geometry.vertexCount;

    // We'll run the executor once per vertex.
    // Collect the first output's data type by running once with vertex 0.

    // Prepare per-vertex scalar inputs
    const scalarInputs: Record<string, any> = {};
    for (const [name, stream] of inputStreams.entries()) {
      if (stream.dataType === 'FLOAT' || stream.dataType === 'INT' || stream.dataType === 'BOOLEAN') {
        scalarInputs[name] = stream.getFloat(0);
      } else if (stream.dataType === 'VECTOR') {
        const v = stream.getVector(0);
        scalarInputs[name] = { x: v[0], y: v[1], z: v[2] };
      } else if (stream.dataType === 'COLOR') {
        const c = stream.getColor(0);
        scalarInputs[name] = c;
      }
    }

    // Run once to discover output names/types
    const sampleOutput = executor(scalarInputs, node.properties);
    const outputNames = Object.keys(sampleOutput);
    if (outputNames.length === 0) return new Map();

    // Determine output data types from sample values
    const outputTypes = new Map<string, AttributeDataType>();
    for (const [name, val] of Object.entries(sampleOutput)) {
      if (typeof val === 'number') {
        outputTypes.set(name, 'FLOAT');
      } else if (val && typeof val === 'object' && 'x' in val && 'y' in val && 'z' in val) {
        outputTypes.set(name, 'VECTOR');
      } else if (val && typeof val === 'object' && 'r' in val) {
        outputTypes.set(name, 'COLOR');
      } else if (typeof val === 'boolean') {
        outputTypes.set(name, 'BOOLEAN');
      } else {
        outputTypes.set(name, 'FLOAT');
      }
    }

    // Create output streams
    const outputStreams = new Map<string, AttributeStream>();
    for (const [name, dtype] of outputTypes.entries()) {
      outputStreams.set(name, new AttributeStream(name, 'point', dtype, vertexCount));
    }

    // Fill vertex 0 from the sample run
    for (const [name, val] of Object.entries(sampleOutput)) {
      this.setStreamValue(outputStreams.get(name)!, 0, val);
    }

    // Run for remaining vertices
    for (let v = 1; v < vertexCount; v++) {
      // Build scalar inputs for this vertex
      const vInputs: Record<string, any> = {};
      for (const [name, stream] of inputStreams.entries()) {
        if (stream.dataType === 'FLOAT' || stream.dataType === 'INT' || stream.dataType === 'BOOLEAN') {
          vInputs[name] = stream.getFloat(v);
        } else if (stream.dataType === 'VECTOR') {
          const vec = stream.getVector(v);
          vInputs[name] = { x: vec[0], y: vec[1], z: vec[2] };
        } else if (stream.dataType === 'COLOR') {
          vInputs[name] = stream.getColor(v);
        }
      }

      try {
        const out = executor(vInputs, node.properties);
        for (const [name, val] of Object.entries(out)) {
          const stream = outputStreams.get(name);
          if (stream) {
            this.setStreamValue(stream, v, val);
          }
        }
      } catch (err) {
        // Silently fall back - leave default (zero) values on error
        if (process.env.NODE_ENV === 'development') console.debug('[PerVertexEvaluator] node output stream fallback:', err);
      }
    }

    return outputStreams;
  }

  /** Set a value at a given index on a stream, auto-detecting the type */
  private setStreamValue(stream: AttributeStream, index: number, value: any): void {
    if (stream.dataType === 'FLOAT' || stream.dataType === 'INT' || stream.dataType === 'BOOLEAN') {
      const num = typeof value === 'number' ? value : (value ? 1 : 0);
      stream.setFloat(index, num);
    } else if (stream.dataType === 'VECTOR') {
      if (Array.isArray(value)) {
        stream.setVector(index, [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]);
      } else if (value && typeof value === 'object') {
        stream.setVector(index, [value.x ?? 0, value.y ?? 0, value.z ?? 0]);
      }
    } else if (stream.dataType === 'COLOR') {
      if (value && typeof value === 'object') {
        stream.setColor(index, {
          r: value.r ?? 0,
          g: value.g ?? 0,
          b: value.b ?? 0,
          a: value.a ?? 1,
        });
      }
    }
  }

  /**
   * Default passthrough: map inputs to outputs by matching names.
   * If no matching input exists for an output, produce a zero-filled stream.
   */
  private passthrough(
    inputStreams: Map<string, AttributeStream>,
    node: NodeInstance,
  ): Map<string, AttributeStream> {
    const outputs = new Map<string, AttributeStream>();

    for (const [outName] of node.outputs.entries()) {
      const matched = inputStreams.get(outName);
      if (matched) {
        outputs.set(outName, matched.clone());
      } else {
        // Create a zero float stream as placeholder
        const stream = new AttributeStream(outName, 'point', 'FLOAT', node.inputs.size > 0 ? 0 : 1);
        outputs.set(outName, stream);
      }
    }

    return outputs;
  }

  /**
   * Apply evaluation results back to the geometry.
   *
   * Looks for nodes that produce "Geometry" outputs (like SetPosition) and
   * applies their results to a cloned GeometryContext.
   */
  private applyResults(
    geometry: GeometryContext,
    context: EvaluationContext,
  ): GeometryContext {
    const result = geometry.clone();

    for (const [nodeId, nodeOutputs] of context.results.entries()) {
      for (const [outputName, stream] of nodeOutputs.entries()) {
        // If a SetPosition-like node produced a "Geometry" output that's a VECTOR
        // stream, treat it as the new position attribute
        if (outputName === 'Geometry' && stream.dataType === 'VECTOR' && stream.size === result.vertexCount) {
          // Check if this looks like a position override (name = 'position')
          if (stream.name === 'position') {
            result.addAttribute(stream);
          }
        }

        // Apply any stream that matches an existing attribute name
        if (result.hasAttribute(stream.name) && stream.name !== 'position' && stream.name !== 'normal') {
          result.addAttribute(stream);
        }
      }
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Utility
  // -----------------------------------------------------------------------

  /**
   * Create a constant AttributeStream filled with the given value.
   * The data type is inferred from the JavaScript type.
   */
  private createConstantStream(
    value: any,
    size: number,
    domain: AttributeDomain,
  ): AttributeStream {
    if (typeof value === 'number') {
      const stream = new AttributeStream('constant', domain, 'FLOAT', size);
      stream.fill(value);
      return stream;
    }

    if (typeof value === 'boolean') {
      const stream = new AttributeStream('constant', domain, 'BOOLEAN', size);
      stream.fill(value ? 1 : 0);
      return stream;
    }

    if (Array.isArray(value)) {
      if (value.length === 3) {
        const stream = new AttributeStream('constant', domain, 'VECTOR', size);
        for (let i = 0; i < size; i++) {
          stream.setVector(i, [value[0], value[1], value[2]]);
        }
        return stream;
      }
      if (value.length === 4) {
        const stream = new AttributeStream('constant', domain, 'COLOR', size);
        for (let i = 0; i < size; i++) {
          stream.setColor(i, { r: value[0], g: value[1], b: value[2], a: value[3] });
        }
        return stream;
      }
    }

    if (value && typeof value === 'object') {
      if ('x' in value && 'y' in value && 'z' in value) {
        const stream = new AttributeStream('constant', domain, 'VECTOR', size);
        for (let i = 0; i < size; i++) {
          stream.setVector(i, [value.x, value.y, value.z]);
        }
        return stream;
      }
      if ('r' in value && 'g' in value && 'b' in value) {
        const stream = new AttributeStream('constant', domain, 'COLOR', size);
        for (let i = 0; i < size; i++) {
          stream.setColor(i, { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 });
        }
        return stream;
      }
    }

    // Fallback: float 0
    const stream = new AttributeStream('constant', domain, 'FLOAT', size);
    return stream;
  }
}

export default PerVertexEvaluator;
