"""Fixture de paritate pentru lib/engine/palm25d.js (palme25d.py: proxy, proiecție, volume C).

    python3 tools/engine/palm_fixture.py   → tests/fixtures/engine/palm25d.json
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/"experiments"/"cleopa-painea"/"scripts"))
import palme25d as P  # noqa: E402

cases = []
for id_, side, wrist, direction, pose, palm in (
    ("mama", "R", (-.46, 1.17), (-.20, .98), "stop", None),
    ("tata", "R", (-.27, 1.67), (.32, .95), "cup", (.40, .25, -.88)),
    ("mihai", "L", (.45, .36), (-.96, .21), "grip", None),
    ("tata", "R", (-.98, .30), (-.30, -.95), "open", (-.55, .1, .83)),
    ("costica", "R", (-.88, .58), (-.99, .10), "reach", None),
    ("mama", "L", (.52, .10), (-.12, -1), "reach", None),
):
    p = json.loads((ROOT/"assets"/"characters"/f"{id_}.json").read_text())["profile"]
    depth = P.default_depth(p, side, wrist)
    arm = P.arm_points(p, side, wrist, depth)
    palm = palm or P.default_palm(pose, side)
    q = P.orientation(direction, palm, side)
    g = P.GESTURES[P.POSE_GESTURE[pose]]
    rig = P.hand_rig(p, side, arm["W"], q, g)
    h = P.project_rig(rig, P.camera_for(side))
    h["k"] = P.HAND_PER_CM*p["hand"]
    built = P.build_volume(h, memory=None, hand=P.hand_of(p), lw=.029*p["hand"])
    cases.append({"id": id_, "side": side, "wrist": wrist, "dir": direction, "pose": pose, "palm": palm,
                  "depth": depth, "W": arm["W"], "order": built["order"],
                  "groups": [{"id": gr["id"], "fill": gr.get("fill"),
                              "shapes": [s.get("pts") or [s["a"], s["b"], s["ra"], s["rb"]] for s in gr["shapes"]],
                              "details": [d["t"] for d in gr["details"]]} for gr in built["groups"]]})
out = ROOT/"tests"/"fixtures"/"engine"/"palm25d.json"
out.write_text(json.dumps(cases))
print("scris", out, len(cases))
