# Delivery status

The editable family scene, Cleopa gesture study, six standalone character rigs and appendable set collections were built with Blender’s Python API. The family scene plays for 30 seconds at 24 fps. Cleopa’s study plays for 4.5 seconds at 24 fps.

## Environment

- Blender 4.3.2 at `/usr/bin/blender` and FFmpeg / FFprobe 7.1.5. The workspace had more than 60 GB free at the start of the final render.
- The included smoke test reached its render step on the first run. This Blender build lacks OpenImageDenoise, so denoising was disabled for the simple smoke-test render. A second run saved the test armature and PNG and reported `SMOKE_OK`.
- No Blender MCP server was configured. All production stages used Blender’s background CLI.
- All five references were inspected. Their bytes match the original handoff archive.

## Implementation

- `scenes/prayer_at_table.blend` contains the orthographic shot, layered farmhouse and tableware, and independent family performances.
- `scenes/cleopa_cross_test.blend` contains the initial study, with markers at the four contact frames, lowering and blink.
- `assets/characters/` contains six full armatures with 18 bones each, editable bone-parented mesh pieces, facial and hand drawings, and manifests. Each library contains `idle_breathe`, `blink`, `head_bow`, `pray_speech`, `cross_orthodox_R` and `sit_idle`. The arms use planar FK generated from wrist targets and a projected elbow solve.
- `assets/backgrounds/` and `assets/props/` contain appendable farmhouse and tableware collections. `scripts/` contains the build, verification, export and review source. `animations/timing.json` records the scene beats and individual contact offsets.
- The fixed orthographic shot uses faces drawn with a slight three-quarter turn. The priest leads the silent working performance, with staggered mouth movement, blinks, bows and breaths.

## Checks and corrections

- Rendered and reviewed Cleopa’s neutral, blink and contact drawings before completing the family scene. Raised the forehead contact and widened the study’s camera framing to include both resting hands.
- Reviewed family drafts, widened the gaps between resting sleeves by narrowing them and lowering the elbows, and corrected an Euler wrap that made the priest’s arm move during the prayer.
- Checked elbow and wrist transforms frame by frame across both gestures. Revised the depth projection around shoulder height to smooth the raise and lowering between contacts. The largest frame-to-frame joint movement in the final family check was 0.230 scene units.
- Reopened the scenes and all six rig libraries in a fresh Blender process. Checked four study contacts, 48 family contacts and 24 reusable clip contacts, with the hand variant active on anatomical right. Confirmed camera framing, separate Actions, face and hand switches in viewport and render, stable resting arms during the prayer, and local append of the set and props. Appended Cleopa’s rig and cross Action to a blank scene and checked its four contacts again.
- The main sequence was resumed after the elbow correction. The finished opening-gesture PNGs were replaced with frames from the revised scene. Unaffected idle frames were retained. Full rebuilds render directly from the current saved scene.

## Exported media

| File | Dimensions | Rate | Frames | Duration |
| --- | --- | --- | --- | --- |
| `renders/prayer_at_table.mp4` | 1920 × 1080 | 24 fps | 720 | 30.0 s |
| `renders/prayer_at_table.gif` | 720 × 405 | 12 fps | 360 | 30.0 s |
| `renders/cleopa_cross_test.mp4` | 1280 × 720 | 24 fps | 108 | 4.5 s |

FFprobe decoded and counted the video frames. The GIF’s infinite loop flag was checked separately. Decoded samples from both family exports and the source contact sheets were visually reviewed. The complete PNG sequences are in `renders/frames/` and `renders/cross_frames/` in the workspace. The portable ZIP contains editable files, sources, references, playback files and review sheets.

## Reproduce

Run from the project root using the commands in `README.md`. Use `scripts/build_scene.py` for the family scene or pass `-- --test` and `-- --rigs` for the study and neutral libraries. Use `scripts/verify_project.py` to reopen and check the saved data. After rendering the numbered PNG sequences, run `python3 scripts/export_media.py` and `python3 scripts/contact_sheets.py`.

## Audio

The handoff included a working Romanian prayer text and timing, with audio absent. The exports are silent and the mouth keys are provisional. The text and recording sync instructions are available in `assets/audio/README.md`.
