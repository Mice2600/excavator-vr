"""Studio renders of the Excavator VR machines, built from the project's own generators.

Run headless, with EVR_OUT pointing at a scratch folder so the project's .blend / FBX / atlases are never touched:

    EVR_OUT=<scratch>/evr_out blender --background --factory-startup --python studio.py -- <job.json>

A job file is a list of {machine, pose, shots:[...]}.
"""

import importlib
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

SCRIPTS = r"D:\Project\Excavator VR\Art\Blender\scripts"
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

assert os.environ.get("EVR_OUT"), "EVR_OUT must be set: the generators would overwrite the project's files"

import evr_common  # noqa: E402,F401


def common():
    return sys.modules["evr_common"]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

EXCAVATORS = ("Excavator", "ExcavatorLarge", "ExcavatorXL", "ExcavatorMining")
MODULES = {"DumpTruck": "dump_truck", "RigidHauler": "hauler", "BucketWheelCompact": "bucketwheel"}


def build(machine, pose=None, paint=None):
    """Build one machine with its bake-source (procedural) materials. pose: dict(boom, stick, bucket, swing)."""
    pose = pose or {}
    if machine in EXCAVATORS:
        import excavator
        excavator.use(machine)
        P = excavator.P
        saved = {k: P[k] for k in ("boom_rest", "stick_rest", "bucket_rest")}
        try:
            for key, name in (("boom", "boom_rest"), ("stick", "stick_rest"), ("bucket", "bucket_rest")):
                if key in pose:
                    P[name] = float(pose[key])
            excavator.build()
            variants = excavator.VARIANTS
        finally:
            P.update(saved)
            excavator.use("Excavator")
    else:
        mod = importlib.import_module(MODULES[machine])
        mod.build()
        variants = getattr(mod, "VARIANTS", None)
    C = common()
    if paint:
        C.set_paint(C.hex_to_linear(paint))
    elif variants:
        C.set_paint(C.hex_to_linear(list(variants.values())[0]))
    for coll in bpy.data.collections:
        if coll.name == "BakeHelpers":
            for ob in coll.objects:
                ob.hide_render = True
                ob.hide_viewport = True
    C.set_bake_mode(0)
    if pose.get("swing"):
        up = bpy.data.objects.get("Upper")
        if up:
            up.rotation_euler[2] = math.radians(pose["swing"])
    for name, deg in (pose.get("rotate") or {}).items():      # {"Bed": [axis, degrees]}
        ob = bpy.data.objects.get(name)
        if ob:
            ob.rotation_euler["xyz".index(deg[0])] = math.radians(deg[1])
    polish()
    bpy.context.view_layer.update()
    if machine == "BucketWheelCompact":
        aim_stays()
    return bpy.data.objects[machine]


def aim_stays():
    """Lay each rope bundle (2 m along Z about its origin) from the mast top to its end on the boom."""
    top = bpy.data.objects.get("MastTop")
    for side in ("_L", "_R"):
        stay = bpy.data.objects.get("BoomStay" + side)
        end = bpy.data.objects.get("BoomStayEnd" + side)
        if not (top and stay and end):
            continue
        a = top.matrix_world.translation.copy()
        b = end.matrix_world.translation.copy()
        along = b - a
        world = stay.matrix_world.copy()
        rot = along.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        from mathutils import Matrix
        m = Matrix.Translation((a + b) * 0.5) @ rot @ Matrix.Diagonal((1.0, 1.0, along.length * 0.5, 1.0))
        stay.matrix_world = m
    bpy.context.view_layer.update()


