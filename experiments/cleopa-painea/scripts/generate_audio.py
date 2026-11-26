"""Generate the script's voices and score through OpenRouter."""
import argparse
from array import array
from base64 import b64decode
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
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


def generate_line(job):
    file, speaker, text, model, force = job
    out = AUDIO / file
    if out.exists() and not force:
        with wave.open(str(out)) as sound:
            return file, round(sound.getnframes() / sound.getframerate(), 5)
    voice, style = SPEC["voices"][speaker]
    content_type, pcm = request("audio/speech", {
        "model": model,
        "voice": voice,
        "input": text,
        "instructions": style + " Spune exact textul în română. O singură voce, fără muzică.",
        "response_format": "pcm",
    })
    if "pcm" not in content_type or len(pcm) < 4800 or len(pcm) % 2:
        raise ValueError(f"Date TTS invalide pentru {file}")
    rate = int(content_type.split("rate=")[1].split(";")[0]) if "rate=" in content_type else 24000
    samples = normalized_voice(pcm, rate)
    temporary = out.with_suffix(".tmp")
    with wave.open(str(temporary), "wb") as sound:
        sound.setparams((1, 2, rate, 0, "NONE", ""))
        sound.writeframes(samples)
    temporary.replace(out)
    duration = round(len(samples) / (2 * rate), 5)
    print(file, model, f"{duration:.2f}s", flush=True)
    return file, duration


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
             f"{beat['page']:02d}-{i:02d}" in args.force)
            for beat in SPEC["beats"]
            for i, (speaker, text) in enumerate(beat["lines"], 1)
        ]
        try:
            first = generate_line(jobs[0])
        except ValueError as error:
            if model == FALLBACK_TTS or not any(code in str(error) for code in ("400", "404")):
                raise
            model = FALLBACK_TTS
            jobs = [(*job[:3], model, job[-1]) for job in jobs]
            first = generate_line(jobs[0])
        lengths = dict([first, *pool.map(generate_line, jobs[1:])])
        music_job.result()
    manifest = {"tts_model": model, "music_model": SPEC["music_model"], "durations": lengths}
    (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
