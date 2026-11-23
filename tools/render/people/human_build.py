"""Builds the base worker with MPFB (MakeHuman for Blender): body, skin, eyes, hair, work suit, boots, rig.

    blender --background --python human_build.py -- <out.blend> [variant]

Run with BLENDER_USER_RESOURCES pointing at the scratch profile that has MPFB and the CC0 asset pack.
"""
import json
import math
import os
import sys

import bpy
import addon_utils

addon_utils.enable("bl_ext.user_default.mpfb", default_set=False)

from bl_ext.user_default.mpfb.services.humanservice import HumanService          # noqa: E402
from bl_ext.user_default.mpfb.services.locationservice import LocationService    # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService        # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
out = argv[0]
variant = argv[1] if len(argv) > 1 else "a"

VARIANTS = {
    # a: the main worker, a man of about thirty
    "a": dict(age=0.56, muscle=0.62, weight=0.56, height=0.52, asian=0.42, caucasian=0.58, skin="middleage_asian_male",
              hair="short02", brows="eyebrow006"),
    # b: a younger, slimmer trainee
    "b": dict(age=0.47, muscle=0.5, weight=0.44, height=0.6, asian=0.5, caucasian=0.5, skin="young_asian_male",
              hair="short04", brows="eyebrow001"),
}
V = VARIANTS[variant]

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("bl_ext.user_default.mpfb", default_set=False)

macro = TargetService.get_default_macro_info_dict()
print("MACRO DEFAULT", json.dumps(macro))
macro["gender"] = 1.0
macro["age"] = V["age"]
macro["muscle"] = V["muscle"]
macro["weight"] = V["weight"]
macro["height"] = V["height"]
macro["proportions"] = 0.6
macro["race"] = dict(asian=V["asian"], caucasian=V["caucasian"], african=0.0)

base = HumanService.create_human(macro_detail_dict=macro)
base.name = "Worker"
print("BASE", base.name, tuple(round(v, 3) for v in base.dimensions))

data = LocationService.get_user_data()


def asset(kind, name, fname=None):
    return os.path.join(data, kind, name, (fname or name) + ".mhclo")


rig = HumanService.add_builtin_rig(base, "default")
print("RIG", rig)

skin = os.path.join(data, "skins", V["skin"], V["skin"] + ".mhmat")
HumanService.set_character_skin(skin, base, skin_type="ENHANCED_SSS")

for kind, name, typ in (
    ("eyes", "high-poly", "Eyes"),
    ("eyebrows", V["brows"], "Eyebrows"),
    ("eyelashes", "eyelashes01", "Eyelashes"),
    ("teeth", "teeth_base", "Teeth"),
    ("hair", V["hair"], "Hair"),
    ("clothes", "male_worksuit01", "Clothes"),
    ("clothes", "shoes04", "Clothes"),
):
    f = asset(kind, name)
    if not os.path.exists(f):
        print("MISSING", f)
        continue
    try:
        HumanService.add_mhclo_asset(f, base, asset_type=typ, subdiv_levels=1, material_type="MAKESKIN")
        print("ADDED", kind, name)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("FAILED", kind, name, e)

for ob in bpy.data.objects:
    print("OB", ob.name, ob.type, tuple(round(v, 3) for v in ob.dimensions), [m.type for m in ob.modifiers],
          [s.material.name for s in ob.material_slots if s.material])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
print("BONES", " ".join(b.name for b in arm.data.bones))

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=out)
print("SAVED", out)
