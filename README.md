# Infinigen R3F Port

A TypeScript port of Infinigen's constraint-based procedural generation system for React Three Fiber.

## Overview

This project ports approximately 63% of Infinigen's codebase (515/812 files) to TypeScript, enabling real-time constraint-based scene composition in the browser. The core constraint language, reasoning engine, and solver algorithms are pure computational logic independent of Blender.

## Features

- ✅ **Constraint Language System** - Full type system with expressions, relations, and set reasoning
- ✅ **Reasoning Engine** - Domain analysis and constraint validation
- ✅ **Solver Core** - Simulated annealing and greedy solvers with move operations
- ✅ **Math Utilities** - Bounding boxes, vector math, and spatial operations
- ✅ **Placement Algorithms** - A* pathfinding, density-based placement, BVH raycasting
- ✅ **Tag System** - Complete semantic tagging hierarchy

## Installation

```bash
npm install
npm run build
```

## Usage

```typescript
import { 
  AnyRelation, 
  ScalarExpression, 
  Variable 
} from '@infinigen/r3f-port/constraint-language';

import { 
  SimulatedAnnealingSolver,
  TranslateMove 
} from '@infinigen/r3f-port/solver';

import { BBox } from '@infinigen/r3f-port/math';

import { TagSet, Semantics } from '@infinigen/r3f-port/tags';
```

## Project Structure

```
src/
├── constraint-language/   # Core constraint DSL
│   ├── types.ts          # Node, Variable, Domain classes
│   ├── expression.ts     # Expression system
│   ├── relations.ts      # Spatial relations
│   ├── set-reasoning.ts  # Quantifiers and set operations
│   └── geometry.ts       # Geometric predicates
├── reasoning/            # Constraint analysis
│   └── domain.ts         # Domain representations
├── solver/               # Optimization solvers
│   ├── moves.ts          # Move operations
│   └── index.ts          # Solver implementations
├── math/                 # Mathematical utilities
│   └── bbox.ts           # Bounding box operations
├── placement/            # Placement algorithms
│   ├── path-finding.ts   # A*, BVH raycasting
│   └── density.ts        # Noise-based placement
├── tags/                 # Semantic tagging
│   └── index.ts          # Tag hierarchy
└── index.ts              # Main entry point
```

## What's Ported

### Fully Portable (100%)
- Constraint language type system
- Reasoning engine algorithms
- Greedy solver components
- Move system abstractions
- Mathematical utilities
- Tag system
- Path finding algorithms

### Not Ported (Blender-specific)
- Geometry generation (use pre-made assets)
- Material node graphs (use three.js materials)
- Physics simulation (integrate separate engine)
- Camera rig spawning
- Asset instantiation via bpy

## Development

```bash
# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

## License

MIT

## Acknowledgments

Original project: [Infinigen](https://github.com/princeton-vl/infinigen)
