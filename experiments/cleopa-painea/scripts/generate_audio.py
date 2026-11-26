"""Generate the script's voices and score through OpenRouter."""
import argparse
from array import array
from base64 import b64decode
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
import statistics
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import wave

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "audio"
SPEC = json.loads((ROOT / "scenariu.json").read_text())
FALLBACK_TTS = "google/gemini-3.1-flash-tts-preview"


def request(endpoint, payload):
    url = "https://openrouter.ai/api/v1/" + endpoint
    body = json.dumps(payload, ensure_ascii=False).encode()
    req = Request(url, data=body, headers={
        "Authorization": "Bearer " + os.environ["OPENROUTER_API_KEY"],
        "Content-Type": "application/json",
        "X-Title": "Micutul Cleopa",
    })
    for retry in range(3):
        try:
            with urlopen(req, timeout=120) as response:
                return response.headers.get("Content-Type", ""), response.read()
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or retry == 2:
                raise ValueError(f"OpenRouter {error.code} · {error.read(270).decode(errors='replace')}") from error
        except URLError:
            if retry == 2:
                raise
        time.sleep(2 ** retry)


def normalized_voice(pcm, rate):
    samples = array("h")
    samples.frombytes(pcm)
    peak = max(map(abs, samples))
    if peak < 300:
        raise ValueError("Voce aproape mută")
    cutoff = max(100, peak * .019)
    window = rate // 50
    audible = [
        i for i in range(0, len(samples), window)
        if sum(abs(x) for x in samples[i:i + window]) / window > cutoff
    ]
    if not audible:
        raise ValueError("Voce fără silabe detectabile")
    start = max(0, audible[0] - 2 * window)
    end = min(len(samples), audible[-1] + 4 * window)
    samples = samples[start:end]
    rms = math.sqrt(sum(x*x for x in samples) / len(samples))
    gain = min(7600 / rms, 28300 / max(map(abs, samples)))
    return array("h", (round(x * gain) for x in samples)).tobytes()


def duration_of(path):
    with wave.open(str(path)) as sound:
        return round(sound.getnframes() / sound.getframerate(), 5)


def synthesize(out, speaker, text, model, delivery=""):
    voice, style = SPEC["voices"][speaker]
    content_type, pcm = request("audio/speech", {
        "model": model,
        "voice": voice,
        "input": text,
        "instructions": (style + " " + delivery).strip() + " Spune exact textul în română. O singură voce, fără muzică.",
        "response_format": "pcm",
    })
    if "pcm" not in content_type or len(pcm) < 4800 or len(pcm) % 2:
        raise ValueError(f"Date TTS invalide pentru {out.name}")
    rate = int(content_type.split("rate=")[1].split(";")[0]) if "rate=" in content_type else 24000
    samples = normalized_voice(pcm, rate)
    temporary = out.with_suffix(".tmp")
    with wave.open(str(temporary), "wb") as sound:
        sound.setparams((1, 2, rate, 0, "NONE", ""))
        sound.writeframes(samples)
    temporary.replace(out)


def generate_chorus(out, speakers, text, model):
    rate = 24000
    with TemporaryDirectory(dir=AUDIO, prefix=".cor-") as temporary:
        paths = [Path(temporary) / f"{speaker}.wav" for speaker in speakers]
        for path, speaker in zip(paths, speakers):
            synthesize(path, speaker, text, model,
                       "Rostește rar și liniștit, în ritmul unei rugăciuni de dimineață.")
        lengths = [duration_of(path) for path in paths]
        target = statistics.median(lengths)
        mix = [0.0] * round((target + 1) * rate)
        for index, (path, length) in enumerate(zip(paths, lengths)):
            pcm = array("h")
            pcm.frombytes(subprocess.check_output([
                "ffmpeg", "-v", "error", "-i", str(path), "-af",
                f"atempo={max(.5, min(2, length / target))}",
                "-ar", str(rate), "-ac", "1", "-f", "s16le", "-",
            ]))
            offset = index * rate // 65
            if len(mix) < offset + len(pcm):
                mix.extend([0.0] * (offset + len(pcm) - len(mix)))
            # The adults lead and the children's voices remain audible underneath.
            gain = (.42, .31, .29, .31)[index]
            for i, sample in enumerate(pcm, offset):
                mix[i] += gain * sample
        end = max(i for i, sample in enumerate(mix) if abs(sample) > 15)
        pcm = array("h", (round(max(-28000, min(28000, sample))) for sample in mix[:end+1]))
        with wave.open(str(out.with_suffix(".tmp")), "wb") as sound:
            sound.setparams((1, 2, rate, 0, "NONE", ""))
            sound.writeframes(pcm.tobytes())
        out.with_suffix(".tmp").replace(out)


def generate_line(job):
    file, speaker, text, model, force, delivery = job
    out = AUDIO / file
    if force or not out.exists():
        chorus = SPEC.get("chorus", {})
        if speaker in chorus:
            generate_chorus(out, chorus[speaker], text, model)
        else:
            synthesize(out, speaker, text, model, delivery)
        print(file, model, f"{duration_of(out):.2f}s", flush=True)
    return file, duration_of(out)


def generate_music():
    out = AUDIO / "lyria.mp3"
    if out.exists():
        return
    _, response = request("chat/completions", {
        "model": SPEC["music_model"],
        "stream": True,
        "modalities": ["text", "audio"],
        "messages": [{"role": "user", "content": SPEC["music_prompt"]}],
    })
    blocks = []
    for line in response.splitlines():
        if not line.startswith(b"data: ") or b"[DONE]" in line:
            continue
        item = json.loads(line[6:])
        for choice in item.get("choices", []):
            audio = choice.get("delta", {}).get("audio") or {}
            if audio.get("data"):
                blocks.append(b64decode(audio["data"]))
    if not blocks:
        raise ValueError("Lyria a terminat fără audio")
    out.write_bytes(b"".join(blocks))
    print(out.name, SPEC["music_model"], out.stat().st_size, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=SPEC["tts_model"])
    parser.add_argument("--music-only", action="store_true")
    parser.add_argument("--force", nargs="+", default=[], metavar="CUE")
    args = parser.parse_args()
    AUDIO.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        music_job = pool.submit(generate_music)
        if args.music_only:
            music_job.result()
            return
        model = args.model
        jobs = [
            (f"{beat['page']:02d}-{i:02d}.wav", speaker, text, model,
             f"{beat['page']:02d}-{i:02d}" in args.force, beat.get("delivery", {}).get(str(i), ""))
            for beat in SPEC["beats"]
            for i, (speaker, text) in enumerate(beat["lines"], 1)
        ]
        try:
            first = generate_line(jobs[0])
        except ValueError as error:
            if model == FALLBACK_TTS or not any(code in str(error) for code in ("400", "404")):
                raise
            model = FALLBACK_TTS
            jobs = [(*job[:3], model, *job[4:]) for job in jobs]
            first = generate_line(jobs[0])
        lengths = dict([first, *pool.map(generate_line, jobs[1:])])
        music_job.result()
    manifest = {"tts_model": model, "music_model": SPEC["music_model"], "durations": lengths}
    (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
