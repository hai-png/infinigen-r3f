/**
 * Base Material Generator
 * Abstract base class for all material generators following Infinigen's pattern
 */
import { Color } from 'three';
import { SeededRandom } from '../../core/util/math/distributions';
export class BaseMaterialGenerator {
    constructor(seed) {
        this.rng = new SeededRandom(seed ?? Math.random() * 10000);
    }
    /**
     * Merge default params with provided params
     */
    mergeParams(defaults, overrides) {
        return { ...defaults, ...overrides };
    }
    /**
     * Create a base material instance
     */
    createBaseMaterial() {
        // Override in subclasses to create specific material types
        throw new Error('createBaseMaterial must be implemented by subclass');
    }
    /**
     * Create a texture from a color
     */
    createTextureFromColor(color, size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const hex = color instanceof Color ? `#${color.getHexString()}` : `#${new Color(color).getHexString()}`;
            ctx.fillStyle = hex;
            ctx.fillRect(0, 0, size, size);
        }
        // Note: CanvasTexture requires browser environment
        // In Node.js, this would need a different implementation
        return {};
    }
    /**
     * Get pixel color from texture at given coordinates
     */
    getPixelColor(texture, u, v) {
        // Simplified implementation - actual implementation would sample texture
        return new Color(1, 1, 1);
    }
    setSeed(seed) {
        this.rng = new SeededRandom(seed);
    }
}
//# sourceMappingURL=BaseMaterialGenerator.js.map