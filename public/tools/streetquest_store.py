# StreetQuest — starter 3D store for Blender (4.2+ / 5.x).
#
# Turns the footprint you downloaded from Admin → 3D stores (store_footprint.obj) into a
# storefront at the real size and spot: ground-floor shop glass, a lit sign with the
# store's name (or its real logo/sign photo), an awning over the pavement, windows on
# the floors above and a parapet round the flat roof — then exports the .glb to upload.
# It's a starting point: open the result in Blender and make it look like the photos.
#
# Headless:
#   blender -b --python streetquest_store.py -- --footprint store_footprint.obj \
#       --name "Cafe Lamiz" --color "#b5232f" --out cafe.glb [--sign-image sign.png] [--floors 4]
# In Blender: import the .obj (File → Import → Wavefront, default axes), open this file
#   in the Scripting tab, set the values in DEFAULTS below and press Run.
#
# Rules the game relies on (keep them when you edit by hand):
#   - 1 unit = 1 m; the origin is the store's pin; top view = map (+X east, +Y north).
#   - Principled BSDF materials only; Emission makes a part glow at night (signs).
#   - Budget for phones: < 60k triangles, ≤ 2048 px textures, ≤ 12 materials, < 2.5 MB.
#   - Objects named ref_… are ignored by the game; delete or keep them, either is fine.
import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

DEFAULTS = {"name": "My Store", "color": "#c0392b", "floors": 0, "out": "", "sign_image": "", "footprint": "", "font": ""}
GROUND = 3.8  # shop floor height (m)
FLOOR = 3.2  # floors above


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--footprint", default=DEFAULTS["footprint"])
    ap.add_argument("--name", default=DEFAULTS["name"])
    ap.add_argument("--color", default=DEFAULTS["color"])
    ap.add_argument("--floors", type=int, default=DEFAULTS["floors"], help="0 = from the map's height")
    ap.add_argument("--sign-image", default=DEFAULTS["sign_image"], help="the real sign or logo (PNG/JPG/WebP)")
    ap.add_argument("--font", default=DEFAULTS["font"], help="a .ttf/.otf for the sign text")
    ap.add_argument("--out", default=DEFAULTS["out"])
    return ap.parse_args(argv)


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1.0]


def material(name, color, rough=0.8, metal=0.0, emit=None, strength=0.0, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if image:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image)
        m.node_tree.links.new(tex.outputs["Color"], p.inputs["Base Color"])
        if emit:
            m.node_tree.links.new(tex.outputs["Color"], p.inputs["Emission Color"])
    elif emit:
        p.inputs["Emission Color"].default_value = emit
    if emit:
        p.inputs["Emission Strength"].default_value = strength
    return m


def footprint_ring():
    """The footprint's bottom outline, counter-clockwise from above, and the map's height."""
    ref = bpy.data.objects.get("ref_footprint")
    if not ref:
        sys.exit("No ref_footprint in the scene — import the footprint .obj from the admin panel first.")
    mw = ref.matrix_world
    verts = [mw @ v.co for v in ref.data.vertices]
    low = min(v.z for v in verts)
    top = max(v.z for v in verts)
    best = None
    for poly in ref.data.polygons:
        pts = [verts[i] for i in poly.vertices]
        if all(abs(p.z - low) < 0.01 for p in pts) and (best is None or len(pts) > len(best)):
            best = pts
    ring = [Vector((p.x, p.y)) for p in best]
    area = sum(ring[i].x * ring[(i + 1) % len(ring)].y - ring[(i + 1) % len(ring)].x * ring[i].y for i in range(len(ring)))
    if area < 0:
        ring.reverse()
    return ring, top


def front_edge(ring):
    """The wall facing the street: the edge whose middle is nearest a ref_street."""
    street = [o.matrix_world @ v.co for o in bpy.data.objects if o.name.startswith("ref_street") for v in o.data.vertices]
    best, best_d = 0, float("inf")
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        if (b - a).length < 2.5:
            continue
        mid = (a + b) / 2
        d = min(((Vector((s.x, s.y)) - mid).length for s in street), default=0) - (b - a).length * 0.05
        if d < best_d:
            best, best_d = i, d
    return best


