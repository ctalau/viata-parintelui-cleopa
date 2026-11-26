"""Export the camera-aligned yard layers for the studio editor."""
from pathlib import Path

import bpy


def main():
    scene = bpy.context.scene
    yard = bpy.data.collections["Ograda în zori · cocoșul și Grăsuțu"]
    landscape = yard.children["Ograda · 01 Peisaj și vegetație"]
    fence = yard.children["Ograda · 02 Gard și magazie"]
    scene.frame_set(next(mark.frame for mark in scene.timeline_markers
                         if mark.name == "Cocoșul și purcelușul") + 38)
    output = Path(__file__).resolve().parents[1] / "renders" / "ograda-straturi"
    output.mkdir(parents=True, exist_ok=True)
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    visibility = {obj: obj.hide_render for obj in yard.all_objects if obj.type == "MESH"}
    for name, objects in (
        ("peisaj", landscape.objects),
        ("gard-magazie", fence.objects),
        ("animale", yard.objects),
    ):
        visible = set(objects)
        for obj, hidden in visibility.items():
            obj.hide_render = hidden or obj not in visible
        scene.render.filepath = str(output / f"{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
