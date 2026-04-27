/**
 * useMaterialPreview - Hook for material preview rendering
 * Provides optimized preview generation for material editor
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as THREE from 'three';

export interface PreviewConfig {
  resolution: number;
  environment: 'studio' | 'outdoor' | 'indoor' | 'none';
  lighting: 'default' | 'dramatic' | 'soft';
  background: 'transparent' | 'grid' | 'gradient' | 'color';
  backgroundColor?: string;
}

export interface MaterialPreviewResult {
  dataUrl: string;
  texture: THREE.Texture | null;
  loading: boolean;
  error?: string;
}

const defaultConfig: PreviewConfig = {
  resolution: 256,
  environment: 'studio',
  lighting: 'default',
  background: 'transparent',
};

export const useMaterialPreview = (
  material: THREE.Material | null,
  config: Partial<PreviewConfig> = {}
): MaterialPreviewResult => {
  const [result, setResult] = useState<MaterialPreviewResult>({
    dataUrl: '',
    texture: null,
    loading: false,
  });

  const finalConfig = { ...defaultConfig, ...config };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Initialize off-screen renderer
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = finalConfig.resolution;
    canvas.height = finalConfig.resolution;
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: finalConfig.background === 'transparent',
      antialias: true,
    });
    renderer.setSize(finalConfig.resolution, finalConfig.resolution);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    
    // Setup lighting based on config
    setupLighting(scene, finalConfig.lighting);
    
    // Setup environment
    if (finalConfig.environment !== 'none') {
      setupEnvironment(scene, finalConfig.environment);
    }

    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    return () => {
      renderer.dispose();
      canvas.remove();
    };
  }, [finalConfig.resolution, finalConfig.environment, finalConfig.lighting, finalConfig.background]);

  // Render preview when material changes
  useEffect(() => {
    if (!material || !rendererRef.current || !sceneRef.current || !cameraRef.current) {
      return;
    }

    let cancelled = false;

    const renderPreview = async () => {
      setResult(prev => ({ ...prev, loading: true }));

      try {
        const scene = sceneRef.current!;
        const renderer = rendererRef.current!;
        const camera = cameraRef.current!;

        // Clear previous mesh
        scene.children.forEach(child => {
          if (child.type === 'Mesh') {
            scene.remove(child);
          }
        });

        // Create preview sphere
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Setup background
        setupBackground(scene, finalConfig.background, finalConfig.backgroundColor);

        // Render
        renderer.render(scene, camera);

        if (!cancelled) {
          // Get data URL
          const dataUrl = renderer.domElement.toDataURL('image/png');
          
          // Create texture
          const texture = new THREE.CanvasTexture(renderer.domElement);
          texture.needsUpdate = true;

          setResult({
            dataUrl,
            texture,
            loading: false,
          });
        }

        // Cleanup
        geometry.dispose();
      } catch (error) {
        if (!cancelled) {
          setResult(prev => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      }
    };

    renderPreview();

    return () => {
      cancelled = true;
    };
  }, [material, finalConfig.background, finalConfig.backgroundColor]);

  return result;
};

function setupLighting(scene: THREE.Scene, type: string) {
  // Clear existing lights
  scene.children.forEach(child => {
    if (child.type.includes('Light')) {
      scene.remove(child);
    }
  });

  switch (type) {
    case 'dramatic':
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
      keyLight.position.set(5, 5, 5);
      scene.add(keyLight);
      
      const rimLight = new THREE.DirectionalLight(0x4488ff, 0.8);
      rimLight.position.set(-5, 0, -5);
      scene.add(rimLight);
      break;

    case 'soft':
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);
      
      const softLight = new THREE.DirectionalLight(0xffffff, 0.8);
      softLight.position.set(3, 5, 3);
      scene.add(softLight);
      break;

    case 'default':
    default:
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const mainLight = new THREE.DirectionalLight(0xffffff, 1);
      mainLight.position.set(5, 5, 5);
      scene.add(mainLight);
      
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-5, 0, -5);
      scene.add(fillLight);
      break;
  }
}

function setupEnvironment(scene: THREE.Scene, type: string) {
  // Environment setup would use @react-three/drei's Environment in actual implementation
  // This is a simplified version for the hook
  console.log(`Setting up ${type} environment`);
}

function setupBackground(
  scene: THREE.Scene,
  type: string,
  color?: string
) {
  switch (type) {
    case 'grid':
      // Grid background would be implemented with a grid helper
      break;
    case 'gradient':
      // Gradient background would use a shader
      break;
    case 'color':
      if (color) {
        scene.background = new THREE.Color(color);
      }
      break;
    case 'transparent':
    default:
      scene.background = null;
      break;
  }
}

export default useMaterialPreview;
