# Real gun models (Sketchfab sources, `npm run assets:get -- <uid> --kind=weapon --as=<key>`,
# credited in assets/credits.json) turned into Street Arena weapons for arena.py:
#
#  1. every mesh joined into one, in metres;
#  2. turned to the arena's convention: barrel along +Y, up +Z — the long axis is the barrel,
#     its thin end the muzzle (the stock / grip end is the tall one), and the bore sits in the
#     upper half (grip and magazine hang below);
#  3. scaled to the real gun's length;
#  4. moved so the grip is at the origin and the bore GRIP_UP above it (where arena.py's
#     hand holds every gun);
#  5. its colours baked into vertex colours and its materials folded into two — metal and
#     the rest — so a gun is two draw calls on a phone, not a dozen;
#  6. thinned to a triangle budget if it's over it.
# Returns the object and what arena.py needs: the muzzle's distance ahead of the grip and the
# sight line's height (for aiming down sights).
import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def _merge(objs, world, name):
    """One mesh object from several, each part's world transform (`world`, taken while its
    parents still existed) baked in. No operators: they need a UI context."""
    bm = bmesh.new()
    mats = []
    for o in objs:
        me = o.data.copy()
        me.transform(world[o])
        if world[o].determinant() < 0:
            me.flip_normals()
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    for m in mats:
        out.materials.append(m)
    g = bpy.data.objects.new(name, out)
    bpy.context.scene.collection.objects.link(g)
    for o in objs:
        bpy.data.objects.remove(o)
    return g


def _base(mat):
    """A material's flat colour and metalness (the sources use plain Principled colours)."""
    if mat and mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                c = n.inputs["Base Color"].default_value
                return (c[0], c[1], c[2], 1.0), n.inputs["Metallic"].default_value, n.inputs["Roughness"].default_value
    if mat:
        c = mat.diffuse_color
        return (c[0], c[1], c[2], 1.0), mat.metallic, mat.roughness
    return (0.2, 0.2, 0.2, 1.0), 0.0, 0.6


