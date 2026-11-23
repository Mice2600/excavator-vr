"""People (and, if wanted, a machine beside them) in the same studio as the machine renders.

    EVR_OUT=<scratch> blender --background --factory-startup --python studio_human.py -- <jobs.json> <studio dir>

A job: {"people": [{"blend", "loc", "rot", "suit", "accent", "name"}], "machine": {"machine", "pose", "paint"} | null,
"shots": [...]}. Shots are studio.py shots; "fit" may name the people's roots.
"""
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
sys.path.insert(0, argv[1])
import studio  # noqa: E402

with open(argv[0], encoding="utf-8") as fh:
    jobs = json.load(fh)

for job in jobs:
    todo = [s for s in job["shots"]
            if os.environ.get("EVR_REDO") or not (os.path.exists(s["out"]) and os.path.exists(os.path.splitext(s["out"])[0] + ".json"))]
    if not todo:
        print("SKIP job", [s["out"] for s in job["shots"]], flush=True)
        continue
    mroot = None
    if job.get("machine"):
        m = job["machine"]
        mroot = studio.build(m["machine"], m.get("pose"), m.get("paint"))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    stage = bpy.data.objects.new("Stage", None)
    scene.collection.objects.link(stage)
    if mroot:
        mroot.parent = stage
    for person in job["people"]:
        before = set(bpy.data.objects)
        mats_before = set(bpy.data.materials)
        with bpy.data.libraries.load(person["blend"]) as (src, dst):
            dst.objects = list(src.objects)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            scene.collection.objects.link(o)
        root = next(o for o in new if o.parent is None)
        root.name = person.get("name", root.name)
        root.parent = stage
        root.location = person.get("loc", (0, 0, 0))
        root.rotation_euler[2] = math.radians(person.get("rot", 180))
        for mat in [m for m in bpy.data.materials if m not in mats_before]:
            if not mat.node_tree:
                continue
            dye = mat.node_tree.nodes.get("SuitDye")
            if dye and person.get("suit"):
                dye.inputs['Color2'].default_value = (*person["suit"], 1.0)
            if mat.name.startswith("HS_Accent") and person.get("accent"):
                b = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                b.inputs['Base Color'].default_value = (*person["accent"], 1.0)
                b.inputs['Emission Color'].default_value = (*person["accent"], 1.0)
        print("PERSON", root.name, len(new), "objects", flush=True)
    bpy.context.view_layer.update()
    for shot in todo:
        shot["samples"] = max(24, int(shot.get("samples", 200) * float(os.environ.get("EVR_SAMPLES", "1"))))
        if os.environ.get("EVR_SCALE"):
            k = float(os.environ["EVR_SCALE"])
            shot["w"], shot["h"] = int(shot.get("w", 1920) * k), int(shot.get("h", 1080) * k)
        gone = []
        for name in shot.get("hide_people", ()):
            for ob in [bpy.data.objects[name]] + studio.common().descendants(bpy.data.objects[name]):
                if not ob.hide_render:
                    ob.hide_render = True
                    gone.append(ob)
        try:
            studio.shoot(stage, shot)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print("SHOT FAILED", shot.get("out"), e, flush=True)
        for ob in gone:
            ob.hide_render = False
