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

## The people

The trainee in the headset, the worker in the hard hat and the crew of four are built with
[MPFB](https://extensions.blender.org/add-ons/mpfb/) (MakeHuman for Blender, GPL) and the MakeHuman
system assets (CC0: skin, hair, the work suit, the boots). The hard hat, the hi-vis vest, the VR headset,
the controllers and the chair are modelled by `people/dress.py`. The headset and controllers are generic,
not a copy of a product.

Use a Blender profile of its own, so the add-on never touches the everyday one:

```
set BLENDER_USER_RESOURCES=C:\scratch\human\bl_user
blender --background --command extension install-file -r user_default -e mpfb.zip
:: unpack makehuman_system_assets_cc0.zip into %BLENDER_USER_RESOURCES%\extensions\.user\user_default\mpfb\data

python people\gen_jobs.py                                              :: writes kits.json and jobs_final.json
blender --background --python people\human_build.py -- out\worker_a.blend a     :: the body, dressed, rigged
blender --background --python people\human_build.py -- out\worker_b.blend b
blender --background --python people\dress.py -- kits.json                      :: colours, kit, pose, baked meshes
set EVR_OUT=C:\scratch\evr_out
blender --background --factory-startup --python people\studio_human.py -- jobs_final.json .
```

`gen_jobs.py` expects to sit in a `scripts` folder beside `out` and `renders`; change its first lines to
move things. The pictures then go through `npm run images` like the machines.
