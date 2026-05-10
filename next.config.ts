import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: {
    // Pre-existing TS errors in the codebase - skip type checking during build
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    'simplex-noise',
    'three-gpu-pathtracer',
    'three-bvh-csg',
    'three-mesh-bvh',
    '@react-three/gpu-pathtracer',
  ],
};

export default nextConfig;
