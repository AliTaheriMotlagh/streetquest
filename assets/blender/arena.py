# Street Arena models, built from code so they're reproducible and tweakable:
#   public/models/arena/soldier.glb  rigged soldier, every weapon in hand (one shown at a time),
#                                    animations: Idle Walk Run Back StrafeL StrafeR Crouch
#                                    CrouchWalk Jump Death
#   public/models/arena/weapons.glb  the same weapons on their own, for the first-person view
#
#   npm run assets:arena            (or: Blender -b -P assets/blender/arena.py -- [preview.png])
#
# Conventions (so three.js needs no fix-ups): the soldier faces Blender +Y, which the glTF
# exporter turns into three.js -Z, the drive's "forward". Metres. The arms are modelled
# in the rifle-ready pose (that's the rest pose), so weapons parented to the right hand sit
# exactly where they're drawn here, and the animations only move legs, hips and torso.
# Each body part is skinned 100% to one bone (rigid, cheap to animate on phones).
# Materials named "Uniform" and "Accent" are tinted per player / team at runtime.
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "models", "arena")
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PREVIEW = argv[0] if argv else None
FPS = 30

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def material(name, color, rough=0.7, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = 2.0
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


M = {
    "skin": material("Skin", srgb("#c99a76"), 0.8),
    "uniform": material("Uniform", srgb("#8a8f7a"), 0.9),
    "accent": material("Accent", srgb("#d7263d"), 0.6),
    "gear": material("Gear", srgb("#3b3f36"), 0.85),
    "boot": material("Boots", srgb("#2a2622"), 0.7),
    "glove": material("Gloves", srgb("#24262a"), 0.75),
    "lens": material("Lens", srgb("#1d2b3a"), 0.15, 0.4),
    "metal": material("Gunmetal", srgb("#2c2f33"), 0.35, 0.8),
    "poly": material("Polymer", srgb("#17181b"), 0.6),
    "tan": material("Furniture", srgb("#8a7556"), 0.7),
    "glass": material("Optic", srgb("#7fd3ff"), 0.05, 0.2, emit=srgb("#3a8fd0")),
}


def finish(o, mat, smooth=False, bevel=0.0, segs=2):
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in o.data.polygons:
        poly.use_smooth = smooth
    return o


def box(name, size, loc, mat, rot=(0, 0, 0), bevel=0.012, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, smooth, bevel)


def cyl(name, r, a, b, mat, verts=10, r2=None, smooth=True):
    """A (tapered) cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2 if r2 is not None else r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(o, mat, smooth)


def ball(name, r, loc, mat, scale=(1, 1, 1), segs=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, True)


def ik(shoulder, hand, a, b, pole):
    """Elbow for a two-bone limb (lengths a, b) reaching from shoulder to hand, bending toward pole."""
    s, h, pole = Vector(shoulder), Vector(hand), Vector(pole)
    d = h - s
    L = min(d.length, a + b - 1e-3)
    x = (a * a - b * b + L * L) / (2 * L)
    y = math.sqrt(max(0.0, a * a - x * x))
    n = d.normalized()
    side = (pole - n * pole.dot(n)).normalized()
    return s + n * x + side * y


# ---------------------------------------------------------------- skeleton (rifle-ready pose)
J = {
    "root": Vector((0, 0, 0)),
    "hips": Vector((0, 0, 0.93)),
    "spine": Vector((0, 0, 1.06)),
    "chest": Vector((0, 0.01, 1.3)),
    "neck": Vector((0, 0.02, 1.52)),
    "head": Vector((0, 0.03, 1.6)),
    "headTop": Vector((0, 0.03, 1.86)),
    "shoulder.R": Vector((0.19, 0.03, 1.45)),
    "shoulder.L": Vector((-0.19, 0.03, 1.45)),
    "hand.R": Vector((0.11, 0.2, 1.3)),
    "hand.L": Vector((0.09, 0.44, 1.32)),
    "hip.R": Vector((0.1, 0, 0.92)),
    "hip.L": Vector((-0.1, 0, 0.92)),
    "knee.R": Vector((0.1, 0.02, 0.5)),
    "knee.L": Vector((-0.1, 0.02, 0.5)),
    "ankle.R": Vector((0.1, 0, 0.09)),
    "ankle.L": Vector((-0.1, 0, 0.09)),
}
UPPER, FORE = 0.28, 0.27
J["elbow.R"] = ik(J["shoulder.R"], J["hand.R"], UPPER, FORE, (0.6, 0, -1))
J["elbow.L"] = ik(J["shoulder.L"], J["hand.L"], UPPER, FORE, (-0.7, 0, -1))
GRIP_DIR = Vector((0, 1, 0))

BONES = [
    # name, head, tail, parent
    ("root", J["root"], J["root"] + Vector((0, 0.25, 0)), None),
    ("hips", J["hips"], J["spine"], "root"),
    ("spine", J["spine"], J["chest"], "hips"),
    ("chest", J["chest"], J["neck"], "spine"),
    ("neck", J["neck"], J["head"], "chest"),
    ("head", J["head"], J["headTop"], "neck"),
    ("upperarm.R", J["shoulder.R"], J["elbow.R"], "chest"),
    ("forearm.R", J["elbow.R"], J["hand.R"], "upperarm.R"),
    ("hand.R", J["hand.R"], J["hand.R"] + GRIP_DIR * 0.1, "forearm.R"),
    ("upperarm.L", J["shoulder.L"], J["elbow.L"], "chest"),
    ("forearm.L", J["elbow.L"], J["hand.L"], "upperarm.L"),
    ("hand.L", J["hand.L"], J["hand.L"] + GRIP_DIR * 0.1, "forearm.L"),
    ("thigh.R", J["hip.R"], J["knee.R"], "hips"),
    ("shin.R", J["knee.R"], J["ankle.R"], "thigh.R"),
    ("foot.R", J["ankle.R"], J["ankle.R"] + Vector((0, 0.16, -0.05)), "shin.R"),
    ("thigh.L", J["hip.L"], J["knee.L"], "hips"),
    ("shin.L", J["knee.L"], J["ankle.L"], "thigh.L"),
    ("foot.L", J["ankle.L"], J["ankle.L"] + Vector((0, 0.16, -0.05)), "shin.L"),
]

arm_data = bpy.data.armatures.new("SoldierRig")
rig = bpy.data.objects.new("Soldier", arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, head, tail, parent in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = head, tail
    eb.roll = 0
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = False
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- body parts → one skinned mesh
parts = []


def part(o, bone):
    vg = o.vertex_groups.new(name=bone)
    vg.add(list(range(len(o.data.vertices))), 1.0, "REPLACE")
    parts.append(o)
    return o


# Legs: trousers, knee pads, boots.
for s, x in (("R", 0.1), ("L", -0.1)):
    part(cyl(f"thigh{s}", 0.085, J[f"hip.{s}"] + Vector((0, 0, 0.04)), J[f"knee.{s}"], M["uniform"], 10, 0.068), f"thigh.{s}")
    part(cyl(f"shin{s}", 0.066, J[f"knee.{s}"], J[f"ankle.{s}"] + Vector((0, 0, 0.06)), M["uniform"], 10, 0.056), f"shin.{s}")
    part(ball(f"kneepad{s}", 0.06, J[f"knee.{s}"] + Vector((0, 0.045, 0)), M["gear"], (0.9, 0.6, 1.1), 10, 6), f"shin.{s}")
    part(box(f"boot{s}", (0.11, 0.25, 0.1), J[f"ankle.{s}"] + Vector((0, 0.05, -0.04)), M["boot"], bevel=0.025), f"foot.{s}")
    part(box(f"sole{s}", (0.115, 0.26, 0.025), J[f"ankle.{s}"] + Vector((0, 0.05, -0.085)), M["poly"], bevel=0.008), f"foot.{s}")
    part(box(f"pocket{s}", (0.04, 0.11, 0.12), J[f"hip.{s}"] + Vector((x * 0.85, 0.0, -0.2)), M["uniform"], bevel=0.01), f"thigh.{s}")

# Hips and torso: belt, trousers top, shirt, plate carrier with pouches, backpack.
part(box("pelvis", (0.32, 0.2, 0.2), J["hips"] + Vector((0, 0, 0.0)), M["uniform"], bevel=0.04), "hips")
part(box("belt", (0.34, 0.215, 0.05), J["hips"] + Vector((0, 0, 0.09)), M["gear"], bevel=0.012), "hips")
part(box("buckle", (0.06, 0.02, 0.04), J["hips"] + Vector((0, 0.11, 0.09)), M["metal"], bevel=0.004), "hips")
part(box("belly", (0.3, 0.19, 0.26), J["spine"] + Vector((0, 0.0, 0.12)), M["uniform"], bevel=0.05), "spine")
part(box("chest", (0.38, 0.22, 0.26), J["chest"] + Vector((0, 0.0, 0.08)), M["uniform"], bevel=0.06), "chest")
part(box("vest", (0.36, 0.26, 0.3), J["chest"] + Vector((0, 0.005, 0.02)), M["gear"], bevel=0.03), "chest")
for i, x in enumerate((-0.11, 0.0, 0.11)):
    part(box(f"pouch{i}", (0.09, 0.05, 0.11), J["chest"] + Vector((x, 0.15, -0.06)), M["gear"], bevel=0.012), "chest")
part(box("patch", (0.08, 0.01, 0.05), J["chest"] + Vector((-0.1, 0.14, 0.09)), M["accent"], bevel=0.003), "chest")
part(box("pack", (0.28, 0.12, 0.3), J["chest"] + Vector((0, -0.18, -0.02)), M["gear"], bevel=0.035), "chest")
part(box("packtop", (0.24, 0.1, 0.06), J["chest"] + Vector((0, -0.18, 0.15)), M["accent"], bevel=0.02), "chest")
for s, x in (("R", 1), ("L", -1)):
    part(ball(f"shoulderpad{s}", 0.075, J[f"shoulder.{s}"] + Vector((0.02 * x, 0, 0.02)), M["uniform"], (1, 1, 0.9), 10, 6), "chest")
    part(box(f"armband{s}", (0.11, 0.11, 0.04), (J[f"shoulder.{s}"] * 0.55 + J[f"elbow.{s}"] * 0.45), M["accent"], bevel=0.01), f"upperarm.{s}")

# Arms: sleeves, forearms, gloves.
for s in ("R", "L"):
    part(cyl(f"upper{s}", 0.06, J[f"shoulder.{s}"], J[f"elbow.{s}"], M["uniform"], 8, 0.052), f"upperarm.{s}")
    part(ball(f"elbow{s}", 0.052, J[f"elbow.{s}"], M["uniform"], (1, 1, 1), 8, 6), f"forearm.{s}")
    part(cyl(f"fore{s}", 0.05, J[f"elbow.{s}"], J[f"hand.{s}"], M["skin"], 8, 0.042), f"forearm.{s}")
    part(cyl(f"cuff{s}", 0.053, J[f"elbow.{s}"].lerp(J[f"hand.{s}"], 0.55), J[f"elbow.{s}"].lerp(J[f"hand.{s}"], 0.8), M["glove"], 8), f"forearm.{s}")
    part(ball(f"glove{s}", 0.05, J[f"hand.{s}"] + Vector((0, 0.02, -0.01)), M["glove"], (0.8, 1.15, 1), 8, 6), f"hand.{s}")

# Head: neck, face, ears, helmet with a coloured band, goggles.
part(cyl("neck", 0.055, J["neck"] - Vector((0, 0, 0.03)), J["head"] + Vector((0, 0, 0.04)), M["skin"], 8), "neck")
part(box("face", (0.19, 0.2, 0.22), J["head"] + Vector((0, 0.01, 0.11)), M["skin"], bevel=0.06, smooth=True), "head")
part(box("nose", (0.035, 0.04, 0.05), J["head"] + Vector((0, 0.115, 0.1)), M["skin"], bevel=0.012, smooth=True), "head")
for x in (-1, 1):
    part(box(f"eye{x}", (0.03, 0.012, 0.026), J["head"] + Vector((0.045 * x, 0.108, 0.135)), M["poly"], bevel=0.005), "head")
    part(box(f"brow{x}", (0.05, 0.014, 0.012), J["head"] + Vector((0.045 * x, 0.11, 0.163)), M["boot"], bevel=0.004), "head")
part(box("jaw", (0.17, 0.05, 0.05), J["head"] + Vector((0, 0.07, 0.02)), M["boot"], bevel=0.015, smooth=True), "head")
for x in (-1, 1):
    part(ball(f"ear{x}", 0.03, J["head"] + Vector((0.097 * x, 0.0, 0.1)), M["skin"], (0.5, 1, 1.2), 8, 6), "head")
part(ball("helmet", 0.135, J["head"] + Vector((0, -0.005, 0.17)), M["uniform"], (1, 1.08, 0.82), 14, 9), "head")
part(box("helmetrim", (0.27, 0.29, 0.03), J["head"] + Vector((0, -0.005, 0.15)), M["gear"], bevel=0.014), "head")
part(box("helmetband", (0.275, 0.295, 0.025), J["head"] + Vector((0, -0.005, 0.185)), M["accent"], bevel=0.01), "head")
part(box("goggles", (0.18, 0.04, 0.05), J["head"] + Vector((0, 0.1, 0.205)), M["lens"], bevel=0.012), "head")
part(box("strap", (0.2, 0.18, 0.02), J["head"] + Vector((0, 0.0, 0.205)), M["poly"], bevel=0.005), "head")

bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = "SoldierBody"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
body.parent = rig
mod = body.modifiers.new("rig", "ARMATURE")
mod.object = rig

# ---------------------------------------------------------------- weapons
# Built around the grip at the origin, barrel along +Y; the bore sits GRIP_UP above the grip.
GRIP_UP = 0.065


def weapon(key, build):
    made = []
    build(made)
    bpy.ops.object.select_all(action="DESELECT")
    for o in made:
        o.select_set(True)
    bpy.context.view_layer.objects.active = made[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = key
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def rifle(m):
    m += [
        box("rcv", (0.05, 0.36, 0.07), (0, 0.08, GRIP_UP), M["metal"], bevel=0.006),
        box("hg", (0.055, 0.22, 0.06), (0, 0.36, GRIP_UP - 0.004), M["poly"], bevel=0.008),
        cyl("brl", 0.012, (0, 0.47, GRIP_UP + 0.008), (0, 0.66, GRIP_UP + 0.008), M["metal"], 8),
        cyl("flash", 0.017, (0, 0.62, GRIP_UP + 0.008), (0, 0.68, GRIP_UP + 0.008), M["poly"], 8),
        box("stock", (0.045, 0.2, 0.07), (0, -0.2, GRIP_UP - 0.01), M["poly"], bevel=0.01),
        box("tube", (0.03, 0.12, 0.03), (0, -0.07, GRIP_UP + 0.01), M["metal"], bevel=0.004),
        box("grip", (0.035, 0.05, 0.1), (0, -0.01, 0.01), M["poly"], (math.radians(-18), 0, 0), bevel=0.008),
        box("mag", (0.035, 0.07, 0.13), (0, 0.13, -0.02), M["metal"], (math.radians(14), 0, 0), bevel=0.006),
        box("rail", (0.03, 0.26, 0.014), (0, 0.16, GRIP_UP + 0.042), M["poly"], bevel=0.003),
        box("sight", (0.04, 0.07, 0.045), (0, 0.1, GRIP_UP + 0.07), M["metal"], bevel=0.006),
        box("lens", (0.03, 0.006, 0.03), (0, 0.067, GRIP_UP + 0.075), M["glass"], bevel=0.002),
    ]


def smg(m):
    m += [
        box("rcv", (0.05, 0.26, 0.075), (0, 0.06, GRIP_UP), M["poly"], bevel=0.01),
        cyl("brl", 0.012, (0, 0.19, GRIP_UP + 0.01), (0, 0.32, GRIP_UP + 0.01), M["metal"], 8),
        cyl("can", 0.02, (0, 0.24, GRIP_UP + 0.01), (0, 0.38, GRIP_UP + 0.01), M["metal"], 10),
        box("grip", (0.035, 0.05, 0.1), (0, -0.01, 0.01), M["poly"], (math.radians(-15), 0, 0), bevel=0.008),
        box("mag", (0.03, 0.04, 0.17), (0, 0.11, -0.05), M["metal"], bevel=0.005),
        box("stockA", (0.012, 0.18, 0.012), (0.018, -0.15, GRIP_UP), M["metal"], bevel=0.002),
        box("stockB", (0.012, 0.18, 0.012), (-0.018, -0.15, GRIP_UP), M["metal"], bevel=0.002),
        box("pad", (0.05, 0.02, 0.07), (0, -0.24, GRIP_UP - 0.01), M["poly"], bevel=0.006),
        box("sight", (0.03, 0.05, 0.035), (0, 0.04, GRIP_UP + 0.05), M["metal"], bevel=0.005),
        box("lens", (0.024, 0.005, 0.024), (0, 0.016, GRIP_UP + 0.055), M["glass"], bevel=0.002),
    ]


def pistol(m):
    m += [
        box("slide", (0.032, 0.19, 0.04), (0, 0.07, GRIP_UP - 0.005), M["metal"], bevel=0.005),
        box("frame", (0.03, 0.14, 0.025), (0, 0.06, GRIP_UP - 0.035), M["poly"], bevel=0.004),
        box("grip", (0.032, 0.05, 0.11), (0, -0.0, -0.005), M["poly"], (math.radians(-16), 0, 0), bevel=0.008),
        box("guard", (0.01, 0.05, 0.03), (0, 0.045, GRIP_UP - 0.06), M["poly"], bevel=0.003),
        cyl("brl", 0.007, (0, 0.16, GRIP_UP - 0.002), (0, 0.17, GRIP_UP - 0.002), M["poly"], 8),
    ]


def sniper(m):
    m += [
        box("rcv", (0.05, 0.34, 0.065), (0, 0.06, GRIP_UP), M["metal"], bevel=0.006),
        box("fore", (0.06, 0.32, 0.06), (0, 0.36, GRIP_UP - 0.008), M["tan"], bevel=0.012),
        cyl("brl", 0.013, (0, 0.5, GRIP_UP + 0.006), (0, 0.98, GRIP_UP + 0.006), M["metal"], 8, 0.011),
        cyl("brake", 0.02, (0, 0.95, GRIP_UP + 0.006), (0, 1.02, GRIP_UP + 0.006), M["metal"], 8),
        box("stock", (0.05, 0.28, 0.09), (0, -0.25, GRIP_UP - 0.02), M["tan"], bevel=0.015),
        box("cheek", (0.045, 0.14, 0.03), (0, -0.2, GRIP_UP + 0.035), M["tan"], bevel=0.01),
        box("grip", (0.035, 0.05, 0.1), (0, -0.01, 0.01), M["tan"], (math.radians(-20), 0, 0), bevel=0.01),
        box("mag", (0.035, 0.08, 0.06), (0, 0.11, 0.0), M["metal"], bevel=0.005),
        cyl("scope", 0.024, (0, 0.0, GRIP_UP + 0.085), (0, 0.3, GRIP_UP + 0.085), M["poly"], 12),
        cyl("bell", 0.034, (0, 0.24, GRIP_UP + 0.085), (0, 0.33, GRIP_UP + 0.085), M["poly"], 12, 0.024),
        cyl("eye", 0.028, (0, -0.06, GRIP_UP + 0.085), (0, 0.0, GRIP_UP + 0.085), M["poly"], 12),
        cyl("lens", 0.029, (0, 0.33, GRIP_UP + 0.085), (0, 0.335, GRIP_UP + 0.085), M["glass"], 12),
        box("mount", (0.03, 0.18, 0.03), (0, 0.13, GRIP_UP + 0.05), M["metal"], bevel=0.004),
    ]


def shotgun(m):
    m += [
        box("rcv", (0.052, 0.26, 0.075), (0, 0.06, GRIP_UP), M["metal"], bevel=0.008),
        cyl("brl", 0.016, (0, 0.18, GRIP_UP + 0.015), (0, 0.72, GRIP_UP + 0.015), M["metal"], 10),
        cyl("tube", 0.014, (0, 0.18, GRIP_UP - 0.022), (0, 0.62, GRIP_UP - 0.022), M["metal"], 10),
        box("pump", (0.055, 0.16, 0.05), (0, 0.42, GRIP_UP - 0.018), M["tan"], bevel=0.012),
        box("stock", (0.05, 0.3, 0.085), (0, -0.22, GRIP_UP - 0.025), M["tan"], (math.radians(4), 0, 0), bevel=0.014),
        box("grip", (0.035, 0.05, 0.09), (0, -0.02, 0.015), M["tan"], (math.radians(-25), 0, 0), bevel=0.01),
        box("bead", (0.008, 0.01, 0.01), (0, 0.71, GRIP_UP + 0.035), M["accent"], bevel=0.002),
    ]


BUILDERS = {"rifle": rifle, "smg": smg, "pistol": pistol, "sniper": sniper, "shotgun": shotgun}
MUZZLE = {"rifle": 0.68, "smg": 0.38, "pistol": 0.17, "sniper": 1.02, "shotgun": 0.72}
MUZZLE_UP = {"rifle": 0.008, "smg": 0.01, "pistol": -0.002, "sniper": 0.006, "shotgun": 0.015}

guns = {k: weapon(k, b) for k, b in BUILDERS.items()}


def muzzle_empty(key, parent):
    e = bpy.data.objects.new(f"muzzle_{key}", None)
    e.empty_display_size = 0.03
    scene.collection.objects.link(e)
    e.parent = parent
    e.location = (0, MUZZLE[key], GRIP_UP + MUZZLE_UP[key])
    return e


# ---------------------------------------------------------------- export the loose weapons (first-person)
os.makedirs(OUT, exist_ok=True)
loose = {}
for k, g in guns.items():
    c = g.copy()
    c.data = g.data.copy()
    c.name = f"fp_{k}"
    scene.collection.objects.link(c)
    c.location = (0, 0, 0)
    loose[k] = c
    m = muzzle_empty(k, c)
    m.name = f"fpmuzzle_{k}"

bpy.ops.object.select_all(action="DESELECT")
for c in loose.values():
    c.select_set(True)
    for ch in c.children:
        ch.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "weapons.glb"), export_format="GLB", use_selection=True, export_apply=True,
    export_animations=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
)
for c in loose.values():
    for ch in list(c.children):
        bpy.data.objects.remove(ch)
    bpy.data.objects.remove(c)

# Weapons in hand: grip at the right hand, barrel pointing forward (+Y), parented to the bone.
for k, g in guns.items():
    g.location = J["hand.R"] + Vector((0, 0, -0.035))
    bpy.context.view_layer.update()
    mw = g.matrix_world.copy()
    g.parent = rig
    g.parent_type = "BONE"
    g.parent_bone = "hand.R"
    bpy.context.view_layer.update()
    g.matrix_world = mw
    g.name = f"gun_{k}"
    muzzle_empty(k, g)

# ---------------------------------------------------------------- animations
pose = rig.pose
for pb in pose.bones:
    pb.rotation_mode = "QUATERNION"
REST = {b.name: b.matrix_local.to_quaternion() for b in arm_data.bones}


def q_arm(bone, x=0.0, y=0.0, z=0.0):
    """A rotation about the armature's axes (degrees, at the bone's head) as the bone's local rotation."""
    r = REST[bone]
    q = Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_quaternion()
    return r.inverted() @ q @ r


