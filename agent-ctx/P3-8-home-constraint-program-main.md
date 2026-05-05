# P3-8: Home Constraint Program

## Task Summary
Created `src/core/constraints/indoor/HomeConstraintProgram.ts` (2036 lines) implementing comprehensive furniture placement constraints for indoor scene generation.

## What Was Done
- **RoomType enum**: 10 residential room types (LIVING_ROOM, BEDROOM, KITCHEN, BATHROOM, DINING_ROOM, STUDY, HALLWAY, CLOSET, GARAGE, BALCONY)
- **FurnitureCategory enum**: 10 categories (SEATING, TABLE, STORAGE, BED, APPLIANCE, LIGHTING, DECORATION, RUG, CURTAIN, PLANT)
- **FurnitureRule interface**: Full rule definition with proximity, alignment, count, area, and weight fields
- **HomeConstraintProgram class**: 38 furniture rules + 9 adjacency constraints + all required methods
- **FurnitureConstraintEvaluator class**: Room-level and global constraint evaluation with violation scoring

## Key Design Decisions
- Rules are declarative (not imperative) for SA solver compatibility
- Violation scoring uses weighted penalties (higher weight = more important rule)
- Against-wall alignment checked via room geometry distance-to-wall calculation
- Facing/beside alignment checked via forward-direction dot products
- Placement suggestions prioritize missing required furniture over optional items

## Compilation
- Zero TypeScript errors from the new file
- Fixed type issues: `evaluateGlobalConstraints` parameter type, explicit type annotation for union type resolution

## Dependencies
- Uses THREE.Vector3 for positions
- Self-contained (no imports from other constraint modules)
- Complements existing BlueprintSolidifier.ts which references HomeConstraintProgram