def polish():
    """Advertising finish on the same materials: clearer glass, a little more gloss on paint, lamps lit."""
    glass = bpy.data.materials.get("S_Glass")
    if glass and glass.node_tree:
        bsdf = next((n for n in glass.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (0.03, 0.06, 0.08, 1.0)
            bsdf.inputs['Roughness'].default_value = 0.02
            bsdf.inputs['Alpha'].default_value = 0.38
    for name, factor in (("S_Paint", 0.62), ("S_RedPaint", 0.62)):
        mat = bpy.data.materials.get(name)
        if not mat or not mat.node_tree:
            continue
        nt = mat.node_tree
        out_group = next((n for n in nt.nodes if n.type == 'GROUP' and n.node_tree and n.node_tree.name == "EVR_Out"), None)
        if not out_group:
            continue
        sock = out_group.inputs['Roughness']
        if sock.links:
            src = sock.links[0].from_socket
            mul = nt.nodes.new('ShaderNodeMath')
            mul.operation = 'MULTIPLY'
            mul.inputs[1].default_value = factor
            nt.links.new(src, mul.inputs[0])
            nt.links.new(mul.outputs[0], sock)
    # The work lamps glow only where a part is marked interior; light them everywhere for the pictures.
    for name, strength in (("S_Lamp", 6.0), ("S_LampAmber", 2.5), ("S_LampRed", 2.0), ("S_Screen", 9.0)):
        mat = bpy.data.materials.get(name)
        if not mat or not mat.node_tree:
            continue
        nt = mat.node_tree
        out_group = next((n for n in nt.nodes if n.type == 'GROUP' and n.node_tree and n.node_tree.name == "EVR_Out"), None)
        if not out_group:
            continue
        d = common().SURFACE_DEF[name[2:]]
        sock = out_group.inputs['Emission']
        for link in list(sock.links):
            nt.links.remove(link)
        sock.default_value = (d["glow"][0] * strength, d["glow"][1] * strength, d["glow"][2] * strength, 1.0)


def bounds(root):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in common().descendants(root):
        if ob.type != 'MESH' or ob.hide_render:
            continue
        for corner in ob.bound_box:
            w = ob.matrix_world @ Vector(corner)
            for k in range(3):
                lo[k] = min(lo[k], w[k])
                hi[k] = max(hi[k], w[k])
    return lo, hi


# ---------------------------------------------------------------------------
# Scene: lights, floor, camera
# ---------------------------------------------------------------------------

def setup_render(scene, w, h, samples, transparent=True):
    try:
        scene.render.engine = 'CYCLES'
    except TypeError as e:
        raise RuntimeError(str(e))
    _, device = common()._cycles_gpu()
    scene.cycles.device = device
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.use_denoising = True
    for den in ('OPENIMAGEDENOISE', 'OPTIX'):          # a dynamic enum: try, don't list
        try:
            scene.cycles.denoiser = den
            break
        except TypeError:
            continue
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 6
    scene.cycles.transparent_max_bounces = 12
    scene.cycles.sample_clamp_indirect = 8.0
    scene.render.film_transparent = transparent
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 60
    vs = scene.view_settings
    for want in ('AgX', 'Filmic', 'Standard'):          # dynamic enums: try, don't list
        try:
            vs.view_transform = want
            break
        except TypeError:
            continue
    for want in ("AgX - Punchy", "Punchy", "AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            vs.look = want
            break
        except TypeError:
            continue
    vs.exposure = 0.0
    vs.gamma = 1.0


def world(scene, strength=0.05, top=(0.08, 0.12, 0.20), horizon=(0.32, 0.20, 0.10)):
    """A dim gradient: a faint warm horizon and a cool top, so metal and glass have something to reflect."""
    w = scene.world or bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    mp = nt.nodes.new('ShaderNodeMapRange')
    mp.inputs['From Min'].default_value = -0.15
    mp.inputs['From Max'].default_value = 0.6
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*horizon, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*top, 1.0)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mp.inputs['Value'])
    nt.links.new(mp.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs['Surface'])


def area(name, loc, target, size, power, color=(1, 1, 1), size_y=None, spread=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size_y or size
    data.energy = power
    data.color = color
    if spread is not None:
        data.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    return ob


def aim(ob, target):
    d = Vector(target) - Vector(ob.location)
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def floor(size=600.0, catcher=True, color=(0.012, 0.012, 0.014), rough=0.35):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = "StudioFloor"
    mat = bpy.data.materials.new("StudioFloor")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    ob.data.materials.append(mat)
    if catcher:
        ob.is_shadow_catcher = True
    return ob


def camera(loc, target, lens=35.0, sensor=36.0, shift=(0.0, 0.0)):
    data = bpy.data.cameras.new("Cam")
    data.lens = lens
    data.sensor_width = sensor
    data.clip_start = 0.03
    data.clip_end = 3000.0
    data.shift_x, data.shift_y = shift
    ob = bpy.data.objects.new("Cam", data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    bpy.context.scene.camera = ob
    return ob


RIGS = {}


def rig(name):
    def deco(fn):
        RIGS[name] = fn
        return fn
    return deco


def _axes(lo, hi, cam_loc):
    c = (lo + hi) / 2
    s = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    cam = Vector(cam_loc)
    to_cam = Vector((cam.x - c.x, cam.y - c.y, 0.0))
    to_cam = to_cam.normalized() if to_cam.length > 1e-6 else Vector((0, 1, 0))
    side = Vector((-to_cam.y, to_cam.x, 0.0))            # to the camera's left
    up = Vector((0, 0, 1))
    return c, s, to_cam, side, up


@rig("ember")
def rig_ember(lo, hi, cam_loc, k=1.0, key_side=1.0):
    """A machine coming out of the dark: a warm key raking across from one side, hard orange and steel-blue rims
    from behind, almost no fill."""
    c, s, f, r, u = _axes(lo, hi, cam_loc)
    q = 0.11 * k * s * s
    r = r * key_side
    area("Key", c + f * s * 0.75 + r * s * 1.15 + u * s * 0.85, c, s * 0.42, 560 * q, (1.0, 0.84, 0.64))
    area("Fill", c + f * s * 1.2 - r * s * 0.9 + u * s * 0.15, c, s * 1.1, 26 * q, (0.45, 0.62, 1.0))
    area("RimWarm", c - f * s * 1.05 + r * s * 0.95 + u * s * 0.55, c, s * 0.22, 2600 * q, (1.0, 0.50, 0.14))
    area("RimCool", c - f * s * 1.10 - r * s * 0.90 + u * s * 0.80, c, s * 0.22, 2300 * q, (0.38, 0.66, 1.0))
    area("Kick", c + f * s * 0.55 - r * s * 1.25 + u * s * 0.05, c + u * (lo.z - c.z + s * 0.08), s * 0.5, 70 * q, (1.0, 0.7, 0.45))
    area("Top", c + u * s * 1.5 - f * s * 0.2, c, s * 0.9, 70 * q, (0.9, 0.95, 1.0))


@rig("noon")
def rig_noon(lo, hi, cam_loc, k=1.0, key_side=1.0):
    """Clean product light: a big soft key, true paint colour, gentle rims."""
    c, s, f, r, u = _axes(lo, hi, cam_loc)
    q = 0.11 * k * s * s
    r = r * key_side
    area("Key", c + f * s * 0.8 + r * s * 1.0 + u * s * 1.1, c, s * 1.0, 900 * q, (1.0, 0.95, 0.88))
    area("Fill", c + f * s * 1.2 - r * s * 0.9 + u * s * 0.35, c, s * 1.2, 200 * q, (0.8, 0.88, 1.0))
    area("Rim", c - f * s * 1.2 - r * s * 0.6 + u * s * 0.9, c, s * 0.4, 1500 * q, (1.0, 0.86, 0.7))
    area("RimB", c - f * s * 1.1 + r * s * 0.9 + u * s * 0.6, c, s * 0.3, 900 * q, (0.6, 0.78, 1.0))
    area("Top", c + u * s * 1.7, c, s * 1.4, 240 * q, (1.0, 1.0, 1.0))


@rig("cab")
def rig_cab(lo, hi, cam_loc, k=1.0, key_side=1.0):
    """Inside the cab at dusk: the site outside is dark, a low warm light comes through the door glass, a cool one
    through the windscreen, and the cab's own lamp over the operator's shoulder makes the controls read."""
    c = (lo + hi) / 2
    s = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    q = k * s * s
    area("Sky", c + Vector((0.0, s * 1.6, s * 1.0)), c, s * 2.2, 170 * q, (0.55, 0.72, 1.0))
    area("Sun", c + Vector((-s * 1.9 * key_side, s * 1.1, s * 0.75)), c + Vector((0, 0, -s * 0.1)), s * 0.5, 620 * q, (1.0, 0.66, 0.36))
    area("Side", c + Vector((s * 1.8 * key_side, s * 0.4, s * 0.5)), c, s * 1.6, 60 * q, (0.5, 0.7, 1.0))
    lamp = bpy.data.lights.new("Dome", 'POINT')
    lamp.energy = 15 * q
    lamp.color = (1.0, 0.88, 0.74)
    lamp.shadow_soft_size = 0.3
    ob = bpy.data.objects.new("Dome", lamp)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(cam_loc) + Vector((0.0, -0.05, 0.22))
    ob.location.z = min(ob.location.z, hi.z - 0.12)


# ---------------------------------------------------------------------------
# Shots
# ---------------------------------------------------------------------------

def clear_studio():
    for ob in list(bpy.data.objects):
        if ob.type in ('LIGHT', 'CAMERA') or ob.name.startswith("StudioFloor"):
            bpy.data.objects.remove(ob, do_unlink=True)


def fit_points(root, names=None):
    """World-space corners of the parts to frame (every bounding box corner, tighter than one big box)."""
    C = common()
    if names:
        obs = []
        for n in names:
            ob = bpy.data.objects[n]
            obs += [ob] + C.descendants(ob)
    else:
        obs = C.descendants(root)
    pts = []
    for ob in obs:
        if ob.type != 'MESH' or ob.hide_render or ob.name.startswith("BAKE_"):
            continue
        pts += [ob.matrix_world @ Vector(corner) for corner in ob.bound_box]
    return pts


def frame(pts, az, el, lens, w, h, margin=0.07, sensor=36.0, zoom=1.0):
    """Camera position, aim and lens shift that frame pts from a direction.
    az: 0 = from the front (+Y), 90 = from the machine's left (-X, the cab side); el: degrees above the horizon."""
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    a, e = math.radians(az), math.radians(el)
    out = Vector((-math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    fwd = -out
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(fwd).normalized()
    big = max(w, h)
    tan_h = (sensor / 2) / lens * (w / big)
    tan_v = (sensor / 2) / lens * (h / big)

    def spans(d):
        cam = c + out * d
        tx, ty = [], []
        for p in pts:
            v = p - cam
            z = v.dot(fwd)
            if z <= 0.05:
                return None
            tx.append(v.dot(right) / z)
            ty.append(v.dot(up) / z)
        return cam, min(tx), max(tx), min(ty), max(ty)

    lo_d, hi_d = 0.2, 4000.0
    for _ in range(60):
        mid = (lo_d + hi_d) / 2
        r = spans(mid)
        ok = r is not None and (r[2] - r[1]) / 2 <= tan_h * (1 - margin) and (r[4] - r[3]) / 2 <= tan_v * (1 - margin)
        if ok:
            hi_d = mid
        else:
            lo_d = mid
    r = spans(hi_d / zoom) or spans(hi_d)
    cam, x0, x1, y0, y1 = r
    half = (sensor / 2) / lens
    shift = ((x0 + x1) / 2 / half / 2, (y0 + y1) / 2 / half / 2)
    return cam, c, shift, (lo, hi)


def shoot(root, shot):
    """shot: dict(out, az, el, lens, w, h, samples, rig, fit=[part names], margin, zoom, offset, fstop, focus, ...)"""
    scene = bpy.context.scene
    clear_studio()
    w, h = shot.get("w", 1920), shot.get("h", 1080)
    lens = shot.get("lens", 35.0)
    hidden = []
    for name in shot.get("hide", ()):
        ob = bpy.data.objects.get(name)
        if ob and not ob.hide_render:
            ob.hide_render = True
            hidden.append(ob)
    wlo, whi = bounds(root)
    if shot.get("eye"):                                     # a view from a point: {"eye": [x,y,z] or node, "look": [x,y,z]}
        eye = shot["eye"]
        cam_loc = bpy.data.objects[eye].matrix_world.translation.copy() if isinstance(eye, str) else Vector(eye)
        cam_loc = cam_loc + Vector(shot.get("eye_offset", (0, 0, 0)))
        look = Vector(shot["look"])
        shift = (0.0, 0.0)
        lo, hi = wlo, whi
    else:
        pts = fit_points(root, shot.get("fit"))
        cam_loc, look, shift, (lo, hi) = frame(pts, shot.get("az", 35.0), shot.get("el", 6.0), lens, w, h,
                                               shot.get("margin", 0.07), zoom=shot.get("zoom", 1.0))
        if cam_loc.z < 0.12:                                # never under the floor
            cam_loc.z = 0.12
    off = shot.get("offset", (0.0, 0.0))                     # move the subject in the frame, in frame widths
    shift = (shift[0] - off[0], shift[1] - off[1])
    transparent = shot.get("transparent", True)
    setup_render(scene, w, h, shot.get("samples", 160), transparent)
    world(scene, shot.get("world", 0.05))
    if shot.get("floor", True):
        floor(catcher=transparent)
    llo, lhi = (lo, hi) if shot.get("light_fit") else (wlo, whi)
    if shot.get("light_box"):
        bp = fit_points(root, shot["light_box"])
        llo = Vector((min(q.x for q in bp), min(q.y for q in bp), min(q.z for q in bp)))
        lhi = Vector((max(q.x for q in bp), max(q.y for q in bp), max(q.z for q in bp)))
    RIGS[shot.get("rig", "ember")](llo, lhi, cam_loc, shot.get("light", 1.0), shot.get("key_side", 1.0))
    cam = camera(cam_loc, look, lens, shift=shift)
    if shot.get("fstop"):
        fp = shot.get("focus")
        if isinstance(fp, str):
            target = bpy.data.objects[fp].matrix_world.translation
        elif fp:
            target = Vector(fp)
        else:
            target = look
        cam.data.dof.use_dof = True
        cam.data.dof.aperture_fstop = shot["fstop"]
        cam.data.dof.focus_distance = (Vector(target) - cam_loc).length
    scene.view_settings.exposure = shot.get("exposure", 0.0)
    scene.render.filepath = shot["out"]
    started = time.time()
    bpy.ops.render.render(write_still=True)
    for ob in hidden:
        ob.hide_render = False
    marks = {}
    if shot.get("marks"):
        from bpy_extras.object_utils import world_to_camera_view
        bpy.context.view_layer.update()
        for name, pnt in shot["marks"].items():
            v = world_to_camera_view(scene, cam, Vector(pnt))
            marks[name] = [round(v.x, 4), round(1.0 - v.y, 4)]
    with open(os.path.splitext(shot["out"])[0] + ".json", "w", encoding="utf-8") as fh:
        json.dump(dict(marks=marks, lo=[round(v, 4) for v in wlo], hi=[round(v, 4) for v in whi], az=shot.get("az"), el=shot.get("el"),
                       lens=lens, w=w, h=h), fh)
    print(f"RENDERED {shot['out']} in {time.time() - started:.1f} s cam {tuple(round(v, 2) for v in cam_loc)}", flush=True)


def main():
    job_path = sys.argv[sys.argv.index("--") + 1]
    with open(job_path, encoding="utf-8") as fh:
        jobs = json.load(fh)
    for job in jobs:
        started = time.time()
        root = build(job["machine"], job.get("pose"), job.get("paint"))
        lo, hi = bounds(root)
        print(f"BUILT {job['machine']} in {time.time() - started:.1f} s bounds {tuple(round(v, 2) for v in lo)} {tuple(round(v, 2) for v in hi)}", flush=True)
        if job.get("list"):
            for ob in common().descendants(root):
                print("  NODE", ob.name, ob.type, tuple(round(v, 2) for v in ob.matrix_world.translation), flush=True)
        for shot in job["shots"]:
            if os.path.exists(shot["out"]) and os.path.exists(os.path.splitext(shot["out"])[0] + ".json") and not os.environ.get("EVR_REDO"):
                print("SKIP", shot["out"], flush=True)
                continue
            shot["samples"] = max(32, int(shot.get("samples", 160) * float(os.environ.get("EVR_SAMPLES", "1"))))
            try:
                shoot(root, shot)
            except Exception as e:                           # one bad shot must not lose the batch
                import traceback
                traceback.print_exc()
                print("SHOT FAILED", shot.get("out"), e, flush=True)


if __name__ == "__main__":
    main()
