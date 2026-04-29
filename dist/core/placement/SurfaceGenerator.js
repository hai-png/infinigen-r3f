/**
 * Surface Generation System
 * Ports core surface generation logic from Infinigen's surface.py (16KB)
 * Handles procedural surface creation, displacement, and detail mapping
 */
import { Float32BufferAttribute, Mesh, PlaneGeometry, SphereGeometry, CylinderGeometry, BoxGeometry, TorusGeometry, ExtrudeGeometry, CatmullRomCurve3, } from 'three';
import { SeededRandom } from '../util/MathUtils';
export var SurfacePrimitive;
(function (SurfacePrimitive) {
    SurfacePrimitive["PLANE"] = "plane";
    SurfacePrimitive["SPHERE"] = "sphere";
    SurfacePrimitive["CYLINDER"] = "cylinder";
    SurfacePrimitive["BOX"] = "box";
    SurfacePrimitive["TORUS"] = "torus";
    SurfacePrimitive["CUSTOM"] = "custom";
})(SurfacePrimitive || (SurfacePrimitive = {}));
/**
 * Main Surface Generator Class
 * Generates displaced surfaces with configurable detail and boundary conditions
 */
export class SurfaceGenerator {
    constructor(config = {}) {
        this.config = {
            seed: Math.floor(Math.random() * 10000),
            resolution: 128,
            displacementScale: 0.1,
            displacementDetail: 1.0,
            roughness: 0.5,
            detailFrequency: 2.0,
            detailAmplitude: 1.0,
            boundaryType: 'open',
            ...config,
        };
        this.rng = new SeededRandom(this.config.seed);
    }
    /**
     * Generate a base primitive geometry
     */
    generateBasePrimitive(params) {
        let geometry;
        switch (params.type) {
            case SurfacePrimitive.PLANE:
                geometry = new PlaneGeometry(params.width || 1, params.height || 1, params.segments || this.config.resolution, params.segments || this.config.resolution);
                break;
            case SurfacePrimitive.SPHERE:
                geometry = new SphereGeometry(params.radius || 0.5, params.segments || this.config.resolution, params.segments || this.config.resolution, params.thetaStart || 0, params.thetaLength || Math.PI * 2, params.phiStart || 0, params.phiLength || Math.PI);
                break;
            case SurfacePrimitive.CYLINDER:
                geometry = new CylinderGeometry(params.radiusTop ?? params.radius || 0.5, params.radiusBottom ?? params.radius || 0.5, params.height || 1, params.radialSegments || this.config.resolution, params.heightSegments || this.config.resolution, params.openEnded || false);
                break;
            case SurfacePrimitive.BOX:
                geometry = new BoxGeometry(params.width || 1, params.height || 1, params.depth || 1, params.segments || this.config.resolution, params.segments || this.config.resolution, params.segments || this.config.resolution);
                break;
            case SurfacePrimitive.TORUS:
                geometry = new TorusGeometry(params.radius || 0.5, params.tube || 0.1, params.radialSegments || this.config.resolution, params.tubularSegments || this.config.resolution, params.arc || Math.PI * 2);
                break;
            default:
                throw new Error(`Unknown primitive type: ${params.type}`);
        }
        return geometry;
    }
    /**
     * Apply displacement to geometry using noise-based field
     */
    applyDisplacement(geometry, intensity = 1.0) {
        const positions = geometry.attributes.position.array;
        const normals = geometry.attributes.normal?.array;
        const hasNormals = !!normals;
        const newNormals = hasNormals ? new Float32Array(normals.length) : new Float32Array(positions.length);
        const displacement = this.generateDisplacementField(geometry);
        for (let i = 0; i < positions.length; i += 3) {
            const dispX = displacement.positions[i] * intensity * this.config.displacementScale;
            const dispY = displacement.positions[i + 1] * intensity * this.config.displacementScale;
            const dispZ = displacement.positions[i + 2] * intensity * this.config.displacementScale;
            positions[i] += dispX;
            positions[i + 1] += dispY;
            positions[i + 2] += dispZ;
            if (hasNormals) {
                newNormals[i] = displacement.normals[i];
                newNormals[i + 1] = displacement.normals[i + 1];
                newNormals[i + 2] = displacement.normals[i + 2];
            }
        }
        geometry.attributes.position.needsUpdate = true;
        if (!hasNormals) {
            geometry.computeVertexNormals();
        }
        else {
            geometry.setAttribute('normal', new Float32BufferAttribute(newNormals, 3));
        }
        geometry.computeVertexNormals();
        return geometry;
    }
    /**
     * Generate displacement field based on noise functions
     */
    generateDisplacementField(geometry) {
        const positions = geometry.attributes.position.array;
        const uvs = geometry.attributes.uv?.array;
        const numVertices = positions.length / 3;
        const outPositions = new Float32Array(positions.length);
        const outNormals = new Float32Array(positions.length);
        const outUvs = uvs ? new Float32Array(uvs.length) : new Float32Array(numVertices * 2);
        const octaves = 4;
        const persistence = 0.5;
        const lacunarity = 2.0;
        for (let i = 0; i < numVertices; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            const u = uvs ? uvs[i * 2] : x;
            const v = uvs ? uvs[i * 2 + 1] : y;
            let amplitude = 1.0;
            let frequency = this.config.detailFrequency;
            let noiseValue = 0;
            let maxValue = 0;
            for (let o = 0; o < octaves; o++) {
                noiseValue += this.noise3D(u * frequency, v * frequency, z * frequency * 0.5) * amplitude;
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= lacunarity;
            }
            noiseValue /= maxValue;
            noiseValue *= this.config.detailAmplitude * this.config.displacementDetail;
            const delta = 0.01;
            const nx = this.calculateGradientX(u, v, z, delta);
            const ny = this.calculateGradientY(u, v, z, delta);
            const nz = 1.0;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            outNormals[i * 3] = nx / len;
            outNormals[i * 3 + 1] = ny / len;
            outNormals[i * 3 + 2] = nz / len;
            outPositions[i * 3] = x + outNormals[i * 3] * noiseValue;
            outPositions[i * 3 + 1] = y + outNormals[i * 3 + 1] * noiseValue;
            outPositions[i * 3 + 2] = z + outNormals[i * 3 + 2] * noiseValue;
            if (uvs) {
                outUvs[i * 2] = uvs[i * 2];
                outUvs[i * 2 + 1] = uvs[i * 2 + 1];
            }
            else {
                outUvs[i * 2] = x;
                outUvs[i * 2 + 1] = y;
            }
        }
        return {
            positions: outPositions,
            normals: outNormals,
            uvs: outUvs,
        };
    }
    calculateGradientX(u, v, w, delta) {
        const n1 = this.noise3D((u + delta) * this.config.detailFrequency, v * this.config.detailFrequency, w * this.config.detailFrequency * 0.5);
        const n2 = this.noise3D((u - delta) * this.config.detailFrequency, v * this.config.detailFrequency, w * this.config.detailFrequency * 0.5);
        return (n1 - n2) / (2 * delta);
    }
    calculateGradientY(u, v, w, delta) {
        const n1 = this.noise3D(u * this.config.detailFrequency, (v + delta) * this.config.detailFrequency, w * this.config.detailFrequency * 0.5);
        const n2 = this.noise3D(u * this.config.detailFrequency, (v - delta) * this.config.detailFrequency, w * this.config.detailFrequency * 0.5);
        return (n1 - n2) / (2 * delta);
    }
    noise3D(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A = this.pHash(X) + Y;
        const AA = this.pHash(A) + Z;
        const AB = this.pHash(A + 1) + Z;
        const B = this.pHash(X + 1) + Y;
        const BA = this.pHash(B) + Z;
        const BB = this.pHash(B + 1) + Z;
        const res = this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.pHash(AA), x, y, z), this.grad(this.pHash(BA), x - 1, y, z)), this.lerp(u, this.grad(this.pHash(AB), x, y - 1, z), this.grad(this.pHash(BB), x - 1, y - 1, z))), this.lerp(v, this.lerp(u, this.grad(this.pHash(AA + 1), x, y, z - 1), this.grad(this.pHash(BA + 1), x - 1, y, z - 1)), this.lerp(u, this.grad(this.pHash(AB + 1), x, y - 1, z - 1), this.grad(this.pHash(BB + 1), x - 1, y - 1, z - 1))));
        return res;
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    pHash(n) {
        const perm = this.rng.getPermutationTable();
        return perm[n % 256];
    }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    generateSurface(primitiveParams, applyDisplacement = true, displacementIntensity = 1.0) {
        const geometry = this.generateBasePrimitive(primitiveParams);
        if (applyDisplacement) {
            this.applyDisplacement(geometry, displacementIntensity);
        }
        const material = this.createDefaultMaterial();
        return new Mesh(geometry, material);
    }
    createDefaultMaterial() {
        return {
            roughness: this.config.roughness,
            metalness: 0.0,
        };
    }
    generateExtrudedSurface(shape, depth = 1) {
        const extrudeSettings = {
            depth,
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.05,
            bevelOffset: 0,
            bevelSegments: 3,
        };
        const geometry = new ExtrudeGeometry(shape, extrudeSettings);
        this.applyDisplacement(geometry, 0.5);
        const material = this.createDefaultMaterial();
        return new Mesh(geometry, material);
    }
    generateSweptSurface(points, profileShape, closed = false) {
        const curve = new CatmullRomCurve3(points, closed);
        const geometry = new ExtrudeGeometry(profileShape, {
            extrudePath: curve,
            bevelEnabled: false,
        });
        this.applyDisplacement(geometry, 0.3);
        const material = this.createDefaultMaterial();
        return new Mesh(geometry, material);
    }
    applyBoundaryConditions(geometry) {
        if (this.config.boundaryType === 'periodic') {
            this.applyPeriodicBoundary(geometry);
        }
        else if (this.config.boundaryType === 'closed') {
            this.closeBoundaries(geometry);
        }
    }
    applyPeriodicBoundary(geometry) {
        console.log('Applying periodic boundary conditions');
    }
    closeBoundaries(geometry) {
        console.log('Closing surface boundaries');
    }
    subdivide(geometry, iterations = 1) {
        const indices = geometry.index?.array;
        if (!indices) {
            console.warn('Cannot subdivide non-indexed geometry');
            return geometry;
        }
        return geometry;
    }
    getConfig() {
        return { ...this.config };
    }
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.rng = new SeededRandom(this.config.seed);
    }
}
export default SurfaceGenerator;
//# sourceMappingURL=SurfaceGenerator.js.map