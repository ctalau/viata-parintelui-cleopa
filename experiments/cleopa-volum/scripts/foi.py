"""Lay out the Workbench frames of each stress test as a contact sheet (WebP)."""
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

EXPERIMENT = Path(__file__).resolve().parents[1]
FRAMES = EXPERIMENT/"renders"/"cadre"
OUT = EXPERIMENT.parents[1]/"studio"/"volum"/"foi"

tests = defaultdict(list)
for path in sorted(FRAMES.glob("*.png")):
    test, frame = path.stem.rsplit("_", 1)
    tests[test].append((int(frame), path))
OUT.mkdir(parents=True, exist_ok=True)
for test, shots in tests.items():
    sheet = Image.new("RGB", (640*3, 360*2), "#31251d")
    draw = ImageDraw.Draw(sheet)
    for i, (frame, path) in enumerate(sorted(shots)[:6]):
        with Image.open(path) as image:
            sheet.paste(image.convert("RGB"), ((i % 3)*640, (i//3)*360))
        draw.text(((i % 3)*640+10, (i//3)*360+8), f"cadrul {frame}", fill="#3a2925")
    sheet.save(OUT/f"{test}.webp", quality=80)
    print("FOAIE", test, len(shots))