def key(frame, bone, x=0.0, y=0.0, z=0.0, loc=None):
    pb = pose.bones[bone]
    pb.rotation_quaternion = q_arm(bone, x, y, z)
    pb.keyframe_insert("rotation_quaternion", frame=frame)
    if loc is not None:
        # Location in armature axes → bone-local.
        pb.location = REST[bone].inverted() @ Vector(loc)
        pb.keyframe_insert("location", frame=frame)


def clear_pose():
    for pb in pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()


actions = []


def anim(name, frames, fn, loop=True):
    clear_pose()
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    fn(frames)
    if loop:
        for fc in getattr(act, "fcurves", []):
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
    actions.append(act)
    rig.animation_data.action = None


def gait(f, n, stride, lift, bob, lean, crouch=0.0, side=0.0, back=False):
    """A walk/run cycle: legs swing `stride` degrees, knees `lift`, body bobs and leans."""
    for i in range(0, n + 1, max(1, n // 8)):
        ph = 2 * math.pi * i / n
        s = math.sin(ph)
        sgn = -1 if back else 1
        fr = f + i
        drop = -crouch * 0.32 - abs(math.cos(ph)) * bob
        key(fr, "root", loc=(0, 0, 0))
        key(fr, "hips", x=0, z=s * 6 * (0 if side else 1), loc=(side * 0, 0, drop))
        key(fr, "spine", x=-lean - crouch * 18, z=-s * 4)
        key(fr, "chest", x=-crouch * 6, z=-s * 3)
        key(fr, "neck", x=lean * 0.6 + crouch * 14)
        for leg, ph2 in (("R", 0.0), ("L", math.pi)):
            sw = math.sin(ph + ph2)
            up = max(0.0, math.cos(ph + ph2))
            if side:
                # Sideways: legs swing out and cross instead of forward and back.
                key(fr, f"thigh.{leg}", x=crouch * 55 + up * lift * 0.4, y=sw * stride * side * 0.6)
            else:
                key(fr, f"thigh.{leg}", x=sgn * sw * stride + crouch * 55)
            key(fr, f"shin.{leg}", x=-(up * lift + crouch * 95))
            key(fr, f"foot.{leg}", x=crouch * 40 + (up * lift * 0.3))


anim("Idle", 60, lambda n: [
    (key(i, "root", loc=(0, 0, 0)), key(i, "hips", loc=(0, 0, -0.005 * math.sin(i / n * 2 * math.pi))),
     key(i, "spine", x=-2 + 1.2 * math.sin(i / n * 2 * math.pi)), key(i, "chest", x=0.8 * math.sin(i / n * 2 * math.pi + 1)),
     key(i, "neck", x=1, z=3 * math.sin(i / n * 2 * math.pi)))
    for i in range(0, n + 1, 15)
])
anim("Walk", 32, lambda n: gait(0, n, 26, 38, 0.02, 3))
anim("Run", 20, lambda n: gait(0, n, 40, 70, 0.045, 10))
anim("Back", 26, lambda n: gait(0, n, 24, 40, 0.025, -2, back=True))
anim("StrafeR", 24, lambda n: gait(0, n, 30, 45, 0.025, 2, side=1))
anim("StrafeL", 24, lambda n: gait(0, n, 30, 45, 0.025, 2, side=-1))
anim("Crouch", 60, lambda n: [
    (key(i, "root", loc=(0, 0, 0)), key(i, "hips", loc=(0, 0, -0.32 - 0.004 * math.sin(i / n * 2 * math.pi))),
     key(i, "spine", x=-18), key(i, "chest", x=-6 + 0.8 * math.sin(i / n * 2 * math.pi)), key(i, "neck", x=14),
     key(i, "thigh.R", x=60, y=-6), key(i, "shin.R", x=-100), key(i, "foot.R", x=40),
     key(i, "thigh.L", x=30, y=8), key(i, "shin.L", x=-110), key(i, "foot.L", x=80))
    for i in range(0, n + 1, 30)
])
anim("CrouchWalk", 36, lambda n: gait(0, n, 22, 30, 0.015, 0, crouch=1.0))


def jump(n):
    for fr, tuck, drop in ((0, 0, -0.06), (6, 30, 0.0), (14, 50, 0.0), (20, 20, -0.04)):
        key(fr, "root", loc=(0, 0, 0))
        key(fr, "hips", loc=(0, 0, drop))
        key(fr, "spine", x=-6)
        for leg, k2 in (("R", 1.0), ("L", 0.6)):
            key(fr, f"thigh.{leg}", x=tuck * k2)
            key(fr, f"shin.{leg}", x=-tuck * 1.6 * k2)
            key(fr, f"foot.{leg}", x=tuck * 0.3)


anim("Jump", 20, jump, loop=False)


def death(n):
    # Knees give, then a fall backward onto the street; the rifle drops with the hands.
    for fr, fall, drop, knee, arms in ((0, 0, 0, 0, 0), (6, 8, -0.12, 40, 10), (14, 55, -0.35, 60, 30), (20, 88, -0.62, 25, 45), (24, 90, -0.66, 15, 50), (n, 90, -0.66, 15, 50)):
        key(fr, "root", x=fall, loc=(0, -fall / 90 * 0.25, 0))
        key(fr, "hips", loc=(0, 0, drop + fall / 90 * 0.62))
        key(fr, "spine", x=fall * 0.12)
        key(fr, "neck", x=fall * 0.3, z=fall * 0.2)
        key(fr, "upperarm.R", x=-arms, y=arms * 0.4)
        key(fr, "upperarm.L", x=-arms * 1.2, y=-arms * 0.6)
        for leg in ("R", "L"):
            key(fr, f"thigh.{leg}", x=knee)
            key(fr, f"shin.{leg}", x=-knee * 1.6)


anim("Death", 40, death, loop=False)

# Every action as its own glTF animation.
for act in actions:
    track = rig.animation_data.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, 0, act)
    strip.name = act.name
    track.mute = True

# ---------------------------------------------------------------- export the soldier
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
for o in rig.children_recursive:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, "soldier.glb"), export_format="GLB", use_selection=True, export_apply=False,
    export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_step=2,
    export_optimize_animation_size=True, export_def_bones=False, export_rest_position_armature=True, export_anim_single_armature=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
)

tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print(f"[arena] soldier body ~{tris} tris; actions: {[a.name for a in actions]}")
for f in ("soldier.glb", "weapons.glb"):
    print(f"[arena] {f}: {os.path.getsize(os.path.join(OUT, f)) // 1024} KB")

# ---------------------------------------------------------------- optional preview render
if PREVIEW:
    for t in rig.animation_data.nla_tracks:
        t.mute = True
    rig.animation_data.action = None
    clear_pose()
    for k, g in guns.items():
        g.hide_render = k != "rifle"
    # A second soldier mid-run, to check the cycle reads.
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    cam.location = (1.9, 2.3, 1.55)
    cam.rotation_euler = Euler((math.radians(82), 0, math.radians(141)))
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = Euler((math.radians(40), 0, math.radians(120)))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.7, 1)
    scene.world = world
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 640, 720
    scene.render.filepath = PREVIEW
    frame_of = os.environ.get("ARENA_POSE")
    if frame_of:
        act = bpy.data.actions[frame_of]
        rig.animation_data.action = act
        scene.frame_set(int(os.environ.get("ARENA_FRAME", "5")))
    bpy.ops.render.render(write_still=True)
    print(f"[arena] preview → {PREVIEW}")
