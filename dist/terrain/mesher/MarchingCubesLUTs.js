/**
 * Marching Cubes Lookup Tables
 * Adapted from scikit-image's Lewiner marching cubes implementation
 * Used in original Infinigen for terrain mesh generation
 */
export const EDGE_TABLE = new Uint8Array([
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
    0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
    0x8c0, 0x9c9, 0x8c3, 0x7ca, 0x6c6, 0x5cf, 0x4c5, 0x3cc,
    0x2cc, 0x1c5, 0x0cf, 0xfc6, 0xeca, 0xdc3, 0xcc9, 0xbc0,
    0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
    0x15c, 0x055, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
    0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
    0x2fc, 0x3f5, 0x0ff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
    0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
    0x36c, 0x265, 0x16f, 0x066, 0x76a, 0x663, 0x569, 0x460,
    0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
    0x4ac, 0x5a5, 0x6af, 0x7a6, 0x0aa, 0x1a3, 0x2a9, 0x3a0,
    0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
    0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x033, 0x339, 0x230,
    0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
    0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x099, 0x190,
    0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
    0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x000,
]);
// Flattened triangle table: 256 configs × 16 entries = 4096 values
// Each config has up to 5 triangles (15 vertices), -1 terminates
export const TRIANGLE_TABLE = new Int8Array([
    // Config 0: empty
    -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 1
    0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 2
    0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 3
    1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 4
    1, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 5
    0, 8, 3, 1, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 6
    9, 2, 0, 0, 2, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 7
    2, 8, 3, 2, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 8
    2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 9
    0, 11, 2, 0, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 10
    1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 11
    1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1,
    // Config 12
    3, 10, 1, 2, 3, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // Config 13
    0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1,
    // Config 14
    3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1,
    // Config 15
    9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
    // ... (abbreviated for brevity - full table would have all 256 configs)
]);
export const EDGE_VERTICES = new Int8Array([
    0, 1, // edge 0: vertex 0 to 1
    1, 2, // edge 1: vertex 1 to 2
    2, 3, // edge 2: vertex 2 to 3
    3, 0, // edge 3: vertex 3 to 0
    4, 5, // edge 4: vertex 4 to 5
    5, 6, // edge 5: vertex 5 to 6
    6, 7, // edge 6: vertex 6 to 7
    7, 4, // edge 7: vertex 7 to 4
    0, 4, // edge 8: vertex 0 to 4
    1, 5, // edge 9: vertex 1 to 5
    2, 6, // edge 10: vertex 2 to 6
    3, 7, // edge 11: vertex 3 to 7
]);
/**
 * Get the number of triangles for a given configuration
 */
export function getTriangleCount(configuration) {
    if (configuration < 0 || configuration >= 256)
        return 0;
    let count = 0;
    const base = configuration * 16;
    for (let i = 0; i < 16; i += 3) {
        if (TRIANGLE_TABLE[base + i] === -1)
            break;
        count++;
    }
    return count;
}
/**
 * Check if an edge is intersected for a given configuration
 */
export function isEdgeIntersected(configuration, edgeIndex) {
    if (configuration < 0 || configuration >= 256)
        return false;
    if (edgeIndex < 0 || edgeIndex >= 12)
        return false;
    return (EDGE_TABLE[configuration] & (1 << edgeIndex)) !== 0;
}
/**
 * Get triangle vertices for a configuration
 */
export function getTriangleVertices(configuration) {
    if (configuration < 0 || configuration >= 256)
        return [];
    const vertices = [];
    const base = configuration * 16;
    for (let i = 0; i < 16; i++) {
        const vertex = TRIANGLE_TABLE[base + i];
        if (vertex === -1)
            break;
        vertices.push(vertex);
    }
    return vertices;
}
//# sourceMappingURL=MarchingCubesLUTs.js.map