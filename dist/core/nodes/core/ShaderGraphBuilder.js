/**
 * Shader Graph Builder
 *
 * Builds shader material graphs from node connections
 * Ports functionality from Blender's shader node system to Three.js
 */
import { SocketType } from './types';
import { NodeType } from './node-types';
// ============================================================================
// Shader Graph Builder Class
// ============================================================================
export class ShaderGraphBuilder {
    constructor(options = {}) {
        this.nodes = new Map();
        this.links = [];
        this.inputInterface = new Map();
        this.outputInterface = new Map();
        this.linkCounter = 0;
        this.options = {
            autoConnect: true,
            validateConnections: true,
            optimize: true,
            ...options,
        };
    }
    // ==========================================================================
    // Node Creation Methods
    // ==========================================================================
    /**
     * Create a new node in the graph
     */
    createNode(type, name, settings, position) {
        const id = this.generateNodeId(type);
        const nodeName = name || this.getDefaultNodeName(type);
        const node = {
            id,
            type,
            name: nodeName,
            inputs: new Map(),
            outputs: new Map(),
            settings: settings || {},
            position,
        };
        // Initialize default inputs/outputs based on node type
        this.initializeNodeSockets(node);
        this.nodes.set(id, node);
        return node;
    }
    /**
     * Add a Principled BSDF shader node
     */
    addPrincipledBSDF(name = 'Principled BSDF', position) {
        return this.createNode(NodeType.PrincipledBSDF, name, {
            baseColor: [0.8, 0.8, 0.8, 1.0],
            subsurface: 0.0,
            subsurfaceRadius: [1.0, 1.0, 1.0],
            subsurfaceColor: [0.5, 0.5, 0.5],
            metallic: 0.0,
            specular: 0.5,
            specularTint: 0.0,
            roughness: 0.5,
            anisotropic: 0.0,
            anisotropicRotation: 0.0,
            sheen: 0.0,
            sheenTint: 0.5,
            clearcoat: 0.0,
            clearcoatRoughness: 0.03,
            ior: 1.45,
            transmission: 0.0,
            transmissionRoughness: 0.0,
            emission: [0.0, 0.0, 0.0],
            emissionStrength: 1.0,
            alpha: 1.0,
            normal: [0.0, 0.0, 1.0],
            tangent: [1.0, 0.0, 0.0],
        }, position);
    }
    /**
     * Add a Noise Texture node
     */
    addNoiseTexture(name = 'Noise Texture', scale = 5.0, detail = 2.0, roughness = 0.5, distortion = 0.0, position) {
        return this.createNode(NodeType.NoiseTexture, name, {
            vector: [0.0, 0.0, 0.0],
            scale,
            detail,
            roughness,
            distortion,
        }, position);
    }
    /**
     * Add a Voronoi Texture node
     */
    addVoronoiTexture(name = 'Voronoi Texture', scale = 1.0, smoothness = 0.0, exponent = 1.0, distanceMetric = 'euclidean', featureMode = 'f1', seed = 0, position) {
        return this.createNode(NodeType.VoronoiTexture, name, {
            vector: [0.0, 0.0, 0.0],
            scale,
            smoothness,
            exponent,
            distanceMetric,
            featureMode,
            seed,
        }, position);
    }
    /**
     * Add a Musgrave Texture node
     */
    addMusgraveTexture(name = 'Musgrave Texture', scale = 5.0, detail = 2.0, dimension = 2.0, lacunarity = 2.0, offset = 0.0, gain = 1.0, musgraveType = 'fbm', position) {
        return this.createNode(NodeType.MusgraveTexture, name, {
            vector: [0.0, 0.0, 0.0],
            scale,
            detail,
            dimension,
            lacunarity,
            offset,
            gain,
            musgraveType,
        }, position);
    }
    /**
     * Add a ColorRamp node
     */
    addColorRamp(name = 'ColorRamp', stops, interpolation = 'linear', position) {
        return this.createNode(NodeType.ColorRamp, name, {
            stops: stops || [
                { position: 0.0, color: [0.0, 0.0, 0.0, 1.0] },
                { position: 1.0, color: [1.0, 1.0, 1.0, 1.0] },
            ],
            interpolation,
        }, position);
    }
    /**
     * Add a MixRGB node
     */
    addMixRGB(name = 'Mix RGB', blendType = 'MIX', factor = 0.5, color1 = [1.0, 1.0, 1.0, 1.0], color2 = [0.0, 0.0, 0.0, 1.0], position) {
        return this.createNode(NodeType.MixRGB, name, {
            blendType,
            factor,
            color1,
            color2,
        }, position);
    }
    /**
     * Add a Texture Coordinate node
     */
    addTextureCoordinate(name = 'Texture Coordinate', position) {
        return this.createNode(NodeType.TextureCoordinate, name, {}, position);
    }
    /**
     * Add a Mapping node
     */
    addMapping(name = 'Mapping', translation = [0.0, 0.0, 0.0], rotation = [0.0, 0.0, 0.0], scale = [1.0, 1.0, 1.0], position) {
        return this.createNode(NodeType.Mapping, name, {
            vector: [0.0, 0.0, 0.0],
            translation,
            rotation,
            scale,
            type: 'point',
        }, position);
    }
    /**
     * Add a Material Output node
     */
    addMaterialOutput(name = 'Material Output', position) {
        return this.createNode(NodeType.MaterialOutput, name, {
            target: 'ALL',
            is_active_output: true,
        }, position);
    }
    // ==========================================================================
    // Connection Methods
    // ==========================================================================
    /**
     * Connect two nodes together
     */
    connect(fromNode, fromSocket, toNode, toSocket) {
        const fromNodeId = typeof fromNode === 'string' ? fromNode : fromNode.id;
        const toNodeId = typeof toNode === 'string' ? toNode : toNode.id;
        // Validate connection if enabled
        if (this.options.validateConnections) {
            this.validateConnection(fromNodeId, fromSocket, toNodeId, toSocket);
        }
        const link = {
            id: `link_${this.linkCounter++}`,
            fromNode: fromNodeId,
            fromSocket,
            toNode: toNodeId,
            toSocket,
        };
        this.links.push(link);
        // Update socket connection tracking
        const fromNodeObj = this.nodes.get(fromNodeId);
        const toNodeObj = this.nodes.get(toNodeId);
        if (fromNodeObj) {
            const outputSocket = fromNodeObj.outputs.get(fromSocket);
            if (outputSocket) {
                outputSocket.connectedLinks.push(link.id);
            }
        }
        if (toNodeObj) {
            const inputSocket = toNodeObj.inputs.get(toSocket);
            if (inputSocket) {
                inputSocket.connectedLinks.push(link.id);
            }
        }
        return link;
    }
    /**
     * Connect a texture to the base color of a Principled BSDF
     */
    connectTextureToBaseColor(textureNode, bsdfNode, textureOutput = 'color', mappingNode) {
        const links = [];
        let sourceNode = textureNode;
        // Add mapping node if provided
        if (mappingNode) {
            const mappingId = typeof mappingNode === 'string' ? mappingNode : mappingNode.id;
            const texNodeId = typeof textureNode === 'string' ? textureNode : textureNode.id;
            // Connect texture vector to mapping vector
            this.connect(texNodeId, 'vector', mappingId, 'vector');
            sourceNode = mappingNode;
        }
        const bsdfId = typeof bsdfNode === 'string' ? bsdfNode : bsdfNode.id;
        const sourceId = typeof sourceNode === 'string' ? sourceNode : sourceNode.id;
        // Connect to base color
        links.push(this.connect(sourceId, textureOutput, bsdfId, 'base_color'));
        return links;
    }
    /**
     * Connect a texture through a ColorRamp to a shader input
     */
    connectTextureThroughColorRamp(textureNode, colorRampNode, shaderNode, shaderInput, textureOutput = 'float') {
        const texId = typeof textureNode === 'string' ? textureNode : textureNode.id;
        const rampId = typeof colorRampNode === 'string' ? colorRampNode : colorRampNode.id;
        const shaderId = typeof shaderNode === 'string' ? shaderNode : shaderNode.id;
        // Connect texture to color ramp
        this.connect(texId, textureOutput, rampId, 'fac');
        // Connect color ramp to shader
        return [this.connect(rampId, 'color', shaderId, shaderInput)];
    }
    // ==========================================================================
    // Interface Methods
    // ==========================================================================
    /**
     * Add an input to the graph interface
     */
    addInput(name, type, defaultValue) {
        const socket = {
            id: `input_${name}`,
            name,
            type,
            value: defaultValue,
            connectedLinks: [],
        };
        this.inputInterface.set(name, socket);
        return socket;
    }
    /**
     * Add an output to the graph interface
     */
    addOutput(name, type, sourceNode, sourceSocket) {
        const socket = {
            id: `output_${name}`,
            name,
            type,
            connectedLinks: [],
        };
        this.outputInterface.set(name, socket);
        // Connect to source if provided
        if (sourceNode && sourceSocket) {
            const nodeId = typeof sourceNode === 'string' ? sourceNode : sourceNode.id;
            this.connect(nodeId, sourceSocket, 'output', name);
        }
        return socket;
    }
    // ==========================================================================
    // Build Methods
    // ==========================================================================
    /**
     * Build the final shader graph
     */
    build() {
        // Convert to NodeTree format
        const tree = {
            id: this.generateTreeId(),
            name: 'Shader Graph',
            type: 'ShaderNodeTree',
            nodes: this.convertNodesToTree(),
            links: [...this.links],
            groups: new Map(),
            interface: {
                inputs: this.inputInterface,
                outputs: this.outputInterface,
            },
        };
        // Optimize if enabled
        if (this.options.optimize) {
            this.optimizeGraph(tree);
        }
        return {
            tree,
            nodes: new Map(this.nodes),
            links: this.links,
            inputInterface: new Map(this.inputInterface),
            outputInterface: new Map(this.outputInterface),
        };
    }
    /**
     * Reset the builder for a new graph
     */
    reset() {
        this.nodes.clear();
        this.links = [];
        this.inputInterface.clear();
        this.outputInterface.clear();
        this.linkCounter = 0;
    }
    // ==========================================================================
    // Private Helper Methods
    // ==========================================================================
    generateNodeId(type) {
        return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    generateTreeId() {
        return `tree_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getDefaultNodeName(type) {
        return type.replace(/([A-Z])/g, ' $1').trim();
    }
    initializeNodeSockets(node) {
        // Initialize sockets based on node type
        switch (node.type) {
            case NodeType.PrincipledBSDF:
                node.inputs.set('base_color', this.createSocket('Base Color', SocketType.COLOR, [0.8, 0.8, 0.8, 1.0]));
                node.inputs.set('roughness', this.createSocket('Roughness', SocketType.FLOAT, 0.5));
                node.inputs.set('metallic', this.createSocket('Metallic', SocketType.FLOAT, 0.0));
                node.inputs.set('normal', this.createSocket('Normal', SocketType.VECTOR, [0.0, 0.0, 1.0]));
                node.outputs.set('bsdf', this.createSocket('BSDF', SocketType.SHADER));
                break;
            case NodeType.NoiseTexture:
            case NodeType.VoronoiTexture:
            case NodeType.MusgraveTexture:
                node.inputs.set('vector', this.createSocket('Vector', SocketType.VECTOR, [0.0, 0.0, 0.0]));
                node.inputs.set('scale', this.createSocket('Scale', SocketType.FLOAT, 1.0));
                node.outputs.set('float', this.createSocket('Float', SocketType.FLOAT));
                node.outputs.set('color', this.createSocket('Color', SocketType.COLOR));
                break;
            case NodeType.ColorRamp:
                node.inputs.set('fac', this.createSocket('Fac', SocketType.FLOAT, 0.5));
                node.outputs.set('color', this.createSocket('Color', SocketType.COLOR));
                node.outputs.set('alpha', this.createSocket('Alpha', SocketType.FLOAT));
                break;
            case NodeType.MixRGB:
                node.inputs.set('factor', this.createSocket('Factor', SocketType.FLOAT, 0.5));
                node.inputs.set('color1', this.createSocket('Color1', SocketType.COLOR, [1.0, 1.0, 1.0, 1.0]));
                node.inputs.set('color2', this.createSocket('Color2', SocketType.COLOR, [0.0, 0.0, 0.0, 1.0]));
                node.outputs.set('color', this.createSocket('Color', SocketType.COLOR));
                break;
            case NodeType.TextureCoordinate:
                node.outputs.set('generated', this.createSocket('Generated', SocketType.VECTOR));
                node.outputs.set('normal', this.createSocket('Normal', SocketType.VECTOR));
                node.outputs.set('uv', this.createSocket('UV', SocketType.VECTOR));
                node.outputs.set('object', this.createSocket('Object', SocketType.VECTOR));
                node.outputs.set('camera', this.createSocket('Camera', SocketType.VECTOR));
                node.outputs.set('window', this.createSocket('Window', SocketType.VECTOR));
                break;
            case NodeType.Mapping:
                node.inputs.set('vector', this.createSocket('Vector', SocketType.VECTOR, [0.0, 0.0, 0.0]));
                node.outputs.set('vector', this.createSocket('Vector', SocketType.VECTOR));
                break;
            case NodeType.MaterialOutput:
                node.inputs.set('surface', this.createSocket('Surface', SocketType.SHADER));
                node.inputs.set('volume', this.createSocket('Volume', SocketType.SHADER));
                node.inputs.set('displacement', this.createSocket('Displacement', SocketType.SHADER));
                break;
        }
    }
    createSocket(name, type, defaultValue) {
        return {
            id: `socket_${name}_${Date.now()}`,
            name,
            type,
            value: defaultValue,
            connectedLinks: [],
        };
    }
    validateConnection(fromNode, fromSocket, toNode, toSocket) {
        const fromNodeObj = this.nodes.get(fromNode);
        const toNodeObj = this.nodes.get(toNode);
        if (!fromNodeObj) {
            throw new Error(`Source node not found: ${fromNode}`);
        }
        if (!toNodeObj) {
            throw new Error(`Target node not found: ${toNode}`);
        }
        const outputSocket = fromNodeObj.outputs.get(fromSocket);
        const inputSocket = toNodeObj.inputs.get(toSocket);
        if (!outputSocket) {
            throw new Error(`Output socket not found: ${fromSocket} on node ${fromNode}`);
        }
        if (!inputSocket) {
            throw new Error(`Input socket not found: ${toSocket} on node ${toNode}`);
        }
        // Check type compatibility
        if (!this.areSocketTypesCompatible(outputSocket.type, inputSocket.type)) {
            throw new Error(`Incompatible socket types: ${outputSocket.type} -> ${inputSocket.type}`);
        }
    }
    areSocketTypesCompatible(source, target) {
        if (source === target)
            return true;
        // Allow some implicit conversions
        const compatiblePairs = [
            [SocketType.FLOAT, SocketType.INT],
            [SocketType.INT, SocketType.FLOAT],
            [SocketType.COLOR, SocketType.VECTOR],
            [SocketType.VECTOR, SocketType.COLOR],
        ];
        return compatiblePairs.some(([a, b]) => (source === a && target === b) || (source === b && target === a));
    }
    convertNodesToTree() {
        const treeNodes = new Map();
        this.nodes.forEach((node, id) => {
            const instance = {
                id: node.id,
                type: node.type,
                name: node.name,
                position: node.position || { x: 0, y: 0 },
                settings: node.settings,
                inputs: new Map(),
                outputs: new Map(),
            };
            // Convert sockets
            node.inputs.forEach((socket, name) => {
                instance.inputs.set(name, socket.value);
            });
            node.outputs.forEach((socket, name) => {
                instance.outputs.set(name, socket.value);
            });
            treeNodes.set(id, instance);
        });
        return treeNodes;
    }
    optimizeGraph(tree) {
        // Remove disconnected nodes (nodes that don't contribute to output)
        const outputNodes = new Set();
        // Start from output interface and trace back
        tree.interface.outputs.forEach((socket) => {
            socket.connectedLinks.forEach((linkId) => {
                const link = tree.links.find((l) => l.id === linkId);
                if (link) {
                    outputNodes.add(link.fromNode);
                }
            });
        });
        // Trace back through all connections
        let changed = true;
        while (changed) {
            changed = false;
            tree.links.forEach((link) => {
                if (outputNodes.has(link.toNode) && !outputNodes.has(link.fromNode)) {
                    outputNodes.add(link.fromNode);
                    changed = true;
                }
            });
        }
        // Remove nodes not in the output chain
        tree.nodes.forEach((_, nodeId) => {
            if (!outputNodes.has(nodeId)) {
                tree.nodes.delete(nodeId);
            }
        });
        // Remove links to deleted nodes
        tree.links = tree.links.filter((link) => outputNodes.has(link.fromNode) && outputNodes.has(link.toNode));
    }
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Create a simple PBR material with noise texture
 */
export function createPBRMaterialWithNoise(options = {}) {
    const builder = new ShaderGraphBuilder();
    // Create nodes
    const texCoord = builder.addTextureCoordinate('Texture Coordinate', { x: -300, y: -200 });
    const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [options.noiseScale || 5, options.noiseScale || 5, options.noiseScale || 5], { x: -100, y: -200 });
    const noise = builder.addNoiseTexture('Noise Texture', options.noiseScale || 5, options.noiseDetail || 2, undefined, undefined, { x: 100, y: -200 });
    const colorRamp = builder.addColorRamp('ColorRamp', undefined, 'linear', { x: 300, y: -200 });
    const bsdf = builder.addPrincipledBSDF('Principled BSDF', { x: 500, y: -200 });
    const output = builder.addMaterialOutput('Material Output', { x: 700, y: -200 });
    // Connect nodes
    builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
    builder.connect(mapping.id, 'vector', noise.id, 'vector');
    builder.connect(noise.id, 'float', colorRamp.id, 'fac');
    builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
    builder.connect(bsdf.id, 'bsdf', output.id, 'surface');
    // Set BSDF properties
    bsdf.settings.roughness = options.roughness ?? 0.5;
    bsdf.settings.metallic = options.metallic ?? 0.0;
    return builder.build();
}
/**
 * Create a procedural marble material
 */
export function createMarbleMaterial(options = {}) {
    const builder = new ShaderGraphBuilder();
    const texCoord = builder.addTextureCoordinate('Texture Coordinate', { x: -300, y: -200 });
    const mapping = builder.addMapping('Mapping', [0, 0, 0], [0, 0, 0], [options.scale || 3, options.scale || 3, options.scale || 3], { x: -100, y: -200 });
    const noise1 = builder.addNoiseTexture('Noise Texture 1', options.scale || 3, 2, undefined, options.distortion || 0.5, { x: 100, y: -300 });
    const noise2 = builder.addNoiseTexture('Noise Texture 2', options.scale || 3 * 2, 2, undefined, options.distortion || 0.5, { x: 100, y: -100 });
    const mix = builder.addMixRGB('Mix', 'ADD', 0.5, undefined, undefined, { x: 300, y: -200 });
    const colorRamp = builder.addColorRamp('ColorRamp', undefined, 'linear', { x: 500, y: -200 });
    const bsdf = builder.addPrincipledBSDF('Principled BSDF', { x: 700, y: -200 });
    const output = builder.addMaterialOutput('Material Output', { x: 900, y: -200 });
    // Connect nodes
    builder.connect(texCoord.id, 'uv', mapping.id, 'vector');
    builder.connect(mapping.id, 'vector', noise1.id, 'vector');
    builder.connect(mapping.id, 'vector', noise2.id, 'vector');
    builder.connect(noise1.id, 'float', mix.id, 'color1');
    builder.connect(noise2.id, 'float', mix.id, 'color2');
    builder.connect(mix.id, 'color', colorRamp.id, 'fac');
    builder.connect(colorRamp.id, 'color', bsdf.id, 'base_color');
    builder.connect(bsdf.id, 'bsdf', output.id, 'surface');
    return builder.build();
}
export default ShaderGraphBuilder;
//# sourceMappingURL=ShaderGraphBuilder.js.map