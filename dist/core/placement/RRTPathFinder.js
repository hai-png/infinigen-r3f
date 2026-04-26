/**
 * RRTPathFinder
 *
 * Rapidly-exploring Random Tree (RRT) pathfinding algorithm for object placement
 * and navigation in 3D scenes. Provides collision-free path planning with
 * configurable constraints and optimization strategies.
 *
 * Features:
 * - Standard RRT and RRT* (optimal) algorithms
 * - 3D configuration space with obstacles
 * - Custom distance metrics and steering functions
 * - Path smoothing and optimization
 * - Dynamic obstacle avoidance
 * - Multi-query support with cached trees
 * - Configurable sampling strategies
 */
import { Vector3, Box3, Raycaster, MathUtils } from 'three';
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Generate a unique node ID
 */
function generateNodeId() {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Euclidean distance between two points
 */
function distance(a, b) {
    return a.distanceTo(b);
}
/**
 * Check if a point is within bounds
 */
function isInBounds(position, bounds) {
    return bounds.containsPoint(position);
}
/**
 * Check if a point collides with any obstacle
 */
function checkCollision(position, obstacles, raycaster) {
    for (const obstacle of obstacles) {
        switch (obstacle.type) {
            case 'box':
                if (obstacle.box?.containsPoint(position)) {
                    return true;
                }
                break;
            case 'sphere':
                if (obstacle.sphere?.containsPoint(position)) {
                    return true;
                }
                break;
            case 'mesh':
                if (obstacle.mesh) {
                    // Simple bounding box check for mesh
                    const bbox = new Box3().setFromObject(obstacle.mesh);
                    if (bbox.containsPoint(position)) {
                        return true;
                    }
                }
                break;
            case 'custom':
                if (obstacle.check?.(position)) {
                    return true;
                }
                break;
        }
    }
    return false;
}
/**
 * Check if a line segment collides with any obstacle
 */
function checkLineCollision(start, end, obstacles, raycaster, steps = 10) {
    const direction = new Vector3().subVectors(end, start);
    const segmentLength = direction.length();
    direction.normalize();
    // Sample points along the line segment
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const point = new Vector3().lerpVectors(start, end, t);
        if (checkCollision(point, obstacles, raycaster)) {
            return true;
        }
    }
    return false;
}
/**
 * Steer from one point toward another with step size limit
 */
function steer(from, to, maxStepSize) {
    const direction = new Vector3().subVectors(to, from);
    const dist = direction.length();
    if (dist <= maxStepSize) {
        return to.clone();
    }
    direction.normalize();
    return new Vector3().addVectors(from, direction.multiplyScalar(maxStepSize));
}
/**
 * Find nearest node in the tree to a given point
 */
function findNearestNode(point, nodes) {
    let nearest = null;
    let minDist = Infinity;
    for (const node of nodes.values()) {
        const dist = distance(node.position, point);
        if (dist < minDist) {
            minDist = dist;
            nearest = node;
        }
    }
    return nearest;
}
/**
 * Find nodes within a radius of a point
 */
function findNodesInRadius(point, nodes, radius) {
    const nearby = [];
    for (const node of nodes.values()) {
        if (distance(node.position, point) <= radius) {
            nearby.push(node);
        }
    }
    return nearby;
}
/**
 * Sample a random point in the configuration space
 */
function samplePoint(bounds, strategy, goal, obstacles) {
    // Goal bias sampling
    if (strategy.name === 'goal_bias' && goal && Math.random() < strategy.goalBiasProbability) {
        return goal.clone();
    }
    // Custom sampler
    if (strategy.customSampler) {
        return strategy.customSampler();
    }
    // Uniform sampling
    const x = MathUtils.randFloat(bounds.min.x, bounds.max.x);
    const y = MathUtils.randFloat(bounds.min.y, bounds.max.y);
    const z = MathUtils.randFloat(bounds.min.z, bounds.max.z);
    return new Vector3(x, y, z);
}
/**
 * Smooth a path by removing unnecessary waypoints
 */
