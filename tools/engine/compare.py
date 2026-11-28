"""Foaie comparativă: motorul Three.js (stânga) lângă filmul Blender (dreapta), pe planuri.

    python3 tools/engine/compare.py <episod> <film.mp4> [cadre…]   → episodes/<episod>/renders/comparatie.jpg

Fără cadre: mijlocul fiecăruia dintre planurile din episode.json.
"""
import json
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
episode_id, film, *frames = sys.argv[1:]
ep = json.loads((ROOT/"episodes"/episode_id/"episode.json").read_text())
shots = ep["shots"]
if not frames:
    ends = [s["at"] for s in shots[1:]]+[ep["frames"]+1]
    frames = [(s["at"]+e)//2 for s, e in zip(shots, ends)]
frames = [int(f) for f in frames]
out = ROOT/"episodes"/episode_id/"renders"/"compare"
out.mkdir(parents=True, exist_ok=True)
subprocess.run(["node", str(ROOT/"tools/engine/stills.mjs"), episode_id, ",".join(map(str, frames)), "--out", str(out), "--w", "960"], check=True)
W, H = 960, 540
sheet = Image.new("RGB", (2*W, H*len(frames)), "white")
for i, f in enumerate(frames):
    ref = out/f"ref{f:04}.png"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{(f-1)/ep['fps']:.4f}", "-i", film, "-frames:v", "1", "-s", f"{W}x{H}", str(ref)], check=True)
    sheet.paste(Image.open(out/f"f{f:04}.png").convert("RGB").resize((W, H)), (0, i*H))
    sheet.paste(Image.open(ref).convert("RGB").resize((W, H)), (W, i*H))
    d = ImageDraw.Draw(sheet)
    d.rectangle((0, i*H, 360, i*H+26), fill=(40, 30, 25))
    d.text((8, i*H+6), f"{f} · Three.js | Blender", fill="white")
path = ROOT/"episodes"/episode_id/"renders"/"comparatie.jpg"
sheet.save(path, quality=85)
print("COMPARE_OK", path, len(frames))
