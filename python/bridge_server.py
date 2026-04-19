#!/usr/bin/env python3
"""
Infinigen Bridge Server

WebSocket server that enables communication between the R3F (TypeScript) frontend
and the original Infinigen (Python/Blender) backend.

Usage:
    python bridge_server.py [--port 8765]

Requirements:
    pip install websockets asyncio
"""

import asyncio
import json
import argparse
import sys
from typing import Dict, Any, Optional
from pathlib import Path

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("Error: websockets library not found. Install with: pip install websockets")
    sys.exit(1)

class InfinigenBridgeServer:
    """
    WebSocket server for handling requests from the R3F frontend.
    Offloads heavy tasks to Blender/Infinigen Python backend.
    """
    
    def __init__(self, host: str = 'localhost', port: int = 8765):
        self.host = host
        self.port = port
        self.clients: set[WebSocketServerProtocol] = set()
        self.task_queue: asyncio.Queue = asyncio.Queue()
        
    async def register(self, websocket: WebSocketServerProtocol):
        """Register a new client connection"""
        self.clients.add(websocket)
        print(f"[Bridge] Client connected. Total clients: {len(self.clients)}")
        
    async def unregister(self, websocket: WebSocketServerProtocol):
        """Unregister a client connection"""
        self.clients.discard(websocket)
        print(f"[Bridge] Client disconnected. Total clients: {len(self.clients)}")
        
    async def handle_message(self, websocket: WebSocketServerProtocol, message: str):
        """Handle incoming messages from clients"""
        try:
            data = json.loads(message)
            # Support both old 'type' and new 'method' formats
            msg_type = data.get('type', 'TASK')
            method = data.get('method', None)
            
            if msg_type == 'SYNC_STATE':
                await self.handle_sync_state(websocket, data.get('payload', {}))
            elif method in ['mesh_boolean', 'mesh_subdivide', 'export_mjcf', 'generate_procedural', 'raycast_batch']:
                # New RPC-style method calls
                await self.handle_rpc_method(websocket, data)
            elif msg_type in ['GENERATE_GEOMETRY', 'RUN_SIMULATION', 'RENDER_IMAGE', 'BAKE_PHYSICS']:
                await self.handle_task(websocket, data)
            else:
                await self.send_error(websocket, f"Unknown message type: {msg_type}")
                
        except json.JSONDecodeError as e:
            await self.send_error(websocket, f"Invalid JSON: {str(e)}")
        except Exception as e:
            await self.send_error(websocket, f"Internal error: {str(e)}")
            
    async def handle_sync_state(self, websocket: WebSocketServerProtocol, state: Dict[str, Any]):
        """Handle state synchronization from frontend"""
        print(f"[Bridge] Received state sync with {len(state.get('objects', []))} objects")
        
        # Store state in memory for subsequent operations
        self.current_state = state
        
        # If running inside Blender, update the actual scene
        try:
            import bpy
            await self._update_blender_scene(state)
            print("[Bridge] Updated Blender scene successfully")
        except ImportError:
            print("[Bridge] Running in standalone mode - state stored in memory")
            
        await websocket.send(json.dumps({
            'type': 'SYNC_ACK',
            'status': 'success',
            'message': 'State synchronized'
        }))
    
    async def handle_rpc_method(self, websocket: WebSocketServerProtocol, request: Dict[str, Any]):
        """Handle RPC-style method calls from the hybrid bridge"""
        method = request.get('method')
        params = request.get('params', {})
        request_id = request.get('id', 'unknown')
        
        print(f"[Bridge] RPC call: {method}")
        
        try:
            result = None
            
            if method == 'mesh_boolean':
                result = await self.mesh_boolean(
                    params.get('operation', 'union'),
                    params.get('meshes', [])
                )
            elif method == 'mesh_subdivide':
                result = await self.mesh_subdivide(
                    params.get('mesh', {}),
                    params.get('levels', 2)
                )
            elif method == 'export_mjcf':
                result = await self.export_mjcf(
                    params.get('config', {})
                )
            elif method == 'generate_procedural':
                result = await self.generate_procedural(
                    params.get('type', 'terrain'),
                    params.get('params', {})
                )
            elif method == 'raycast_batch':
                result = await self.raycast_batch(
                    params.get('rays', [])
                )
            else:
                raise ValueError(f"Unknown method: {method}")
            
            # Send success response
            await websocket.send(json.dumps({
                'id': request_id,
                'success': True,
                'result': result
            }))
            
        except Exception as e:
            print(f"[Bridge] RPC {method} failed: {str(e)}")
            await websocket.send(json.dumps({
                'id': request_id,
                'success': False,
                'error': str(e)
            }))
    
    async def _update_blender_scene(self, state: Dict[str, Any]):
        """Update Blender scene to match frontend state"""
        import bpy
        
        # Clear existing objects if needed
        # bpy.ops.object.select_all(action='SELECT')
        # bpy.ops.object.delete()
        
        # Create/update objects based on state
        for obj_data in state.get('objects', []):
            obj_id = obj_data.get('id')
            obj_type = obj_data.get('type', 'mesh')
            pose = obj_data.get('pose', {})
            
            # Check if object exists
            if obj_id in bpy.data.objects:
                obj = bpy.data.objects[obj_id]
            else:
                # Create new object based on type
                if obj_type == 'camera':
                    cam_data = bpy.data.cameras.new(obj_id)
                    obj = bpy.data.objects.new(obj_id, cam_data)
                    bpy.context.collection.objects.link(obj)
                elif obj_type == 'light':
                    light_data = bpy.data.lights.new(obj_id, type='POINT')
                    obj = bpy.data.objects.new(obj_id, light_data)
                    bpy.context.collection.objects.link(obj)
                else:
                    # Default mesh (cube placeholder)
                    mesh_data = bpy.data.meshes.new(obj_id)
                    obj = bpy.data.objects.new(obj_id, mesh_data)
                    bpy.context.collection.objects.link(obj)
            
            # Apply transform
            location = pose.get('position', [0, 0, 0])
            rotation = pose.get('rotation', [0, 0, 0])
            scale = pose.get('scale', [1, 1, 1])
            
            obj.location = location
            obj.rotation_euler = rotation
            obj.scale = scale
        
    async def handle_task(self, websocket: WebSocketServerProtocol, request: Dict[str, Any]):
        """Handle heavy computation tasks"""
        task_id = request.get('taskId', 'unknown')
        task_type = request.get('type', 'UNKNOWN')
        payload = request.get('payload', {})
        
        print(f"[Bridge] Received task {task_id} of type {task_type}")
        
        # Send progress acknowledgment
        await websocket.send(json.dumps({
            'taskId': task_id,
            'status': 'progress',
            'progress': 0
        }))
        
        try:
            # Route to appropriate handler
            if task_type == 'GENERATE_GEOMETRY':
                result = await self.generate_geometry(payload)
            elif task_type == 'RUN_SIMULATION':
                result = await self.run_simulation(payload)
            elif task_type == 'RENDER_IMAGE':
                result = await self.render_image(payload)
            elif task_type == 'BAKE_PHYSICS':
                result = await self.bake_physics(payload)
            else:
                raise ValueError(f"Unknown task type: {task_type}")
                
            # Send success response
            await websocket.send(json.dumps({
                'taskId': task_id,
                'status': 'success',
                'progress': 100,
                'data': result
            }))
            
        except Exception as e:
            print(f"[Bridge] Task {task_id} failed: {str(e)}")
            await websocket.send(json.dumps({
                'taskId': task_id,
                'status': 'error',
                'error': str(e)
            }))
            
    async def generate_geometry(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate geometry using Infinigen Python backend.
        This is where unportable bpy operations happen.
        """
        objects = payload.get('objects', [])
        options = payload.get('options', {'detail': 'high', 'format': 'glb'})
        
        print(f"[Bridge] Generating geometry for {len(objects)} objects...")
        
        # Check if running in Blender environment
        try:
            import bpy
            import bmesh
            
            # Use actual Infinigen geometry generation if available
            try:
                from infinigen.core import generate_meshes
                mesh_data = await asyncio.to_thread(
                    generate_meshes, 
                    objects, 
                    **options
                )
                output_path = await self._save_mesh(mesh_data, options.get('format', 'glb'))
                return {
                    'assetUrl': output_path,
                    'stateUpdate': {'generated': True, 'source': 'blender'}
                }
            except ImportError:
                # Fallback: Create basic meshes using Blender operators
                print("[Bridge] Using Blender fallback for geometry generation")
                output_path = await self._generate_blender_meshes(objects, options)
                return {
                    'assetUrl': output_path,
                    'stateUpdate': {'generated': True, 'source': 'blender_fallback'}
                }
        except ImportError:
            # Standalone mode: use trimesh for basic geometry
            print("[Bridge] Running in standalone mode - using trimesh")
            output_path = await self._generate_trimesh_geometry(objects, options)
            return {
                'assetUrl': output_path,
                'stateUpdate': {'generated': True, 'source': 'trimesh'}
            }
    
    async def _generate_blender_meshes(self, objects: list, options: dict) -> str:
        """Generate meshes using Blender operators"""
        import bpy
        import os
        
        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)
        
        for obj_data in objects:
            obj_id = obj_data.get('id')
            semantic_type = obj_data.get('tags', {}).get('semantics', 'unknown')
            
            # Create appropriate mesh based on semantic type
            if obj_id not in bpy.data.objects:
                # Create primitive based on type
                if semantic_type in ['chair', 'stool', 'table']:
                    bpy.ops.mesh.primitive_cube_add(size=1)
                    obj = bpy.context.active_object
                    obj.name = obj_id
                elif semantic_type in ['sphere', 'ball']:
                    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5)
                    obj = bpy.context.active_object
                    obj.name = obj_id
                else:
                    bpy.ops.mesh.primitive_cube_add(size=1)
                    obj = bpy.context.active_object
                    obj.name = obj_id
            
            # Apply modifiers for detail level
            if options.get('detail') == 'high':
                # Add subdivision surface modifier
                if 'Subdivision' not in bpy.data.objects[obj_id].modifiers:
                    mod = bpy.data.objects[obj_id].modifiers.new('Subdivision', 'SUBSURF')
                    mod.levels = 3
                    mod.render_levels = 4
        
        # Export to GLB
        output_path = os.path.join(output_dir, f'geometry_{objects[0].get("id", "scene")}.glb')
        bpy.ops.export_scene.gltf(filepath=output_path, export_selected=True)
        
        return output_path
    
    async def _generate_trimesh_geometry(self, objects: list, options: dict) -> str:
        """Generate meshes using trimesh (standalone mode)"""
        try:
            import trimesh
            import numpy as np
        except ImportError:
            # Fallback to mock result
            await asyncio.sleep(2)
            return '/assets/generated/fallback.glb'
        
        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)
        
        meshes = []
        for obj_data in objects:
            pose = obj_data.get('pose', {})
            position = pose.get('position', [0, 0, 0])
            scale = pose.get('scale', [1, 1, 1])
            
            # Create simple box mesh
            mesh = trimesh.creation.box(extents=np.array(scale) * 2)
            mesh.apply_translation(position)
            meshes.append(mesh)
        
        # Combine meshes
        scene = trimesh.Scene()
        for i, mesh in enumerate(meshes):
            scene.add_geometry(mesh)
        
        # Export
        output_path = os.path.join(output_dir, f'geometry_{objects[0].get("id", "scene")}.glb')
        scene.export(output_path)
        
        return output_path
        
    async def run_simulation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run physics simulation using Blender.
        """
        state = payload.get('state', {})
        duration = payload.get('duration', 1.0)
        fps = payload.get('fps', 30)
        
        print(f"[Bridge] Running simulation for {duration}s at {fps}fps...")
        
        # Check if running in Blender environment
        try:
            import bpy
            
            # Set up scene from state
            await self._update_blender_scene(state)
            
            # Configure physics settings
            bpy.context.scene.rigidbody_world.enabled = True
            bpy.context.scene.frame_end = int(duration * fps)
            
            # Bake physics simulation
            print("[Bridge] Baking physics simulation...")
            bpy.ops.ptcache.bake_all()
            
            # Export animated mesh
            output_dir = '/tmp/infinigen_exports'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'sim_{state.get("id", "scene")}.glb')
            
            bpy.ops.export_scene.gltf(
                filepath=output_path,
                export_animations=True,
                frame_range=(1, int(duration * fps))
            )
            
            return {
                'assetUrl': output_path,
                'stateUpdate': {'simulated': True, 'source': 'blender'}
            }
            
        except ImportError:
            # Standalone mode: use pybullet or mock
            print("[Bridge] Running in standalone mode - using mock simulation")
            await asyncio.sleep(duration * 2)  # Simulate processing
            
            return {
                'assetUrl': '/assets/simulated/cache_001.glb',
                'stateUpdate': {'simulated': True, 'source': 'mock'}
            }
        
    async def render_image(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Render high-quality image using Blender Cycles.
        """
        state = payload.get('state', {})
        settings = payload.get('settings', {'resolution': [1920, 1080], 'samples': 128})
        
        print(f"[Bridge] Rendering image at {settings['resolution']}...")
        
        # Check if running in Blender environment
        try:
            import bpy
            
            # Set up scene from state
            await self._update_blender_scene(state)
            
            # Configure render settings
            bpy.context.scene.render.engine = 'CYCLES'
            bpy.context.scene.cycles.samples = settings.get('samples', 128)
            bpy.context.scene.cycles.use_denoising = True
            bpy.context.scene.render.resolution_x = settings['resolution'][0]
            bpy.context.scene.render.resolution_y = settings['resolution'][1]
            
            # Set output format
            output_dir = '/tmp/infinigen_renders'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'render_{state.get("id", "scene")}.png')
            bpy.context.scene.render.filepath = output_path
            
            # Render image
            print("[Bridge] Rendering with Cycles...")
            bpy.ops.render.render(write_still=True)
            
            return {
                'imageUrl': output_path,
                'metadata': {
                    'resolution': settings['resolution'],
                    'samples': settings['samples'],
                    'engine': 'cycles'
                }
            }
            
        except ImportError:
            # Standalone mode: use mock or basic renderer
            print("[Bridge] Running in standalone mode - returning placeholder")
            await asyncio.sleep(2)
            
            return {
                'imageUrl': '/renders/placeholder.png',
                'metadata': {
                    'resolution': settings['resolution'],
                    'samples': settings['samples'],
                    'engine': 'placeholder'
                }
            }
        
    async def bake_physics(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Bake physics caches for real-time playback.
        """
        state = payload.get('state', {})
        duration = payload.get('duration', 1.0)
        fps = payload.get('fps', 30)
        
        print("[Bridge] Baking physics...")
        
        try:
            import bpy
            
            # Set up scene
            await self._update_blender_scene(state)
            
            # Enable rigid body world
            bpy.context.scene.rigidbody_world.enabled = True
            bpy.context.scene.frame_end = int(duration * fps)
            
            # Bake all physics caches
            print("[Bridge] Baking rigid body cache...")
            bpy.ops.ptcache.bake_all()
            
            # Export baked animation
            output_dir = '/tmp/infinigen_exports'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f'baked_{state.get("id", "scene")}.glb')
            
            bpy.ops.export_scene.gltf(
                filepath=output_path,
                export_animations=True,
                frame_range=(1, int(duration * fps))
            )
            
            return {
                'assetUrl': output_path,
                'baked': True,
                'source': 'blender'
            }
            
        except ImportError:
            # Standalone mode
            print("[Bridge] Running in standalone mode - mock bake")
            await asyncio.sleep(2)
            
            return {
                'assetUrl': '/assets/baked/mock.glb',
                'baked': True,
                'source': 'mock'
            }
    
    async def _save_mesh(self, mesh_data, format: str = 'glb') -> str:
        """Save mesh data to file"""
        import os
        
        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)
        
        if hasattr(mesh_data, 'export'):
            # trimesh object
            output_path = os.path.join(output_dir, f'export_{hash(str(mesh_data))}.{format}')
            mesh_data.export(output_path)
            return output_path
        else:
            # Assume it's already a path
            return str(mesh_data)
    
    async def mesh_boolean(self, operation: str, meshes: list) -> dict:
        """
        Perform boolean operations on meshes using trimesh or Blender
        
        Args:
            operation: 'union', 'difference', or 'intersection'
            meshes: List of mesh data (vertices, faces) or file paths
            
        Returns:
            Result mesh as {vertices: [...], faces: [...]}
        """
        print(f"[Bridge] Performing mesh {operation} on {len(meshes)} meshes")
        
        try:
            import trimesh
            import numpy as np
            
            # Load meshes from data or paths
            loaded_meshes = []
            for i, mesh_data in enumerate(meshes):
                if isinstance(mesh_data, str):
                    # It's a file path
                    mesh = trimesh.load(mesh_data, force='mesh')
                elif isinstance(mesh_data, dict) and 'vertices' in mesh_data:
                    # It's vertex/face data
                    vertices = np.array(mesh_data['vertices'])
                    faces = np.array(mesh_data['faces'])
                    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
                else:
                    raise ValueError(f"Invalid mesh data format at index {i}")
                loaded_meshes.append(mesh)
            
            if len(loaded_meshes) < 2:
                raise ValueError("Need at least 2 meshes for boolean operation")
            
            # Perform boolean operation
            result_mesh = None
            if operation == 'union':
                result_mesh = trimesh.boolean.union(loaded_meshes, engine='blender')
            elif operation == 'difference':
                result_mesh = trimesh.boolean.difference(loaded_meshes, engine='blender')
            elif operation == 'intersection':
                result_mesh = trimesh.boolean.intersection(loaded_meshes, engine='blender')
            else:
                raise ValueError(f"Unknown boolean operation: {operation}")
            
            # Return mesh data
            return {
                'vertices': result_mesh.vertices.tolist(),
                'faces': result_mesh.faces.tolist(),
                'vertex_normals': result_mesh.vertex_normals.tolist() if result_mesh.vertex_normals is not None else None
            }
            
        except ImportError:
            # Fallback: return first mesh
            print("[Bridge] trimesh not available, returning first mesh")
            if meshes and isinstance(meshes[0], dict):
                return meshes[0]
            return {'vertices': [], 'faces': []}
        except Exception as e:
            print(f"[Bridge] Boolean operation failed: {e}")
            raise
    
    async def mesh_subdivide(self, mesh_data: dict, levels: int = 2) -> dict:
        """
        Subdivide mesh for higher fidelity
        
        Args:
            mesh_data: Mesh with vertices and faces
            levels: Number of subdivision levels
            
        Returns:
            Subdivided mesh data
        """
        print(f"[Bridge] Subdividing mesh with {levels} levels")
        
        try:
            import trimesh
            import numpy as np
            
            # Create mesh from data
            vertices = np.array(mesh_data.get('vertices', []))
            faces = np.array(mesh_data.get('faces', []))
            mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
            
            # Subdivide using loop subdivision or simple midpoint
            for _ in range(levels):
                # Simple midpoint subdivision
                new_vertices = []
                new_faces = []
                
                # For each face, create 4 new faces
                vertex_count = len(mesh.vertices)
                edge_midpoints = {}
                
                for face in mesh.faces:
                    # Get edge midpoints
                    mid_indices = []
                    for i in range(3):
                        edge = tuple(sorted([face[i], face[(i+1)%3]]))
                        if edge not in edge_midpoints:
                            # Create new vertex at edge midpoint
                            v1 = mesh.vertices[face[i]]
                            v2 = mesh.vertices[face[(i+1)%3]]
                            midpoint = (v1 + v2) / 2
                            edge_midpoints[edge] = vertex_count + len(new_vertices)
                            new_vertices.append(midpoint)
                        mid_indices.append(edge_midpoints[edge])
                    
                    # Create 4 new triangles
                    f0, f1, f2 = face
                    m0, m1, m2 = mid_indices
                    
                    new_faces.extend([
                        [f0, m0, m2],
                        [f1, m1, m0],
                        [f2, m2, m1],
                        [m0, m1, m2]
                    ])
                
                # Update mesh
                all_vertices = np.vstack([mesh.vertices, np.array(new_vertices)])
                mesh = trimesh.Trimesh(vertices=all_vertices, faces=np.array(new_faces))
            
            return {
                'vertices': mesh.vertices.tolist(),
                'faces': mesh.faces.tolist(),
                'vertex_normals': mesh.vertex_normals.tolist() if mesh.vertex_normals is not None else None
            }
            
        except ImportError:
            print("[Bridge] trimesh not available, returning original mesh")
            return mesh_data
        except Exception as e:
            print(f"[Bridge] Subdivision failed: {e}")
            raise
    
    async def export_mjcf(self, config: dict) -> str:
        """
        Export scene to MJCF (MuJoCo XML) format
        
        Args:
            config: Physics configuration with objects, joints, etc.
            
        Returns:
            Path to exported MJCF file or XML string
        """
        print(f"[Bridge] Exporting MJCF with {len(config.get('objects', []))} objects")
        
        try:
            import xml.etree.ElementTree as ET
            import os
            
            # Create MJCF structure
            mjcf = ET.Element('mujoco', model=config.get('name', 'infinigen_scene'))
            ET.SubElement(mjcf, 'compiler', angle='radian', coordinate='local')
            
            # Add worldbody
            worldbody = ET.SubElement(mjcf, 'worldbody')
            
            # Add objects
            for obj in config.get('objects', []):
                body = ET.SubElement(worldbody, 'body', name=obj.get('id', 'obj'))
                
                # Position and rotation
                pos = obj.get('position', [0, 0, 0])
                quat = obj.get('quaternion', [1, 0, 0, 0])
                
                # Add geom based on type
                geom_type = obj.get('geometry', 'box')
                size = obj.get('size', [0.5, 0.5, 0.5])
                
                geom = ET.SubElement(body, 'geom', 
                                    type=geom_type,
                                    size=' '.join(map(str, size)),
                                    pos=' '.join(map(str, pos)),
                                    quat=' '.join(map(str, quat)))
                
                # Add joint if specified
                if obj.get('joint'):
                    joint = obj['joint']
                    ET.SubElement(body, 'joint', 
                                 type=joint.get('type', 'hinge'),
                                 axis=' '.join(map(str, joint.get('axis', [0, 0, 1]))))
            
            # Convert to string
            xml_str = ET.tostring(mjcf, encoding='unicode')
            
            # Optionally save to file
            if config.get('output_path'):
                output_path = config['output_path']
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                with open(output_path, 'w') as f:
                    f.write(xml_str)
                return output_path
            
            return xml_str
            
        except Exception as e:
            print(f"[Bridge] MJCF export failed: {e}")
            raise
    
    async def generate_procedural(self, gen_type: str, params: dict) -> dict:
        """
        Generate procedural geometry (terrain, vegetation, buildings)
        
        Args:
            gen_type: Type of generation ('terrain', 'vegetation', 'building')
            params: Generation parameters
            
        Returns:
            Generated mesh data
        """
        print(f"[Bridge] Generating procedural {gen_type}")
        
        try:
            import trimesh
            import numpy as np
            
            if gen_type == 'terrain':
                # Heightmap-based terrain
                width = params.get('width', 100)
                depth = params.get('depth', 100)
                resolution = params.get('resolution', 64)
                height_scale = params.get('height_scale', 10)
                
                # Create grid
                x = np.linspace(-width/2, width/2, resolution)
                z = np.linspace(-depth/2, depth/2, resolution)
                X, Z = np.meshgrid(x, z)
                
                # Generate heightmap using Perlin-like noise
                frequency = params.get('frequency', 0.1)
                Y = np.sin(X * frequency) * np.cos(Z * frequency) * height_scale
                
                # Create mesh from heightmap
                vertices = np.column_stack([X.flatten(), Y.flatten(), Z.flatten()])
                
                # Create faces
                faces = []
                for i in range(resolution - 1):
                    for j in range(resolution - 1):
                        idx = i * resolution + j
                        faces.append([idx, idx + 1, idx + resolution])
                        faces.append([idx + 1, idx + resolution + 1, idx + resolution])
                
                mesh = trimesh.Trimesh(vertices=vertices, faces=np.array(faces))
                
            elif gen_type == 'vegetation':
                # Simple tree generation
                trunk_height = params.get('trunk_height', 2)
                trunk_radius = params.get('trunk_radius', 0.2)
                crown_radius = params.get('crown_radius', 1.5)
                
                # Trunk (cylinder)
                trunk = trimesh.creation.cylinder(radius=trunk_radius, height=trunk_height)
                
                # Crown (sphere)
                crown = trimesh.creation.icosphere(radius=crown_radius)
                crown.apply_translation([0, trunk_height + crown_radius, 0])
                
                # Combine
                mesh = trimesh.util.concatenate([trunk, crown])
                
            elif gen_type == 'building':
                # Simple box building
                width = params.get('width', 10)
                height = params.get('height', 20)
                depth = params.get('depth', 10)
                
                mesh = trimesh.creation.box(extents=[width, height, depth])
                mesh.apply_translation([0, height/2, 0])
                
            else:
                raise ValueError(f"Unknown generation type: {gen_type}")
            
            return {
                'vertices': mesh.vertices.tolist(),
                'faces': mesh.faces.tolist(),
                'vertex_normals': mesh.vertex_normals.tolist() if mesh.vertex_normals is not None else None
            }
            
        except ImportError:
            print("[Bridge] trimesh not available, returning placeholder")
            return {'vertices': [[0, 0, 0]], 'faces': [[0, 0, 0]]}
        except Exception as e:
            print(f"[Bridge] Procedural generation failed: {e}")
            raise
    
    async def raycast_batch(self, rays: list) -> list:
        """
        Perform batch raycasting for visibility/collision checks
        
        Args:
            rays: List of {origin: [x,y,z], dir: [dx,dy,dz]} 
            
        Returns:
            List of distances (Infinity if no hit)
        """
        print(f"[Bridge] Batch raycasting {len(rays)} rays")
        
        try:
            import trimesh
            import numpy as np
            
            # Get current scene state
            if not hasattr(self, 'current_state') or not self.current_state:
                # No scene loaded, return all infinity
                return [float('inf')] * len(rays)
            
            # Build scene from state
            scene = trimesh.Scene()
            
            for obj in self.current_state.get('objects', []):
                pose = obj.get('pose', {})
                position = pose.get('position', [0, 0, 0])
                
                # Create simple collision mesh (box approximation)
                size = obj.get('size', [1, 1, 1])
                box = trimesh.creation.box(extents=size)
                box.apply_translation(position)
                scene.add_geometry(box)
            
            # Cast rays using trimesh.ray module
            results = []
            
            # Import ray casting utilities
            from trimesh.ray import ray_pyembree as ray_util
            
            for ray in rays:
                origin = np.array(ray.get('origin', [0, 0, 0]))
                direction = np.array(ray.get('dir', [0, 0, -1]))
                direction = direction / np.linalg.norm(direction)
                
                # Use scene's raycaster
                locations, index_ray, index_tri = scene.ray.intersects_location(
                    ray_origins=[origin],
                    ray_directions=[direction]
                )
                
                if len(locations) > 0:
                    # Calculate distance to first hit
                    dist = np.linalg.norm(locations[0] - origin)
                    results.append(dist)
                else:
                    results.append(float('inf'))
            
            return results
            
        except ImportError as e:
            print(f"[Bridge] trimesh/ray not available, returning infinity: {e}")
            return [float('inf')] * len(rays)
        except AttributeError as e:
            # Fallback: simple bounding box intersection test
            print(f"[Bridge] Using fallback raycast: {e}")
            return self._raycast_fallback(rays)
        except Exception as e:
            print(f"[Bridge] Raycast failed: {e}")
            return [float('inf')] * len(rays)
    
    def _raycast_fallback(self, rays: list) -> list:
        """Simple AABB raycast fallback"""
        import numpy as np
        
        results = []
        
        for ray in rays:
            origin = np.array(ray.get('origin', [0, 0, 0]))
            direction = np.array(ray.get('dir', [0, 0, -1]))
            direction = direction / np.linalg.norm(direction)
            
            min_dist = float('inf')
            
            # Check against each object's bounding box
            for obj in self.current_state.get('objects', []):
                pose = obj.get('pose', {})
                position = np.array(pose.get('position', [0, 0, 0]))
                size = np.array(obj.get('size', [1, 1, 1]))
                
                # AABB bounds
                bbox_min = position - size / 2
                bbox_max = position + size / 2
                
                # Slab method for ray-AABB intersection
                tmin = (bbox_min - origin) / (direction + 1e-10)
                tmax = (bbox_max - origin) / (direction + 1e-10)
                
                t1 = np.minimum(tmin, tmax)
                t2 = np.maximum(tmin, tmax)
                
                tnear = np.max(t1)
                tfar = np.min(t2)
                
                if tnear <= tfar and tfar > 0:
                    hit_dist = max(0, tnear)
                    min_dist = min(min_dist, hit_dist)
            
            results.append(min_dist)
        
        return results
        
    async def send_error(self, websocket: WebSocketServerProtocol, error_msg: str):
        """Send error response to client"""
        await websocket.send(json.dumps({
            'status': 'error',
            'error': error_msg
        }))
        
    async def run(self):
        """Start the WebSocket server"""
        handler = lambda ws, path: self.handler(ws)
        
        async with websockets.serve(self.handler, self.host, self.port):
            print(f"[Bridge] Server started on ws://{self.host}:{self.port}")
            await asyncio.Future()  # Run forever
            
    async def handler(self, websocket: WebSocketServerProtocol):
        """WebSocket connection handler"""
        await self.register(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        finally:
            await self.unregister(websocket)


def main():
    parser = argparse.ArgumentParser(description='Infinigen Bridge Server')
    parser.add_argument('--host', default='localhost', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to listen on')
    args = parser.parse_args()
    
    server = InfinigenBridgeServer(host=args.host, port=args.port)
    
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\n[Bridge] Server shutdown requested")
    except Exception as e:
        print(f"[Bridge] Fatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
