"""Converts the harness's grabs (PNG/JPEG, full size) to raw RGBA at grab size,
what the film pipeline's sync reads.

    uv run --with pillow python -I png2rgba.py <img_dir> <frames_dir> <W>x<H>
"""

import sys
from pathlib import Path

from PIL import Image

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
w, h = (int(v) for v in sys.argv[3].split("x"))
dst.mkdir(parents=True, exist_ok=True)
for p in sorted(src.glob("*.*")):
    im = Image.open(p).convert("RGBA").resize((w, h), Image.Resampling.BOX)
    (dst / f"{p.stem}.rgba").write_bytes(im.tobytes())
