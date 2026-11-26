"""Package the episode's revised rigs as collection assets for later episodes."""
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_episode import ROOT, actor, finish_action, setup, stand


def main():
    scene = setup('Familia · riguri pentru episoadele Cleopa', width=20, end=1, center=(0, .25))
    ids = ('mother', 'cleopa', 'brother_01', 'brother_02', 'father', 'priest')
    for index, design in enumerate(ids):
        character = actor(scene.collection, design, design, (3.1 * (index - 2.5), 0, 0))
        rig = character['rig']
        rig.location.y = character['p']['leg'] - 1.8
        stand(character, 1)
        finish_action(rig, character['action'])
        rig.animation_data.action = None
        bpy.data.actions.remove(character['action'])
        coll = character['collection']
        coll.instance_offset = rig.location
        coll.asset_mark()
        coll.asset_data.description = (
            f"{character['p']['label']}. Rig 2D cu umăr ancorat, mânecă continuă și șase forme de palmă."
        )
        for side in ('R', 'L'):
            fingers = rig.pose.bones['hand.' + side].tail
            knee = rig.pose.bones['shin.' + side].head
            assert fingers.y > knee.y + .22, (design, side)
    scene.frame_set(1)
    path = ROOT / 'assets' / 'family_rigs.blend'
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    print('FAMILY_LIBRARY_OK', len(ids), path)


if __name__ == '__main__':
    main()
