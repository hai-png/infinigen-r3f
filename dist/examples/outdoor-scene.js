/**
 * Example Scene - Demonstrating Infinigen R3F capabilities
 *
 * This example shows how to use the asset factories, lighting, and placement systems
 * to create a procedural outdoor scene.
 */
import * as THREE from 'three';
import { BoulderFactory } from '../assets/geometries/boulder-factory';
import { SimplePlantFactory } from '../assets/geometries/plant-factory';
import { TerrainFactory } from '../assets/geometries/terrain-factory';
import { setupSkyLighting } from '../assets/lighting/sky-lighting';
import { InstanceScatter } from '../placement/instance-scatter';
import { DensityFilter } from '../placement/density';
const DEFAULT_SCENE_CONFIG = {
    seed: 42,
    terrainSize: 100,
    boulderCount: 50,
    plantCount: 500,
    timeOfDay: 14, // 2 PM
};
/**
 * Create a complete procedural outdoor scene
 */
export async function createOutdoorScene(config) {
    const finalConfig = { ...DEFAULT_SCENE_CONFIG, ...config };
    const scene = new THREE.Group();
    // 1. Generate terrain
    console.log('Generating terrain...');
    const terrainFactory = new TerrainFactory({
        seed: finalConfig.seed,
        width: finalConfig.terrainSize,
        depth: finalConfig.terrainSize,
        maxHeight: 15,
        noiseOctaves: 6,
        enableWater: true,
        waterLevel: 0.2,
    });
    const terrain = await terrainFactory.generateAsset();
    scene.add(terrain);
    // 2. Setup sky lighting
    console.log('Setting up sky lighting...');
    const skyConfig = {
        seed: finalConfig.seed,
        hour: finalConfig.timeOfDay,
        turbidity: 10,
        rayleigh: 2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
    };
    const skyGroup = setupSkyLighting(skyConfig);
    scene.add(skyGroup);
    // 3. Scatter boulders
    console.log('Scattering boulders...');
    const boulderFactory = new BoulderFactory({
        seed: finalConfig.seed + 1,
        radius: 1.5,
        displacementScale: 0.4,
    });
    const boulderScatterConfig = {
        seed: finalConfig.seed + 1,
        count: finalConfig.boulderCount,
        minScale: 0.5,
        maxScale: 2.0,
        alignToSurface: true,
    };
    // Get terrain mesh for scattering surface
    const terrainMesh = terrain.children[0];
    const boulderScatter = new InstanceScatter(boulderScatterConfig);
    const boulderPrototype = await boulderFactory.generateAsset();
    // Create density filter to avoid placing boulders in water
    const densityFilter = new DensityFilter({
        altitudeMin: 0.5, // Above water level
    });
    const boulderInstances = await boulderScatter.scatterOnMesh(boulderPrototype, terrainMesh, densityFilter);
    scene.add(boulderInstances);
    // Clean up prototype
    boulderPrototype.traverse((child) => {
        if (child.isMesh) {
            const mesh = child;
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            }
            else {
                mesh.material.dispose();
            }
        }
    });
    // 4. Scatter plants
    console.log('Scattering plants...');
    const plantFactory = new SimplePlantFactory({
        seed: finalConfig.seed + 2,
        height: 0.4,
        bladeCount: 6,
    });
    const plantScatterConfig = {
        seed: finalConfig.seed + 2,
        count: finalConfig.plantCount,
        minScale: 0.7,
        maxScale: 1.3,
        alignToSurface: true,
    };
    const plantScatter = new InstanceScatter(plantScatterConfig);
    const plantPrototype = await plantFactory.generateAsset();
    const plantInstances = await plantScatter.scatterOnMesh(plantPrototype, terrainMesh, new DensityFilter({
        altitudeMin: 1.0, // Only on higher ground
        altitudeMax: 12.0,
    }));
    scene.add(plantInstances);
    // Clean up prototype
    plantPrototype.traverse((child) => {
        if (child.isMesh) {
            const mesh = child;
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            }
            else {
                mesh.material.dispose();
            }
        }
    });
    scene.userData.config = finalConfig;
    scene.userData.type = 'outdoor-scene';
    console.log('Scene generation complete!');
    return scene;
}
/**
 * Create a simple rock garden scene
 */
export async function createRockGarden(size = 20, seed) {
    const scene = new THREE.Group();
    const actualSeed = seed ?? Math.floor(Math.random() * 1000000);
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(size, size);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x3a5c2a),
        roughness: 0.95,
        metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;
    scene.add(ground);
    // Add boulders
    const boulderFactory = new BoulderFactory({
        seed: actualSeed,
        radius: 1.0,
        displacementScale: 0.35,
    });
    const boulders = await boulderFactory.generateCollection(15, {
        seed: actualSeed,
    });
    // Arrange boulders in a circle
    const radius = size * 0.3;
    boulders.forEach((boulder, i) => {
        const angle = (i / boulders.length) * Math.PI * 2;
        boulder.position.x = Math.cos(angle) * radius;
        boulder.position.z = Math.sin(angle) * radius;
        boulder.position.y = 0.5;
        scene.add(boulder);
    });
    // Add some plants in the center
    const plantFactory = new SimplePlantFactory({
        seed: actualSeed + 1,
        height: 0.3,
        bladeCount: 8,
    });
    const plants = await plantFactory.generateCollection(10, {
        seed: actualSeed + 1,
    });
    plants.forEach((plant, i) => {
        const angle = (i / plants.length) * Math.PI * 2;
        const offsetRadius = radius * 0.5;
        plant.position.x = Math.cos(angle) * offsetRadius;
        plant.position.z = Math.sin(angle) * offsetRadius;
        scene.add(plant);
    });
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    // Add directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffdfba, 1.0);
    sunLight.position.set(10, 15, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);
    scene.userData.type = 'rock-garden';
    scene.userData.seed = actualSeed;
    return scene;
}
export default { createOutdoorScene, createRockGarden };
//# sourceMappingURL=outdoor-scene.js.map