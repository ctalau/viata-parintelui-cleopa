"""Anvelopele vocilor pentru gura personajelor (lib/engine/lipsync.js).

    python3 tools/engine/envelopes.py experiments/cleopa-painea/audio episodes/001-painea-care-poate-sa-astepte

Pentru fiecare fișier WAV: energia medie |x| a ferestrei de 0,1 s de la fiecare 3 cadre (24 fps),
exact ca build_episode.voice.
"""
from array import array
import json
from pathlib import Path
import sys
import wave

source, episode = map(Path, sys.argv[1:3])
fps = json.loads((episode/"episode.json").read_text())["fps"]
timeline = json.loads((episode/"timeline.json").read_text())
out = {}
for beat in timeline["beats"]:
    for cue in beat["cues"]:
        with wave.open(str(source/cue["file"])) as sound:
            rate = sound.getframerate()
            samples = array("h")
            samples.frombytes(sound.readframes(sound.getnframes()))
        energy = []
        for f in range(cue["start"], cue["end"], 3):
            j = round((f-cue["start"])*rate/fps)
            window = samples[j:j+rate//10]
            energy.append(round(sum(abs(n) for n in window)/max(len(window), 1)))
        out[cue["file"]] = {"rate": rate, "samples": len(samples), "energy": energy}
(episode/"audio").mkdir(exist_ok=True)
(episode/"audio"/"envelopes.json").write_text(json.dumps(out))
print("ENVELOPES_OK", len(out))
