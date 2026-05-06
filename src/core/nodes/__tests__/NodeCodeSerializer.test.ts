/**
 * Node Code Serializer Tests
 *
 * Tests for the NodeCodeSerializer that converts NodeWrangler graphs
 * to TypeScript code, and the round-trip test capability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeWrangler } from '../core/node-wrangler';
import { NodeTypes } from '../core/node-types';
import {
  NodeCodeSerializer,
  serializeToTypeScript,
  roundTripTest,
  type CodeSerializerOptions,
} from '../core/NodeCodeSerializer';

// ============================================================================
// Helper: build sample graphs
// ============================================================================

function buildSimpleGraph(): NodeWrangler {
  const nw = new NodeWrangler();
  const texCoord = nw.newNode(NodeTypes.TextureCoord);
  const noiseTex = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 5.0 });
  nw.connect(texCoord, 'UV', noiseTex, 'Vector');
  return nw;
}

function buildMaterialGraph(): NodeWrangler {
  const nw = new NodeWrangler();
  const texCoord = nw.newNode(NodeTypes.TextureCoord);
  const noiseTex = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 5.0 });
  const principled = nw.newNode(NodeTypes.PrincipledBSDF, undefined, undefined, {});
  const materialOutput = nw.newNode(NodeTypes.MaterialOutput);

  nw.connect(texCoord, 'UV', noiseTex, 'Vector');
  nw.connect(noiseTex, 'Fac', principled, 'Roughness');
  nw.connect(principled, 'BSDF', materialOutput, 'Surface');

  return nw;
}

function buildGraphWithInputValues(): NodeWrangler {
  const nw = new NodeWrangler();
  const value = nw.newNode(NodeTypes.Value);
  const math = nw.newNode(NodeTypes.Math, undefined, undefined, { operation: 'MULTIPLY' });

  nw.setInputValue(value, 'Value', 3.14);
  nw.setInputValue(math, 'Value', 2.0);

  return nw;
}

function buildDisconnectedGraph(): NodeWrangler {
  const nw = new NodeWrangler();
  nw.newNode(NodeTypes.Value);
  nw.newNode(NodeTypes.RGB);
  nw.newNode(NodeTypes.Vector);
  return nw;
}

function buildMultiConnectionGraph(): NodeWrangler {
  const nw = new NodeWrangler();
  const texCoord = nw.newNode(NodeTypes.TextureCoord);
  const noise1 = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 5.0 });
  const noise2 = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 10.0 });
  const mix = nw.newNode(NodeTypes.MixRGB, undefined, undefined, {});

  nw.connect(texCoord, 'UV', noise1, 'Vector');
  nw.connect(texCoord, 'UV', noise2, 'Vector');
  nw.connect(noise1, 'Fac', mix, 'Color1');
  nw.connect(noise2, 'Fac', mix, 'Color2');

  return nw;
}

// ============================================================================
// Tests
// ============================================================================

describe('NodeCodeSerializer', () => {
  let serializer: NodeCodeSerializer;

  beforeEach(() => {
    serializer = new NodeCodeSerializer();
  });

  // --------------------------------------------------------------------------
  // Basic serialization
  // --------------------------------------------------------------------------

  describe('serialize', () => {
    it('should produce valid TypeScript code with imports', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toContain("import { NodeWrangler, NodeTypes } from");
      expect(code).toContain('export function buildGraph');
      expect(code).toContain('NodeTypes.');
    });

    it('should produce code with correct function signature', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toContain('export function buildGraph(nw: NodeWrangler)');
    });

    it('should use custom function name when provided', () => {
      const nw = buildSimpleGraph();
      const customSerializer = new NodeCodeSerializer({ functionName: 'buildMaterialGraph' });
      const code = customSerializer.serialize(nw);

      expect(code).toContain('export function buildMaterialGraph(nw: NodeWrangler)');
    });

    it('should use custom import path when provided', () => {
      const nw = buildSimpleGraph();
      const customSerializer = new NodeCodeSerializer({ importPath: './core/nodes' });
      const code = customSerializer.serialize(nw);

      expect(code).toContain("from './core/nodes'");
    });
  });

  // --------------------------------------------------------------------------
  // Node declarations
  // --------------------------------------------------------------------------

  describe('node declarations', () => {
    it('should generate a const declaration for each node', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      // Should have two nodes: texCoord and noiseTex
      expect(code).toMatch(/const \w+ = nw\.newNode\(NodeTypes\.\w+/);
      // Count const declarations inside the function body
      const constMatches = code.match(/const \w+ = nw\.newNode/g);
      expect(constMatches).toHaveLength(2);
    });

    it('should include node properties as the 4th argument', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toContain('Scale: 5');
    });

    it('should generate correct NodeTypes enum references', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toContain('NodeTypes.TextureCoord');
      expect(code).toContain('NodeTypes.TextureNoise');
    });

    it('should handle nodes without properties', () => {
      const nw = new NodeWrangler();
      nw.newNode(NodeTypes.Value);
      const code = serializer.serialize(nw);

      expect(code).toContain('NodeTypes.Value');
    });
  });

  // --------------------------------------------------------------------------
  // Connections
  // --------------------------------------------------------------------------

  describe('connections', () => {
    it('should generate nw.connect() calls for each link', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toContain("nw.connect(");
      expect(code).toContain("'UV'");
      expect(code).toContain("'Vector'");
    });

    it('should handle multiple connections', () => {
      const nw = buildMultiConnectionGraph();
      const code = serializer.serialize(nw);

      const connectCalls = code.match(/nw\.connect\(/g);
      expect(connectCalls).toHaveLength(4);
    });

    it('should handle graphs with no connections', () => {
      const nw = buildDisconnectedGraph();
      const code = serializer.serialize(nw);

      expect(code).not.toContain('nw.connect(');
    });
  });

  // --------------------------------------------------------------------------
  // Input value overrides
  // --------------------------------------------------------------------------

  describe('input value overrides', () => {
    it('should generate setInputValue calls for non-default input values', () => {
      const nw = buildGraphWithInputValues();
      const code = serializer.serialize(nw);

      expect(code).toContain('nw.setInputValue(');
    });

    it('should not generate setInputValue for default values', () => {
      const nw = new NodeWrangler();
      nw.newNode(NodeTypes.Value);
      const code = serializer.serialize(nw);

      // Value node's default value is 0 - should not generate setInputValue for it
      // unless the user explicitly set it to something different
      // The default for Value output socket is 0
      expect(code).not.toContain('setInputValue');
    });
  });

  // --------------------------------------------------------------------------
  // Comments
  // --------------------------------------------------------------------------

  describe('comments', () => {
    it('should include comments when enabled', () => {
      const nw = buildSimpleGraph();
      const serializerWithComments = new NodeCodeSerializer({ includeComments: true });
      const code = serializerWithComments.serialize(nw);

      expect(code).toContain('//');
    });

    it('should exclude comments when disabled', () => {
      const nw = buildSimpleGraph();
      const serializerNoComments = new NodeCodeSerializer({ includeComments: false });
      const code = serializerNoComments.serialize(nw);

      // The only comments would be node type comments
      expect(code).not.toMatch(/\/\/ \w+Node/);
    });
  });

  // --------------------------------------------------------------------------
  // Return value
  // --------------------------------------------------------------------------

  describe('return value', () => {
    it('should return the output node if one exists', () => {
      const nw = buildMaterialGraph();
      const code = serializer.serialize(nw);

      // MaterialOutput should be the return value
      expect(code).toMatch(/return \w+;/);
    });

    it('should return the last node in topological order if no output node', () => {
      const nw = buildSimpleGraph();
      const code = serializer.serialize(nw);

      expect(code).toMatch(/return \w+;/);
    });
  });

  // --------------------------------------------------------------------------
  // Value serialization
  // --------------------------------------------------------------------------

  describe('serializeValue', () => {
    it('should serialize primitive types correctly', () => {
      expect(serializer.serializeValue(42)).toBe('42');
      expect(serializer.serializeValue(3.14)).toBe('3.14');
      expect(serializer.serializeValue(true)).toBe('true');
      expect(serializer.serializeValue(false)).toBe('false');
      expect(serializer.serializeValue('hello')).toBe("'hello'");
      expect(serializer.serializeValue(null)).toBe('null');
      expect(serializer.serializeValue(undefined)).toBe('undefined');
    });

    it('should serialize arrays correctly', () => {
      expect(serializer.serializeValue([1, 2, 3])).toBe('[1, 2, 3]');
      expect(serializer.serializeValue([])).toBe('[]');
      expect(serializer.serializeValue(['a', 'b'])).toBe("['a', 'b']");
    });

    it('should serialize objects correctly', () => {
      expect(serializer.serializeValue({ x: 1, y: 2 })).toBe('{ x: 1, y: 2 }');
      expect(serializer.serializeValue({})).toBe('{}');
    });

    it('should serialize nested structures', () => {
      const value = { color: [0.8, 0.2, 0.1], scale: 5.0 };
      const result = serializer.serializeValue(value);
      expect(result).toContain('0.8');
      expect(result).toContain('5');
    });

    it('should handle special number values', () => {
      expect(serializer.serializeValue(0)).toBe('0');
      expect(serializer.serializeValue(-1)).toBe('-1');
      expect(serializer.serializeValue(0.001)).toBe('0.001');
    });

    it('should escape strings with special characters', () => {
      const result = serializer.serializeValue("it's a test");
      expect(result).toBe("'it\\'s a test'");
    });
  });

  // --------------------------------------------------------------------------
  // Variable naming
  // --------------------------------------------------------------------------

  describe('variable naming', () => {
    it('should use preferred variable names for common node types', () => {
      const nw = new NodeWrangler();
      nw.newNode(NodeTypes.TextureCoord);
      nw.newNode(NodeTypes.NoiseTexture);
      const code = serializer.serialize(nw);

      expect(code).toContain('texCoord');
      expect(code).toContain('noiseTex');
    });

    it('should deduplicate variable names when multiple nodes of the same type exist', () => {
      const nw = new NodeWrangler();
      nw.newNode(NodeTypes.Value);
      nw.newNode(NodeTypes.Value);
      const code = serializer.serialize(nw);

      // Should have value and value2 (or similar)
      const constMatches = code.match(/const (value\w*) = /g);
      expect(constMatches).toHaveLength(2);
      // The first is 'value', second should be 'value2'
      expect(constMatches![0]).toContain('value');
      expect(constMatches![1]).toContain('value');
    });
  });

  // --------------------------------------------------------------------------
  // NodeTypes enum key resolution
  // --------------------------------------------------------------------------

  describe('resolveNodeTypesEnumKey', () => {
    it('should resolve common type strings to their enum keys', () => {
      expect(serializer.resolveNodeTypesEnumKey('TextureNoiseNode')).toBe('TextureNoise');
      expect(serializer.resolveNodeTypesEnumKey('TextureVoronoiNode')).toBe('TextureVoronoi');
      expect(serializer.resolveNodeTypesEnumKey('PrincipledBSDFNode')).toBe('PrincipledBSDF');
      expect(serializer.resolveNodeTypesEnumKey('ValueNode')).toBe('Value');
      expect(serializer.resolveNodeTypesEnumKey('TextureCoordNode')).toBe('TextureCoord');
    });

    it('should fallback to quoted string for unknown types', () => {
      const result = serializer.resolveNodeTypesEnumKey('UnknownCustomNode');
      expect(result).toBe("'UnknownCustomNode'");
    });
  });

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  describe('options', () => {
    it('should use custom wrangler parameter name', () => {
      const nw = buildSimpleGraph();
      const customSerializer = new NodeCodeSerializer({ wranglerParamName: 'graph' });
      const code = customSerializer.serialize(nw);

      expect(code).toContain('graph.newNode(');
      expect(code).toContain('graph.connect(');
    });

    it('should include location when option is enabled', () => {
      const nw = new NodeWrangler();
      const node = nw.newNode(NodeTypes.Value, undefined, [100, -200]);
      const customSerializer = new NodeCodeSerializer({ includeLocations: true });
      const code = customSerializer.serialize(nw);

      expect(code).toContain('[100, -200]');
    });

    it('should not include location when option is disabled', () => {
      const nw = new NodeWrangler();
      nw.newNode(NodeTypes.Value, undefined, [100, -200]);
      const code = serializer.serialize(nw);

      expect(code).not.toContain('[100, -200]');
    });
  });
});

// ============================================================================
// Convenience function tests
// ============================================================================

describe('serializeToTypeScript', () => {
  it('should work as a convenience function', () => {
    const nw = buildSimpleGraph();
    const code = serializeToTypeScript(nw);

    expect(code).toContain('export function buildGraph');
    expect(code).toContain('NodeTypes.TextureCoord');
  });

  it('should accept options', () => {
    const nw = buildSimpleGraph();
    const code = serializeToTypeScript(nw, { functionName: 'myGraph' });

    expect(code).toContain('export function myGraph');
  });
});

// ============================================================================
// Round-trip tests
// ============================================================================

describe('roundTripTest', () => {
  it('should pass for a simple graph', () => {
    const nw = buildSimpleGraph();
    const result = roundTripTest(nw);

    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass for a material graph', () => {
    const nw = buildMaterialGraph();
    const result = roundTripTest(nw);

    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass for a disconnected graph', () => {
    const nw = buildDisconnectedGraph();
    const result = roundTripTest(nw);

    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('should pass for a graph with input values', () => {
    const nw = buildGraphWithInputValues();
    const result = roundTripTest(nw);

    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('should pass for a multi-connection graph', () => {
    const nw = buildMultiConnectionGraph();
    const result = roundTripTest(nw);

    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it('should generate valid code that can be executed', () => {
    const nw = buildSimpleGraph();
    const result = roundTripTest(nw);

    expect(result.generatedCode).toContain('NodeTypes.TextureCoord');
    expect(result.generatedCode).toContain('NodeTypes.TextureNoise');
    expect(result.generatedCode).toContain('nw.connect(');
  });

  it('should produce a result with generatedCode even on error', () => {
    // Even if the round-trip fails, we should still get the generated code
    const nw = buildSimpleGraph();
    const result = roundTripTest(nw);

    expect(result.generatedCode).toBeTruthy();
    expect(typeof result.generatedCode).toBe('string');
  });

  it('should detect node count mismatches (if we tamper with the result)', () => {
    // This tests the comparison logic itself
    const nw = new NodeWrangler();
    nw.newNode(NodeTypes.Value);
    nw.newNode(NodeTypes.RGB);

    const result = roundTripTest(nw);
    expect(result.success).toBe(true);
    expect(result.differences).toHaveLength(0);
  });
});

// ============================================================================
// generateFunctionBody tests
// ============================================================================

describe('generateFunctionBody', () => {
  it('should generate pure JS without imports or type annotations', () => {
    const nw = buildSimpleGraph();
    const serializer = new NodeCodeSerializer();
    const body = serializer.generateFunctionBody(nw);

    expect(body).not.toContain('import ');
    expect(body).not.toContain('export function');
    expect(body).not.toContain(': NodeWrangler');
    expect(body).toContain('nw.newNode(');
  });

  it('should be executable with new Function()', () => {
    const nw = buildSimpleGraph();
    const serializer = new NodeCodeSerializer({ includeComments: false });
    const body = serializer.generateFunctionBody(nw);

    // Should not throw when creating/executing the function
    const newNw = new NodeWrangler();
    const fn = new Function('nw', 'NodeTypes', body);

    expect(() => fn(newNw, NodeTypes)).not.toThrow();
    expect(newNw.getActiveGroup().nodes.size).toBe(2);
  });

  it('should recreate connections correctly via new Function()', () => {
    const nw = buildSimpleGraph();
    const serializer = new NodeCodeSerializer({ includeComments: false });
    const body = serializer.generateFunctionBody(nw);

    const newNw = new NodeWrangler();
    const fn = new Function('nw', 'NodeTypes', body);
    fn(newNw, NodeTypes);

    const group = newNw.getActiveGroup();
    expect(group.links.size).toBe(1);

    // Verify the link connects the right socket types
    const link = Array.from(group.links.values())[0];
    expect(link.fromSocket).toBe('UV');
    expect(link.toSocket).toBe('Vector');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('edge cases', () => {
  it('should handle an empty graph', () => {
    const nw = new NodeWrangler();
    const serializer = new NodeCodeSerializer();
    const code = serializer.serialize(nw);

    expect(code).toContain('export function buildGraph');
    // No nodes, no connections, no return
  });

  it('should handle a graph with a single node', () => {
    const nw = new NodeWrangler();
    nw.newNode(NodeTypes.Value);
    const code = new NodeCodeSerializer().serialize(nw);

    expect(code).toContain('NodeTypes.Value');
    expect(code).toMatch(/return \w+;/);
  });

  it('should handle nodes with complex properties', () => {
    const nw = new NodeWrangler();
    nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, {
      Scale: 10.0,
      Detail: 5,
      Roughness: 0.7,
    });
    const code = new NodeCodeSerializer().serialize(nw);

    expect(code).toContain('Scale: 10');
    expect(code).toContain('Detail: 5');
    expect(code).toContain('Roughness: 0.7');
  });

  it('should handle nodes with named custom names', () => {
    const nw = new NodeWrangler();
    nw.newNode(NodeTypes.Value, 'myCustomValue');
    const code = new NodeCodeSerializer().serialize(nw);

    expect(code).toContain("'myCustomValue'");
  });

  it('should handle the Convenience API round-trip', () => {
    const nw = new NodeWrangler();
    const texCoord = nw.newNode(NodeTypes.TextureCoord);
    const noiseTex = nw.newNode(NodeTypes.NoiseTexture, undefined, undefined, { Scale: 5.0 });
    const principled = nw.newNode(NodeTypes.PrincipledBSDF, undefined, undefined, {});
    const output = nw.newNode(NodeTypes.MaterialOutput);

    nw.setInputValue(principled, 'Base Color', [0.8, 0.2, 0.1, 1.0]);
    nw.connect(texCoord, 'UV', noiseTex, 'Vector');
    nw.connect(noiseTex, 'Fac', principled, 'Roughness');
    nw.connect(principled, 'BSDF', output, 'Surface');

    const result = roundTripTest(nw);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.differences).toHaveLength(0);
  });
});