def prism(name, ring, z0, z1, mat, caps=True):
    bm = bmesh.new()
    lo = [bm.verts.new((p.x, p.y, z0)) for p in ring]
    hi = [bm.verts.new((p.x, p.y, z1)) for p in ring]
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    if caps:
        bm.faces.new(hi)
        bm.faces.new(list(reversed(lo)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def box(name, centre, size, yaw, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre, rotation=(0, 0, yaw))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def main():
    a = args()
    if a.footprint:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.wm.obj_import(filepath=os.path.abspath(a.footprint))
    ring, map_h = footprint_ring()
    floors = a.floors or max(0, round((max(map_h, GROUND + 1) - GROUND) / FLOOR))
    height = GROUND + floors * FLOOR
    color = hex_rgb(a.color)
    plaster = material("Plaster", hex_rgb("#d9cfbf"), 0.85)
    roof = material("Roof", hex_rgb("#6d6e70"), 0.9)
    glass = material("ShopGlass", hex_rgb("#22313d"), 0.06, 0.6)
    frame = material("Frame", hex_rgb("#26292d"), 0.4, 0.7)
    window = material("Windows", hex_rgb("#334656"), 0.1, 0.5)
    brand = material("Brand", color, 0.5)
    sign = material("Sign", color if not a.sign_image else [1, 1, 1, 1], 0.4, 0, emit=color, strength=2.5, image=a.sign_image or None)
    letters = material("Letters", [1, 1, 1, 1], 0.4, 0, emit=[1, 1, 1, 1], strength=4)
    parts = []

    # Body: shop glass below, plaster above, a dark band between, a flat roof.
    parts.append(prism("shop", ring, 0, GROUND - 0.3, glass, caps=False))
    parts.append(prism("band", ring, GROUND - 0.3, GROUND, frame, caps=False))
    if floors:
        parts.append(prism("body", ring, GROUND, height, plaster, caps=False))
    top = prism("roof", ring, height, height + 0.01, roof)
    parts.append(top)
    # Parapet: a low wall round the roof (Tehran's flat roofs all have one).
    wall = prism("parapet", ring, height, height + 0.9, plaster, caps=False)
    sol = wall.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.25
    sol.offset = 1
    parts.append(wall)

    # Windows on every wall over 3 m long, on each floor above the shop.
    n = len(ring)
    for i in range(n):
        p, q = ring[i], ring[(i + 1) % n]
        edge = q - p
        length = edge.length
        if length < 3 or not floors:
            continue
        d = edge.normalized()
        out = Vector((d.y, -d.x))
        yaw = math.atan2(d.y, d.x)
        count = max(1, int(length // 3))
        for f in range(floors):
            z = GROUND + f * FLOOR + 1.7
            for k in range(count):
                at = p + d * (length * (k + 0.5) / count) + out * 0.03
                parts.append(box("window", (at.x, at.y, z), (1.4, 0.08, 1.6), yaw, window))

    # The street side: mullions, the sign, the awning.
    i = front_edge(ring)
    p, q = ring[i], ring[(i + 1) % n]
    edge = q - p
    length = edge.length
    d = edge.normalized()
    out = Vector((d.y, -d.x))
    yaw = math.atan2(d.y, d.x)
    mid = (p + q) / 2
    for k in range(1, max(2, int(length // 1.6))):
        at = p + d * (length * k / max(2, int(length // 1.6))) + out * 0.05
        parts.append(box("mullion", (at.x, at.y, (GROUND - 0.3) / 2), (0.08, 0.1, GROUND - 0.3), yaw, frame))
    sw = min(length * 0.82, 14)
    at = mid + out * 0.16
    parts.append(box("sign", (at.x, at.y, GROUND + 0.55), (sw, 0.22, 0.95), yaw, sign))
    if not a.sign_image:
        bpy.ops.object.text_add(location=(0, 0, 0))
        txt = bpy.context.active_object
        txt.data.body = a.name
        if a.font:
            txt.data.font = bpy.data.fonts.load(os.path.abspath(a.font))
        txt.data.align_x = "CENTER"
        txt.data.align_y = "CENTER"
        txt.data.extrude = 0.02
        bpy.ops.object.convert(target="MESH")
        dims = txt.dimensions
        s = min(sw * 0.86 / max(dims.x, 0.01), 0.62 / max(dims.y, 0.01))
        txt.scale = (s, s, s)
        txt.rotation_euler = (math.pi / 2, 0, yaw)
        front = mid + out * 0.29
        txt.location = (front.x, front.y, GROUND + 0.55)
        txt.data.materials.append(letters)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        parts.append(txt)
    # Awning: slopes down 1.4 m out over the pavement.
    aw = min(length * 0.9, 16)
    z1, z2 = GROUND - 0.35, GROUND - 0.75
    A, B = mid - d * (aw / 2) + out * 0.05, mid + d * (aw / 2) + out * 0.05
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((A.x, A.y, z1), (B.x, B.y, z1), ((B + out * 1.4).x, (B + out * 1.4).y, z2), ((A + out * 1.4).x, (A + out * 1.4).y, z2))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new("awning")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(brand)
    awning = bpy.data.objects.new("awning", me)
    bpy.context.collection.objects.link(awning)
    awning.modifiers.new("thick", "SOLIDIFY").thickness = 0.05
    parts.append(awning)

    # One object (a draw call per material), modifiers applied, references gone.
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    store = bpy.context.active_object
    store.name = "store"
    for ob in [o for o in bpy.data.objects if o.name.startswith("ref_")]:
        ob.hide_set(True)
    out_path = a.out or os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "store.glb")
    bpy.ops.object.select_all(action="DESELECT")
    store.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_image_format="WEBP" if a.sign_image else "AUTO",
    )
    tris = sum(len(p.vertices) - 2 for p in store.data.polygons)
    print(f"StreetQuest: wrote {out_path} — {tris} triangles, {len(store.data.materials)} materials, {floors} floors over the shop, sign on wall {i}")


main()
