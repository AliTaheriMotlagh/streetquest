# The police officer of the open 3D city: a downloaded character mesh (assets/models/character/
# police.glb — npm run assets:get, credited in assets/credits.json) put on the arena soldier's
# skeleton, so it plays every one of the soldier's animations and holds its guns
# (arena.py calls build_police after the soldier is built, and exports public/models/arena/police.glb).
#
# The source is a bare mesh standing in a T-pose. To fit it:
#  1. stand it up facing +Y at the soldier's height, feet on the ground;
#  2. skin it to a T-pose copy of the soldier's skeleton (arms out sideways, the soldier's
#     own arm lengths, ending at the mesh's wrists) and bend that into the soldier's
#     rifle-ready rest pose — the arms come round to the gun;
#  3. bake that pose into the mesh and skin it again, to the soldier's real skeleton;
#  4. recolour the uniform (navy in the source) to Iran's police green, and shrink the
#     texture for phones.
# Skinning is by distance to each bone (the nearest few, smoothly blended at the joints),
# never across the body's middle (a thigh never pulls on the other leg).
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

# Iran's police green (uniform), and how far from the source's navy a pixel may be to count.
GREEN_HUE = 0.30
HEIGHT = 1.84
HAND_LEN = 0.17


def _mesh_from(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o != body and o.name in bpy.data.objects:
            bpy.data.objects.remove(o)
    return body


def _verts(o):
    return np.array([v.co[:] for v in o.data.vertices])


def _stand(body):
    """Feet on the ground, centred, facing +Y, HEIGHT tall."""
    v = _verts(body)
    lo, hi = v.min(0), v.max(0)
    # Up is the longest axis that isn't the arm span (x is the span in a T-pose).
    up = 2 if (hi - lo)[2] >= (hi - lo)[1] else 1
    if up == 1:
        body.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))
        v = _verts(body)
        lo, hi = v.min(0), v.max(0)
    s = HEIGHT / (hi[2] - lo[2])
    body.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))))
    # The toes point forward: the feet reach further out front than behind.
    v = _verts(body)
    feet = v[v[:, 2] < 0.06]
    if abs(feet[:, 1].max()) < abs(feet[:, 1].min()):
        body.data.transform(Matrix.Rotation(math.pi, 4, "Z"))


def _segments(joints, bones):
    """(name, head, tail) for each bone; joints in armature space."""
    return [(n, np.array(h[:]), np.array(t[:])) for n, h, t in bones(joints)]


