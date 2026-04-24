# Weather System Module

Dynamic weather simulation for Infinigen R3F.

## Features

- **Weather Types**: Clear, Cloudy, Rain, Snow, Fog, Storm, Thunderstorm
- **Particle Systems**: Rain and snow with wind effects
- **Cloud System**: Dynamic cloud generation and movement
- **Lightning**: Procedural lightning strikes for storms
- **Transitions**: Smooth weather state transitions

## Usage

```typescript
import { WeatherSystem, WeatherType } from '@infinigen/weather';

const weather = new WeatherSystem(scene, 'clear');
weather.setWeather('rain', 3000); // Transition to rain over 3 seconds

// In animation loop
weather.update(deltaTime);
```

## Location History

Previously located at:
- `src/weather/WeatherSystem.ts` (original)
- `src/terrain/weather/` (referenced but empty)
- `src/particles/effects/WeatherSystem.ts` (duplicate for particles module)

Now consolidated in `src/weather/` with re-export from `src/particles/effects/`.