function smoothPath(path, obstacles, raycaster, maxIterations = 100) {
    if (path.length <= 2)
        return path;
    const smoothed = [path[0].clone()];
    let currentIndex = 0;
    for (let iter = 0; iter < maxIterations; iter++) {
        // Try to connect to farthest possible point
        let farthestIndex = currentIndex + 1;
        for (let j = currentIndex + 2; j < path.length; j++) {
            if (!checkLineCollision(smoothed[currentIndex], path[j], obstacles, raycaster)) {
                farthestIndex = j;
            }
            else {
                break;
            }
        }
        if (farthestIndex > currentIndex + 1) {
            smoothed.push(path[farthestIndex].clone());
            currentIndex = farthestIndex;
        }
        else {
            currentIndex++;
            if (currentIndex < path.length) {
                smoothed.push(path[currentIndex].clone());
            }
        }
        if (currentIndex >= path.length - 1)
            break;
    }
    // Ensure we reach the goal
    if (smoothed.length === 0 || !smoothed[smoothed.length - 1].equals(path[path.length - 1])) {
        smoothed.push(path[path.length - 1].clone());
    }
    return smoothed;
}
// ============================================================================
// RRTPathFinder Class
// ============================================================================
export class RRTPathFinder {
    constructor(config) {
        this.config = {
            maxIterations: config?.maxIterations ?? 10000,
            stepSize: config?.stepSize ?? 1.0,
            goalThreshold: config?.goalThreshold ?? 0.5,
            maxStepSize: config?.maxStepSize ?? 2.0,
            minStepSize: config?.minStepSize ?? 0.1,
            useRRStar: config?.useRRStar ?? false,
            rewireRadius: config?.rewireRadius ?? 5.0,
            pathSmoothing: config?.pathSmoothing ?? true,
            randomSeed: config?.randomSeed
        };
        this.nodes = new Map();
        this.root = null;
        this.goal = null;
        this.obstacles = [];
        this.bounds = new Box3(new Vector3(-50, 0, -50), new Vector3(50, 50, 50));
        this.raycaster = new Raycaster();
        this.samplingStrategy = {
            name: 'uniform',
            goalBiasProbability: 0.1
        };
        this.seed = this.config.randomSeed ?? Date.now();
    }
    /**
     * Set the configuration space bounds
     */
    setBounds(min, max) {
        this.bounds.set(min, max);
    }
    /**
     * Add an obstacle to the scene
     */
    addObstacle(obstacle) {
        this.obstacles.push(obstacle);
    }
    /**
     * Remove an obstacle
     */
    removeObstacle(index) {
        if (index >= 0 && index < this.obstacles.length) {
            this.obstacles.splice(index, 1);
        }
    }
    /**
     * Clear all obstacles
     */
    clearObstacles() {
        this.obstacles = [];
    }
    /**
     * Add obstacles from scene objects
     */
    addObstaclesFromScene(objects) {
        for (const obj of objects) {
            const bbox = new Box3().setFromObject(obj);
            this.addObstacle({
                type: 'box',
                box: bbox
            });
        }
    }
    /**
     * Set the sampling strategy
     */
    setSamplingStrategy(strategy) {
        this.samplingStrategy = { ...this.samplingStrategy, ...strategy };
    }
    /**
     * Reset the tree
     */
    reset() {
        this.nodes.clear();
        this.root = null;
        this.goal = null;
    }
    /**
     * Plan a path from start to goal
     */
    plan(start, goal) {
        const startTime = performance.now();
        // Validate start and goal positions
        if (checkCollision(start, this.obstacles, this.raycaster)) {
            return {
                success: false,
                path: [],
                nodes: 0,
                iterations: 0,
                computationTime: 0,
                message: 'Start position is in collision'
            };
        }
        if (checkCollision(goal, this.obstacles, this.raycaster)) {
            return {
                success: false,
                path: [],
                nodes: 0,
                iterations: 0,
                computationTime: 0,
                message: 'Goal position is in collision'
            };
        }
        // Initialize tree with start node
        this.reset();
        const rootNode = {
            id: generateNodeId(),
            position: start.clone(),
            parent: null,
            children: [],
            cost: 0,
            heuristic: distance(start, goal),
            totalCost: distance(start, goal),
            metadata: {}
        };
        this.nodes.set(rootNode.id, rootNode);
        this.root = rootNode.id;
        let goalNode = null;
        let iterations = 0;
        // Main RRT loop
        while (iterations < this.config.maxIterations) {
            iterations++;
            // Sample a random point
            const samplePoint = this.sampleConfigurationSpace(goal);
            // Find nearest node
            const nearestNode = findNearestNode(samplePoint, this.nodes);
            if (!nearestNode)
                continue;
            // Steer toward sample
            const stepSize = MathUtils.clamp(distance(nearestNode.position, samplePoint) * 0.5, this.config.minStepSize, this.config.maxStepSize);
            const newPosition = steer(nearestNode.position, samplePoint, stepSize);
            // Check if new point is in bounds
            if (!isInBounds(newPosition, this.bounds)) {
                continue;
            }
            // Check for collisions along the path
            if (checkLineCollision(nearestNode.position, newPosition, this.obstacles, this.raycaster)) {
                continue;
            }
            // Create new node
            const newNode = {
                id: generateNodeId(),
                position: newPosition,
                parent: nearestNode.id,
                children: [],
                cost: nearestNode.cost + distance(nearestNode.position, newPosition),
                heuristic: distance(newPosition, goal),
                totalCost: 0,
                metadata: {}
            };
            newNode.totalCost = newNode.cost + newNode.heuristic;
            // For RRT*, find better parent
            if (this.config.useRRStar) {
                const nearby = findNodesInRadius(newPosition, this.nodes, this.config.rewireRadius);
                let bestParent = nearestNode;
                let bestCost = newNode.cost;
                for (const potentialParent of nearby) {
                    if (checkLineCollision(potentialParent.position, newPosition, this.obstacles, this.raycaster)) {
                        continue;
                    }
                    const costThroughPotential = potentialParent.cost + distance(potentialParent.position, newPosition);
                    if (costThroughPotential < bestCost) {
                        bestParent = potentialParent;
                        bestCost = costThroughPotential;
                    }
                }
                // Update parent and cost
                newNode.parent = bestParent.id;
                newNode.cost = bestCost;
                newNode.totalCost = bestCost + newNode.heuristic;
                // Rewire tree
                for (const nearbyNode of nearby) {
                    if (nearbyNode.id === newNode.id)
                        continue;
                    const costThroughNew = newNode.cost + distance(newNode.position, nearbyNode.position);
                    if (costThroughNew < nearbyNode.cost) {
                        // Remove from old parent's children
                        if (nearbyNode.parent) {
                            const oldParent = this.nodes.get(nearbyNode.parent);
                            if (oldParent) {
                                oldParent.children = oldParent.children.filter(id => id !== nearbyNode.id);
                            }
                        }
                        // Update parent
                        nearbyNode.parent = newNode.id;
                        nearbyNode.cost = costThroughNew;
                        nearbyNode.totalCost = costThroughNew + nearbyNode.heuristic;
                        // Add to new parent's children
                        newNode.children.push(nearbyNode.id);
                    }
                }
                // Update old parent's children
                if (bestParent.id !== nearestNode.id) {
                    nearestNode.children = nearestNode.children.filter(id => id !== newNode.id);
                    bestParent.children.push(newNode.id);
                }
            }
            else {
                // Standard RRT: just add to nearest node's children
                nearestNode.children.push(newNode.id);
            }
            this.nodes.set(newNode.id, newNode);
            // Check if we reached the goal
            if (distance(newPosition, goal) <= this.config.goalThreshold) {
                goalNode = newNode;
                break;
            }
        }
        // Extract path
        if (!goalNode) {
            // Try to connect to goal directly from nearest node
            const nearestToGoal = findNearestNode(goal, this.nodes);
            if (nearestToGoal &&
                distance(nearestToGoal.position, goal) <= this.config.goalThreshold * 2 &&
                !checkLineCollision(nearestToGoal.position, goal, this.obstacles, this.raycaster)) {
                // Create a virtual goal node
                goalNode = {
                    id: generateNodeId(),
                    position: goal.clone(),
                    parent: nearestToGoal.id,
                    children: [],
                    cost: nearestToGoal.cost + distance(nearestToGoal.position, goal),
                    heuristic: 0,
                    totalCost: nearestToGoal.cost + distance(nearestToGoal.position, goal),
                    metadata: {}
                };
                this.nodes.set(goalNode.id, goalNode);
                nearestToGoal.children.push(goalNode.id);
            }
        }
        const computationTime = performance.now() - startTime;
        if (!goalNode) {
            return {
                success: false,
                path: [],
                nodes: this.nodes.size,
                iterations,
                computationTime,
                message: 'No path found within iteration limit'
            };
        }
        // Backtrack to extract path
        const path = [];
        let currentNode = goalNode;
        while (currentNode) {
            path.unshift(currentNode.position.clone());
            if (currentNode.parent) {
                currentNode = this.nodes.get(currentNode.parent) || null;
            }
            else {
                currentNode = null;
            }
        }
        // Smooth the path
        let finalPath = path;
        if (this.config.pathSmoothing && path.length > 2) {
            finalPath = smoothPath(path, this.obstacles, this.raycaster);
        }
        this.goal = goalNode.id;
        return {
            success: true,
            path: finalPath,
            nodes: this.nodes.size,
            iterations,
            computationTime
        };
    }
    /**
     * Get the current tree nodes
     */
    getNodes() {
        return new Map(this.nodes);
    }
    /**
     * Get statistics about the tree
     */
    getStatistics() {
        if (this.nodes.size === 0) {
            return {
                totalNodes: 0,
                treeDepth: 0,
                avgBranchingFactor: 0,
                coverage: 0
            };
        }
        // Calculate tree depth
        let maxDepth = 0;
        const calculateDepth = (nodeId, depth) => {
            const node = this.nodes.get(nodeId);
            if (!node)
                return depth;
            let maxChildDepth = depth;
            for (const childId of node.children) {
                const childDepth = calculateDepth(childId, depth + 1);
                maxChildDepth = Math.max(maxChildDepth, childDepth);
            }
            return maxChildDepth;
        };
        if (this.root) {
            maxDepth = calculateDepth(this.root, 0);
        }
        // Calculate average branching factor
        let totalChildren = 0;
        for (const node of this.nodes.values()) {
            totalChildren += node.children.length;
        }
        const avgBranchingFactor = this.nodes.size > 0 ? totalChildren / this.nodes.size : 0;
        // Estimate coverage (volume of bounding box of all nodes)
        const allPositions = Array.from(this.nodes.values()).map(n => n.position);
        const coverageBox = new Box3().setFromPoints(allPositions);
        const coverage = coverageBox.volume();
        return {
            totalNodes: this.nodes.size,
            treeDepth: maxDepth,
            avgBranchingFactor,
            coverage
        };
    }
    /**
     * Export tree to JSON
     */
    exportToJSON() {
        const data = {
            config: this.config,
            bounds: {
                min: [this.bounds.min.x, this.bounds.min.y, this.bounds.min.z],
                max: [this.bounds.max.x, this.bounds.max.y, this.bounds.max.z]
            },
            nodes: Array.from(this.nodes.values()).map(n => ({
                id: n.id,
                position: [n.position.x, n.position.y, n.position.z],
                parent: n.parent,
                children: n.children,
                cost: n.cost,
                heuristic: n.heuristic,
                totalCost: n.totalCost
            })),
            root: this.root,
            goal: this.goal
        };
        return JSON.stringify(data, null, 2);
    }
    /**
     * Import tree from JSON
     */
    importFromJSON(json) {
        const data = JSON.parse(json);
        this.config = { ...this.config, ...data.config };
        this.bounds.set(new Vector3(...data.bounds.min), new Vector3(...data.bounds.max));
        this.nodes.clear();
        for (const nodeData of data.nodes) {
            const node = {
                ...nodeData,
                position: new Vector3(...nodeData.position)
            };
            this.nodes.set(node.id, node);
        }
        this.root = data.root;
        this.goal = data.goal;
    }
    /**
     * Sample a configuration space point
     */
    sampleConfigurationSpace(goal) {
        return samplePoint(this.bounds, this.samplingStrategy, goal, this.obstacles);
    }
}
export default RRTPathFinder;
//# sourceMappingURL=RRTPathFinder.js.map