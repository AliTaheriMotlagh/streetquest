#!/usr/bin/env bash
# Installs the product photo → 3D model tools into $P3D_DIR (default ~/.cache/streetquest-3d): a Python 3.11 venv with
# CPU-only PyTorch, TripoSR (MIT, VAST-AI + Stability AI) at a pinned commit and its weights (SHA-256-checked), rembg's
# background cutter. Linux x64 (the GitHub runner) and macOS arm64 (a Mac). Idempotent: a second run only checks.
# The workflow (.github/workflows/product3d.yml) keeps $P3D_DIR in the Actions cache keyed on this file's hash, so
# changing a pin below downloads again. Used by scripts/product3d/reconstruct.py through scripts/product3d/worker.ts.
set -euo pipefail

TRIPOSR_COMMIT=107cefdc244c39106fa830359024f6a2f1c78871
WEIGHTS_REV=5b521936b01fbe1890f6f9baed0254ab6351c04a
WEIGHTS_SHA=429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee
PY=3.11

P3D_DIR=${P3D_DIR:-$HOME/.cache/streetquest-3d}
mkdir -p "$P3D_DIR"
cd "$P3D_DIR"

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
retry() { for i in 1 2 3; do "$@" && return 0; echo "retry $i: $*"; sleep $((i * 10)); done; return 1; }

command -v uv >/dev/null || retry sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# TripoSR's code at the pinned commit (a tarball: no git history needed).
if [ ! -f "TripoSR-$TRIPOSR_COMMIT/tsr/system.py" ]; then
  retry curl -fsSL -o triposr.tar.gz "https://github.com/VAST-AI-Research/TripoSR/archive/$TRIPOSR_COMMIT.tar.gz"
  tar -xzf triposr.tar.gz && rm triposr.tar.gz
fi
ln -sfn "TripoSR-$TRIPOSR_COMMIT" triposr

# The weights (1.6 GB), resumable, checked.
if [ ! -f model.ckpt ] || [ "$(sha model.ckpt)" != "$WEIGHTS_SHA" ]; then
  retry curl -fL -C - -o model.ckpt.part "https://huggingface.co/stabilityai/TripoSR/resolve/$WEIGHTS_REV/model.ckpt" ||
    retry curl -fL -o model.ckpt.part "https://huggingface.co/stabilityai/TripoSR/resolve/$WEIGHTS_REV/model.ckpt"
  [ "$(sha model.ckpt.part)" = "$WEIGHTS_SHA" ] || { echo "::error::model.ckpt: SHA-256 mismatch"; rm -f model.ckpt.part; exit 1; }
  mv model.ckpt.part model.ckpt
fi
retry curl -fsSL -o config.yaml "https://huggingface.co/stabilityai/TripoSR/resolve/$WEIGHTS_REV/config.yaml"

# Python: CPU wheels only (no CUDA, ~10× smaller). torchmcubes (needs a C++ build) is replaced by PyMCubes's wheel —
# reconstruct.py puts a shim in its place.
[ -x venv/bin/python ] || uv venv --python "$PY" venv
idx=()
[ "$(uname -s)" = Linux ] && idx=(--index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple)
retry uv pip install --python venv/bin/python -q "${idx[@]}" \
  torch==2.5.1 numpy==1.26.4 omegaconf==2.3.0 Pillow==10.4.0 einops==0.7.0 transformers==4.35.0 \
  huggingface-hub==0.24.7 trimesh==4.0.5 PyMCubes==0.1.6 rembg==2.0.59 onnxruntime==1.19.2
# rembg's u2net model, fetched once into the cache (it would otherwise download on the first cutout).
U2NET_HOME="$P3D_DIR/u2net" venv/bin/python -c "from rembg import new_session; new_session('u2net')" >/dev/null
echo "product3d tools ready in $P3D_DIR"