def _vc_material(name, metal, rough):
    """A material whose colour is the mesh's vertex colours (exported as glTF COLOR_0)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    return m


def _slice_z(bm, axis, lo, hi):
    zs = [v.co.z for v in bm.verts if lo <= v.co[axis] <= hi]
    return (min(zs), max(zs)) if zs else (0.0, 0.0)


def import_gun(path, key, length, grip, grip_up, budget=5000, roll=0, flip=False):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    # Where every part really is (parts hang off the source's armature bones: read it before that goes).
    world = {o: o.matrix_world.copy() for o in new}
    # The importer draws bones with a little sphere mesh of its own: not part of the gun.
    shapes = {pb.custom_shape for o in new if o.type == "ARMATURE" for pb in o.pose.bones if pb.custom_shape}
    meshes = [o for o in new if o.type == "MESH" and o not in shapes and len(o.data.polygons)]
    # (Skinned parts are taken in their rest pose: the gun doesn't move.)
    # Some sources lay props beside the gun (spare shells, a loose magazine): keep only the
    # biggest group of parts that touch each other (boxes overlapping, with a little slack).
    boxes = []
    for o in meshes:
        pts = [world[o] @ Vector(c) for c in o.bound_box]
        boxes.append([Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])])
    span = max((b[1] - b[0]).length for b in boxes)
    pad = span * 0.01
    touch = lambda a, b: all(a[0][i] - pad <= b[1][i] and b[0][i] - pad <= a[1][i] for i in range(3))
    group = [-1] * len(meshes)
    for i in range(len(meshes)):
        if group[i] >= 0:
            continue
        group[i], todo = i, [i]
        while todo:
            a = todo.pop()
            for j in range(len(meshes)):
                if group[j] < 0 and touch(boxes[a], boxes[j]):
                    group[j] = i
                    todo.append(j)
    size = {}
    for i, gid in enumerate(group):
        size[gid] = size.get(gid, 0) + len(meshes[i].data.polygons)
    keep = max(size, key=size.get)
    for i, o in enumerate(list(meshes)):
        if group[i] != keep:
            meshes.remove(o)
            bpy.data.objects.remove(o)
    g = _merge(meshes, world, key)
    for o in new:
        if o not in meshes and o.name in bpy.data.objects:
            bpy.data.objects.remove(o)

    # -- colours into vertex colours, materials into metal + the rest
    me = g.data
    looks = [_base(s.material) for s in g.material_slots] or [_base(None)]
    col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    for p in me.polygons:
        c = looks[min(p.material_index, len(looks) - 1)][0]
        for li in p.loop_indices:
            col.data[li].color = c
    metal_idx = {i for i, lk in enumerate(looks) if lk[1] > 0.4}
    rough_m = sum(looks[i][2] for i in metal_idx) / len(metal_idx) if metal_idx else 0.4
    orig = [p.material_index for p in me.polygons]
    me.materials.clear()
    me.materials.append(_vc_material(f"gunmetal_{key}", 0.55, max(0.3, min(0.6, rough_m))))
    me.materials.append(_vc_material(f"gunpoly_{key}", 0.0, 0.7))
    for p, i in zip(me.polygons, orig):
        p.material_index = 0 if i in metal_idx else 1

    # -- orient: long axis → +Y (muzzle forward), up → +Z
    bm = bmesh.new()
    bm.from_mesh(me)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    ext = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
    long_ax = ext.index(max(ext))
    rot = Matrix.Identity(4)
    if long_ax == 0:
        rot = Matrix.Rotation(1.5707963, 4, "Z")  # +X → +Y
    elif long_ax == 2:
        rot = Matrix.Rotation(-1.5707963, 4, "X")  # +Z → +Y
    bm.transform(rot)
    # Per-gun fix-ups where a source breaks the rules below: a roll about the barrel (a gun
    # modelled lying on its side), and end-for-end.
    if roll:
        bm.transform(Matrix.Rotation(math.radians(roll), 4, "Y"))
    ys = [v.co.y for v in bm.verts]
    y0, y1 = min(ys), max(ys)
    L = y1 - y0
    s0 = _slice_z(bm, 1, y0, y0 + L * 0.08)
    s1 = _slice_z(bm, 1, y1 - L * 0.08, y1)
    # The muzzle end is the thin one (barrel against stock or grip).
    if ((s0[1] - s0[0]) < (s1[1] - s1[0])) != flip:
        bm.transform(Matrix.Rotation(math.pi, 4, "Z"))
        ys = [v.co.y for v in bm.verts]
        y0, y1 = min(ys), max(ys)
    s1 = _slice_z(bm, 1, y1 - L * 0.08, y1)
    zs = [v.co.z for v in bm.verts]
    z0, z1 = min(zs), max(zs)
    bore = (s1[0] + s1[1]) / 2
    # Grip and magazine hang below the bore: if the bore is in the lower half, it's upside down.
    if bore < (z0 + z1) / 2:
        bm.transform(Matrix.Rotation(3.14159265, 4, "Y"))
        zs = [v.co.z for v in bm.verts]
        z0, z1 = min(zs), max(zs)
        s1 = _slice_z(bm, 1, y1 - L * 0.08, y1)
        bore = (s1[0] + s1[1]) / 2

    # -- scale to the real gun, grip at the origin, bore grip_up above it
    k = length / L
    bm.transform(Matrix.Scale(k, 4))
    y0, y1, bore = y0 * k, y1 * k, bore * k
    xs = [v.co.x for v in bm.verts]
    cx = (min(xs) + max(xs)) / 2
    gy = y0 + (y1 - y0) * grip
    bm.transform(Matrix.Translation(Vector((-cx, -gy, -(bore - grip_up)))))
    # Sight line: the top of the gun just ahead of the grip (iron sights / optic), a little under it.
    near = [v.co.z for v in bm.verts if -0.06 <= v.co.y <= 0.25]
    top = (max(near) if near else grip_up + 0.04) - 0.012
    muzzle = y1 - gy
    bm.to_mesh(me)
    bm.free()
    me.update()

    # -- triangle budget
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris > budget:
        d = g.modifiers.new("thin", "DECIMATE")
        d.ratio = budget / tris
        d.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = g
        bpy.ops.object.modifier_apply(modifier=d.name)
    for p in me.polygons:
        p.use_smooth = False
    return g, {"muzzle": muzzle, "sight": top, "tris": sum(len(p.vertices) - 2 for p in g.data.polygons)}
