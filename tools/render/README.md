# Studio renders

The site's pictures are renders of the simulator's own machines, built by the generator scripts of the
Excavator VR project (`D:\Project\Excavator VR\Art\Blender\scripts`) with their full paint, wear and mud
shaders, then lit and framed here. Blender 5.2, Cycles, headless.

`EVR_OUT` must point at a scratch folder: the generators save their work there instead of into the Unity
project, which these scripts never write to.

```
set EVR_OUT=C:\scratch\evr_out
blender --background --factory-startup --python studio.py -- shots.json        # machines, cut-outs
blender --background --factory-startup --python studio.py -- shots_cab.json    # cab control panels
blender --background --factory-startup --python studio.py -- shots_view.json   # the view from the seat
blender --background --factory-startup --python export_glb.py -- ..\..\public\models C:\scratch\glb_tmp
```

A shot file is a list of machines, each with a pose and its shots: camera direction (`az`, `el`) or an
eye point, lens, size, light rig (`ember`, `noon`, `cab`), and optional `marks`: 3D points that are
projected into the picture and saved beside it, which is where the cab hotspots come from. Finished
shots are skipped on the next run; set `EVR_REDO=1` to render them again.

Then, from the project root: `npm run images -- <folder with the renders>`.
