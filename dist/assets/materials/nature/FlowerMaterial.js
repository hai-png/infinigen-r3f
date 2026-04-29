import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';
/**
 * Procedural flower material generator
 */
export class FlowerMaterial {
    static generate(config = {}) {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D context for flower material generation');
        }
        this.generatePetalTexture(ctx, size, finalConfig);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const normalCanvas = document.createElement('canvas');
        normalCanvas.width = size;
        normalCanvas.height = size;
        const normalCtx = normalCanvas.getContext('2d');
        if (normalCtx) {
            this.generateNormalMap(normalCtx, size, finalConfig);
        }
        const normalTexture = new THREE.CanvasTexture(normalCanvas);
        normalTexture.wrapS = THREE.RepeatWrapping;
        normalTexture.wrapT = THREE.RepeatWrapping;
        return new THREE.MeshStandardMaterial({
            map: texture,
            normalMap: normalTexture,
            normalScale: new THREE.Vector2(finalConfig.normalScale, finalConfig.normalScale),
            roughness: finalConfig.petalRoughness,
            metalness: finalConfig.petalMetalness,
            transparent: finalConfig.petalOpacity < 1.0,
            opacity: finalConfig.petalOpacity,
            side: THREE.DoubleSide,
            emissive: finalConfig.hasDewdrops ? new THREE.Color(0x224466) : new THREE.Color(0x000000),
            emissiveIntensity: finalConfig.hasDewdrops ? 0.2 : 0.0,
        });
    }
    static generatePetalTexture(ctx, size, config) {
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size * 0.45;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, config.centerColor.getStyle());
        gradient.addColorStop(0.3, config.petalColor.getStyle());
        gradient.addColorStop(1, config.petalColor.clone().multiplyScalar(0.7).getStyle());
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = x / size;
                const ny = y / size;
                const veinNoise = NoiseUtils.perlin2D(nx * 8, ny * 8) * 0.5 + 0.5;
                const radialDist = Math.sqrt((nx - 0.5) ** 2 + (ny - 0.5) ** 2);
                const angle = Math.atan2(ny - 0.5, nx - 0.5);
                const veinPattern = Math.sin(angle * 12 + veinNoise * 4) * 0.5 + 0.5;
                const veinIntensity = (1 - radialDist) * veinPattern * veinNoise * 0.3;
                const idx = (y * size + x) * 4;
                data[idx] = Math.max(0, data[idx] - veinIntensity * 50);
                data[idx + 1] = Math.max(0, data[idx + 1] - veinIntensity * 30);
                data[idx + 2] = Math.max(0, data[idx + 2] - veinIntensity * 40);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        if (config.hasDewdrops) {
            this.addDewdrops(ctx, size);
        }
    }
    static generateNormalMap(ctx, size, config) {
        ctx.fillStyle = '#8080ff';
        ctx.fillRect(0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = x / size;
                const ny = y / size;
                const veinNoise = NoiseUtils.perlin2D(nx * 8, ny * 8);
                const angle = Math.atan2(ny - 0.5, nx - 0.5);
                const veinPattern = Math.sin(angle * 12 + veinNoise * 4);
                const bumpStrength = 0.15;
                const normalX = veinPattern * bumpStrength;
                const normalY = Math.cos(angle * 6) * bumpStrength * 0.5;
                const normalZ = Math.sqrt(Math.max(0, 1 - normalX * normalX - normalY * normalY));
                const idx = (y * size + x) * 4;
                data[idx] = Math.floor((normalX + 1) * 127.5);
                data[idx + 1] = Math.floor((normalY + 1) * 127.5);
                data[idx + 2] = Math.floor(normalZ * 255);
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }
    static addDewdrops(ctx, size) {
        const numDewdrops = 8;
        for (let i = 0; i < numDewdrops; i++) {
            const x = Math.random() * size * 0.8 + size * 0.1;
            const y = Math.random() * size * 0.8 + size * 0.1;
            const radius = Math.random() * 3 + 2;
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    static getPreset(flowerType) {
        const presets = {
            rose: {
                ...this.DEFAULT_CONFIG,
                petalColor: new THREE.Color(0xdc143c),
                centerColor: new THREE.Color(0x8b0000),
                petalRoughness: 0.3,
                hasDewdrops: true,
            },
            daisy: {
                ...this.DEFAULT_CONFIG,
                petalColor: new THREE.Color(0xffffff),
                centerColor: new THREE.Color(0xffd700),
                petalOpacity: 0.9,
                petalRoughness: 0.5,
            },
            tulip: {
                ...this.DEFAULT_CONFIG,
                petalColor: new THREE.Color(0xff1493),
                centerColor: new THREE.Color(0x4b0082),
                petalRoughness: 0.25,
                subsurfaceScattering: 0.7,
            },
            sunflower: {
                ...this.DEFAULT_CONFIG,
                petalColor: new THREE.Color(0xffd700),
                centerColor: new THREE.Color(0x8b4513),
                petalRoughness: 0.6,
                centerRoughness: 0.9,
            },
            lavender: {
                ...this.DEFAULT_CONFIG,
                petalColor: new THREE.Color(0x967bb6),
                centerColor: new THREE.Color(0x6a5acd),
                petalOpacity: 0.85,
                petalRoughness: 0.45,
            },
        };
        return presets[flowerType.toLowerCase()] || this.DEFAULT_CONFIG;
    }
}
FlowerMaterial.DEFAULT_CONFIG = {
    petalColor: new THREE.Color(0xff69b4),
    petalOpacity: 0.95,
    petalRoughness: 0.4,
    petalMetalness: 0.1,
    centerColor: new THREE.Color(0xffd700),
    centerRoughness: 0.8,
    hasDewdrops: false,
    subsurfaceScattering: 0.5,
    normalScale: 1.0,
    animationSpeed: 0.5
};
//# sourceMappingURL=FlowerMaterial.js.map