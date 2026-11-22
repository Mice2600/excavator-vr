"""Export the machines as .glb for the website's 3D viewer.

    blender --background --factory-startup --python export_glb.py -- <out folder> <scratch folder>

Opens each machine's .blend read-only (nothing is ever saved back), keeps the full-detail meshes, and swaps the
Unity-layout atlas material for one glTF understands (occlusion / roughness / metallic packed the glTF way).
"""

import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

BLENDS = r"D:\Project\Excavator VR\Art\Blender"
TEX = r"D:\Project\Excavator VR\Assets\_Project\Art\Textures"
OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

MACHINES = [
    ("Excavator", "Yellow", "excavator-20t"),
    ("ExcavatorLarge", "White", "excavator-50t"),
    ("ExcavatorXL", "Steel", "excavator-80t"),
    ("ExcavatorMining", "Jade", "excavator-150t"),
    ("DumpTruck", "Orange", "dump-truck"),
    ("RigidHauler", "Red", "rigid-hauler"),
    ("BucketWheelCompact", "Blue", "bucket-wheel"),
]
SIZE = 1024 if "--small" in sys.argv else 2048


def load(path, noncolor, size=None):
    img = bpy.data.images.load(path, check_existing=False)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    if size and img.size[0] > size:
        img.scale(size, size)
    return img


def orm_image(name, mask_path):
    """Unity mask (R metallic, G occlusion, A smoothness) -> glTF (R occlusion, G roughness, B metallic)."""
    src = bpy.data.images.load(mask_path, check_existing=False)
    src.colorspace_settings.name = 'Non-Color'
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    out = np.ones((h, w, 4), dtype=np.float32)
    out[..., 0] = px[..., 1]
    out[..., 1] = 1.0 - px[..., 3]
    out[..., 2] = px[..., 0]
    img = bpy.data.images.new(name + "_ORM", w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(out.ravel())
    path = os.path.join(TMP, name + "_ORM.png")
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(src)
    return load(path, True, SIZE)


def gltf_material(name, variant):
    mat = bpy.data.materials.new(name + "_Web")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    col = nt.nodes.new('ShaderNodeTexImage')
    col.image = load(os.path.join(TEX, f"{name}_BaseColor_{variant}.png"), False, SIZE)
    nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    orm = nt.nodes.new('ShaderNodeTexImage')
    orm.image = orm_image(name, os.path.join(TEX, f"{name}_Mask.png"))
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(orm.outputs['Color'], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs[2], bsdf.inputs['Metallic'])
    nrm = nt.nodes.new('ShaderNodeTexImage')
    nrm.image = load(os.path.join(TEX, f"{name}_Normal.png"), True, SIZE)
    nmap = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    glow = os.path.join(TEX, f"{name}_Emission.png")
    if os.path.exists(glow):
        em = nt.nodes.new('ShaderNodeTexImage')
        em.image = load(glow, False, SIZE)
        nt.links.new(em.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def glass_material(name):
    mat = bpy.data.materials.new(name + "_GlassWeb")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.05, 0.09, 0.11, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.05
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Alpha'].default_value = 0.42
    for attr, value in (("surface_render_method", 'BLENDED'), ("blend_method", 'BLEND')):
        try:
            setattr(mat, attr, value)
        except (AttributeError, TypeError):
            pass
    return mat


def aim_stays():
    top = bpy.data.objects.get("MastTop")
    for side in ("_L", "_R"):
        stay = bpy.data.objects.get("BoomStay" + side)
        end = bpy.data.objects.get("BoomStayEnd" + side)
        if not (top and stay and end):
            continue
        a = top.matrix_world.translation.copy()
        b = end.matrix_world.translation.copy()
        along = b - a
        rot = along.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        stay.matrix_world = Matrix.Translation((a + b) * 0.5) @ rot @ Matrix.Diagonal((1.0, 1.0, along.length * 0.5, 1.0))
    bpy.context.view_layer.update()


for name, variant, out_name in MACHINES:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(BLENDS, name + ".blend"))
    root = bpy.data.objects[name]
    keep = []
    for ob in list(bpy.data.objects):
        lod = ob.name.endswith("_Mid") or ob.name.endswith("_Far")
        if lod or ob.name.startswith("BAKE_") or ob.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(ob, do_unlink=True)
    web = gltf_material(name, variant)
    glass = glass_material(name)
    tris = 0
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        is_glass = ob.name.startswith("Glass")
        ob.data.materials.clear()
        ob.data.materials.append(glass if is_glass else web)
        tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
        ob.hide_set(False)
        ob.hide_viewport = False
        ob.hide_render = False
    if name == "BucketWheelCompact":
        aim_stays()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(True)
    path = os.path.join(OUT, out_name + ".glb")
    kwargs = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                  export_animations=False, export_extras=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(export_image_format='WEBP', export_image_quality=82, **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(export_image_format='JPEG', export_jpeg_quality=82, **kwargs)
    print(f"EXPORTED {out_name}.glb {os.path.getsize(path) / 1e6:.2f} MB {tris} triangles", flush=True)
