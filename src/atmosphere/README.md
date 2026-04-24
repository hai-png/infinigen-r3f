# Atmosphere Module

This module consolidates all atmospheric effects previously scattered across:
- `src/atmosphere/` (AtmosphericScattering)
- `src/terrain/atmosphere/` (AtmosphericSky, VolumetricClouds)

## Usage

```typescript
import { AtmosphericSky, VolumetricClouds, AtmosphericScattering } from '@infinigen/atmosphere';
```

## Components

- **AtmosphericSky**: Rayleigh/Mie scattering sky renderer
- **VolumetricClouds**: GPU-accelerated volumetric cloud system  
- **AtmosphericScattering**: Legacy scattering implementation (deprecated, use AtmosphericSky)

## Migration

Replace imports from `src/terrain/atmosphere` with `src/atmosphere`.
