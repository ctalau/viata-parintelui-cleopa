"""Fixture de paritate pentru lib/engine/arm25d.js: palme25d.py pe profilurile personajelor.

    python3 tools/engine/arm_fixture.py   → tests/fixtures/engine/arm25d.json
"""
import json
from math import atan2
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/"experiments"/"cleopa-painea"/"scripts"))
import palme25d as P  # noqa: E402

cases = []
for id_ in ("mama", "tata", "costica", "mihai"):
    p = json.loads((ROOT/"assets"/"characters"/f"{id_}.json").read_text())["profile"]
    for side, wrist, direction in (("R", (-.46, 1.17), (-.20, .98)), ("R", (-1.0, .62), (-.26, -.97)),
                                   ("L", (.62, .42), (-.96, .24)), ("R", (-.27, 1.67), (.32, .95)),
                                   ("L", (1.25, .85), (.95, .28)), ("R", (-.9, .3), (-.3, -.95))):
        depth = P.default_depth(p, side, wrist)
        rotations, scales, pts = P.solve_arm(p, side, wrist, atan2(direction[0], -direction[1]), depth)
        cases.append({"id": id_, "side": side, "wrist": wrist, "dir": direction, "depth": depth,
                      "rotations": rotations, "scales": scales, "E": pts["E"], "W": pts["W"]})
out = ROOT/"tests"/"fixtures"/"engine"/"arm25d.json"
out.write_text(json.dumps(cases))
print("scris", out, len(cases))
