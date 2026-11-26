"""A product photo -> a 3D model (.glb), for scripts/product3d/worker.ts. Long-lived: TripoSR (1.6 GB) is loaded once,
then jobs come in as JSON lines on stdin and answers go out as JSON lines on stdout (logs go to stderr):

  in : {"id": "p…", "image": "/path/photo.jpg", "out": "/path/raw.glb", "res": 192}
  out: {"id": "p…", "ok": true, "fg": 0.41, "parts": 1, "colorVar": 0.12, "box": [w, h, d], "triangles": 51234, "seconds": 74.2}
       {"id": "p…", "ok": false, "why": "cutout" | "reconstruct", "error": "…"}

Steps per photo: cut the background (rembg u2net), refuse a photo with no single object in it, centre it on grey as
TripoSR wants, reconstruct, keep the main pieces (drop floating specks), turn it y-up facing +z, fix the winding, export
with vertex colours. Simplifying and compressing is the worker's (gltf-transform + meshoptimizer, like the owner scans).
Runs from setup.sh's venv: $P3D_DIR/venv/bin/python -I scripts/product3d/reconstruct.py
"""
import json
import os
import sys
import time
import types

P3D_DIR = os.environ.get("P3D_DIR", os.path.expanduser("~/.cache/streetquest-3d"))
os.environ.setdefault("U2NET_HOME", os.path.join(P3D_DIR, "u2net"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
sys.path.insert(0, os.path.join(P3D_DIR, "triposr"))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import mcubes  # noqa: E402

# TripoSR imports torchmcubes (a C++/CUDA build). PyMCubes does the same on the CPU from a wheel. torchmcubes returns
# vertices in reversed axis order (TripoSR swaps them back with [..., [2, 1, 0]]), so the shim reverses them too.
def _marching_cubes(level, threshold):
    v, f = mcubes.marching_cubes(level.detach().cpu().numpy().astype(np.float64), float(threshold))
    return torch.from_numpy(np.ascontiguousarray(v[:, ::-1]).astype(np.float32)), torch.from_numpy(f.astype(np.int64))

sys.modules["torchmcubes"] = types.SimpleNamespace(marching_cubes=_marching_cubes)

import trimesh  # noqa: E402
from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402
from tsr.system import TSR  # noqa: E402
from tsr.utils import resize_foreground  # noqa: E402


def log(*a):
    print(*a, file=sys.stderr, flush=True)


torch.set_num_threads(max(1, os.cpu_count() or 4))
t0 = time.time()
MODEL = TSR.from_pretrained(P3D_DIR, config_name="config.yaml", weight_name="model.ckpt")
MODEL.renderer.set_chunk_size(8192)
MODEL.to("cpu")
REMBG = new_session("u2net")
log(f"TripoSR ready in {time.time() - t0:.1f}s")


def cut(path):
    """The photo with its background cut away (RGBA), and how much of it is the object."""
    img = Image.open(path).convert("RGB")
    rgba = remove(img, session=REMBG)
    a = np.asarray(rgba)[:, :, 3].astype(np.float32) / 255.0
    return rgba, float((a > 0.5).mean())


def keep_main(mesh):
    """Drop floating specks: keep pieces with at least 5 % of the biggest piece's faces."""
    labels = trimesh.graph.connected_component_labels(mesh.face_adjacency, node_count=len(mesh.faces))
    sizes = np.bincount(labels)
    keep = np.where(sizes >= max(8, 0.05 * sizes.max()))[0]
    mask = np.isin(labels, keep)
    if mask.all():
        return mesh, len(sizes)
    m = mesh.submesh([np.where(mask)[0]], append=True)
    return m, len(sizes)


def make(job):
    t = time.time()
    rgba, fg = cut(job["image"])
    if fg < 0.03:
        return {"ok": False, "why": "cutout", "error": f"no object in the photo (foreground {fg:.3f})", "fg": fg}
    if fg > 0.985:
        return {"ok": False, "why": "cutout", "error": "the background couldn't be cut (the whole photo is foreground)", "fg": fg}
    img = resize_foreground(rgba, 0.85)
    arr = np.asarray(img).astype(np.float32) / 255.0
    arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
    img = Image.fromarray((arr * 255.0).astype(np.uint8))
    with torch.no_grad():
        codes = MODEL([img], device="cpu")
        mesh = MODEL.extract_mesh(codes, True, resolution=int(job.get("res", 192)))[0]
    if len(mesh.faces) < 50:
        return {"ok": False, "why": "reconstruct", "error": f"empty model ({len(mesh.faces)} faces)", "fg": fg}
    mesh, parts = keep_main(mesh)
    # TripoSR is z-up; glTF is y-up with the front towards +z (the same turn TripoSR's own viewer makes).
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    trimesh.repair.fix_winding(mesh)
    trimesh.repair.fix_inversion(mesh)
    # Stand it on y = 0, centred.
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    cols = mesh.visual.vertex_colors[:, :3].astype(np.float32) / 255.0 if mesh.visual.kind == "vertex" else np.zeros((1, 3))
    mesh.export(job["out"], file_type="glb")
    return {
        "ok": True, "fg": round(fg, 4), "parts": int(parts), "colorVar": round(float(cols.std(axis=0).mean()), 4),
        "box": [round(float(x), 4) for x in mesh.extents], "triangles": int(len(mesh.faces)), "seconds": round(time.time() - t, 1),
    }


print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        job = json.loads(line)
    except ValueError:
        continue
    try:
        out = make(job)
    except Exception as e:  # one bad photo never stops the batch
        out = {"ok": False, "why": "reconstruct", "error": f"{type(e).__name__}: {e}"[:300]}
    out["id"] = job.get("id")
    print(json.dumps(out), flush=True)
