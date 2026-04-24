import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { AnyRelation, ScalarConstant, ObjectSetVariable, Distance, Touching } from '../constraints/language';
import { useInfinigenSolver, ConstraintDebugger, ConstraintOverlay } from '../integration';
/**
 * Example scene demonstrating basic constraint solving.
 *
 * This example shows:
 * - Setting up initial objects
 * - Defining constraints (distance, touching)
 * - Using the solver hook
 * - Visualizing results with debugger
 */
export function BasicExample() {
    // Define initial objects
    const initialObjects = [
        {
            id: 'box1',
            position: new THREE.Vector3(-2, 0, 0),
            rotation: new THREE.Quaternion(),
            scale: new THREE.Vector3(1, 1, 1)
        },
        {
            id: 'box2',
            position: new THREE.Vector3(2, 0, 0),
            rotation: new THREE.Quaternion(),
            scale: new THREE.Vector3(1, 1, 1)
        },
        {
            id: 'box3',
            position: new THREE.Vector3(0, 0, -2),
            rotation: new THREE.Quaternion(),
            scale: new THREE.Vector3(1, 1, 1)
        }
    ];
    // Define constraints
    const constraints = [
        // Box1 and Box2 should be within distance 3
        new AnyRelation(new ObjectSetVariable('box1'), new ObjectSetVariable('box2'), new Distance(new ScalarConstant(3), 'less_than')),
        // Box2 and Box3 should be touching
        new AnyRelation(new ObjectSetVariable('box2'), new ObjectSetVariable('box3'), new Touching())
    ];
    // Use the solver
    const { state, isSolving, isSolved, progress, violationCount, error, reset, solve } = useInfinigenSolver({
        constraints,
        initialObjects,
        autoSolve: true,
        solverConfig: {
            maxIterations: 500,
            temperature: 100,
            coolingRate: 0.95
        },
        onSolution: (solvedState) => {
            console.log('Solution found!', solvedState);
        },
        onError: (err) => {
            console.error('Solver error:', err);
        }
    });
    return (_jsxs(_Fragment, { children: [_jsx(ConstraintOverlay, { violations: violationCount, total: constraints.length, progress: progress }), _jsxs("div", { style: {
                    position: 'absolute',
                    bottom: 20,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '10px',
                    zIndex: 1000
                }, children: [_jsx("button", { onClick: solve, disabled: isSolving, style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: isSolving ? 'not-allowed' : 'pointer',
                            background: '#4ade80',
                            border: 'none',
                            borderRadius: '5px'
                        }, children: isSolving ? 'Solving...' : 'Solve' }), _jsx("button", { onClick: reset, style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#f87171',
                            border: 'none',
                            borderRadius: '5px'
                        }, children: "Reset" })] }), error && (_jsxs("div", { style: {
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(255,0,0,0.8)',
                    padding: '20px',
                    borderRadius: '10px',
                    color: 'white',
                    zIndex: 1000
                }, children: [_jsx("h3", { children: "Error" }), _jsx("p", { children: error.message })] })), _jsxs(Canvas, { camera: { position: [5, 5, 5], fov: 60 }, children: [_jsx("color", { attach: "background", args: ['#1a1a2e'] }), _jsx("ambientLight", { intensity: 0.5 }), _jsx("directionalLight", { position: [10, 10, 5], intensity: 1 }), _jsx(Environment, { preset: "city" }), _jsx(Grid, { position: [0, -0.01, 0], args: [10, 10], cellColor: "#444", sectionColor: "#666", fadeDistance: 20 }), state && Array.from(state.objects.entries()).map(([id, objState]) => (_jsxs("mesh", { name: id, position: objState.position, rotation: objState.rotation.toEuler(), scale: objState.scale, children: [_jsx("boxGeometry", { args: [1, 1, 1] }), _jsx("meshStandardMaterial", { color: isSolved ? '#4ade80' : isSolving ? '#fbbf24' : '#60a5fa', metalness: 0.3, roughness: 0.7 })] }, id))), state && (_jsx(ConstraintDebugger, { state: state, constraints: constraints, showDomains: true, highlightViolations: true, showLabels: true })), _jsx(OrbitControls, {})] })] }));
}
/**
 * Room layout example with multiple furniture pieces.
 */
