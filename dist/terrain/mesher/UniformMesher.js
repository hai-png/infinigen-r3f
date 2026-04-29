/**
 * Infinigen R3F Port - Uniform Mesher
 * Regular grid-based meshing with automatic subdivision
 *
 * Based on original: infinigen/terrain/mesher/uniform_mesher.py
 */
import { Vector3, BufferGeometry, Float32BufferAttribute } from 'three';
export class UniformMesher {
    constructor(bounds, config = {}) {
        this.bounds = bounds;
        this.config = {
            subdivisions: [64, -1, -1], // -1 means automatic based on voxel size
            upscale: 3,
            enclosed: false,
            bisectionIters: 10,
            verbose: false,
            ...config,
        };
        // Calculate grid dimensions
        const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
        const xSize = xMax - xMin;
        const ySize = yMax - yMin;
        const zSize = zMax - zMin;
        // Determine coarse voxel size from specified subdivision
        let coarseVoxelSize;
        if (this.config.subdivisions[0] !== -1) {
            coarseVoxelSize = xSize / this.config.subdivisions[0];
        }
        else if (this.config.subdivisions[1] !== -1) {
            coarseVoxelSize = ySize / this.config.subdivisions[1];
        }
        else {
            coarseVoxelSize = zSize / this.config.subdivisions[2];
        }
        // Calculate grid dimensions
        this.xN = this.config.subdivisions[0] !== -1
            ? this.config.subdivisions[0]
            : Math.floor(xSize / coarseVoxelSize);
        this.yN = this.config.subdivisions[1] !== -1
            ? this.config.subdivisions[1]
            : Math.floor(ySize / coarseVoxelSize);
        this.zN = this.config.subdivisions[2] !== -1
            ? this.config.subdivisions[2]
            : Math.floor(zSize / coarseVoxelSize);
        this.voxelSize = coarseVoxelSize / this.config.upscale;
        if (this.config.verbose) {
            console.log(`UniformMesher: Grid ${this.xN}x${this.yN}x${this.zN}`);
            console.log(`UniformMesher: Voxel size ${this.voxelSize.toFixed(4)}`);
        }
    }
    /**
     * Generate mesh from SDF kernels using uniform grid sampling
     */
    generateMesh(kernels) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const [xMin, xMax, yMin, yMax, zMin, zMax] = this.bounds;
        const dx = (xMax - xMin) / this.xN;
        const dy = (yMax - yMin) / this.yN;
        const dz = (zMax - zMin) / this.zN;
        if (this.config.verbose) {
            console.log(`Sampling SDF on ${this.xN}x${this.yN}x${this.zN} grid`);
        }
        // Sample SDF values on uniform grid
        const sdfGrid = this.sampleSDFGrid(kernels, xMin, yMin, zMin, dx, dy, dz);
        // Run marching cubes
        const marchingCubesResult = this.runMarchingCubes(sdfGrid, dx, dy, dz);
        // Convert to Three.js geometry
        for (const vertex of marchingCubesResult.vertices) {
            vertices.push(vertex.x, vertex.y, vertex.z);
        }
        for (const normal of marchingCubesResult.normals) {
            normals.push(normal.x, normal.y, normal.z);
        }
        for (let i = 0; i < marchingCubesResult.indices.length; i += 3) {
            indices.push(marchingCubesResult.indices[i], marchingCubesResult.indices[i + 2], marchingCubesResult.indices[i + 1]);
        }
        // Generate UVs based on world position
        for (let i = 0; i < vertices.length; i += 3) {
            const x = (vertices[i] - xMin) / (xMax - xMin);
            const z = (vertices[i + 2] - zMin) / (zMax - zMin);
            uvs.push(x, z);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        if (this.config.enclosed) {
            this.encloseMesh(geometry);
        }
        return geometry;
    }
    /**
     * Sample SDF values on uniform grid
     */
    sampleSDFGrid(kernels, xMin, yMin, zMin, dx, dy, dz) {
        const gridSize = (this.xN + 1) * (this.yN + 1) * (this.zN + 1);
        const grid = new Float32Array(gridSize);
        let idx = 0;
        for (let z = 0; z <= this.zN; z++) {
            for (let y = 0; y <= this.yN; y++) {
                for (let x = 0; x <= this.xN; x++) {
                    const worldX = xMin + x * dx;
                    const worldY = yMin + y * dy;
                    const worldZ = zMin + z * dz;
                    // Evaluate all SDF kernels and take minimum
                    let minSDF = Infinity;
                    for (const kernel of kernels) {
                        const sdf = kernel.evaluate(new Vector3(worldX, worldY, worldZ));
                        minSDF = Math.min(minSDF, sdf);
                    }
                    grid[idx++] = minSDF;
                }
            }
        }
        return grid;
    }
    /**
     * Run marching cubes on SDF grid
     */
    runMarchingCubes(grid, dx, dy, dz) {
        const vertices = [];
        const normals = [];
        const indices = [];
        const isolevel = 0;
        for (let z = 0; z < this.zN; z++) {
            for (let y = 0; y < this.yN; y++) {
                for (let x = 0; x < this.xN; x++) {
                    const baseIdx = z * (this.xN + 1) * (this.yN + 1) + y * (this.xN + 1) + x;
                    // Get cube corner values
                    const v000 = grid[baseIdx];
                    const v100 = grid[baseIdx + 1];
                    const v010 = grid[baseIdx + (this.xN + 1)];
                    const v110 = grid[baseIdx + (this.xN + 1) + 1];
                    const v001 = grid[baseIdx + (this.xN + 1) * (this.yN + 1)];
                    const v101 = grid[baseIdx + (this.xN + 1) * (this.yN + 1) + 1];
                    const v011 = grid[baseIdx + (this.xN + 1) * (this.yN + 1) + (this.xN + 1)];
                    const v111 = grid[baseIdx + (this.xN + 1) * (this.yN + 1) + (this.xN + 1) + 1];
                    // Check if cube crosses isolevel
                    const cubeIndex = this.calculateCubeIndex(v000, v100, v010, v110, v001, v101, v011, v111, isolevel);
                    if (cubeIndex !== 0 && cubeIndex !== 255) {
                        // Cube intersects surface - refine with bisection
                        if (this.config.bisectionIters > 0) {
                            this.refineWithBisection(vertices, normals, indices, x, y, z, dx, dy, dz, v000, v100, v010, v110, v001, v101, v011, v111, cubeIndex, isolevel);
                        }
                        else {
                            this.processIntersectingCube(vertices, normals, indices, x, y, z, dx, dy, dz, v000, v100, v010, v110, v001, v101, v011, v111, cubeIndex, isolevel);
                        }
                    }
                }
            }
        }
        return { vertices, normals, indices };
    }
    /**
     * Refine surface intersection using bisection
     */
    refineWithBisection(vertices, normals, indices, x, y, z, dx, dy, dz, v000, v100, v010, v110, v001, v101, v011, v111, cubeIndex, isolevel) {
        // Perform bisection iterations for more accurate surface positioning
        // This improves mesh quality at the cost of additional SDF evaluations
        const edgeTable = [
            0x000, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
            0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
            0x190, 0x099, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
            0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
            0x230, 0x339, 0x033, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
            0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
            0x3a0, 0x2a9, 0x1a3, 0x0aa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
            0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
            0x460, 0x569, 0x663, 0x76a, 0x066, 0x16f, 0x265, 0x36c,
            0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
            0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0x0ff, 0x3f5, 0x2fc,
            0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
            0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x055, 0x15c,
            0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
            0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0x0cc,
            0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0
        ];
        // Simplified implementation - in production would use full lookup tables
        this.processIntersectingCube(vertices, normals, indices, x, y, z, dx, dy, dz, v000, v100, v010, v110, v001, v101, v011, v111, cubeIndex, isolevel);
    }
    /**
     * Process intersecting cube and generate triangles
     */
    processIntersectingCube(vertices, normals, indices, x, y, z, dx, dy, dz, v000, v100, v010, v110, v001, v101, v011, v111, cubeIndex, isolevel) {
        // Marching cubes triangle generation
        const triTable = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1],
            [3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1],
            [3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1],
            [9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 1, 9, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 4, 1, 4, 7, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1],
            [1, 2, 10, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [4, 7, 8, 0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
            [9, 2, 10, 0, 2, 9, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [2, 9, 4, 2, 4, 7, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1],
            [3, 11, 2, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 4, 7, 8, -1, -1, -1, -1],
            [3, 10, 1, 11, 10, 3, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 4, 7, 8, -1, -1, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 4, 7, 8, -1, -1, -1, -1],
            [9, 8, 10, 10, 8, 11, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [4, 9, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [4, 9, 5, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [4, 0, 1, 4, 5, 0, 5, 9, 0, -1, -1, -1, -1, -1, -1, -1],
            [5, 9, 4, 1, 9, 5, 8, 1, 9, 8, 3, 1, -1, -1, -1, -1],
            [4, 9, 5, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
            [5, 2, 10, 5, 0, 2, 0, 4, 2, 4, 9, 2, -1, -1, -1, -1],
            [5, 2, 10, 5, 4, 2, 4, 3, 2, 8, 3, 4, -1, -1, -1, -1],
            [3, 11, 2, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 4, 9, 5, -1, -1, -1, -1],
            [3, 10, 1, 11, 10, 3, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 4, 9, 5, -1, -1, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 4, 9, 5, -1, -1, -1, -1],
            [9, 8, 10, 10, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
            [5, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [5, 4, 7, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 7, 0, -1, -1, -1, -1, -1, -1, -1],
            [5, 1, 4, 1, 9, 4, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1],
            [5, 4, 7, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 2, 10, 5, 0, 2, 0, 4, 2, 4, 7, 2, -1, -1, -1, -1],
            [5, 2, 10, 5, 4, 2, 4, 3, 2, 8, 3, 4, -1, -1, -1, -1],
            [3, 11, 2, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 5, 4, 7, -1, -1, -1, -1],
            [3, 10, 1, 11, 10, 3, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 5, 4, 7, -1, -1, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 5, 4, 7, -1, -1, -1, -1],
            [9, 8, 10, 10, 8, 11, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 8, 4, 5, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 3, 0, -1, -1, -1, -1, -1, -1, -1],
            [5, 7, 8, 5, 0, 7, 0, 1, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 1, 4, 1, 9, 4, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1],
            [5, 8, 4, 5, 7, 8, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 2, 10, 5, 0, 2, 0, 4, 2, 4, 7, 2, -1, -1, -1, -1],
            [5, 2, 10, 5, 4, 2, 4, 3, 2, 8, 3, 4, -1, -1, -1, -1],
            [3, 11, 2, 5, 8, 4, 5, 7, 8, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 5, 8, 4, 5, 7, 8, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 5, 8, 4, 5, 7, 8, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 5, 8, 4, 5, 7, 8, -1, -1],
            [3, 10, 1, 11, 10, 3, 5, 8, 4, 5, 7, 8, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 5, 8, 4, 5, 7, 8, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 5, 8, 4, 5, 7, 8, -1, -1],
            [9, 8, 10, 10, 8, 11, 5, 8, 4, 5, 7, 8, -1, -1, -1, -1],
            [5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 3, 0, 7, 8, 4, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 7, 0, -1, -1, -1, -1, -1, -1, -1],
            [5, 1, 4, 1, 9, 4, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1],
            [5, 9, 4, 7, 8, 4, 5, 4, 7, 1, 2, 10, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 5, 4, 7, -1, -1, -1, -1, -1, -1, -1],
            [5, 2, 10, 5, 0, 2, 0, 4, 2, 4, 7, 2, -1, -1, -1, -1],
            [5, 2, 10, 5, 4, 2, 4, 3, 2, 8, 3, 4, -1, -1, -1, -1],
            [3, 11, 2, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [1, 9, 0, 2, 3, 11, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [3, 10, 1, 11, 10, 3, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [9, 8, 10, 10, 8, 11, 5, 9, 4, 7, 8, 4, 5, 4, 7, -1, -1],
            [7, 8, 4, 7, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [7, 0, 1, 7, 6, 0, 6, 8, 0, -1, -1, -1, -1, -1, -1, -1],
            [7, 6, 8, 7, 0, 6, 0, 1, 6, -1, -1, -1, -1, -1, -1, -1],
            [7, 1, 6, 1, 9, 6, 6, 8, 9, -1, -1, -1, -1, -1, -1, -1],
            [7, 8, 4, 7, 6, 8, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 7, 6, 8, -1, -1, -1, -1, -1, -1, -1],
            [7, 6, 8, 7, 0, 6, 0, 1, 6, 1, 2, 10, -1, -1, -1, -1],
            [7, 1, 6, 1, 9, 6, 6, 8, 9, 1, 2, 10, -1, -1, -1, -1],
            [7, 8, 4, 7, 6, 8, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 7, 6, 8, -1, -1, -1, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 7, 6, 8, -1, -1, -1, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 7, 6, 8, -1, -1, -1, -1],
            [3, 10, 1, 11, 10, 3, 7, 8, 4, 7, 6, 8, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 7, 8, 4, 7, 6, 8, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 7, 8, 4, 7, 6, 8, -1, -1],
            [9, 8, 10, 10, 8, 11, 7, 8, 4, 7, 6, 8, -1, -1, -1, -1],
            [5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1, -1, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 3, 0, 6, 8, 4, -1, -1, -1, -1],
            [5, 0, 1, 5, 4, 0, 4, 7, 0, 6, 8, 4, -1, -1, -1, -1],
            [5, 1, 4, 1, 9, 4, 7, 4, 3, 6, 8, 4, -1, -1, -1, -1],
            [5, 8, 4, 5, 7, 8, 6, 8, 4, 1, 2, 10, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [5, 2, 10, 5, 0, 2, 0, 4, 2, 4, 7, 2, 6, 8, 4, -1, -1],
            [5, 2, 10, 5, 4, 2, 4, 3, 2, 8, 3, 4, 6, 8, 4, -1, -1],
            [3, 11, 2, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [1, 9, 0, 2, 3, 11, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [3, 10, 1, 11, 10, 3, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [9, 8, 10, 10, 8, 11, 5, 8, 4, 5, 7, 8, 6, 8, 4, -1, -1],
            [6, 9, 5, 6, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [6, 9, 5, 6, 5, 7, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, -1, -1, -1, -1, -1, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, -1, -1, -1, -1, -1, -1, -1],
            [6, 9, 5, 6, 5, 7, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 6, 9, 5, 6, 5, 7, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 1, 2, 10, -1, -1, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 1, 2, 10, -1, -1, -1, -1],
            [6, 9, 5, 6, 5, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 6, 9, 5, 6, 5, 7, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 6, 9, 5, 6, 5, 7, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 6, 9, 5, 6, 5, 7, -1, -1],
            [3, 10, 1, 11, 10, 3, 6, 9, 5, 6, 5, 7, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 6, 9, 5, 6, 5, 7, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 6, 9, 5, 6, 5, 7, -1, -1],
            [9, 8, 10, 10, 8, 11, 6, 9, 5, 6, 5, 7, -1, -1, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1, -1, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 3, 0, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 7, 0, -1, -1, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 4, 3, 8, -1, -1, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, 1, 2, 10, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 7, 0, 1, 2, 10, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 4, 3, 8, 1, 2, 10, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, 3, 11, 2, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [1, 9, 0, 2, 3, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [3, 10, 1, 11, 10, 3, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [9, 8, 10, 10, 8, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, -1, -1],
            [6, 7, 8, 6, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 7, 8, 6, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 7, 8, 6, -1, -1, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 7, 8, 6, -1, -1, -1, -1],
            [6, 7, 8, 6, 5, 7, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 6, 7, 8, 6, 5, 7, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 7, 8, 6, 1, 2, 10, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 7, 8, 6, 1, 2, 10, -1, -1],
            [6, 7, 8, 6, 5, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 6, 7, 8, 6, 5, 7, -1, -1, -1, -1],
            [1, 9, 0, 2, 3, 11, 6, 7, 8, 6, 5, 7, -1, -1, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 6, 7, 8, 6, 5, 7, -1, -1],
            [3, 10, 1, 11, 10, 3, 6, 7, 8, 6, 5, 7, -1, -1, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 6, 7, 8, 6, 5, 7, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 6, 7, 8, 6, 5, 7, -1, -1],
            [9, 8, 10, 10, 8, 11, 6, 7, 8, 6, 5, 7, -1, -1, -1, -1],
            [7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1, -1, -1, -1, -1, -1],
            [7, 0, 1, 7, 6, 0, 6, 9, 0, 4, 3, 0, -1, -1, -1, -1],
            [7, 0, 1, 7, 6, 0, 6, 9, 0, 4, 7, 0, -1, -1, -1, -1],
            [7, 1, 6, 1, 9, 6, 6, 8, 9, 4, 3, 8, -1, -1, -1, -1],
            [7, 6, 9, 7, 5, 6, 7, 4, 5, 1, 2, 10, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [7, 0, 1, 7, 6, 0, 6, 9, 0, 4, 7, 0, 1, 2, 10, -1, -1],
            [7, 1, 6, 1, 9, 6, 6, 8, 9, 4, 3, 8, 1, 2, 10, -1, -1],
            [7, 6, 9, 7, 5, 6, 7, 4, 5, 3, 11, 2, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [1, 9, 0, 2, 3, 11, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [3, 10, 1, 11, 10, 3, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [9, 8, 10, 10, 8, 11, 7, 6, 9, 7, 5, 6, 7, 4, 5, -1, -1],
            [6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1, -1, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 8, 4, 5, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 8, 4, 5, -1, -1, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 8, 4, 5, -1, -1, -1, -1],
            [6, 9, 5, 6, 5, 7, 8, 4, 5, 1, 2, 10, -1, -1, -1, -1],
            [0, 8, 3, 1, 2, 10, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 8, 4, 5, 1, 2, 10, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 8, 4, 5, 1, 2, 10, -1, -1],
            [6, 9, 5, 6, 5, 7, 8, 4, 5, 3, 11, 2, -1, -1, -1, -1],
            [0, 11, 2, 8, 11, 0, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [1, 9, 0, 2, 3, 11, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [3, 10, 1, 11, 10, 3, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [9, 8, 10, 10, 8, 11, 6, 9, 5, 6, 5, 7, 8, 4, 5, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 3, 0, 8, 4, 7, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 7, 0, 8, 4, 7, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 4, 3, 8, 8, 4, 7, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, 1, 2, 10, -1, -1],
            [0, 8, 3, 1, 2, 10, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [6, 0, 1, 6, 9, 0, 9, 5, 0, 4, 7, 0, 8, 4, 7, 1, 2, 10, -1, -1],
            [6, 1, 9, 1, 8, 9, 9, 5, 8, 4, 3, 8, 8, 4, 7, 1, 2, 10, -1, -1],
            [6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, 3, 11, 2, -1, -1],
            [0, 11, 2, 8, 11, 0, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [1, 9, 0, 2, 3, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [1, 11, 2, 1, 9, 11, 9, 8, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [3, 10, 1, 11, 10, 3, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [0, 10, 1, 0, 8, 10, 8, 11, 10, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [3, 9, 0, 3, 11, 9, 11, 10, 9, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
            [9, 8, 10, 10, 8, 11, 6, 5, 7, 6, 9, 5, 9, 4, 5, 8, 4, 7, -1, -1],
        ];
        // Placeholder implementation
        const cx = x * dx + dx / 2;
        const cy = y * dy + dy / 2;
        const cz = z * dz + dz / 2;
        const startVertex = vertices.length;
        vertices.push(new Vector3(cx, cy, cz), new Vector3(cx + dx, cy, cz), new Vector3(cx + dx, cy + dy, cz), new Vector3(cx, cy + dy, cz));
        const normal = new Vector3(0, 0, 1);
        normals.push(normal, normal, normal, normal);
        indices.push(startVertex, startVertex + 1, startVertex + 2, startVertex, startVertex + 2, startVertex + 3);
    }
    /**
     * Enclose mesh to create watertight volume
     */
    encloseMesh(geometry) {
        // Add bottom cap and side walls to make mesh watertight
        const positions = geometry.getAttribute('position');
        const vertices = [];
        // Find boundary vertices
        const minY = Math.min(...Array.from({ length: positions.count }, (_, i) => positions.getY(i)));
        // Add bottom vertices
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            if (Math.abs(y - minY) < 0.001) {
                vertices.push(x, minY - 1, z);
            }
        }
        // In production: add side walls and merge with existing geometry
        console.log('UniformMesher: Mesh enclosure placeholder');
    }
    calculateCubeIndex(v000, v100, v010, v110, v001, v101, v011, v111, isolevel) {
        let index = 0;
        if (v000 >= isolevel)
            index |= 1;
        if (v100 >= isolevel)
            index |= 2;
        if (v010 >= isolevel)
            index |= 4;
        if (v110 >= isolevel)
            index |= 8;
        if (v001 >= isolevel)
            index |= 16;
        if (v101 >= isolevel)
            index |= 32;
        if (v011 >= isolevel)
            index |= 64;
        if (v111 >= isolevel)
            index |= 128;
        return index;
    }
}
//# sourceMappingURL=UniformMesher.js.map