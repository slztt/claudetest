---
title: Running Blender scripts headless (bpy)
domain: blender
kind: knowledge
tags: blender bpy headless render background python command line save blend
created: seed
---
- run_script with language `blender` runs `blender -b --factory-startup --python script.py --python-exit-code 1`. A fresh start has the default Cube, Camera and Light; remove them first if the scene must be clean:
  `bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()`.
- Prefer the data API (`bpy.data.meshes.new`, `bpy.data.objects.new`, `collection.objects.link`) to `bpy.ops` where possible; operators depend on context and often fail headless.
- Save: `bpy.ops.wm.save_as_mainfile(filepath=r"C:\path\scene.blend")`. Render a still: set `scene.render.filepath`, `scene.render.image_settings.file_format = 'PNG'`, then `bpy.ops.render.render(write_still=True)`.
- Render engine names are version-sensitive. 'CYCLES' is stable. Eevee was 'BLENDER_EEVEE' up to 4.1, 'BLENDER_EEVEE_NEXT' in 4.2 to 4.5, and may differ again in 5.x: check `bpy.app.version_string` and research before setting it. Eevee needs a GPU; headless servers should use Cycles on CPU.
- Python errors make Blender exit 1 only because of `--python-exit-code 1`. Always print a final success line and use expect_files for the output.
- Script arguments come after `--`; read them with `sys.argv[sys.argv.index('--')+1:]`.
- Print `bpy.app.version_string` at the start of anything that depends on version.
