"""Save an editable still with Tata on the far side of the yard fence."""
import argparse
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_episode import BEATS, actor, collection, finish_action, head, short_beard, stand


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Destination PNG")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    frame = BEATS["trezire"]["start"] + 38
    yard = bpy.data.collections["Ograda în zori · cocoșul și Grăsuțu"]
    pivot = yard.objects[f"{yard.name} · origine decor"]
    cast = collection("Probă · Tata dincolo de gard", yard)
    father = actor(cast, "father", "Tata · dincolo de gard", (.95, .29, -4.2), .55, look=-1)
    father["rig"].parent = pivot
    short_beard(father)
    stand(father, frame)
    head(father["rig"], frame, .015, .065)
    finish_action(father["rig"], father["action"])

    scene.frame_set(frame)
    scene.render.filepath = str(output)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.with_suffix(".blend")), compress=True)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
