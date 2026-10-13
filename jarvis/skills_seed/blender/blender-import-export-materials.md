---
title: Blender import/export operators and material gotchas
domain: blender
kind: knowledge
tags: blender export import obj fbx gltf stl principled bsdf material emission version 4
created: seed
---
- glTF: `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB')`. FBX: `bpy.ops.export_scene.fbx(filepath=...)`. Both export the whole scene unless `use_selection=True`.
- OBJ: the old `export_scene.obj` / `import_scene.obj` were replaced by `bpy.ops.wm.obj_export` / `wm.obj_import` (the old ones are gone in 4.x). STL: `wm.stl_export` / `wm.stl_import` in 4.x.
- Material nodes: `mat.use_nodes = True; bsdf = mat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Base Color'].default_value = (r,g,b,1)`. In Blender 4.x some input names changed (for example 'Emission' became 'Emission Color', 'Specular' became 'Specular IOR Level'); list inputs with `[i.name for i in bsdf.inputs]` when unsure.
- Units are metres by default; Roblox uses studs (about 0.28 m), so scale when exporting to Roblox.
- Apply transforms before export when the target expects clean geometry: `bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)`.
- Add-ons that ship with Blender (glTF, FBX, OBJ) are on by default; others need `bpy.ops.preferences.addon_enable(module=...)`.
