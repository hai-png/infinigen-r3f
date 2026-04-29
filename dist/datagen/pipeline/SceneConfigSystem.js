/**
 * Configuration System for Scene Specification
 *
 * Provides YAML/JSON configuration support for defining scenes,
 * objects, materials, lighting, and rendering parameters.
 *
 * This system ports the functionality from Infinigen's configs/ directory,
 * enabling declarative scene specification and batch processing.
 */
/**
 * Configuration Parser and Validator
 */
export class ConfigParser {
    /**
     * Parse a JSON configuration string
     */
    static parseJSON(jsonString) {
        try {
            const config = JSON.parse(jsonString);
            this.validate(config);
            return config;
        }
        catch (error) {
            throw new Error(`Failed to parse JSON config: ${error}`);
        }
    }
    /**
     * Parse a YAML configuration string
     * Note: Requires js-yaml package for full YAML support
     */
    static parseYAML(yamlString) {
        try {
            // Simple YAML parser for basic configs
            // For production use, integrate with js-yaml package
            const config = this.simpleYAMLParse(yamlString);
            this.validate(config);
            return config;
        }
        catch (error) {
            throw new Error(`Failed to parse YAML config: ${error}`);
        }
    }
    /**
     * Validate configuration structure
     */
    static validate(config) {
        const errors = [];
        // Required fields
        if (!config.name) {
            errors.push('Missing required field: name');
        }
        if (!config.version) {
            errors.push('Missing required field: version');
        }
        // Validate cameras
        if (config.cameras) {
            config.cameras.forEach((camera, index) => {
                if (!camera.id) {
                    errors.push(`Camera at index ${index} missing id`);
                }
                if (!camera.type) {
                    errors.push(`Camera "${camera.id}" missing type`);
                }
            });
        }
        // Validate objects
        if (config.objects) {
            config.objects.forEach((obj, index) => {
                if (!obj.id) {
                    errors.push(`Object at index ${index} missing id`);
                }
                if (!obj.type) {
                    errors.push(`Object "${obj.id}" missing type`);
                }
            });
        }
        // Validate rendering config
        if (config.rendering?.resolution) {
            const res = config.rendering.resolution;
            if ('width' in res && (!res.width || !res.height)) {
                errors.push('Invalid resolution: missing width or height');
            }
        }
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }
    /**
     * Convert configuration to JSON string
     */
    static toJSON(config, pretty) {
        if (pretty) {
            return JSON.stringify(config, null, 2);
        }
        return JSON.stringify(config);
    }
    /**
     * Load configuration from file (Node.js environment)
     */
    static async loadFromFile(filePath) {
        // In Node.js environment
        if (typeof require !== 'undefined') {
            const fs = await import('fs').catch(() => null);
            const path = await import('path').catch(() => null);
            if (fs && path) {
                const ext = path.extname(filePath).toLowerCase();
                const content = fs.readFileSync(filePath, 'utf-8');
                if (ext === '.json') {
                    return this.parseJSON(content);
                }
                else if (ext === '.yaml' || ext === '.yml') {
                    return this.parseYAML(content);
                }
                else {
                    throw new Error(`Unsupported config file extension: ${ext}`);
                }
            }
        }
        throw new Error('File loading not available in browser environment');
    }
    /**
     * Create default configuration template
     */
    static createDefault() {
        return {
            name: 'Untitled Scene',
            version: '1.0.0',
            description: 'Default scene configuration',
            environment: {
                type: 'studio',
                background: {
                    type: 'color',
                    color: [0.5, 0.5, 0.5],
                },
            },
            cameras: [
                {
                    id: 'main',
                    type: 'perspective',
                    position: [5, 5, 5],
                    target: [0, 0, 0],
                    fov: 60,
                    near: 0.1,
                    far: 1000,
                },
            ],
            lighting: {
                ambient: {
                    enabled: true,
                    color: [0.4, 0.4, 0.4],
                    intensity: 1,
                },
                directional: [
                    {
                        enabled: true,
                        color: [1, 1, 1],
                        intensity: 1,
                        direction: [1, -1, 0.5],
                        castShadow: true,
                        shadowMapSize: 2048,
                    },
                ],
            },
            rendering: {
                resolution: { width: 1920, height: 1080 },
                antialias: { enabled: true, samples: 4 },
                toneMapping: { type: 'aces', exposure: 1 },
                shadows: { enabled: true, type: 'pcfSoft', mapSize: 2048 },
            },
            output: {
                directory: './output',
                namingPattern: '{scene}_{camera}_0001',
                formats: {
                    image: { enabled: true, format: 'png', compression: 9 },
                    depth: { enabled: false, format: 'exr' },
                    normal: { enabled: false, format: 'png' },
                    segmentation: { enabled: false, format: 'png', mode: 'color' },
                },
            },
        };
    }
    /**
     * Simple YAML parser for basic configurations
     * For production use, integrate with js-yaml package
     */
    static simpleYAMLParse(yamlString) {
        // This is a very simplified YAML parser
        // It only handles basic key-value pairs and nested objects
        // For full YAML support, use the js-yaml package
        const result = {};
        const lines = yamlString.split('\n');
        const stack = [{ obj: result, indent: -1 }];
        for (const line of lines) {
            // Skip comments and empty lines
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            // Calculate indentation
            const indent = line.search(/\S/);
            // Parse key-value
            const match = trimmed.match(/^(\w+):\s*(.*)$/);
            if (match) {
                const [, key, value] = match;
                // Pop stack until we find parent with smaller indent
                while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                    stack.pop();
                }
                const parent = stack[stack.length - 1].obj;
                if (value === '') {
                    // Nested object
                    parent[key] = {};
                    stack.push({ obj: parent[key], indent });
                }
                else {
                    // Simple value
                    parent[key] = this.parseYAMLValue(value);
                }
            }
        }
        return result;
    }
    /**
     * Parse YAML value to appropriate type
     */
    static parseYAMLValue(value) {
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }
        // Boolean
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        // Null
        if (value === 'null' || value === '~')
            return null;
        // Number
        const num = Number(value);
        if (!isNaN(num))
            return num;
        // Array (simple [a, b, c])
        if (value.startsWith('[') && value.endsWith(']')) {
            return value
                .slice(1, -1)
                .split(',')
                .map(v => this.parseYAMLValue(v.trim()));
        }
        // String
        return value;
    }
    /**
     * Merge multiple configurations
     */
    static merge(...configs) {
        return configs.reduce((acc, config) => {
            return this.deepMerge(acc, config);
        }, this.createDefault());
    }
    /**
     * Deep merge two objects
     */
    static deepMerge(target, source) {
        const output = { ...target };
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    }
                    else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                }
                else {
                    output[key] = source[key];
                }
            }
        }
        return output;
    }
    /**
     * Check if value is an object
     */
    static isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    /**
     * Apply variable substitution in config values
     */
    static substituteVariables(config, variables) {
        const jsonStr = JSON.stringify(config);
        const substituted = jsonStr.replace(/\$\{(\w+)\}/g, (_, key) => {
            if (key in variables) {
                return JSON.stringify(variables[key]).slice(1, -1);
            }
            return _;
        });
        return JSON.parse(substituted);
    }
}
export default ConfigParser;
//# sourceMappingURL=SceneConfigSystem.js.map