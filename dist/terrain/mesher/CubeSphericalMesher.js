/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Cube Spherical Mesher for Hybrid Planet/Cube Mapping
 *
 * Based on original: infinigen/terrain/mesher/cube_spherical_mesher.py
 * Combines spherical and cube mapping for reduced distortion at poles
 */
import { Vector3, BufferGeometry, Float32BufferAttribute } from 'three';
import { SphericalMesher } from './SphericalMesher';
export class CubeSphericalMesher extends SphericalMesher {
    constructor(cameraPose, bounds, config = {}) {
        super(cameraPose, bounds, config);
        this.cubeConfig = {
            cubeMapResolution: 256,
            blendFactor: 0.5,
            cornerSmoothing: 0.1,
            ...config,
        };
    }
    /**
     * Generate mesh using cube-sphere hybrid mapping
     * Projects sphere onto cube faces for more uniform sampling
     */
    generateMesh(kernels) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const { rMin, rMax } = this.config;
        const { cubeMapResolution, blendFactor, cornerSmoothing } = this.cubeConfig;
        // Define cube face normals and up vectors
        const faces = [
            { normal: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), name: 'right' },
            { normal: new Vector3(-1, 0, 0), up: new Vector3(0, 1, 0), name: 'left' },
            { normal: new Vector3(0, 1, 0), up: new Vector3(0, 0, -1), name: 'top' },
            { normal: new Vector3(0, -1, 0), up: new Vector3(0, 0, 1), name: 'bottom' },
            { normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), name: 'front' },
            { normal: new Vector3(0, 0, -1), up: new Vector3(0, 1, 0), name: 'back' },
        ];
        let vertexIndex = 0;
        const faceVertexCounts = [];
        // Generate vertices for each cube face
        for (const face of faces) {
            const faceStartIndex = vertexIndex;
            const right = new Vector3().crossVectors(face.up, face.normal).normalize();
            for (let y = 0; y <= cubeMapResolution; y++) {
                for (let x = 0; x <= cubeMapResolution; x++) {
                    // Calculate UV coordinates for this face
                    const u = x / cubeMapResolution;
                    const v = y / cubeMapResolution;
                    // Map to cube face space (-1 to 1)
                    const faceX = (u - 0.5) * 2;
                    const faceY = (v - 0.5) * 2;
                    // Convert cube face coordinates to spherical direction
                    let direction = this.cubeToSphere(face.normal, right, face.up, faceX, faceY, blendFactor);
                    direction.applyMatrix4(this.cameraPose.rotation);
                    // Apply corner smoothing
                    if (cornerSmoothing > 0) {
                        direction = this.smoothCorners(direction, face.normal, right, face.up, faceX, faceY, cornerSmoothing);
                    }
                    // Ray march to find surface
                    const raySteps = this.config.testDownscale;
                    const distance = this.rayMarchSurface(kernels, direction, rMin, rMax, raySteps);
                    // Calculate vertex position
                    const position = this.cameraPose.position.clone().add(direction.clone().multiplyScalar(distance));
                    vertices.push(position.x, position.y, position.z);
                    // Calculate normal
                    const normal = this.calculateNormal(kernels, position, direction);
                    normals.push(normal.x, normal.y, normal.z);
                    // Store UV with face index encoded
                    uvs.push(u, v);
                    vertexIndex++;
                }
            }
            faceVertexCounts.push(vertexIndex - faceStartIndex);
        }
        // Generate indices for each face
        let currentIndex = 0;
        for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
            const faceVerts = faceVertexCounts[faceIdx];
            const resolution = cubeMapResolution;
            for (let y = 0; y < resolution; y++) {
                for (let x = 0; x < resolution; x++) {
                    const current = currentIndex + y * (resolution + 1) + x;
                    const next = current + 1;
                    const below = currentIndex + (y + 1) * (resolution + 1) + x;
                    const belowNext = below + 1;
                    // First triangle
                    indices.push(current, below, next);
                    // Second triangle
                    indices.push(next, below, belowNext);
                }
            }
            currentIndex += faceVerts;
        }
        // Create geometry
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        return geometry;
    }
    /**
     * Convert cube face coordinates to spherical direction
     * Uses blend factor to interpolate between cube and sphere projection
     */
    cubeToSphere(normal, right, up, x, y, blend) {
        // Cube projection (normalized)
        const cubeDir = new Vector3()
            .copy(normal)
            .add(right.clone().multiplyScalar(x))
            .add(up.clone().multiplyScalar(y))
            .normalize();
        // Sphere projection (direct mapping)
        const sphereDir = new Vector3()
            .copy(normal)
            .add(right.clone().multiplyScalar(x))
            .add(up.clone().multiplyScalar(y));
        // Normalize sphere direction
        if (sphereDir.length() > 0) {
            sphereDir.normalize();
        }
        // Blend between cube and sphere
        const result = new Vector3().lerpVectors(cubeDir, sphereDir, blend);
        return result.normalize();
    }
    /**
     * Smooth cube corners to reduce sharp edges
     */
    smoothCorners(direction, normal, right, up, x, y, smoothing) {
        // Calculate distance from center of face
        const distFromCenter = Math.sqrt(x * x + y * y);
        const maxDist = Math.sqrt(2); // Corner distance
        // Apply smoothing near corners
        if (distFromCenter > 0.7) {
            const t = Math.pow((distFromCenter - 0.7) / (maxDist - 0.7), 2);
            const smoothed = new Vector3().lerpVectors(direction, normal, t * smoothing);
            return smoothed.normalize();
        }
        return direction;
    }
}
//# sourceMappingURL=CubeSphericalMesher.js.map