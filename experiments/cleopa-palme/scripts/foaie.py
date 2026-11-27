"""Compune foaia de contact din randările lui `randeaza_momente.py` (Pillow).

    python3 foaie.py ../renders/baza ../renders/foaie_baza.jpg "Linia de bază"
"""
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from momente import moments  # noqa: E402

source, target, heading = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
phase = int(sys.argv[4]) if len(sys.argv) > 4 else 1
rows = [m for m in moments() if (phase == 2) == (not m[1].startswith("Mama"))]
rows = [m for m in rows if (source/f"{m[0]}_0_aproape.png").exists()]
cell, film, pad, label = 300, (300, 169), 10, 34
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
width = pad+3*(cell+pad)
height = 50+len(rows)*(label+cell+film[1]+2*pad)
sheet = Image.new("RGB", (width, height), (246, 236, 214))
draw = ImageDraw.Draw(sheet)
draw.text((pad, 14), heading, font=font, fill=(70, 45, 35))
y = 50
for id_, actor, title, frames in rows:
    draw.text((pad, y+8), f"{title} · {actor}", font=font, fill=(70, 45, 35))
    y += label
    for i, frame in enumerate(frames):
        x = pad+i*(cell+pad)
        sheet.paste(Image.open(source/f"{id_}_{i}_aproape.png").convert("RGB").resize((cell, cell)), (x, y))
        sheet.paste(Image.open(source/f"{id_}_{i}_film.png").convert("RGB").resize(film), (x, y+cell+pad//2))
        tag = ("pregătire", "contact", "revenire")[i]
        draw.rectangle((x, y, x+120, y+20), fill=(246, 236, 214))
        draw.text((x+4, y+3), f"{tag} · {frame}", font=small, fill=(70, 45, 35))
    y += cell+film[1]+2*pad
sheet.save(target, quality=88)
print("FOAIE", target, len(rows), "momente")
