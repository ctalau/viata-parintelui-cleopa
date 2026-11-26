"""Proof the Romanian voice tracks through OpenRouter."""
import argparse
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
import json
from pathlib import Path
import re
import unicodedata

from generate_audio import request

ROOT = Path(__file__).resolve().parents[1]
TRANSCRIPTION_MODEL = "google/gemini-3.8-flash"


def completion(messages):
    _, raw = request("chat/completions", {
        "model": TRANSCRIPTION_MODEL, "messages": messages, "temperature": .1,
    })
    return json.loads(raw)["choices"][0]["message"]["content"]


def words(text):
    replacements = {"2":"doi","3":"trei"}
    text = "".join(c for c in unicodedata.normalize("NFD",text.casefold())
                   if not unicodedata.combining(c))
    return [replacements.get(word,word) for word in re.findall(r"\w+",text)]


def verify(cue):
    file = cue["file"]
    data = b64encode((ROOT/"audio"/file).read_bytes()).decode()
    response = completion([{"role": "user", "content": [
        {"type":"text","text":"Transcrie exact și integral cuvintele auzite în limba română. Doar transcrierea."},
        {"type":"input_audio","input_audio":{"data":data,"format":"wav"}},
    ]}])
    ratio = SequenceMatcher(a=words(cue["text"]),b=words(response),autojunk=False).ratio()
    print(file, f"{ratio:.2f}", response.replace("\n"," "), flush=True)
    return file, {"score":round(ratio,3),"text":response}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--cues",nargs="+",help="IDs clips WAV, fără extensie.")
    args=parser.parse_args()
    timing=json.loads((ROOT/"timeline.json").read_text())
    cues=[cue for beat in timing["beats"] for cue in beat["cues"]]
    with ThreadPoolExecutor(max_workers=4) as pool:
        selected = [cue for cue in cues if not args.cues or Path(cue["file"]).stem in args.cues]
        checks=dict(pool.map(verify,selected))
    report=ROOT/"audio"/"transcrieri.json"
    if args.cues and report.exists():
        checks = dict(json.loads(report.read_text()),**checks)
    report.write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n")


if __name__ == "__main__":
    main()
