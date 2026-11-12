# The main character of the open 3D city: a plain-clothes Tehrani everyman, built exactly
# like the police officer — a downloaded CC-BY character (assets/models/character/casual.glb,
# credited in assets/credits.json) put on the arena soldier's skeleton, so he plays every one
# of the soldier's animations and holds its guns (arena.py calls build_civilian after the
# soldier is built, and exports public/models/arena/civilian.glb). Unlike police.py, the
# clothes keep their own colours.
#
#   ARENA_ONLY=civilian npm run assets:arena   rebuild civilian.glb alone (soldier/weapons/police untouched)
#
# The source differs from police.glb in one way: it ships a stray 42-vertex icosphere next to
# the character, so the mesh import here keeps only real body parts (>= 200 vertices).
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

from police import _armature, _segments, _skin, _stand, _verts

HEIGHT = 1.84
HAND_LEN = 0.17


def _character_mesh(path):
    """The character meshes of `path`, joined (stray helpers smaller than 200 vertices are dropped)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH" and len(o.data.vertices) >= 200]
    if not meshes:
        raise RuntimeError(f"no usable mesh in {path}")
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


def _pack(body):
    """Keep the clothes as they are; shrink the textures to 512 px for phones."""
    for slot in body.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        mat.name = "Civilian"
        for node in mat.node_tree.nodes:
            img = getattr(node, "image", None)
            if not img or not img.size[0]:
                continue
            w, h = img.size
            img.scale(min(w, 512), min(h, 512))
            img.pack()


def build_civilian(src, soldier_rig, J, BONES, UPPER, FORE):
    """The civilian body, skinned to `soldier_rig`; J / BONES as arena.py lays the soldier out."""
    body = _character_mesh(src)
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
    trig = _armature("CivilianT", t_segs, parents)
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
    _pack(body)
    body.name = "CivilianBody"
    return body
