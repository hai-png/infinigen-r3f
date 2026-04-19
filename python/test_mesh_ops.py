#!/usr/bin/env python3
"""
Test script for Advanced Mesh Operations via Hybrid Bridge

Tests:
1. Mesh Boolean operations (union, difference, intersection)
2. Mesh subdivision
3. Procedural generation (terrain, vegetation, building)
4. Batch raycasting
5. MJCF export

Usage:
    python test_mesh_ops.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from bridge_server import InfinigenBridgeServer


async def test_mesh_boolean():
    """Test mesh boolean operations"""
    print("\n" + "="*60)
    print("TEST: Mesh Boolean Operations")
    print("="*60)
    
    server = InfinigenBridgeServer()
    
    # Create two overlapping boxes
    mesh1 = {
        'vertices': [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ],
        'faces': [
            [0, 1, 2], [0, 2, 3],  # back
            [4, 6, 5], [4, 7, 6],  # front
            [0, 5, 1], [0, 4, 5],  # bottom
            [2, 7, 3], [2, 6, 7],  # top
            [0, 3, 7], [0, 7, 4],  # left
            [1, 5, 6], [1, 6, 2]   # right
        ]
    }
    
    # Second box offset by 0.5
    mesh2 = {
        'vertices': [
            [-0.5, -0.5, -0.5], [1.5, -0.5, -0.5], [1.5, 1.5, -0.5], [-0.5, 1.5, -0.5],
            [-0.5, -0.5, 1.5], [1.5, -0.5, 1.5], [1.5, 1.5, 1.5], [-0.5, 1.5, 1.5]
        ],
        'faces': [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 5, 1], [0, 4, 5],
            [2, 7, 3], [2, 6, 7],
            [0, 3, 7], [0, 7, 4],
            [1, 5, 6], [1, 6, 2]
        ]
    }
    
    try:
        # Test union
        result = await server.mesh_boolean('union', [mesh1, mesh2])
        print(f"✓ Union: {len(result['vertices'])} vertices, {len(result['faces'])} faces")
        
        # Test difference
        result = await server.mesh_boolean('difference', [mesh1, mesh2])
        print(f"✓ Difference: {len(result['vertices'])} vertices, {len(result['faces'])} faces")
        
        # Test intersection
        result = await server.mesh_boolean('intersection', [mesh1, mesh2])
        print(f"✓ Intersection: {len(result['vertices'])} vertices, {len(result['faces'])} faces")
        
        return True
    except Exception as e:
        print(f"✗ Boolean operation failed: {e}")
        return False


async def test_mesh_subdivide():
    """Test mesh subdivision"""
    print("\n" + "="*60)
    print("TEST: Mesh Subdivision")
    print("="*60)
    
    server = InfinigenBridgeServer()
    
    # Create a simple cube
    mesh = {
        'vertices': [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ],
        'faces': [
            [0, 1, 2], [0, 2, 3],
            [4, 6, 5], [4, 7, 6],
            [0, 5, 1], [0, 4, 5],
            [2, 7, 3], [2, 6, 7],
            [0, 3, 7], [0, 7, 4],
            [1, 5, 6], [1, 6, 2]
        ]
    }
    
    try:
        initial_faces = len(mesh['faces'])
        print(f"Initial mesh: {len(mesh['vertices'])} vertices, {initial_faces} faces")
        
        # Subdivide with 2 levels
        result = await server.mesh_subdivide(mesh, levels=2)
        
        print(f"After 2 levels: {len(result['vertices'])} vertices, {len(result['faces'])} faces")
        print(f"Face increase: {initial_faces} -> {len(result['faces'])} ({len(result['faces'])/initial_faces:.1f}x)")
        
        return True
    except Exception as e:
        print(f"✗ Subdivision failed: {e}")
        return False


async def test_procedural_generation():
    """Test procedural geometry generation"""
    print("\n" + "="*60)
    print("TEST: Procedural Generation")
    print("="*60)
    
    server = InfinigenBridgeServer()
    
    try:
        # Test terrain
        terrain = await server.generate_procedural('terrain', {
            'width': 50,
            'depth': 50,
            'resolution': 32,
            'height_scale': 5,
            'frequency': 0.2
        })
        print(f"✓ Terrain: {len(terrain['vertices'])} vertices, {len(terrain['faces'])} faces")
        
        # Test vegetation (tree)
        tree = await server.generate_procedural('vegetation', {
            'trunk_height': 2,
            'trunk_radius': 0.2,
            'crown_radius': 1.5
        })
        print(f"✓ Tree: {len(tree['vertices'])} vertices, {len(tree['faces'])} faces")
        
        # Test building
        building = await server.generate_procedural('building', {
            'width': 10,
            'height': 20,
            'depth': 10
        })
        print(f"✓ Building: {len(building['vertices'])} vertices, {len(building['faces'])} faces")
        
        return True
    except Exception as e:
        print(f"✗ Procedural generation failed: {e}")
        return False


async def test_raycast_batch():
    """Test batch raycasting"""
    print("\n" + "="*60)
    print("TEST: Batch Raycasting")
    print("="*60)
    
    server = InfinigenBridgeServer()
    
    # Set up a simple scene state
    server.current_state = {
        'objects': [
            {
                'id': 'box1',
                'pose': {'position': [0, 0, 0]},
                'size': [1, 1, 1]
            },
            {
                'id': 'box2',
                'pose': {'position': [3, 0, 0]},
                'size': [1, 1, 1]
            }
        ]
    }
    
    try:
        # Cast rays from different positions
        rays = [
            {'origin': [-5, 0, 0], 'dir': [1, 0, 0]},  # Should hit box1
            {'origin': [0, 0, 5], 'dir': [0, 0, -1]},  # Should hit box1
            {'origin': [10, 0, 0], 'dir': [-1, 0, 0]}, # Should hit box2
            {'origin': [0, 10, 0], 'dir': [0, -1, 0]}, # Should hit nothing (above)
        ]
        
        results = await server.raycast_batch(rays)
        
        for i, (ray, dist) in enumerate(zip(rays, results)):
            if dist == float('inf'):
                print(f"✓ Ray {i}: No hit (infinity)")
            else:
                print(f"✓ Ray {i}: Hit at distance {dist:.2f}")
        
        return True
    except Exception as e:
        print(f"✗ Raycasting failed: {e}")
        return False


async def test_mjcf_export():
    """Test MJCF export"""
    print("\n" + "="*60)
    print("TEST: MJCF Export")
    print("="*60)
    
    server = InfinigenBridgeServer()
    
    config = {
        'name': 'test_scene',
        'objects': [
            {
                'id': 'floor',
                'position': [0, 0, 0],
                'quaternion': [1, 0, 0, 0],
                'geometry': 'box',
                'size': [10, 0.1, 10]
            },
            {
                'id': 'box1',
                'position': [0, 1, 0],
                'quaternion': [1, 0, 0, 0],
                'geometry': 'box',
                'size': [0.5, 0.5, 0.5],
                'joint': {
                    'type': 'hinge',
                    'axis': [0, 0, 1]
                }
            }
        ]
    }
    
    try:
        xml_str = await server.export_mjcf(config)
        
        # Check XML structure
        if '<mujoco' in xml_str and '<worldbody>' in xml_str:
            print(f"✓ MJCF XML generated ({len(xml_str)} chars)")
            print(f"  Preview: {xml_str[:100]}...")
            return True
        else:
            print("✗ Invalid MJCF XML structure")
            return False
    except Exception as e:
        print(f"✗ MJCF export failed: {e}")
        return False


async def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("ADVANCED MESH OPERATIONS TEST SUITE")
    print("="*60)
    
    tests = [
        ("Mesh Boolean", test_mesh_boolean),
        ("Mesh Subdivision", test_mesh_subdivide),
        ("Procedural Generation", test_procedural_generation),
        ("Batch Raycasting", test_raycast_batch),
        ("MJCF Export", test_mjcf_export)
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = await test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n✗ {name} crashed: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
