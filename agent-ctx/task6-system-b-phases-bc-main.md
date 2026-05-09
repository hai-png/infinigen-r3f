# Task 6 — System B Phases B & C: L-System Cleanup, Creature Relocation, SpatialGrid Fix

## Agent: Main
## Status: Completed

### Summary

Implemented all Phase B and Phase C tasks for the Vegetation & Plant System overhaul:

1. **Creature Relocation** — Moved 4 creature implementations from `vegetation/` to `creatures/` (canonical), preserving backward compatibility with CreatureBase adapters
2. **SpatialGrid Fix** — Added `query()` method and restructured SpaceColonization main loop from O(N×M) to O(M×K)
3. **GrassGenerator Deprecation** — Added deprecation notice with migration guide
4. **Index Updates** — Updated both `creatures/index.ts` and `vegetation/index.ts`

### Files Modified

- `src/assets/objects/creatures/DragonflyGenerator.ts` — Full implementation + adapter (was thin delegate)
- `src/assets/objects/creatures/JellyfishGenerator.ts` — Full implementation + adapter (was thin delegate)
- `src/assets/objects/creatures/BeetleGenerator.ts` — Full implementation + adapter (was thin delegate)
- `src/assets/objects/creatures/CrustaceanGenerator.ts` — Full implementation + adapter (was thin delegate)
- `src/assets/objects/creatures/index.ts` — Updated exports, removed vegetation/ deprecation notices
- `src/assets/objects/vegetation/SpaceColonization.ts` — Added SpatialGrid.query(), restructured main loop
- `src/assets/objects/vegetation/plants/GrassGenerator.ts` — Added @deprecated notice
- `src/assets/objects/vegetation/index.ts` — Added @deprecated to GrassGenerator export

### Files Deleted

- `src/assets/objects/vegetation/dragonfly/DragonflyGenerator.ts`
- `src/assets/objects/vegetation/dragonfly/index.ts`
- `src/assets/objects/vegetation/jellyfish/JellyfishGenerator.ts`
- `src/assets/objects/vegetation/jellyfish/index.ts`
- `src/assets/objects/vegetation/beetle/BeetleGenerator.ts`
- `src/assets/objects/vegetation/beetle/index.ts`
- `src/assets/objects/vegetation/crustacean/CrustaceanGenerator.ts`
- `src/assets/objects/vegetation/crustacean/index.ts`

### Key Decisions

- Canonical generator classes keep their original names (e.g., `BeetleGenerator`) since they are the primary API
- CreatureBase adapters renamed to `*Adapter` (e.g., `BeetleAdapter`) to avoid name collision with the canonical implementation
- `BeetleConfig`/`JellyfishConfig`/etc. are the new canonical config types; `BeetleParams`/`JellyfishParams`/etc. marked @deprecated
- SpatialGrid.query() uses squared distance comparison for performance
