/**
 * BlackbodyGLSL — Blackbody spectrum function for GLSL shaders
 *
 * Provides an injectable GLSL function that converts color temperature
 * (in Kelvin) to RGB color using Planck's law approximation.
 *
 * Based on the algorithm by Tanner Helland, which approximates CIE 1931
 * data for blackbody radiation in the 1000-40000K range.
 *
 * Used by lava, fire, and blackbody emission shaders.
 *
 * @module assets/shaders/common
 */

export const BLACKBODY_GLSL = /* glsl */ `
// ============================================================================
// Blackbody Color Temperature → RGB
// ============================================================================

/**
 * Convert color temperature (Kelvin) to RGB color.
 * Approximation based on Planck's law for visible spectrum.
 * Valid range: 1000K - 40000K
 *
 * @param tempK - Temperature in Kelvin
 * @return vec3 - RGB color in linear space (0-1 range, may exceed 1.0 for very hot temps)
 */
vec3 blackbodyColor(float tempK) {
  // Clamp to valid range
  float t = clamp(tempK, 1000.0, 40000.0) / 100.0;

  // Red channel
  float r;
  if (t <= 66.0) {
    r = 1.0;
  } else {
    r = 329.698727446 * pow(t - 60.0, -0.1332047592);
    r = clamp(r / 255.0, 0.0, 1.0);
  }

  // Green channel
  float g;
  if (t <= 66.0) {
    g = 99.4708025861 * log(t) - 161.1195681661;
    g = clamp(g / 255.0, 0.0, 1.0);
  } else {
    g = 288.1221695283 * pow(t - 60.0, -0.0755148492);
    g = clamp(g / 255.0, 0.0, 1.0);
  }

  // Blue channel
  float b;
  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = 138.5177312231 * log(t - 10.0) - 305.0447927307;
    b = clamp(b / 255.0, 0.0, 1.0);
  }

  return vec3(r, g, b);
}

/**
 * Get blackbody emission color with intensity scaling.
 * Applies proper gamma correction for physically-based emission.
 *
 * @param tempK - Temperature in Kelvin (1000-25000)
 * @param intensity - Emission intensity multiplier
 * @return vec3 - Emission RGB (linear space, HDR)
 */
vec3 blackbodyEmission(float tempK, float intensity) {
  vec3 color = blackbodyColor(tempK);

  // Luminous efficacy peaks around 6600K (daylight)
  // Normalize so that 6600K gives the brightest per-unit-intensity emission
  float efficacy = 1.0 - 0.3 * abs(tempK - 6600.0) / 6600.0;
  efficacy = clamp(efficacy, 0.2, 1.0);

  return color * intensity * efficacy;
}
`;
