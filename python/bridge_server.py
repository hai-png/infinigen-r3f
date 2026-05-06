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
import struct
import os
import sys
from typing import Dict, Any, Optional, Tuple
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

    VERSION = '1.0'

    def __init__(self, host: str = 'localhost', port: int = 8765):
        self.host = host
        self.port = port
        self.clients: set[WebSocketServerProtocol] = set()
        self.task_queue: asyncio.Queue = asyncio.Queue()
        self.start_time: float = 0  # set in run()

        # In-memory store for geometry payloads pending USD conversion.
        # Key: request id from the binary frame header; Value: bytes on disk.
        self._pending_geometry: Dict[str, str] = {}
        
    async def register(self, websocket: WebSocketServerProtocol):
        """Register a new client connection"""
        self.clients.add(websocket)
        print(f"[Bridge] Client connected. Total clients: {len(self.clients)}")
        
    async def unregister(self, websocket: WebSocketServerProtocol):
        """Unregister a client connection"""
        self.clients.discard(websocket)
        print(f"[Bridge] Client disconnected. Total clients: {len(self.clients)}")
        
    # ------------------------------------------------------------------
    # Binary frame protocol
    # ------------------------------------------------------------------

    @staticmethod
    def decode_binary_frame(data: bytes) -> Tuple[Dict[str, Any], bytes]:
        """
        Decode a binary WebSocket frame:
          [4 bytes LE: header length N][N bytes: JSON header][rest: binary payload]

        Returns:
            (header_dict, payload_bytes)
        """
        if len(data) < 4:
            raise ValueError("Binary frame too short to contain header length")

        header_length = struct.unpack('<I', data[:4])[0]

        if header_length > len(data) - 4:
            raise ValueError(
                f"Header length {header_length} exceeds remaining buffer "
                f"({len(data) - 4} bytes)"
            )

        header_json = data[4:4 + header_length].decode('utf-8')
        header = json.loads(header_json)

        payload = data[4 + header_length:]
        return header, payload

    @staticmethod
    def encode_binary_frame(header: Dict[str, Any], payload: bytes = b'') -> bytes:
        """
        Encode a binary WebSocket frame:
          [4 bytes LE: header length N][N bytes: JSON header][payload bytes]
        """
        header_json = json.dumps(header).encode('utf-8')
        header_length = len(header_json)
        return struct.pack('<I', header_length) + header_json + payload

    async def handle_message(self, websocket: WebSocketServerProtocol, message):
        """Handle incoming messages from clients (text or binary frames)"""

        # ---- Binary frame ------------------------------------------------
        if isinstance(message, bytes):
            await self.handle_binary_frame(websocket, message)
            return

        # ---- Text (JSON) frame -------------------------------------------
        try:
            data = json.loads(message)
            # Support both old 'type' and new 'method' formats
            msg_type = data.get('type', 'TASK')
            method = data.get('method', None)

            if msg_type == 'SYNC_STATE':
                await self.handle_sync_state(websocket, data.get('payload', {}))
            elif method in [
                'mesh_boolean', 'mesh_subdivide', 'export_mjcf',
                'generate_procedural', 'raycast_batch',
                'optimize_decoration', 'optimize_trajectories',
                'transfer_image', 'transfer_geometry', 'transfer_heightmap',
                'health_check', 'get_capabilities', 'export_usd',
            ]:
                await self.handle_rpc_method(websocket, data)
            elif msg_type in ['GENERATE_GEOMETRY', 'RUN_SIMULATION', 'RENDER_IMAGE', 'BAKE_PHYSICS']:
                await self.handle_task(websocket, data)
            else:
                await self.send_error(websocket, f"Unknown message type: {msg_type}")

        except json.JSONDecodeError as e:
            await self.send_error(websocket, f"Invalid JSON: {str(e)}")
        except Exception as e:
            await self.send_error(websocket, f"Internal error: {str(e)}")

    async def handle_binary_frame(self, websocket: WebSocketServerProtocol, data: bytes):
        """Handle a binary WebSocket frame from the R3F frontend."""
        try:
            header, payload = self.decode_binary_frame(data)
            method = header.get('method', '')
            request_id = header.get('id', 'unknown')
            content_type = header.get('contentType', 'application/octet-stream')

            print(f"[Bridge] Binary frame — method={method}, "
                  f"payload={len(payload)} bytes, contentType={content_type}")

            if method == 'transfer_image':
                result = await self.handle_transfer_image(payload, header)
            elif method == 'transfer_geometry':
                result = await self.handle_transfer_geometry(payload, header)
            elif method == 'transfer_heightmap':
                result = await self.handle_transfer_heightmap(payload, header)
            elif method == 'export_usd':
                # Binary-frame variant of USD export: payload is the GLB bytes,
                # header carries format/options. We convert and send back binary.
                usd_result = await self.handle_export_usd_binary(payload, header)
                if usd_result.get('success'):
                    usd_bytes = usd_result.pop('usd_bytes', b'')
                    resp_header = {
                        'id': request_id,
                        'success': True,
                        'result': usd_result,
                        'contentType': usd_result.get('contentType', 'model/usd'),
                    }
                    frame = self.encode_binary_frame(resp_header, usd_bytes)
                    await websocket.send(frame)
                    return
                else:
                    await websocket.send(json.dumps({
                        'id': request_id,
                        'success': False,
                        'error': usd_result.get('error', 'USD export failed'),
                    }))
                    return
            else:
                raise ValueError(f"Unknown binary method: {method}")

            # Send JSON success response (correlated by request id)
            await websocket.send(json.dumps({
                'id': request_id,
                'success': True,
                'result': result,
            }))

        except Exception as e:
            print(f"[Bridge] Binary frame handling failed: {e}")
            request_id = header.get('id', 'unknown') if 'header' in dir() else 'unknown'
            await websocket.send(json.dumps({
                'id': request_id,
                'success': False,
                'error': str(e),
            }))
            
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
            elif method == 'transfer_image':
                # Binary-only; text-frame dispatch returns a hint
                result = {'hint': 'transfer_image requires a binary frame'}
            elif method == 'transfer_geometry':
                result = {'hint': 'transfer_geometry requires a binary frame'}
            elif method == 'transfer_heightmap':
                result = {'hint': 'transfer_heightmap requires a binary frame'}
            elif method == 'health_check':
                result = self.handle_health_check()
            elif method == 'get_capabilities':
                result = self.handle_get_capabilities()
            elif method == 'export_usd':
                # Text-frame variant: expects geometry to have been previously
                # transferred via transfer_geometry; params carries the request id.
                result = await self.handle_export_usd_text(params)
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
    
    # ------------------------------------------------------------------
    # Health Check & Capability Discovery
    # ------------------------------------------------------------------

    def handle_health_check(self) -> Dict[str, Any]:
        """
        Return server health status.

        GET /health equivalent — returns { "status": "ok", "version": "1.0" }
        plus additional metadata used by HybridBridge.healthCheck().
        """
        import time
        uptime = time.time() - self.start_time if self.start_time else 0
        return {
            'status': 'ok',
            'version': self.VERSION,
            'capabilities': self._get_method_list(),
            'uptime': round(uptime, 1),
        }

    def handle_get_capabilities(self) -> Dict[str, Any]:
        """
        Return detailed capability information about the bridge server.

        Lists supported RPC methods and format-specific capabilities
        (e.g. whether USD export is available, which quality levels).
        """
        usd_supported = self._is_usd_available()
        return {
            'methods': self._get_method_list(),
            'formats': {
                'usd': {
                    'supported': usd_supported,
                    'quality': 'production' if usd_supported else None,
                },
                'usda': {
                    'supported': usd_supported,
                    'quality': 'production' if usd_supported else None,
                },
                'usdc': {
                    'supported': usd_supported,
                    'quality': 'production' if usd_supported else None,
                },
                'usdz': {
                    'supported': usd_supported,
                    'quality': 'preview' if usd_supported else None,
                },
                'glb': {'supported': True, 'quality': 'production'},
                'gltf': {'supported': True, 'quality': 'production'},
                'fbx': {'supported': False},
            },
        }

    def _get_method_list(self) -> list:
        """Return the list of RPC methods this server supports."""
        return [
            'mesh_boolean', 'mesh_subdivide', 'export_mjcf',
            'generate_procedural', 'raycast_batch',
            'optimize_decoration', 'optimize_trajectories',
            'transfer_image', 'transfer_geometry', 'transfer_heightmap',
            'health_check', 'get_capabilities', 'export_usd',
        ]

    def _is_usd_available(self) -> bool:
        """Check whether pxr (OpenUSD) or trimesh is available for USD conversion."""
        try:
            from pxr import Usd  # noqa: F401
            return True
        except ImportError:
            pass
        # trimesh can write USDA (text) as a fallback
        try:
            import trimesh  # noqa: F401
            return True
        except ImportError:
            return False

    # ------------------------------------------------------------------
    # USD Export
    # ------------------------------------------------------------------

    async def handle_export_usd_text(
        self, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Text-frame USD export.

        The caller must have previously transferred geometry via
        `transfer_geometry`, passing the same request `id` so the server
        can correlate the saved file.  Params:

            format:           'usda' | 'usdc' | 'usdz'  (default 'usda')
            geometryId:       the request-id used during transfer_geometry
            includePhysics:   bool (default False)
            quality:          'preview' | 'production'
            embedTextures:    bool (default True)

        Returns { usdData: <base64>, vertexCount, format } on success.
        """
        fmt = params.get('format', 'usda')
        geo_id = params.get('geometryId', '')
        geo_path = self._pending_geometry.pop(geo_id, None)

        if not geo_path or not os.path.isfile(geo_path):
            return {
                'error': (
                    f'No geometry found for id "{geo_id}". '
                    'Transfer geometry first via transfer_geometry.'
                ),
            }

        return await self._convert_to_usd(geo_path, fmt, params)

    async def handle_export_usd_binary(
        self, payload: bytes, header: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Binary-frame USD export.

        The payload is the raw GLB/OBJ bytes.  The header carries the
        same params as the text variant (format, includePhysics, etc.).

        Returns { success, usd_bytes, vertexCount, format, contentType }
        on success, or { success: False, error } on failure.
        """
        fmt = header.get('format', 'usda')
        params = {
            'includePhysics': header.get('includePhysics', False),
            'quality': header.get('quality', 'preview'),
            'embedTextures': header.get('embedTextures', True),
        }

        # Write payload to a temp file
        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)
        request_id = header.get('id', 'usd_export')
        ext = 'glb'
        content_type = header.get('contentType', '')
        if 'obj' in content_type:
            ext = 'obj'
        elif 'stl' in content_type:
            ext = 'stl'

        temp_path = os.path.join(output_dir, f'usd_input_{request_id}.{ext}')
        with open(temp_path, 'wb') as f:
            f.write(payload)

        result = await self._convert_to_usd(temp_path, fmt, params)

        # Clean up temp file
        try:
            os.remove(temp_path)
        except OSError:
            pass

        if 'error' in result:
            return {'success': False, 'error': result['error']}

        usd_bytes = result.pop('usd_bytes', b'')
        content_type_map = {
            'usda': 'model/usd',
            'usdc': 'model/usd',
            'usdz': 'model/vnd.usdz+zip',
        }
        return {
            'success': True,
            'usd_bytes': usd_bytes,
            'vertexCount': result.get('vertexCount', 0),
            'format': fmt,
            'contentType': content_type_map.get(fmt, 'model/usd'),
        }

    async def _convert_to_usd(
        self, input_path: str, fmt: str, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert a geometry file (GLB/OBJ/STL) on disk to the requested
        USD format.

        Tries OpenUSD (pxr) first, then falls back to trimesh, then
        to a minimal hand-written USDA.
        """
        vertex_count = 0
        try:
            import trimesh
            mesh = trimesh.load(input_path, force='mesh')
            vertex_count = len(mesh.vertices)
        except Exception:
            pass

        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f'export_{os.path.basename(input_path)}.{fmt}')

        # --- Try pxr (OpenUSD) -------------------------------------------
        try:
            from pxr import Usd, UsdGeom, Sdf, Vt
            import numpy as np

            stage = Usd.Stage.CreateNew(output_path)
            stage.SetStartTimeCode(0)
            stage.SetEndTimeCode(1)

            xform = UsdGeom.Xform.Define(stage, '/Root')
            mesh_prim = UsdGeom.Mesh.Define(stage, '/Root/Mesh')

            # Load source mesh via trimesh
            try:
                import trimesh
                tm = trimesh.load(input_path, force='mesh')
                verts = Vt.Vec3fArray([tuple(v) for v in tm.vertices])
                faces = Vt.IntArray([int(i) for f in tm.faces for i in f])
                face_counts = Vt.IntArray([3] * len(tm.faces))
                mesh_prim.GetPointsAttr().Set(verts)
                mesh_prim.GetFaceVertexIndicesAttr().Set(faces)
                mesh_prim.GetFaceVertexCountsAttr().Set(face_counts)
                vertex_count = len(tm.vertices)
            except Exception:
                # If trimesh fails, create a placeholder mesh
                placeholder = Vt.Vec3fArray([(0, 0, 0), (1, 0, 0), (0, 1, 0)])
                mesh_prim.GetPointsAttr().Set(placeholder)
                mesh_prim.GetFaceVertexIndicesAttr().Set(Vt.IntArray([0, 1, 2]))
                mesh_prim.GetFaceVertexCountsAttr().Set(Vt.IntArray([3]))

            stage.GetRootLayer().Save()

            with open(output_path, 'rb') as f:
                usd_bytes = f.read()

            try:
                os.remove(output_path)
            except OSError:
                pass

            return {
                'usd_bytes': usd_bytes,
                'vertexCount': vertex_count,
                'format': fmt,
            }

        except ImportError:
            pass
        except Exception as e:
            print(f"[Bridge] pxr USD export failed, falling back: {e}")

        # --- Try trimesh (writes USDA text) --------------------------------
        try:
            import trimesh

            tm = trimesh.load(input_path, force='mesh')
            vertex_count = len(tm.vertices)

            if fmt == 'usda':
                # trimesh can export USDA
                usda_path = output_path
                tm.export(usda_path, file_type='usda')
                with open(usda_path, 'rb') as f:
                    usd_bytes = f.read()
                try:
                    os.remove(usda_path)
                except OSError:
                    pass
                return {
                    'usd_bytes': usd_bytes,
                    'vertexCount': vertex_count,
                    'format': 'usda',
                }
            else:
                # For usdc/usdz trimesh cannot write, fall through
                pass
        except Exception as e:
            print(f"[Bridge] trimesh USD export failed, falling back: {e}")

        # --- Minimal hand-written USDA fallback ----------------------------
        try:
            import trimesh
            tm = trimesh.load(input_path, force='mesh')
            vertex_count = len(tm.vertices)
            verts_str = '\n'.join(
                f'            {v[0]:.6f}, {v[1]:.6f}, {v[2]:.6f}'
                for v in tm.vertices
            )
            faces_flat = [int(i) for f in tm.faces for i in f]
            counts_str = ', '.join('3' for _ in tm.faces)
            indices_str = ', '.join(str(i) for i in faces_flat)
        except Exception:
            verts_str = '            0.0, 0.0, 0.0\n            1.0, 0.0, 0.0\n            0.0, 1.0, 0.0'
            counts_str = '3'
            indices_str = '0, 1, 2'

        usda_content = f"""#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root"
{{
    def Mesh "Mesh"
    {{
        point3f[] points = [
{verts_str}
        ]
        int[] faceVertexCounts = [{counts_str}]
        int[] faceVertexIndices = [{indices_str}]
    }}
}}
"""
        return {
            'usd_bytes': usda_content.encode('utf-8'),
            'vertexCount': vertex_count,
            'format': 'usda',
        }

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
        
    # ------------------------------------------------------------------
    # Binary transfer handlers
    # ------------------------------------------------------------------

    async def handle_transfer_image(self, payload: bytes, header: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle a rendered image transferred from the R3F frontend.

        The payload contains raw pixel data. The header carries metadata:
          - width, height, format, contentType

        Saves the image to /tmp/infinigen_renders/ and returns the path.
        """
        import numpy as np

        width = header.get('width', 0)
        height = header.get('height', 0)
        fmt = header.get('format', 'rgba8')
        content_type = header.get('contentType', 'image/raw')

        print(f"[Bridge] transfer_image: {width}×{height} {fmt}, "
              f"{len(payload)} bytes, contentType={content_type}")

        output_dir = '/tmp/infinigen_renders'
        os.makedirs(output_dir, exist_ok=True)

        try:
            # Try to save as PNG via PIL/numpy
            try:
                from PIL import Image as PILImage

                if fmt == 'rgba8':
                    img = PILImage.frombytes('RGBA', (width, height), payload)
                elif fmt == 'rgb8':
                    img = PILImage.frombytes('RGB', (width, height), payload)
                elif fmt == 'float16':
                    arr = np.frombuffer(payload, dtype=np.float16)
                    arr = arr.reshape(height, width, -1)
                    arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
                    img = PILImage.fromarray(arr)
                else:
                    img = PILImage.frombytes('RGBA', (width, height), payload)

                output_path = os.path.join(
                    output_dir,
                    f'transfer_{header.get("id", "img")}.png'
                )
                img.save(output_path)
                return {'saved': True, 'path': output_path}

            except ImportError:
                # No PIL — save raw bytes
                output_path = os.path.join(
                    output_dir,
                    f'transfer_{header.get("id", "img")}.raw'
                )
                with open(output_path, 'wb') as f:
                    f.write(payload)
                return {'saved': True, 'path': output_path}

        except Exception as e:
            print(f"[Bridge] Image save failed: {e}")
            return {'saved': False, 'error': str(e)}

    async def handle_transfer_geometry(self, payload: bytes, header: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle serialised geometry (e.g. GLB / OBJ) transferred from R3F.

        Saves the payload to disk and, if trimesh is available, inspects it.
        """
        content_type = header.get('contentType', 'application/octet-stream')
        print(f"[Bridge] transfer_geometry: {len(payload)} bytes, "
              f"contentType={content_type}")

        output_dir = '/tmp/infinigen_exports'
        os.makedirs(output_dir, exist_ok=True)

        # Determine file extension
        ext = 'glb'
        if 'obj' in content_type:
            ext = 'obj'
        elif 'stl' in content_type:
            ext = 'stl'
        elif 'ply' in content_type:
            ext = 'ply'

        output_path = os.path.join(
            output_dir,
            f'geometry_{header.get("id", "mesh")}.{ext}'
        )

        with open(output_path, 'wb') as f:
            f.write(payload)

        vertex_count = 0
        try:
            import trimesh
            mesh = trimesh.load(output_path, force='mesh')
            vertex_count = len(mesh.vertices)
        except Exception:
            pass

        # Store path for later USD conversion keyed by request id
        request_id = header.get('id', '')
        if request_id:
            self._pending_geometry[request_id] = output_path

        return {'received': True, 'vertexCount': vertex_count, 'path': output_path}

    async def handle_transfer_heightmap(self, payload: bytes, header: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle terrain heightmap data transferred as Float32.

        The payload is a flat Float32 array of shape (height, width).
        """
        import numpy as np

        width = header.get('width', 0)
        height = header.get('height', 0)
        content_type = header.get('contentType', 'application/x-heightmap-float32')

        print(f"[Bridge] transfer_heightmap: {width}×{height}, "
              f"{len(payload)} bytes, contentType={content_type}")

        if width == 0 or height == 0:
            return {'received': False, 'error': 'Invalid dimensions'}

        try:
            data = np.frombuffer(payload, dtype=np.float32)
            data = data.reshape(height, width)

            h_min = float(np.min(data))
            h_max = float(np.max(data))

            # Save as .npy for later consumption
            output_dir = '/tmp/infinigen_terrain'
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(
                output_dir,
                f'heightmap_{header.get("id", "terrain")}.npy'
            )
            np.save(output_path, data)

            return {
                'received': True,
                'min': h_min,
                'max': h_max,
                'path': output_path,
            }
        except Exception as e:
            print(f"[Bridge] Heightmap processing failed: {e}")
            return {'received': False, 'error': str(e)}

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def send_error(self, websocket: WebSocketServerProtocol, error_msg: str):
        """Send error response to client"""
        await websocket.send(json.dumps({
            'status': 'error',
            'error': error_msg
        }))
        
    async def run(self):
        """Start the WebSocket server"""
        import time
        self.start_time = time.time()

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
