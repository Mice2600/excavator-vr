"""Dresses and poses the base worker, then bakes the result to plain meshes under one root.

    blender --background --python dress.py -- <kits.json> [name ...]

A kit: name, src (.blend from human_build.py), out (.blend), pose ("seated" | "stand"), suit [r,g,b], and the
switches helmet, vest, headset ("on" | "hand" | null), controllers, chair.
"""
import json
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
with open(argv[0], encoding="utf-8") as fh:
    KITS = json.load(fh)
ONLY = set(argv[1:])


# ---------------------------------------------------------------------------------------------- materials

def principled(name, color, rough=0.5, metal=0.0, coat=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.08
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1.0)
        b.inputs['Emission Strength'].default_value = strength
    return m


def base_link(mat):
    """The link that feeds the Principled base colour of an MPFB cloth material."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    return nt, bsdf, next(l for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Base Color')


def multiply(mat, color, fac=1.0):
    nt, bsdf, link = base_link(mat)
    src = link.from_socket
    mix = nt.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Fac'].default_value = fac
    mix.inputs['Color2'].default_value = (*color, 1.0)
    nt.links.new(src, mix.inputs['Color1'])
    nt.links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    return bsdf


def recolor_suit(mat, suit, shirt):
    """The dungarees are the saturated part of the texture, the T-shirt the white part: dye them separately."""
    nt, bsdf, link = base_link(mat)
    src = link.from_socket
    tex = next(n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.name == 'diffuseTexture')
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    sep.mode = 'HSV'
    nt.links.new(src, sep.inputs[0])
    mask = nt.nodes.new('ShaderNodeMapRange')
    mask.inputs['From Min'].default_value = 0.10
    mask.inputs['From Max'].default_value = 0.22
    nt.links.new(sep.outputs[1], mask.inputs['Value'])
    grey = nt.nodes.new('ShaderNodeMixRGB')              # the cloth's own light and shade, as a grey
    grey.blend_type = 'MULTIPLY'
    grey.inputs['Fac'].default_value = 1.0
    nt.links.new(sep.outputs[2], grey.inputs['Color1'])
    grey.inputs['Color2'].default_value = (1.25, 1.25, 1.25, 1.0)
    dyed = nt.nodes.new('ShaderNodeMixRGB')
    dyed.name = "SuitDye"
    dyed.blend_type = 'MULTIPLY'
    dyed.inputs['Fac'].default_value = 1.0
    nt.links.new(grey.outputs['Color'], dyed.inputs['Color1'])
    dyed.inputs['Color2'].default_value = (*suit, 1.0)
    white = nt.nodes.new('ShaderNodeMixRGB')
    white.blend_type = 'MULTIPLY'
    white.inputs['Fac'].default_value = 1.0
    nt.links.new(src, white.inputs['Color1'])
    white.inputs['Color2'].default_value = (*shirt, 1.0)
    pick = nt.nodes.new('ShaderNodeMixRGB')
    nt.links.new(mask.outputs['Result'], pick.inputs['Fac'])
    nt.links.new(white.outputs['Color'], pick.inputs['Color1'])
    nt.links.new(dyed.outputs['Color'], pick.inputs['Color2'])
    nt.links.new(pick.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.82


# ---------------------------------------------------------------------------------------------- geometry

def new_object(name, bm, material, smooth=True, parent=None, matrix=None):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if material:
        me.materials.append(material)
    if parent:
        ob.parent = parent
    if matrix is not None:
        ob.matrix_local = matrix
    return ob


def box(name, size, material, bevel=0.0, segments=6, parent=None, matrix=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    ob = new_object(name, bm, material, parent=parent, matrix=matrix)
    if bevel:
        mod = ob.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'NONE'
        ob.modifiers.new("Normals", 'WEIGHTED_NORMAL')
    return ob


def cylinder(name, r1, r2, depth, material, segments=32, bevel=0.0, parent=None, matrix=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r1, radius2=r2, depth=depth)
    ob = new_object(name, bm, material, parent=parent, matrix=matrix)
    if bevel:
        mod = ob.modifiers.new("Bevel", 'BEVEL')
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(40)
        ob.modifiers.new("Normals", 'WEIGHTED_NORMAL')
    return ob


def catmull(pts, steps=10):
    pts = [Vector(p) for p in pts]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(steps):
            t = s / steps
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(pts[-1])
    return out


def ribbon(name, pts, wdir, width, thick, material, parent=None, steps=10):
    """A flat band swept along a smooth path; wdir is the direction its width runs in."""
    path = catmull(pts, steps)
    wdir = Vector(wdir)
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        w = (wdir - t * wdir.dot(t)).normalized()
        n = t.cross(w).normalized()
        rings.append([bm.verts.new(p + w * sw * width / 2 + n * sn * thick / 2)
                      for sw, sn in ((1, 1), (1, -1), (-1, -1), (-1, 1))])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    ob = new_object(name, bm, material, smooth=False, parent=parent)
    mod = ob.modifiers.new("Bevel", 'BEVEL')
    mod.width = thick * 0.35
    mod.segments = 2
    return ob


def tube(name, pts, radius, material, parent=None, smooth_path=True):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 5
    path = catmull(pts, 8) if smooth_path else [Vector(p) for p in pts]
    sp = cu.splines.new('POLY')
    sp.points.add(len(path) - 1)
    for q, p in zip(sp.points, path):
        q.co = (*p, 1.0)
    cu.use_fill_caps = True
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    cu.materials.append(material)
    if parent:
        ob.parent = parent
    return ob


def empty(name, parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


# ---------------------------------------------------------------------------------------------- one kit

def run(kit):
    bpy.ops.wm.open_mainfile(filepath=kit["src"])
    scene = bpy.context.scene
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    body = bpy.data.objects["Worker"]
    suit = bpy.data.objects["Worker.male_worksuit01"]
    shoes = bpy.data.objects["Worker.shoes04"]
    hair = next(o for o in bpy.data.objects if o.name.startswith("Worker.short"))
    PB = arm.pose.bones
    RB = arm.data.bones

    def upd():
        bpy.context.view_layer.update()

    # ---- colours
    tan = kit.get("skin", (0.80, 0.60, 0.47))
    for g in bpy.data.node_groups:
        for n in g.nodes:
            if n.type == 'MIX_RGB' and n.name == 'Mix':
                n.blend_type = 'MULTIPLY'
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'GROUP' and 'colorMixIn' in n.inputs and 'teeth' not in m.name:
                n.inputs['colorMixIn'].default_value = (*tan, 1.0)
                n.inputs['colorMixInStrength'].default_value = kit.get("skin_mix", 1.0)
                n.inputs['Roughness'].default_value = 0.5
                n.inputs['Clearcoat'].default_value = 0.04
    multiply(hair.material_slots[0].material, (0.035, 0.03, 0.028)).inputs['Roughness'].default_value = 0.42
    brow = next(o for o in bpy.data.objects if o.name.startswith("Worker.eyebrow"))
    multiply(brow.material_slots[0].material, (0.12, 0.10, 0.09))
    recolor_suit(suit.material_slots[0].material, kit.get("suit", (0.05, 0.16, 0.42)), kit.get("shirt", (0.80, 0.80, 0.78)))
    multiply(shoes.material_slots[0].material, (0.55, 0.50, 0.46))

    white = principled("HS_White", (0.80, 0.81, 0.83), 0.42)
    black = principled("HS_Glass", (0.004, 0.004, 0.005), 0.24, coat=0.25)
    foam = principled("HS_Foam", (0.03, 0.03, 0.035), 0.92)
    strap = principled("HS_Strap", (0.16, 0.165, 0.18), 0.78)
    accent = kit.get("accent")
    glow = principled("HS_Accent", accent or (0.95, 0.72, 0.02), 0.4, emission=accent or (0.95, 0.72, 0.02), strength=2.2)

    # ---- the head, measured (rest pose; the figure faces -Y, its left is +X)
    eye = (RB["eye.L"].head_local + RB["eye.R"].head_local) / 2
    gi = body.vertex_groups["body"].index
    hz = RB["head"].head_local.z
    if body.data.shape_keys:
        mixed = body.shape_key_add(name="_mix", from_mix=True)
        shape = [d.co.copy() for d in mixed.data]
        body.shape_key_remove(mixed)
    else:
        shape = [v.co.copy() for v in body.data.vertices]
    hp = [shape[v.index] for v in body.data.vertices if shape[v.index].z > hz + 0.02 and any(g.group == gi for g in v.groups)]
    top = max(p.z for p in hp)
    back = max(p.y for p in hp)
    halfw = max(abs(p.x) for p in hp if abs(p.z - (eye.z + 0.03)) < 0.03)
    hairtop = max((hair.matrix_world @ v.co).z for v in hair.data.vertices)
    print("HEADM eye", tuple(round(v, 3) for v in eye), "top", round(top, 3), "back", round(back, 3), "halfw", round(halfw, 3),
          "hairtop", round(hairtop, 3))

    def bone_parent(ob, bone):
        mw = ob.matrix_world.copy()
        ob.parent = arm
        ob.parent_type = 'BONE'
        ob.parent_bone = bone
        upd()
        ob.matrix_world = mw
        upd()

    # ---- hard hat
    if kit.get("helmet"):
        shell = principled("Helmet", tuple(kit.get("helmet_color", (0.93, 0.60, 0.02))), 0.28, coat=0.6)
        c = Vector((0.0, (back + eye.y - 0.018) / 2, top - 0.056))
        ax = Vector((halfw + 0.030, (back - eye.y + 0.018) / 2 + 0.026, 0.124))
        zb = eye.z + 0.040                                   # the brim line, above the eyebrows
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
        bmesh.ops.scale(bm, vec=ax, verts=bm.verts)
        bmesh.ops.translate(bm, vec=c, verts=bm.verts)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zb), plane_no=(0, 0, -1),
                               clear_outer=True)
        rim = [e for e in bm.edges if e.is_boundary]
        ext = bmesh.ops.extrude_edge_only(bm, edges=rim)
        for v in [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]:
            d = Vector((v.co.x - c.x, v.co.y - c.y, 0.0))
            ang = math.atan2(d.x, -d.y)                      # 0 at the front
            peak = max(0.0, math.cos(ang)) ** 3
            reach = 0.011 + 0.042 * peak
            v.co += d.normalized() * reach
            v.co.z -= 0.004 + 0.006 * peak
        ob = new_object("Helmet", bm, shell)
        mod = ob.modifiers.new("Solid", 'SOLIDIFY')
        mod.thickness = 0.0035
        mod.offset = 1.0
        sub = ob.modifiers.new("Sub", 'SUBSURF')
        sub.levels = sub.render_levels = 2
        bone_parent(ob, "head")
        # the rib over the crown
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
        bmesh.ops.scale(bm, vec=Vector((0.024, ax.y * 0.94, ax.z + 0.0045)), verts=bm.verts)
        bmesh.ops.translate(bm, vec=c, verts=bm.verts)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zb + 0.02), plane_no=(0, 0, -1),
                               clear_outer=True)
        rib = new_object("HelmetRib", bm, shell)
        sub = rib.modifiers.new("Sub", 'SUBSURF')
        sub.levels = sub.render_levels = 2
        bone_parent(rib, "head")
        # hair that would poke through the shell
        hm = hair.data
        bmh = bmesh.new()
        bmh.from_mesh(hm)
        kill = [v for v in bmh.verts if v.co.z > zb - 0.004]
        bmesh.ops.delete(bmh, geom=kill, context='VERTS')
        bmh.to_mesh(hm)
        bmh.free()

    # ---- VR headset (built on the face; moved to the hand later if the kit says so)
    hs = None
    if kit.get("headset"):
        hs = empty("Headset")
        e = eye
        box("HS_Visor", (0.178, 0.078, 0.096), white, bevel=0.027, parent=hs, matrix=Matrix.Translation((0, e.y - 0.066, e.z + 0.004)))
        box("HS_Front", (0.150, 0.078, 0.070), black, bevel=0.022, parent=hs, matrix=Matrix.Translation((0, e.y - 0.0705, e.z + 0.004)))
        box("HS_Gasket", (0.150, 0.060, 0.086), foam, bevel=0.022, parent=hs, matrix=Matrix.Translation((0, e.y - 0.008, e.z + 0.002)))
        box("HS_Light", (0.012, 0.004, 0.004), glow, bevel=0.0015, parent=hs, matrix=Matrix.Translation((0.058, e.y - 0.1085, e.z + 0.033)))
        sx = halfw + 0.005
        side = [(sx - 0.002, e.y - 0.045, e.z + 0.006), (sx + 0.003, e.y + 0.04, e.z + 0.024), (sx - 0.004, e.y + 0.11, e.z + 0.030),
                (sx - 0.034, back + 0.004, e.z + 0.016), (0.0, back + 0.017, e.z + 0.006)]
        loop = side + [(-x, y, z) for x, y, z in reversed(side[:-1])]
        ribbon("HS_Band", loop, (0, 0, 1), 0.030, 0.006, strap, parent=hs)
        box("HS_Cradle", (0.105, 0.020, 0.058), white, bevel=0.009, parent=hs, matrix=Matrix.Translation((0, back + 0.022, e.z + 0.006)))
        crown = max(top, hairtop) + 0.012
        over = [(0, e.y - 0.045, e.z + 0.050), (0, e.y + 0.02, crown - 0.012), (0, (e.y + back) / 2 + 0.01, crown),
                (0, back - 0.03, crown - 0.03), (0, back + 0.024, e.z + 0.03)]
        ribbon("HS_Top", over, (1, 0, 0), 0.028, 0.005, strap, parent=hs)
        hs["apex"] = (0.0, (e.y + back) / 2 + 0.01, crown)
        if kit["headset"] == "on":
            bone_parent(hs, "head")

    # ---- hi-vis vest, grown from the torso
    if kit.get("vest"):
        vme = body.data.copy()
        vest = bpy.data.objects.new("Vest", vme)
        scene.collection.objects.link(vest)
        vest.parent = arm
        for g in body.vertex_groups:
            vest.vertex_groups.new(name=g.name)
        if vme.shape_keys:
            vest.shape_key_clear()
        for v in vme.vertices:
            v.co = shape[v.index]
        bm = bmesh.new()
        bm.from_mesh(vme)
        dl = bm.verts.layers.deform.verify()
        sh = RB["upperarm01.L"].head_local
        zlo = RB["spine05"].head_local.z - 0.035
        ztop = RB["neck01"].head_local.z + 0.01
        keep = set()
        for v in bm.verts:
            co = v.co
            if gi not in v[dl] or not (zlo < co.z < ztop) or abs(co.x) > sh.x + 0.004:
                continue
            if (abs(co.x) - (sh.x + 0.035)) ** 2 + (co.z - (sh.z - 0.07)) ** 2 < 0.105 ** 2:      # armholes
                continue
            if co.x ** 2 + (co.y - RB["neck01"].head_local.y) ** 2 < 0.068 ** 2 and co.z > sh.z - 0.01:   # neck
                continue
            if co.y < 0.0 and co.z > (sh.z - 0.10) + 1.5 * abs(co.x):                             # the V at the front
                continue
            keep.add(v)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v in keep for v in f.verts)], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        # below the chest the cloth hangs straight instead of following the waist
        zc = sh.z - 0.10
        ring = [v for v in bm.verts if abs(v.co.z - zc) < 0.03]
        cy = sum(v.co.y for v in ring) / len(ring)
        bins = 48
        rmax = [0.0] * bins

        def which(co):
            return int((math.atan2(co.x, co.y - cy) + math.pi) / (2 * math.pi) * bins) % bins

        for v in ring:
            k = which(v.co)
            rmax[k] = max(rmax[k], math.hypot(v.co.x, v.co.y - cy))
        for k in range(bins):
            if rmax[k] == 0.0:
                near = [rmax[(k + d) % bins] for d in (-2, -1, 1, 2) if rmax[(k + d) % bins] > 0]
                rmax[k] = sum(near) / len(near) if near else 0.0
        rmax = [(rmax[k - 1] + rmax[k] + rmax[(k + 1) % bins]) / 3 for k in range(bins)]
        for v in bm.verts:
            if v.co.z < zc:
                r = math.hypot(v.co.x, v.co.y - cy)
                want = rmax[which(v.co)] * 0.985
                if 1e-6 < r < want:
                    v.co.x *= want / r
                    v.co.y = cy + (v.co.y - cy) * want / r
        bm.normal_update()
        for v in bm.verts:
            v.co += v.normal * (0.032 if v.normal.y < -0.2 else 0.025)
        for _ in range(9):
            bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        for _ in range(14):                                  # straighten the cut edges
            moves = []
            for v in bm.verts:
                if not v.is_boundary:
                    continue
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) == 2:
                    moves.append((v, (nb[0].co + nb[1].co) / 2))
            for v, c2 in moves:
                v.co = v.co * 0.5 + c2 * 0.5
        bm.normal_update()
        uv = bm.loops.layers.uv.new("rest")
        for f in bm.faces:
            f.smooth = True
            f.material_index = 0
            for lp in f.loops:
                lp[uv].uv = (lp.vert.co.x + 0.5, lp.vert.co.z / 2.0)
        bm.to_mesh(vme)
        bm.free()
        vme.materials.clear()
        vm = bpy.data.materials.new("Vest")
        vm.use_nodes = True
        nt = vm.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        uvn = nt.nodes.new('ShaderNodeUVMap')
        uvn.uv_map = "rest"
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(uvn.outputs['UV'], sep.inputs[0])

        def band(sock, lo, hi):
            a = nt.nodes.new('ShaderNodeMath')
            a.operation = 'GREATER_THAN'
            a.inputs[1].default_value = lo
            nt.links.new(sock, a.inputs[0])
            b = nt.nodes.new('ShaderNodeMath')
            b.operation = 'LESS_THAN'
            b.inputs[1].default_value = hi
            nt.links.new(sock, b.inputs[0])
            m = nt.nodes.new('ShaderNodeMath')
            m.operation = 'MULTIPLY'
            nt.links.new(a.outputs[0], m.inputs[0])
            nt.links.new(b.outputs[0], m.inputs[1])
            return m.outputs[0]

        def either(a, b):
            m = nt.nodes.new('ShaderNodeMath')
            m.operation = 'MAXIMUM'
            nt.links.new(a, m.inputs[0])
            nt.links.new(b, m.inputs[1])
            return m.outputs[0]

        ax_ = nt.nodes.new('ShaderNodeMath')                 # |x|
        ax_.operation = 'ABSOLUTE'
        off = nt.nodes.new('ShaderNodeMath')
        off.operation = 'SUBTRACT'
        off.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs['X'], off.inputs[0])
        nt.links.new(off.outputs[0], ax_.inputs[0])
        z0 = zlo
        h1 = band(sep.outputs['Y'], (z0 + 0.065) / 2, (z0 + 0.103) / 2)
        h2 = band(sep.outputs['Y'], (z0 + 0.170) / 2, (z0 + 0.208) / 2)
        vert = nt.nodes.new('ShaderNodeMath')
        vert.operation = 'MULTIPLY'
        nt.links.new(band(ax_.outputs[0], 0.088, 0.116), vert.inputs[0])
        up = nt.nodes.new('ShaderNodeMath')
        up.operation = 'GREATER_THAN'
        up.inputs[1].default_value = (z0 + 0.208) / 2
        nt.links.new(sep.outputs['Y'], up.inputs[0])
        nt.links.new(up.outputs[0], vert.inputs[1])
        tape = either(either(h1, h2), vert.outputs[0])
        col = nt.nodes.new('ShaderNodeMixRGB')
        col.inputs['Color1'].default_value = (*kit.get("vest_color", (1.0, 0.30, 0.02)), 1.0)
        col.inputs['Color2'].default_value = (0.60, 0.62, 0.64, 1.0)
        nt.links.new(tape, col.inputs['Fac'])
        nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
        ro = nt.nodes.new('ShaderNodeMapRange')
        ro.inputs['To Min'].default_value = 0.72
        ro.inputs['To Max'].default_value = 0.36
        nt.links.new(tape, ro.inputs['Value'])
        nt.links.new(ro.outputs['Result'], bsdf.inputs['Roughness'])
        vme.materials.append(vm)
        am = vest.modifiers.new("Armature", 'ARMATURE')
        am.object = arm
        sm = vest.modifiers.new("Smooth", 'SMOOTH')
        sm.factor = 0.5
        sm.iterations = 6
        so = vest.modifiers.new("Solid", 'SOLIDIFY')
        so.thickness = 0.004
        so.offset = 1.0
        sub = vest.modifiers.new("Sub", 'SUBSURF')
        sub.levels = sub.render_levels = 2

    # ---- pose helpers (armature space)
    def head(b):
        return PB[b].head.copy()

    def rot_about(b, q):
        pb = PB[b]
        m = pb.matrix.copy()
        piv = m.translation.copy()
        pb.matrix = Matrix.Translation(piv) @ q.to_matrix().to_4x4() @ Matrix.Translation(-piv) @ m
        upd()

    def aim(b, target, end=None):
        d = ((head(end) if end else PB[b].tail) - head(b)).normalized()
        rot_about(b, d.rotation_difference(Vector(target).normalized()))

    def turn(b, axis, deg):
        rot_about(b, Quaternion(Vector(axis).normalized(), math.radians(deg)))

    def hand_frame(s):
        k = (head(f"finger2-1.{s}") - head(f"finger5-1.{s}")).normalized()       # pinky to index knuckle
        f = (head(f"finger3-1.{s}") - head(f"wrist.{s}")).normalized()           # wrist to knuckles
        n = (f.cross(k) if s == "L" else k.cross(f)).normalized()                # out of the palm
        mid = (head(f"finger2-1.{s}") + head(f"finger5-1.{s}")) / 2
        return k, f, n, mid

    def palm_to(s, want, share=0.4):
        """Twist the forearm so the palm faces `want`."""
        a = (head(f"wrist.{s}") - head(f"lowerarm01.{s}")).normalized()
        k, f, n, mid = hand_frame(s)
        want = Vector(want).normalized()
        np_ = (n - a * n.dot(a)).normalized()
        wp = (want - a * want.dot(a)).normalized()
        ang = math.degrees(math.atan2(a.dot(np_.cross(wp)), np_.dot(wp)))
        print("PALM", s, "twist", round(ang, 1))
        turn(f"lowerarm01.{s}", a, ang * share)
        turn(f"lowerarm02.{s}", a, ang * (1 - share))

    def curl(s, amounts, spread=0.0, index=1.0):
        k, f, n, mid = hand_frame(s)
        sign = 1.0 if k.cross(f).dot(n) > 0 else -1.0
        for i in (2, 3, 4, 5):
            for j, a in zip((1, 2, 3), amounts):
                turn(f"finger{i}-{j}.{s}", k, sign * (a + (i - 2) * spread) * (index if i == 2 else 1.0))

    def thumb_to(s, target, rounds=10, share=(0.55, 0.6, 0.35)):
        """Bend the thumb, joint by joint, until its tip rests on `target` (armature space)."""
        tipbone = PB[f"finger1-3.{s}"]
        for _ in range(rounds):
            for j, w in zip((3, 2, 1), share):
                b = f"finger1-{j}.{s}"
                a = tipbone.tail - head(b)
                t = Vector(target) - head(b)
                if a.length < 1e-6 or t.length < 1e-6:
                    continue
                q = a.normalized().rotation_difference(t.normalized())
                rot_about(b, Quaternion().slerp(q, w))
        print("THUMB", s, "gap mm", round((tipbone.tail - Vector(target)).length * 1000, 1))

    def phalanx(s, i, j):
        return (head(f"finger{i}-{j}.{s}") + PB[f"finger{i}-{j}.{s}"].tail) / 2

    pose = kit.get("pose", "stand")
    if pose == "seated":
        for s, sx in (("L", 1), ("R", -1)):
            aim(f"upperleg01.{s}", (0.16 * sx, -0.985, -0.03), end=f"lowerleg01.{s}")
            aim(f"lowerleg01.{s}", (0.02 * sx, -0.10, -0.99), end=f"foot.{s}")
            aim(f"foot.{s}", (0.16 * sx, -0.86, -0.49))
            aim(f"upperarm01.{s}", (0.24 * sx, -0.26, -0.94), end=f"lowerarm01.{s}")
            fore = Vector(kit.get("fore", {}).get(s, (-0.16 * sx, -0.94, 0.30)))
            aim(f"lowerarm01.{s}", fore, end=f"wrist.{s}")
            aim(f"wrist.{s}", fore + Vector((0.02 * sx, -0.03, -0.10)), end=f"finger3-1.{s}")
            palm_to(s, (-sx, 0.0, -0.2))
            curl(s, (62, 72, 46), spread=3.0, index=0.72)
        turn("spine05", (1, 0, 0), -5)
        turn("spine02", (1, 0, 0), 3)
        turn("neck01", (1, 0, 0), 4)
        turn("head", (1, 0, 0), kit.get("head_pitch", 5))
        turn("head", (0, 0, 1), kit.get("head_turn", 0))
    else:
        aim("upperarm01.L", (0.17, 0.0, -0.985), end="lowerarm01.L")
        aim("lowerarm01.L", (0.10, -0.24, -0.965), end="wrist.L")
        aim("wrist.L", (0.06, -0.28, -0.96), end="finger3-1.L")
        palm_to("L", (-1.0, 0.25, 0.0))
        curl("L", (15, 22, 14), spread=5.0)
        k, f, n, mid = hand_frame("L")
        thumb_to("L", phalanx("L", 2, 1) + k * 0.026 + n * 0.012 + f * 0.012, rounds=6)
        if kit.get("headset") == "hand":
            aim("upperarm01.R", (-0.20, -0.06, -0.98), end="lowerarm01.R")
            aim("lowerarm01.R", (-0.10, -0.52, -0.85), end="wrist.R")
            aim("wrist.R", (-0.06, -0.50, -0.86), end="finger3-1.R")
            palm_to("R", (1.0, 0.1, 0.0))
            curl("R", (66, 78, 50), spread=2.0)
            k, f, n, mid = hand_frame("R")
            grip = mid + n * 0.022 + f * 0.006
            over = (phalanx("R", 2, 2) + phalanx("R", 3, 2)) / 2
            thumb_to("R", over + (over - grip).normalized() * 0.013)
        else:
            aim("upperarm01.R", (-0.17, 0.0, -0.985), end="lowerarm01.R")
            aim("lowerarm01.R", (-0.10, -0.24, -0.965), end="wrist.R")
            aim("wrist.R", (-0.06, -0.28, -0.96), end="finger3-1.R")
            palm_to("R", (1.0, 0.25, 0.0))
            curl("R", (15, 22, 14), spread=5.0)
            k, f, n, mid = hand_frame("R")
            thumb_to("R", phalanx("R", 2, 1) + k * 0.026 + n * 0.012 + f * 0.012, rounds=6)
        aim("upperleg01.L", (0.085, -0.035, -0.995), end="lowerleg01.L")
        aim("upperleg01.R", (-0.060, 0.02, -0.998), end="lowerleg01.R")
        turn("spine03", (0, 0, 1), kit.get("chest_turn", 0))
        turn("head", (0, 0, 1), kit.get("head_turn", 0))
        turn("head", (1, 0, 0), kit.get("head_pitch", -2))

    # ---- controllers, put into the closed hands
    if kit.get("controllers"):
        for s, sx in (("L", 1), ("R", -1)):
            k, f, n, mid = hand_frame(s)
            z = k
            fw = (f - z * f.dot(z)).normalized()
            y = -fw
            x = y.cross(z).normalized()
            m = Matrix((x, y, z)).transposed().to_4x4()
            m.translation = mid + n * 0.027 + fw * 0.006
            root = empty(f"Controller.{s}")
            root.matrix_world = arm.matrix_world @ m
            stick = m @ Matrix.Translation((0, 0.004, 0.046)) @ Matrix.Rotation(math.radians(38), 4, 'X') @ Vector((-0.008 * sx, -0.010, 0.034))
            thumb_to(s, stick)
            cylinder("C_Handle", 0.0150, 0.0185, 0.118, white, bevel=0.006, parent=root, matrix=Matrix.Translation((0, 0, -0.030)))
            tilt = Matrix.Translation((0, 0.004, 0.046)) @ Matrix.Rotation(math.radians(38), 4, 'X')
            cylinder("C_Head", 0.031, 0.033, 0.022, white, bevel=0.007, parent=root, matrix=tilt)
            cylinder("C_Face", 0.027, 0.027, 0.003, black, parent=root, matrix=tilt @ Matrix.Translation((0, 0, 0.0115)))
            cylinder("C_StickPost", 0.004, 0.004, 0.012, foam, parent=root, matrix=tilt @ Matrix.Translation((-0.008 * sx, -0.004, 0.018)))
            cylinder("C_Stick", 0.0085, 0.0075, 0.005, foam, bevel=0.002, parent=root, matrix=tilt @ Matrix.Translation((-0.008 * sx, -0.004, 0.026)))
            cylinder("C_BtnA", 0.0052, 0.0052, 0.004, foam, parent=root, matrix=tilt @ Matrix.Translation((0.011 * sx, 0.008, 0.0135)))
            cylinder("C_BtnB", 0.0052, 0.0052, 0.004, foam, parent=root, matrix=tilt @ Matrix.Translation((0.014 * sx, -0.007, 0.0135)))
            box("C_Trigger", (0.013, 0.016, 0.030), foam, bevel=0.005, parent=root, matrix=Matrix.Translation((0, -0.021, 0.012)))
            box("C_Light", (0.004, 0.003, 0.010), glow, bevel=0.001, parent=root, matrix=Matrix.Translation((0, -0.0185, -0.045)))

    # ---- the headset carried in the right hand, hanging from its top strap
    if hs and kit.get("headset") == "hand":
        k, f, n, mid = hand_frame("R")
        grip = arm.matrix_world @ (mid + n * 0.022 + f * 0.006)
        apex = Vector(hs["apex"])
        r = Matrix.Rotation(math.radians(kit.get("hs_yaw", -70)), 4, 'Z') @ Matrix.Rotation(math.radians(kit.get("hs_pitch", 28)), 4, 'X')
        hs.matrix_world = Matrix.Translation(grip) @ r @ Matrix.Translation(-apex)

    upd()
    dg = bpy.context.evaluated_depsgraph_get()

    def low_point(ob, test=None):
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        pts = [ob.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
        return [p for p in pts if (test is None or test(p))]

    # ---- feet on the floor
    drop = min(p.z for p in low_point(shoes, lambda p: abs(p.x) < 1 and abs(p.y) < 1.5))
    arm.location.z -= drop
    for ob in bpy.data.objects:
        if ob.parent is None and ob is not arm and ob.name.startswith(("Controller", "Headset")):
            ob.location.z -= drop
    upd()
    dg = bpy.context.evaluated_depsgraph_get()

    # ---- chair
    if kit.get("chair"):
        hip = arm.matrix_world @ head("upperleg01.L")
        under = low_point(suit, lambda p: hip.y - 0.30 < p.y < hip.y - 0.08 and abs(p.x) < 0.3 and p.z > 0.25)
        seat_z = min(p.z for p in under) + 0.006
        steel = principled("Chair_Steel", (0.02, 0.02, 0.022), 0.32, metal=1.0)
        pad = principled("Chair_Pad", (0.035, 0.036, 0.04), 0.86)
        ch = empty("Chair")
        y0, y1 = hip.y + 0.13, hip.y - 0.36                   # back edge, front edge
        yc = (y0 + y1) / 2
        w = 0.47
        box("Chair_Seat", (w, y0 - y1, 0.055), pad, bevel=0.022, parent=ch, matrix=Matrix.Translation((0, yc, seat_z - 0.0275)))
        box("Chair_Back", (w - 0.04, 0.045, 0.30), pad, bevel=0.020, parent=ch,
            matrix=Matrix.Translation((0, y0 + 0.075, seat_z + 0.40)) @ Matrix.Rotation(math.radians(-9), 4, 'X'))
        for sxx in (-1, 1):
            xx = sxx * (w / 2 - 0.035)
            zf = seat_z - 0.055
            tube("Chair_Leg", [(xx, y0 + 0.10, seat_z + 0.50), (xx, y0 + 0.055, seat_z + 0.02), (xx, y0 + 0.02, zf), (xx, y0 + 0.01, 0.016),
                               (xx, y1 + 0.02, 0.016), (xx, y1 + 0.03, zf), (xx, y0 + 0.02, zf)], 0.011, steel, parent=ch, smooth_path=False)

    for s_ in ("L", "R"):
        print("HAND", kit["name"], s_, tuple(round(v, 3) for v in (arm.matrix_world @ hand_frame(s_)[3])))
    # ---- bake everything to plain meshes under one root
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    root = empty("Human_" + kit["name"])
    baked = []
    for ob in list(bpy.data.objects):
        if ob.type not in ('MESH', 'CURVE'):
            continue
        ev = ob.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        if not me.polygons:
            continue
        nb = bpy.data.objects.new("H_" + kit["name"] + "_" + ob.name.replace("Worker.", ""), me)
        nb.matrix_world = ob.matrix_world.copy()
        baked.append(nb)
    keep_names = {root.name} | {nb.name for nb in baked}
    for ob in list(bpy.data.objects):
        if ob.name not in keep_names:
            bpy.data.objects.remove(ob, do_unlink=True)
    for nb in baked:
        scene.collection.objects.link(nb)
        mw = nb.matrix_world.copy()
        nb.parent = root
        nb.matrix_world = mw
    lo = min(min((nb.matrix_world @ Vector(c)).z for c in nb.bound_box) for nb in baked)
    hi = max(max((nb.matrix_world @ Vector(c)).z for c in nb.bound_box) for nb in baked)
    print("BAKED", kit["name"], len(baked), "objects, z", round(lo, 3), round(hi, 3))
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=kit["out"])
    print("SAVED", kit["out"])


for kit in KITS:
    if ONLY and kit["name"] not in ONLY:
        continue
    run(kit)
