"""Paritatea portului Python (palme25d.py) cu implementarea de referință din studio/palme/.

    python3 tests/palme25d_test.py

Fixture-urile sunt scrise de `node tools/palme-fixtures.mjs`. Toleranța este 1e-6.
"""
from pathlib import Path
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"experiments"/"cleopa-painea"/"scripts"))
import palme25d as P  # noqa: E402

FIXTURES = ROOT/"tests"/"fixtures"/"palme"
TOL = 1e-6


def close(a, b, where):
    if isinstance(b, (list, tuple)):
        assert len(a) == len(b), f"{where}: {len(a)} ≠ {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, f"{where}[{i}]")
    elif b is None:
        assert a is None, f"{where}: {a} ≠ None"
    else:
        # Fixture-urile au 10 cifre semnificative.
        assert abs(a-b) <= TOL*max(1, abs(b)), f"{where}: {a} ≠ {b}"


def shape(s):
    if s["t"] == "poly":
        return {"t": s["t"], "pts": s["pts"]}
    return {k: s[k] for k in ("t", "a", "b", "ra", "rb", "z")}


def detail(d):
    if d["t"] == "nail":
        return {k: d[k] for k in ("t", "c", "angle", "rx", "ry")}
    if d["t"] == "line":
        return {"t": d["t"], "pts": d["pts"]}
    return {"t": d["t"], "c": d["c"], "r": d["r"]}


def compare(mine, theirs, where):
    if isinstance(theirs, dict):
        assert set(mine) == set(theirs), f"{where}: {sorted(mine)} ≠ {sorted(theirs)}"
        for key in theirs:
            compare(mine[key], theirs[key], f"{where}.{key}")
    elif isinstance(theirs, str):
        assert mine == theirs, f"{where}: {mine!r} ≠ {theirs!r}"
    elif isinstance(theirs, list) and theirs and isinstance(theirs[0], dict):
        assert len(mine) == len(theirs), where
        for i, (a, b) in enumerate(zip(mine, theirs)):
            compare(a, b, f"{where}[{i}]")
    else:
        close(mine, theirs, where)


class Parity(unittest.TestCase):
    def test_fixtures_exist(self):
        self.assertEqual(sorted(p.stem for p in FIXTURES.glob("*.json")), sorted(t["id"] for t in P.TESTS))

    def test_every_stress_test(self):
        for path in sorted(FIXTURES.glob("*.json")):
            data = json.loads(path.read_text())
            test = P.TESTS_BY_ID[data["test"]]
            volume = P.Volume()
            cam_spec = data["camera"]
            for frame in data["frames"]:
                where = f"{data['test']} @ {frame['time']:.4f}s"
                pose = P.pose_at(test, frame["time"])
                rig = P.solve(pose)
                cam = P.Camera(yaw=pose["cam"], **cam_spec)
                h = P.project_rig(rig, cam)
                built = volume.build(h)
                mine = {
                    "time": frame["time"], "q": list(pose["q"]), "cam": pose["cam"],
                    "S": h["S"], "E": h["E"], "W": h["W"], "contact": h["contact"], "miss": rig["miss"],
                    "axes": [h["axes"]["x"], h["axes"]["y"], h["axes"]["z"]],
                    "digits": [d["pts"] for d in h["digits"]],
                    "screenUp": P.screen_up(h["axes"]),
                    "target": P.contact_at(test, frame["time"]),
                    "order": built["order"],
                    "groups": [{"id": g["id"], "z": g["z"], "fill": g.get("fill"),
                                "shapes": [shape(s) for s in g["shapes"]],
                                "details": [detail(d) for d in g["details"]]} for g in built["groups"]],
                }
                # `fill` e o culoare în JS și un nume de ton în Python.
                for g in frame["groups"]:
                    g["fill"] = P.SHADE if g["fill"] else None
                compare(mine, frame, where)


class Contracts(unittest.TestCase):
    def test_left_hand_is_the_mirrored_right(self):
        """Mâna stângă nu are geometrie proprie: e dreapta rezolvată în oglindă și reflectată."""
        pose = P.pose_at(P.TESTS_BY_ID["rasucire"], .7)
        twice = P.mirror_pose(P.mirror_pose(pose))
        close(list(twice["q"]), list(pose["q"]), "involuție")
        right = P.solve(pose)
        left = P.solve(P.mirror_pose(pose), shoulder=(14, 118, 0))
        close(left["W"], (-right["W"][0], right["W"][1], right["W"][2]), "încheietura")
        # Cu palma spre cameră, degetul mare drept e în stânga încheieturii pe ecran.
        self.assertLess(right["digits"][0]["pts"][3][0], right["W"][0])

    def test_flipped_triangle(self):
        rest = ((0, 0), (1, 0), (0, 1))
        self.assertFalse(P.flipped(rest, rest))
        self.assertTrue(P.flipped(rest, ((0, 0), (0, 1), (1, 0))))

    def test_anchor_keeps_the_contact(self):
        place = P.anchor_drawing((10, 20), (.3, -.8), 1.1, 2.5)
        close(place((.3, -.8)), (10, 20), "contact")


if __name__ == "__main__":
    unittest.main(verbosity=2)
