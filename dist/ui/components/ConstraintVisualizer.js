import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { evaluateProblem } from '../../constraints/evaluator/evaluate';
/**
 * ConstraintVisualizer - 3D visualization of constraints in the scene
 * Shows violations, satisfied constraints, bounds, and relationships
 */
const ConstraintVisualizer = ({ problem, config, showDebugLines = true, }) => {
    const { scene } = useThree();
    const [visualizationObjects, setVisualizationObjects] = useState([]);
    const defaultConfig = {
        showViolations: true,
        showSatisfied: true,
        showBounds: true,
        violationColor: '#ff4444',
        satisfiedColor: '#44ff88',
        scale: 1.0,
        ...config,
    };
    // Clear previous visualizations
    useEffect(() => {
        return () => {
            visualizationObjects.forEach((obj) => {
                scene.remove(obj);
                // Clean up geometries and materials
                obj.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.geometry?.dispose();
                        if (Array.isArray(child.material)) {
                            child.material.forEach((m) => m.dispose());
                        }
                        else {
                            child.material?.dispose();
                        }
                    }
                });
            });
            setVisualizationObjects([]);
        };
    }, [problem, scene]);
    // Create visualization for constraints
    useEffect(() => {
        if (!problem || !showDebugLines)
            return;
        const objects = [];
        // Evaluate current state
        const result = evaluateProblem(problem);
        // Visualize each constraint
        problem.constraints.forEach((constraint, index) => {
            const isViolated = result.violations.some((v) => v.constraintIndex === index);
            const color = isViolated ? defaultConfig.violationColor : defaultConfig.satisfiedColor;
            if ((isViolated && !defaultConfig.showViolations) ||
                (!isViolated && !defaultConfig.showSatisfied)) {
                return;
            }
            // Create constraint indicator
            const geometry = new THREE.SphereGeometry(0.1 * defaultConfig.scale, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8,
            });
            const sphere = new THREE.Mesh(geometry, material);
            // Position based on constraint type and involved objects
            // This is simplified - real implementation would calculate proper positions
            sphere.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
            scene.add(sphere);
            objects.push(sphere);
            // Add line to related objects if applicable
            if (constraint.type === 'Touching' || constraint.type === 'SupportedBy') {
                const lineGeometry = new THREE.BufferGeometry();
                const positions = new Float32Array([
                    sphere.position.x, sphere.position.y, sphere.position.z,
                    sphere.position.x + 0.5, sphere.position.y, sphere.position.z,
                ]);
                lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
                const line = new THREE.Line(lineGeometry, lineMaterial);
                scene.add(line);
                objects.push(line);
            }
        });
        setVisualizationObjects(objects);
    }, [problem, scene, showDebugLines, defaultConfig]);
    // Animate visualizations
    useFrame((state, delta) => {
        visualizationObjects.forEach((obj, index) => {
            if (obj instanceof THREE.Mesh) {
                // Pulse animation for violations
                const isViolation = obj.material instanceof THREE.MeshBasicMaterial &&
                    obj.material.color.getHexString() === 'ff4444';
                if (isViolation) {
                    const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
                    obj.scale.setScalar(scale);
                }
            }
        });
    });
    return null; // This component only creates scene objects, doesn't render JSX
};
export default ConstraintVisualizer;
//# sourceMappingURL=ConstraintVisualizer.js.map