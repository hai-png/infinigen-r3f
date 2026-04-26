import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
export class WaterMaterial {
    constructor(config) {
        this.time = 0;
        this.config = {
            baseColor: new THREE.Color(0x29b6f6),
            deepColor: new THREE.Color(0x01579b),
            foamColor: new THREE.Color(0xffffff),
            transparency: 0.8,
            roughness: 0.1,
            metalness: 0.1,
            waveHeight: 0.3,
            waveSpeed: 1.0,
            enableFoam: true,
            enableCaustics: false,
            ...config,
        };
        this.material = this.createMaterial();
    }
    createMaterial() {
        const material = new THREE.MeshPhysicalMaterial({
            color: this.config.baseColor,
            roughness: this.config.roughness,
            metalness: this.config.metalness,
            transmission: this.config.transparency,
            thickness: 2.0,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            ior: 1.33,
            side: THREE.DoubleSide,
        });
        this.generateWaterSurface(material);
        return material;
    }
    generateWaterSurface(material) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                const wave = this.getWaveHeight(x / size, y / size, 0);
                // Depth-based color
                const depthFactor = (wave + 1) / 2;
                const r = this.config.baseColor.r * (1 - depthFactor) + this.config.deepColor.r * depthFactor;
                const g = this.config.baseColor.g * (1 - depthFactor) + this.config.deepColor.g * depthFactor;
                const b = this.config.baseColor.b * (1 - depthFactor) + this.config.deepColor.b * depthFactor;
                imageData.data[index] = Math.floor(r * 255);
                imageData.data[index + 1] = Math.floor(g * 255);
                imageData.data[index + 2] = Math.floor(b * 255);
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        material.map = texture;
    }
    getWaveHeight(u, v, t) {
        const wave1 = Math.sin(u * 10 + t) * 0.5;
        const wave2 = Math.cos(v * 8 + t * 0.8) * 0.3;
        const noise = NoiseUtils.perlin2D(u * 5 + t, v * 5) * 0.2;
        return (wave1 + wave2 + noise) * this.config.waveHeight;
    }
    update(deltaTime) {
        this.time += deltaTime * this.config.waveSpeed;
        this.generateWaterSurface(this.material);
    }
    getMaterial() {
        return this.material;
    }
    static createPreset(preset) {
        switch (preset) {
            case 'ocean':
                return new WaterMaterial({
                    baseColor: new THREE.Color(0x0288d1),
                    deepColor: new THREE.Color(0x01579b),
                    waveHeight: 0.5,
                    waveSpeed: 1.2,
                });
            case 'lake':
                return new WaterMaterial({
                    baseColor: new THREE.Color(0x29b6f6),
                    deepColor: new THREE.Color(0x0277bd),
                    waveHeight: 0.2,
                    waveSpeed: 0.5,
                });
            case 'river':
                return new WaterMaterial({
                    baseColor: new THREE.Color(0x4fc3f7),
                    deepColor: new THREE.Color(0x0288d1),
                    waveHeight: 0.3,
                    waveSpeed: 1.5,
                });
            case 'pool':
                return new WaterMaterial({
                    baseColor: new THREE.Color(0x4dd0e1),
                    deepColor: new THREE.Color(0x0097a7),
                    transparency: 0.9,
                    waveHeight: 0.1,
                });
            case 'swamp':
                return new WaterMaterial({
                    baseColor: new THREE.Color(0x558b2f),
                    deepColor: new THREE.Color(0x33691e),
                    transparency: 0.5,
                    roughness: 0.3,
                });
            default:
                return new WaterMaterial();
        }
    }
}
//# sourceMappingURL=WaterMaterial.js.map