export function RoomLayoutExample() {
    // Create furniture objects
    const furniture = [
        { id: 'sofa', position: new THREE.Vector3(0, 0, 0), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(2, 0.5, 1) },
        { id: 'table', position: new THREE.Vector3(3, 0, 0), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(1, 0.5, 1) },
        { id: 'chair1', position: new THREE.Vector3(-2, 0, 2), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(0.5, 0.5, 0.5) },
        { id: 'chair2', position: new THREE.Vector3(-2, 0, -2), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(0.5, 0.5, 0.5) },
        { id: 'lamp', position: new THREE.Vector3(4, 0, 3), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(0.3, 1.5, 0.3) }
    ];
    // Define room constraints
    const roomConstraints = [
        // Sofa should be against a wall (simplified)
        new AnyRelation(new ObjectSetVariable('sofa'), new ObjectSetVariable('wall_north'), new Touching()),
        // Table should be near sofa
        new AnyRelation(new ObjectSetVariable('table'), new ObjectSetVariable('sofa'), new Distance(new ScalarConstant(2), 'less_than')),
        // Chairs should face table
        new AnyRelation(new ObjectSetVariable('chair1'), new ObjectSetVariable('table'), new Distance(new ScalarConstant(1.5), 'less_than'))
    ];
    const { state, isSolved, violationCount } = useInfinigenSolver({
        constraints: roomConstraints,
        initialObjects: furniture,
        autoSolve: true
    });
    return (_jsxs(Canvas, { camera: { position: [8, 8, 8], fov: 50 }, children: [_jsx("color", { attach: "background", args: ['#0f0f1a'] }), _jsx("ambientLight", { intensity: 0.6 }), _jsx("directionalLight", { position: [5, 10, 5], intensity: 1, castShadow: true }), _jsxs("mesh", { position: [0, 1.5, -5], children: [_jsx("boxGeometry", { args: [10, 3, 0.2] }), _jsx("meshStandardMaterial", { color: "#333" })] }), _jsxs("mesh", { position: [-5, 1.5, 0], rotation: [0, Math.PI / 2, 0], children: [_jsx("boxGeometry", { args: [10, 3, 0.2] }), _jsx("meshStandardMaterial", { color: "#333" })] }), _jsxs("mesh", { rotation: [-Math.PI / 2, 0, 0], position: [0, -0.01, 0], children: [_jsx("planeGeometry", { args: [10, 10] }), _jsx("meshStandardMaterial", { color: "#222" })] }), state && Array.from(state.objects.entries()).map(([id, objState]) => (_jsxs("mesh", { position: objState.position, rotation: objState.rotation.toEuler(), castShadow: true, receiveShadow: true, children: [id === 'sofa' && _jsx("boxGeometry", { args: [2, 0.5, 1] }), id === 'table' && _jsx("boxGeometry", { args: [1, 0.5, 1] }), id.includes('chair') && _jsx("boxGeometry", { args: [0.5, 0.5, 0.5] }), id === 'lamp' && _jsx("cylinderGeometry", { args: [0.15, 0.15, 1.5, 8] }), _jsx("meshStandardMaterial", { color: isSolved ? '#4ade80' : '#f472b6', metalness: 0.2, roughness: 0.8 })] }, id))), _jsx(OrbitControls, {}), _jsx(Grid, { args: [10, 10], position: [0, -0.02, 0], cellColor: "#333" })] }));
}
/**
 * Main example app component.
 */
export default function Examples() {
    const [activeExample, setActiveExample] = useState('basic');
    return (_jsxs("div", { style: { width: '100vw', height: '100vh' }, children: [_jsxs("div", { style: {
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '10px',
                    zIndex: 1000
                }, children: [_jsx("button", { onClick: () => setActiveExample('basic'), style: {
                            padding: '8px 16px',
                            background: activeExample === 'basic' ? '#60a5fa' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }, children: "Basic Example" }), _jsx("button", { onClick: () => setActiveExample('room'), style: {
                            padding: '8px 16px',
                            background: activeExample === 'room' ? '#60a5fa' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                        }, children: "Room Layout" })] }), activeExample === 'basic' ? _jsx(BasicExample, {}) : _jsx(RoomLayoutExample, {})] }));
}
//# sourceMappingURL=basic-examples.js.map