def _skin(body, segs, falloff=0.035, keep=3):
    """Vertex groups by distance to the bones (the nearest `keep`, blended over `falloff` m)."""
    body.vertex_groups.clear()
    groups = {n: body.vertex_groups.new(name=n) for n, _, _ in segs}
    v = _verts(body)
    d = np.full((len(v), len(segs)), np.inf)
    for j, (n, a, b) in enumerate(segs):
        ab = b - a
        t = np.clip(((v - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        dist = np.linalg.norm(v - (a + t[:, None] * ab), axis=1)
        # Never across the middle of the body.
        if n.endswith(".R"):
            dist[v[:, 0] < -0.03] = np.inf
        if n.endswith(".L"):
            dist[v[:, 0] > 0.03] = np.inf
        if n == "root":
            dist[:] = np.inf
        d[:, j] = dist
    order = np.argsort(d, axis=1)[:, :keep]
    for i in range(len(v)):
        near = order[i]
        dm = d[i, near[0]]
        w = np.exp(-(d[i, near] - dm) / falloff)
        w /= w.sum()
        for j, wj in zip(near, w):
            if wj > 0.02:
                groups[segs[j][0]].add([i], float(wj), "REPLACE")


def _armature(name, segs, parents):
    data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for n, h, t in segs:
        eb = data.edit_bones.new(n)
        eb.head, eb.tail, eb.roll = Vector(h), Vector(t), 0
    for n, _, _ in segs:
        if parents.get(n):
            data.edit_bones[n].parent = data.edit_bones[parents[n]]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def _recolour(body):
    """Navy uniform → police green, in the texture itself; texture down to 512 px."""
    for slot in body.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        mat.name = "Police"
        for node in mat.node_tree.nodes:
            img = getattr(node, "image", None)
            if not img or not img.size[0]:
                continue
            w, h = img.size
            px = np.array(img.pixels[:]).reshape(-1, 4)
            rgb = px[:, :3]
            mx, mn = rgb.max(1), rgb.min(1)
            sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
            # Hue of each pixel (0…1).
            r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
            c = np.maximum(mx - mn, 1e-6)
            hue = np.where(mx == r, ((g - b) / c) % 6, np.where(mx == g, (b - r) / c + 2, (r - g) / c + 4)) / 6
            # The uniform: blue, not too bright (skin, badges and the white shirt stay as they are).
            navy = (hue > 0.52) & (hue < 0.75) & (sat > 0.12) & (mx < 0.75)
            # Into a dark olive green, keeping the cloth's shading (its brightness).
            v = mx[navy]
            green = np.stack([v * 0.5, v * 0.66, v * 0.44], 1)
            rgb[navy] = green
            px[:, :3] = rgb
            img.pixels[:] = px.ravel()
            img.scale(min(w, 512), min(h, 512))
            img.pack()


def build_police(src, soldier_rig, J, BONES, UPPER, FORE):
    """The police body, skinned to `soldier_rig`; J / BONES as arena.py lays the soldier out."""
    body = _mesh_from(src)
    _stand(body)
    v = _verts(body)

    # The T-pose arms: at the height where the mesh is widest, out to its fingertips.
    span = v[np.abs(v[:, 0]) > 0.55]
    arm_z = float(np.median(span[:, 2])) if len(span) else J["shoulder.R"].z
    arm_y = float(np.median(span[:, 1])) if len(span) else 0.0
    tip = float(np.abs(v[:, 0]).max())
    wrist = tip - HAND_LEN
    # Shoulders where the soldier's arm lengths end at the mesh's wrists.
    sx = max(0.12, wrist - UPPER - FORE)
    parents = {n: p for n, _, _, p in BONES}

    def t_bones(_):
        out = []
        for n, h, t, p in BONES:
            if n.startswith(("upperarm", "forearm", "hand")):
                side = 1 if n.endswith(".R") else -1
                sh = Vector((sx * side, arm_y, arm_z))
                el = sh + Vector((UPPER * side, 0, 0))
                wr = el + Vector((FORE * side, 0, 0))
                h, t = {"upperarm": (sh, el), "forearm": (el, wr), "hand": (wr, wr + Vector((HAND_LEN * side, 0, 0)))}[n.split(".")[0]]
            out.append((n, h, t))
        return out

    t_segs = _segments(None, t_bones)
    trig = _armature("PoliceT", t_segs, parents)
    _skin(body, t_segs)
    mod = body.modifiers.new("t", "ARMATURE")
    mod.object = trig

    # Bend the T-pose arms into the soldier's rest pose (parents first).
    bpy.context.view_layer.objects.active = trig
    bpy.ops.object.mode_set(mode="POSE")
    target = {n: (Vector(h), Vector(t)) for n, h, t, _ in BONES}
    for n in ("upperarm.R", "forearm.R", "hand.R", "upperarm.L", "forearm.L", "hand.L"):
        pb = trig.pose.bones[n]
        bpy.context.view_layer.update()
        head = target[n][0] if n.startswith("upperarm") else Vector(pb.head)
        rest_dir = (pb.bone.tail_local - pb.bone.head_local).normalized()
        want = (target[n][1] - target[n][0]).normalized()
        rot = rest_dir.rotation_difference(want).to_matrix().to_4x4()
        m = rot @ pb.bone.matrix_local.normalized()
        m.translation = head
        pb.matrix = m
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="t")
    bpy.data.objects.remove(trig)

    # Now in the soldier's rest pose: skin it to the soldier's own skeleton.
    _skin(body, [(n, np.array(h[:]), np.array(t[:])) for n, h, t, _ in BONES])
    body.parent = soldier_rig
    m = body.modifiers.new("rig", "ARMATURE")
    m.object = soldier_rig
    _recolour(body)
    body.name = "PoliceBody"
    return body
