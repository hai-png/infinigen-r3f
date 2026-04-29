import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
/**
 * Seaweed types with specific characteristics
 */
export var SeaweedType;
(function (SeaweedType) {
    SeaweedType["KELP"] = "kelp";
    SeaweedType["SARGASSUM"] = "sargassum";
    SeaweedType["DULSE"] = "dulse";
    SeaweedType["WAKAME"] = "wakame";
    SeaweedType["SEA_LETTUCE"] = "sea_lettuce";
})(SeaweedType || (SeaweedType = {}));
/**
 * Generates procedural seaweed meshes with natural flowing animation support
 */
export class SeaweedGenerator {
    /**
     * Generate a single seaweed strand
     */
    static generateStrand(config) {
        const geometry = this.createStrandGeometry(config);
        const material = this.getMaterial(config);
        const mesh = new THREE.Mesh(geometry, material);
        // Store animation data in userData
        mesh.userData.seaweedData = {
            config,
            timeOffset: Math.random() * Math.PI * 2,
            basePosition: new THREE.Vector3()
        };
        return mesh;
    }
    /**
     * Create seaweed strand geometry with segments for animation
     */
    static createStrandGeometry(config) {
        const { height, segmentCount, baseWidth, tipWidth, leafCount, leafSize } = config;
        // Create main strand as a curved tube
        const points = [];
        const segmentHeight = height / segmentCount;
        for (let i = 0; i <= segmentCount; i++) {
            const t = i / segmentCount;
            const y = t * height;
            // Add natural curve using noise
            const noiseX = NoiseUtils.perlin2D(0, y * 0.01, 3) * config.bendFactor * t;
            const noiseZ = NoiseUtils.perlin2D(100, y * 0.01, 3) * config.bendFactor * t;
            // Width tapers from base to tip
            const width = THREE.MathUtils.lerp(baseWidth, tipWidth, t);
            points.push(new THREE.Vector3(noiseX, y, noiseZ));
        }
        // Create tube geometry along the curve
        const path = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(path, segmentCount, baseWidth * 0.3, 4, false);
        // Add leaves/fronds along the strand
        if (leafCount > 0 && leafSize > 0) {
            this.addLeavesToGeometry(geometry, config, points);
        }
        return geometry;
    }
    /**
     * Add leaf geometries to the main strand
     */
    static addLeavesToGeometry(geometry, config, points) {
        const { leafCount, leafSize, height } = config;
        for (let i = 0; i < leafCount; i++) {
            const segmentIndex = Math.floor(Math.random() * (points.length - 2)) + 1;
            const point = points[segmentIndex];
            const nextPoint = points[segmentIndex + 1];
            // Calculate direction along the strand
            const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
            // Create leaf at this position
            const leafGeometry = this.createLeafGeometry(leafSize);
            // Position and orient leaf
            leafGeometry.translate(point.x, point.y, point.z);
            // Merge geometries (simplified - in production use InstancedMesh)
            // This is a placeholder for actual geometry merging
        }
    }
    /**
     * Create individual leaf geometry
     */
    static createLeafGeometry(size) {
        const shape = new THREE.Shape();
        // Create elongated leaf shape
        shape.moveTo(0, 0);
        shape.quadraticCurveTo(size * 0.3, size * 0.5, 0, size);
        shape.quadraticCurveTo(-size * 0.3, size * 0.5, 0, 0);
        const geometry = new THREE.ShapeGeometry(shape);
        return geometry;
    }
    /**
     * Get or create material for seaweed
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
                uBaseWidth: { value: config.baseWidth },
                uTipWidth: { value: config.tipWidth }
            },
            vertexShader: `
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uFlowAmplitude;
        
        varying vec2 vUv;
        varying float vWave;
        
        void main() {
          vUv = uv;
          
          // Calculate wave based on height (y position)
          float wave = sin(uv.y * 10.0 + uTime * uFlowSpeed) * uFlowAmplitude * uv.y;
          vWave = wave;
          
          vec3 newPosition = position;
          newPosition.x += wave;
          newPosition.z += wave * 0.5;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        
        varying vec2 vUv;
        varying float vWave;
        
        void main() {
          // Add subtle gradient from base to tip
          vec3 color = uColor * (0.8 + 0.2 * vUv.y);
          
          // Add translucency effect
          float alpha = uOpacity * (0.7 + 0.3 * sin(vWave * 5.0));
          
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
     * Generate kelp forest
     */
    static generateKelpForest(count, area, waterDepth) {
        const group = new THREE.Group();
        const config = {
            type: SeaweedType.KELP,
            height: waterDepth * 0.9,
            segmentCount: 8,
            baseWidth: 0.15,
            tipWidth: 0.03,
            color: new THREE.Color(0x2d5016),
            opacity: 0.85,
            flowSpeed: 0.5,
            flowAmplitude: 0.3,
            bendFactor: 0.4,
            leafCount: 12,
            leafSize: 0.4
        };
        for (let i = 0; i < count; i++) {
            const strand = this.generateStrand(config);
            // Random position within area
            const x = (Math.random() - 0.5) * area.width;
            const z = (Math.random() - 0.5) * area.depth;
            strand.position.set(x, 0, z);
            strand.userData.seaweedData.basePosition.set(x, 0, z);
            // Random rotation and slight scale variation
            strand.rotation.y = Math.random() * Math.PI * 2;
            const scale = 0.8 + Math.random() * 0.4;
            strand.scale.set(scale, scale, scale);
            group.add(strand);
        }
        return group;
    }
    /**
     * Get preset configurations for different seaweed types
     */
    static getPreset(type) {
        switch (type) {
            case SeaweedType.KELP:
                return {
                    type: SeaweedType.KELP,
                    height: 3.0,
                    segmentCount: 10,
                    baseWidth: 0.15,
                    tipWidth: 0.03,
                    color: new THREE.Color(0x2d5016),
                    opacity: 0.85,
                    flowSpeed: 0.5,
                    flowAmplitude: 0.3,
                    bendFactor: 0.4,
                    leafCount: 12,
                    leafSize: 0.4
                };
            case SeaweedType.SARGASSUM:
                return {
                    type: SeaweedType.SARGASSUM,
                    height: 1.5,
                    segmentCount: 6,
                    baseWidth: 0.08,
                    tipWidth: 0.02,
                    color: new THREE.Color(0x5c6b2e),
                    opacity: 0.75,
                    flowSpeed: 0.7,
                    flowAmplitude: 0.4,
                    bendFactor: 0.6,
                    leafCount: 20,
                    leafSize: 0.15
                };
            case SeaweedType.DULSE:
                return {
                    type: SeaweedType.DULSE,
                    height: 0.8,
                    segmentCount: 4,
                    baseWidth: 0.05,
                    tipWidth: 0.01,
                    color: new THREE.Color(0x8b3a3a),
                    opacity: 0.9,
                    flowSpeed: 0.4,
                    flowAmplitude: 0.2,
                    bendFactor: 0.3,
                    leafCount: 8,
                    leafSize: 0.2
                };
            case SeaweedType.WAKAME:
                return {
                    type: SeaweedType.WAKAME,
                    height: 2.0,
                    segmentCount: 8,
                    baseWidth: 0.1,
                    tipWidth: 0.02,
                    color: new THREE.Color(0x3d5c2e),
                    opacity: 0.8,
                    flowSpeed: 0.6,
                    flowAmplitude: 0.35,
                    bendFactor: 0.5,
                    leafCount: 15,
                    leafSize: 0.3
                };
            case SeaweedType.SEA_LETTUCE:
                return {
                    type: SeaweedType.SEA_LETTUCE,
                    height: 0.5,
                    segmentCount: 3,
                    baseWidth: 0.03,
                    tipWidth: 0.01,
                    color: new THREE.Color(0x7cb342),
                    opacity: 0.7,
                    flowSpeed: 0.8,
                    flowAmplitude: 0.5,
                    bendFactor: 0.7,
                    leafCount: 5,
                    leafSize: 0.25
                };
            default:
                return this.getPreset(SeaweedType.KELP);
        }
    }
    /**
     * Update animation for seaweed strands
     */
    static updateAnimation(group, deltaTime) {
        const time = Date.now() * 0.001;
        group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.seaweedData) {
                const data = child.userData.seaweedData;
                const material = child.material;
                if (material.uniforms.uTime) {
                    material.uniforms.uTime.value = time + data.timeOffset;
                }
            }
        });
    }
}
SeaweedGenerator.materialCache = new Map();
//# sourceMappingURL=SeaweedGenerator.js.map