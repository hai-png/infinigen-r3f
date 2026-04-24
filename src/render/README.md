# Render Module - DEPRECATED

⚠️ **This module is deprecated and will be removed in a future release.**

## Migration Path

Use `src/rendering/` instead, which provides:
- Shader compilation
- Post-processing effects
- EffectComposer integration

## What's Here

- `multi-pass-renderer.ts`: Multi-pass rendering system with AOV support
- `aov-system.ts`: Arbitrary Output Variable management

These files have NOT been migrated to `src/rendering/` yet because they serve different purposes:
- `src/render/` = Scene rendering passes (geometry, depth, normals, etc.)
- `src/rendering/` = Post-processing and shader compilation

## Recommendation

Keep both modules separate but rename for clarity:
- `src/render/` → `src/rendering/passes/` or `src/rendering/multi-pass/`
- OR keep as-is but document the distinction clearly

For now, this directory remains functional but should be consolidated in Phase 2.
