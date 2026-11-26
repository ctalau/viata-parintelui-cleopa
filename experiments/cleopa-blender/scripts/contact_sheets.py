"""Make review sheets from the delivered numbered Blender renders. Requires Pillow."""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
RENDERS = ROOT / "renders"
REVIEW = RENDERS / "review"
TIMING = json.loads((ROOT / "animations" / "timing.json").read_text())
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
INK = "#f6ddbd"
INK_DIM = "#c99b78"
PAPER = "#322522"


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size=size)


def read_frame(frames, frame):
    with Image.open(RENDERS / frames / f"frame_{frame:04d}.png") as source:
        return source.convert("RGB")


def grid(title, cells, columns, width, height, output):
    gap, padding, header, footer = 14, 25, 65, 29
    rows = (len(cells) + columns - 1) // columns
    canvas = Image.new("RGB", (
        padding * 2 + columns * width + (columns - 1) * gap,
        padding + header + rows * (height + footer) + (rows - 1) * gap,
    ), PAPER)
    text = ImageDraw.Draw(canvas)
    text.text((padding, 19), title, font=font(29), fill=INK)
    for index, (label, image) in enumerate(cells):
        x = padding + (index % columns) * (width + gap)
        y = header + (index // columns) * (height + footer + gap)
        thumbnail = ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS)
        canvas.paste(thumbnail, (x, y))
        text.text((x + 1, y + height + 6), label, font=font(15), fill=INK_DIM)
    canvas.save(REVIEW / output, quality=93, subsampling=0, optimize=True)


def study():
    frames = (
        (1, "Neutral"), (33, "Forehead"), (49, "Chest"), (64, "Right shoulder"),
        (79, "Left shoulder"), (98, "Hand down"), (104, "Blink"),
    )
    cells = []
    for frame, label in frames:
        image = read_frame("cross_frames", frame)
        x, y = image.size
        image = image.crop((round(x * .29), 0, round(x * .71), y))
        cells.append((f"{frame:03}  {label}", image))
    grid("Cleopa · Orthodox sign of the cross", cells, 4, 262, 348, "cleopa_cross_contact_sheet.jpg")


def family():
    frames = (
        (1, "Settle"), (44, "Forehead"), (60, "Chest"), (76, "Right shoulder"),
        (92, "Left shoulder"), (120, "Hand down"), (240, "Prayer"),
        (576, "Close of prayer"), (590, "Amen"), (620, "Forehead"),
        (636, "Chest"), (652, "Right shoulder"), (668, "Left shoulder"),
        (720, "Return"),
    )
    cells = [(f"{frame:03}  {label}", read_frame("frames", frame)) for frame, label in frames]
    grid("Prayer at the table · Scene review", cells, 4, 410, 231, "prayer_contact_sheet.jpg")
    read_frame("frames", 240).save(REVIEW / "prayer_poster.jpg",
                                   quality=95, subsampling=0, optimize=True)


def actor_contacts(gesture):
    positions = (-6.18, -3.91, -1.52, .90, 3.31, 5.92)
    labels = ("Father", "Older brother I", "Older brother II", "Cleopa", "Mother", "Priest")
    vertical_bounds = ((395, 827), (443, 831), (424, 822), (460, 829), (401, 825), (354, 814))
    landmarks = ("Forehead", "Chest", "Right shoulder", "Left shoulder")
    cells = []
    for base, landmark in zip(TIMING["contact_frames_leader"][gesture], landmarks):
        for identifier, name, x, (top, bottom) in zip(TIMING["characters"], labels, positions, vertical_bounds):
            number = base + TIMING["offset_frames"][identifier]
            image = read_frame("frames", number)
            center = round((x + 8) * 120)
            radius = round((bottom - top) / 3)
            image = image.crop((center-radius, top, center+radius, bottom))
            display = f"{name} · {number:03}"
            if name == "Father":
                display = f"{landmark} · {number:03}"
            cells.append((display, image))
    stage = "Opening" if gesture == "first" else "Closing"
    grid(f"{stage} cross · Individual contact frames", cells, 6, 207, 310,
         f"{gesture}_cross_contacts.jpg")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=("study", "first", "family", "all"), default="all", nargs="?")
    target = parser.parse_args().target
    REVIEW.mkdir(parents=True, exist_ok=True)
    if target in ("study", "all"):
        study()
    if target in ("first", "family", "all"):
        actor_contacts("first")
    if target in ("family", "all"):
        family()
        actor_contacts("second")
