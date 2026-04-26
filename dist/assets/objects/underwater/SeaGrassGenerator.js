import * as THREE from 'three';
/**
 * Seagrass types with specific characteristics
 */
export var SeaGrassType;
(function (SeaGrassType) {
    SeaGrassType["EELGRASS"] = "eelgrass";
    SeaGrassType["TURTLEGRASS"] = "turtlegrass";
    SeaGrassType["MANATEEGRASS"] = "manateegrass";
    SeaGrassType["PADDLEGRASS"] = "paddlegrass";
    SeaGrassType["SHOALGRASS"] = "shoalgrass";
})(SeaGrassType || (SeaGrassType = {}));
/**
 * Generates procedural seagrass beds with instanced rendering for performance
 */
export class SeaGrassGenerator {
    /**
     * Generate a seagrass bed using instanced mesh
     */
    static generateBed(config, area) {
        const { bladeCount, density, clusterSize } = config;
        // Calculate total instances based on area and density
        const totalInstances = Math.floor((area.width * area.depth) * density * bladeCount);
        // Get or create blade geometry
        const bladeGeometry = this.getBladeGeometry(config.bladeHeight, config.bladeWidth);
        // Get or create material
        const material = this.getMaterial(config);
        // Create instanced mesh
        const instancedMesh = new THREE.InstancedMesh(bladeGeometry, material, totalInstances);
        const dummy = new THREE.Object3D();
        let instanceIndex = 0;
        // Generate clusters of seagrass
        const clusterCount = Math.floor(totalInstances / clusterSize);
        for (let c = 0; c < clusterCount && instanceIndex < totalInstances; c++) {
            // Cluster center position
            const clusterX = (Math.random() - 0.5) * area.width;
            const clusterZ = (Math.random() - 0.5) * area.depth;
            // Generate blades in this cluster
            for (let b = 0; b < clusterSize && instanceIndex < totalInstances; b++) {
                // Position within cluster (gaussian distribution)
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * Math.random() * (area.width * 0.1);
                const x = clusterX + Math.cos(angle) * radius;
                const z = clusterZ + Math.sin(angle) * radius;
                // Random rotation
                const rotationY = Math.random() * Math.PI * 2;
                const rotationZ = (Math.random() - 0.5) * 0.3;
                const rotationX = (Math.random() - 0.5) * 0.2;
                // Scale variation
                const scale = 0.7 + Math.random() * 0.6;
                dummy.position.set(x, config.bladeHeight * 0.5, z);
                dummy.rotation.set(rotationX, rotationY, rotationZ);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
            }
        }
        // Store configuration for animation
        instancedMesh.userData.seaGrassData = {
            config,
            area,
            timeOffset: Math.random() * Math.PI * 2
        };
        return instancedMesh;
    }
    /**
     * Get or create blade geometry
     */
    static getBladeGeometry(height, width) {
        const key = Math.floor(height * 100) * 1000 + Math.floor(width * 100);
        if (this.bladeGeometryCache.has(key)) {
            return this.bladeGeometryCache.get(key);
        }
        // Create curved blade shape
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(width * 0.3, height * 0.3, width * 0.2, height);
        shape.quadraticCurveTo(-width * 0.2, height, -width * 0.3, height * 0.3);
        shape.quadraticCurveTo(0, 0, 0, 0);
        const geometry = new THREE.ShapeGeometry(shape);
        // Add UV mapping
        const uvAttribute = geometry.attributes.uv;
        for (let i = 0; i < uvAttribute.count; i++) {
            const u = uvAttribute.getX(i);
            const v = uvAttribute.getY(i);
            uvAttribute.setXY(i, u, v * 0.8 + 0.1);
        }
        this.bladeGeometryCache.set(key, geometry);
        return geometry;
    }
    /**
     * Get or create material for seagrass
     */
    static getMaterial(config) {
        const key = `${config.type}-${config.color.getHexString()}-${config.opacity}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key);
        }
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: config.color },
                uOpacity: { value: config.opacity },
                uFlowSpeed: { value: config.flowSpeed },
                uFlowAmplitude: { value: config.flowAmplitude },
                uBladeHeight: { value: config.bladeHeight }
            },
            vertexShader: `
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uFlowAmplitude;
        uniform float uBladeHeight;
        
        varying vec2 vUv;
        varying float vBend;
        
        void main() {
          vUv = uv;
          
          // Bend increases with height
          float bendFactor = uv.y * uv.y;
          vBend = bendFactor;
          
          // Wave motion
          float wave = sin(uv.y * 8.0 + uTime * uFlowSpeed) * uFlowAmplitude * bendFactor;
          
          vec3 newPosition = position;
          newPosition.x += wave;
          newPosition.z += wave * 0.3;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        
        varying vec2 vUv;
        varying float vBend;
        
        void main() {
          // Gradient from base to tip
          vec3 color = uColor * (0.7 + 0.3 * vUv.y);
          
          // Add vein pattern
          float vein = sin(vUv.y * 20.0) * 0.1;
          color += vein;
          
          // Transparency at tips
          float alpha = uOpacity * (1.0 - 0.3 * vBend);
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.materialCache.set(key, material);
        return material;
    }
    /**
     * Generate single seagrass clump
     */
    static generateClump(config, position) {
        const group = new THREE.Group();
        const { bladeCount, clusterSize } = config;
        const actualCount = Math.min(bladeCount, clusterSize);
        for (let i = 0; i < actualCount; i++) {
            const bladeGeometry = this.getBladeGeometry(config.bladeHeight, config.bladeWidth);
            const material = this.getMaterial(config);
            const blade = new THREE.Mesh(bladeGeometry, material);
            // Position within clump
            const angle = (i / actualCount) * Math.PI * 2;
            const radius = Math.random() * 0.15;
            blade.position.set(position.x + Math.cos(angle) * radius, config.bladeHeight * 0.5, position.z + Math.sin(angle) * radius);
            // Random orientation
            blade.rotation.y = angle + (Math.random() - 0.5) * 0.5;
            blade.rotation.z = (Math.random() - 0.5) * 0.3;
            // Scale variation
            const scale = 0.8 + Math.random() * 0.4;
            blade.scale.set(scale, scale, scale);
            group.add(blade);
        }
        group.position.copy(position);
        return group;
    }
    /**
     * Get preset configurations for different seagrass types
     */
    static getPreset(type) {
        switch (type) {
            case SeaGrassType.EELGRASS:
                return {
                    type: SeaGrassType.EELGRASS,
                    bladeHeight: 0.8,
                    bladeWidth: 0.03,
                    bladeCount: 150,
                    color: new THREE.Color(0x4a7c2e),
                    opacity: 0.85,
                    flowSpeed: 0.6,
                    flowAmplitude: 0.35,
                    density: 25,
                    clusterSize: 8
                };
            case SeaGrassType.TURTLEGRASS:
                return {
                    type: SeaGrassType.TURTLEGRASS,
                    bladeHeight: 1.2,
                    bladeWidth: 0.05,
                    bladeCount: 120,
                    color: new THREE.Color(0x5c8a3d),
                    opacity: 0.8,
                    flowSpeed: 0.5,
                    flowAmplitude: 0.3,
                    density: 20,
                    clusterSize: 6
                };
            case SeaGrassType.MANATEEGRASS:
                return {
                    type: SeaGrassType.MANATEEGRASS,
                    bladeHeight: 0.5,
                    bladeWidth: 0.02,
                    bladeCount: 200,
                    color: new THREE.Color(0x6b9b4f),
                    opacity: 0.9,
                    flowSpeed: 0.7,
                    flowAmplitude: 0.4,
                    density: 35,
                    clusterSize: 10
                };
            case SeaGrassType.PADDLEGRASS:
                return {
                    type: SeaGrassType.PADDLEGRASS,
                    bladeHeight: 1.5,
                    bladeWidth: 0.08,
                    bladeCount: 100,
                    color: new THREE.Color(0x3d6b2e),
                    opacity: 0.75,
                    flowSpeed: 0.4,
                    flowAmplitude: 0.25,
                    density: 15,
                    clusterSize: 5
                };
            case SeaGrassType.SHOALGRASS:
                return {
                    type: SeaGrassType.SHOALGRASS,
                    bladeHeight: 0.3,
                    bladeWidth: 0.015,
                    bladeCount: 300,
                    color: new THREE.Color(0x7ab342),
                    opacity: 0.95,
                    flowSpeed: 0.8,
                    flowAmplitude: 0.45,
                    density: 50,
                    clusterSize: 12
                };
            default:
                return this.getPreset(SeaGrassType.EELGRASS);
        }
    }
    /**
     * Update animation for seagrass beds
     */
    static updateAnimation(instancedMesh, deltaTime) {
        const time = Date.now() * 0.001;
        const data = instancedMesh.userData.seaGrassData;
        if (data) {
            const material = instancedMesh.material;
            if (material.uniforms.uTime) {
                material.uniforms.uTime.value = time + data.timeOffset;
            }
        }
    }
}
SeaGrassGenerator.materialCache = new Map();
SeaGrassGenerator.bladeGeometryCache = new Map();
//# sourceMappingURL=SeaGrassGenerator.js.map