# Cleopa · Prayer at the table

This 30-second cartoon stages a meal prayer in an early twentieth-century Moldavian farmhouse. The six-person gathering is a dramatization. The drawings are original editable cut-outs, built in Blender from vector paths in the Python source.

## Open the project

- `scenes/prayer_at_table.blend` contains the full six-character performance and layered set.
- `scenes/cleopa_cross_test.blend` contains Cleopa’s separate 4.5-second gesture study.
- `assets/characters/<id>/<id>.blend` contains the standalone neutral rig for each character. Each character has a named Asset Browser collection, six reusable Actions and a manifest.
- `assets/backgrounds/farmhouse.blend` and `assets/props/tableware.blend` supply appendable collections from the set.
- `renders/prayer_at_table.mp4`, `renders/prayer_at_table.gif` and `renders/cleopa_cross_test.mp4` are the playback files. Contact sheets in `renders/review/` show the reviewed poses.
- `assets/audio/README.md` contains the Romanian working prayer and instructions for timing a recording. The current performance and exports are silent.

## Edit or reuse a rig

Open a character’s library to see its neutral pose. To move a rig into a different file, use File → Append and select its `CHAR_<id>` collection. Append the desired Actions from the library’s Action folder, select the armature and assign an Action from the Dope Sheet’s Action Editor. Choose the matching armature slot if your Blender version exposes slots. Use Make Local when you need to edit a linked copy.

Enable viewport overlays to see the pose bones. The root moves the whole drawing. The arm and leg bones pose the limbs, and the head bone carries the hair, ears, eyes and mouth drawings. The hand, eye and mouth variants are integer custom properties on the armature object. Their tooltips list the available drawings. Clear previous pose transforms and reset drawing properties to 0 before auditioning a different standalone Action. Each reusable Action keys only the channels required for that performance.

The crosses in the main scene are keyed on the anatomical right arm. The right hand goes to the forehead, sternum, own right shoulder and own left shoulder. Blender’s timeline marks the main beats. `animations/timing.json` lists the contact frames and each character’s offset. The name prefix of each Action identifies its character.

## Rebuild and render

Run these commands from the project root. Blender 4.3.2 and FFmpeg 7.1.5 were used for this delivery. Pillow is only needed for the optional contact sheets.

```bash
blender -b --factory-startup --python-exit-code 1 --python scripts/smoke_test.py
blender -b --factory-startup --python-exit-code 1 --python scripts/build_scene.py -- --test
blender -b --factory-startup --python-exit-code 1 --python scripts/build_scene.py -- --rigs
blender -b --factory-startup --python-exit-code 1 --python scripts/build_scene.py
blender -b --factory-startup --python-exit-code 1 --python scripts/verify_project.py

mkdir -p renders/frames renders/cross_frames
blender -b scenes/cleopa_cross_test.blend --python-expr 'import bpy; bpy.context.scene.render.resolution_percentage = 67' -o //../renders/cross_frames/frame_#### -F PNG -a
blender -b scenes/prayer_at_table.blend -o //../renders/frames/frame_#### -F PNG -a
python3 scripts/export_media.py
python3 scripts/contact_sheets.py
```

The render engine uses flat Workbench materials with antialiasing, and the meshes also have emission shaders for use in other lit or rendered scenes. The Python source, saved Blender files, manifests and numbered renders use paths relative to the project root. `STATUS.md` records the validation results.
