"""Set shot timing from the measured voices and build the audio beds."""
import json
from math import pi, sin
from pathlib import Path
import subprocess
import wave

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "audio"
FPS = 24
RATE = 24000


def frames(seconds):
    return max(2, int(np.ceil(seconds * FPS / 2)) * 2)


def write_wave(path, samples):
    pcm = np.rint(np.clip(samples, -.998, .998) * 32767).astype("<i2")
    channels = samples.shape[1] if samples.ndim > 1 else 1
    with wave.open(str(path), "wb") as snd:
        snd.setparams((channels, 2, RATE, 0, "NONE", ""))
        snd.writeframes(pcm.tobytes())


def cue_wave(path, duration, kind):
    def sound(t):
        if kind == "burta":
            power = max(0, sin(pi*t/duration)) ** .73
            warble = 2*pi*(78*t+6*sin(7*t)+.54*sin(29*t))
            return power*(.095*sin(warble)+.045*sin(2*warble)+.022*sin(3*warble))
        if kind == "grohait":
            power = max(0, sin(pi*t/duration)) ** 1.8
            root = 2*pi*(140*t-54*t*t)
            return power*(.076*sin(root)+.042*sin(2.04*root)+.021*sin(4*root))
        support = max(0, sin(pi*t/duration)) ** .88
        phase = t/duration
        formant = 2*pi*(568*t-88*t*t+8*sin(15*t))
        attack = .51 + .43*sin(2*pi*(3.7*phase+.17))
        return support*attack*(.073*sin(formant)+.030*sin(formant*2)+.015*sin(formant*3))
    samples = np.fromiter((sound(i/RATE) for i in range(round(RATE*duration))), dtype=np.float32)
    write_wave(path, samples)


def build_timing(spec, lengths):
    next_frame = 1
    timeline = []
    for beat in spec["beats"]:
        start = next_frame
        next_frame += frames(beat["lead"])
        cues = []
        for index,(speaker,text) in enumerate(beat["lines"],1):
            file = f"{beat['page']:02d}-{index:02d}.wav"
            length = frames(lengths[file])
            cues.append({"speaker":speaker,"text":text,"file":file,"start":next_frame,"end":next_frame+length})
            next_frame += length
            if index != len(beat["lines"]):
                next_frame += frames(.38 if beat["page"] in (2, 8, 10) else .24)
        next_frame += frames(beat["tail"])
        timeline.append(dict(page=beat["page"],id=beat["id"],start=start,end=next_frame,cues=cues))
    return timeline


def add_effects(beats):
    effects = [
        ("cocos", beats[1]["start"] + 4, .66),
        ("burta", beats[2]["start"] + 1, .59),
        ("grohait", beats[3]["cues"][-1]["end"] + 2, .48),
    ]
    result = []
    for kind, start, duration in effects:
        file = kind + ".wav"
        cue_wave(AUDIO / file,duration,kind)
        result.append(dict(file=file,start=start,end=start+frames(duration)))
    return result


def decoded(path, channels):
    raw = subprocess.check_output([
        "ffmpeg","-v","error","-i",str(path),"-ar",str(RATE),"-ac",str(channels),"-f","f32le","-",
    ])
    return np.frombuffer(raw,dtype="<f4").reshape(-1,channels)


def make_mix(cues, effects, end):
    size = (end - 1) * RATE // FPS
    source = decoded(AUDIO/"lyria.mp3",2)
    overlap = RATE * 2
    loop_length = len(source) - overlap
    assert loop_length > RATE*8, "Clipul muzical este prea scurt."
    stride = np.arange(size)
    in_loop = stride % loop_length
    music = source[in_loop].copy()
    in_fade = (in_loop < overlap) & (stride >= loop_length)
    cross = (in_loop[in_fade]/overlap)[:, None]
    music[in_fade] = source[loop_length+in_loop[in_fade]] * (1-cross) + music[in_fade] * cross
    t = stride / RATE
    duck = np.zeros(size, dtype=np.float32)
    full_voice = np.zeros((size,2), dtype=np.float32)
    for cue in (*cues, *effects):
        sample = (cue["start"]-1) * RATE // FPS
        values = decoded(AUDIO/cue["file"],1)
        n = min(size-sample,len(values))
        full_voice[sample:sample+n] += values[:n]
        if cue in cues:
            start = sample/RATE
            end_time = start+n/RATE
            envelope = np.minimum(np.clip((t-(start-.22))/.22,0,1),
                                  np.clip(((end_time+.50)-t)/.50,0,1))
            np.maximum(duck, envelope, out=duck)
    rms = float(np.sqrt(np.mean(source**2)))
    music *= (min(.44,.061/max(.001,rms))*(1-.57*duck))[:,None]
    music *= np.minimum(np.clip(t/.45,0,1), np.clip((size/RATE-t)/1.9,0,1))[:,None]
    mix = music + full_voice
    assert np.max(np.abs(mix)) < .98, "Mix peste nivelul maxim."
    write_wave(AUDIO/"mix.wav",mix)
    subprocess.run([
        "ffmpeg","-y","-v","error","-f","f32le","-ar",str(RATE),"-ac","2","-i","-",
        "-codec:a","libmp3lame","-q:a","3",str(AUDIO/"music-bed.mp3"),
    ],input=music.astype("<f4").tobytes(),check=True)


def main():
    spec = json.loads((ROOT/"scenariu.json").read_text())
    manifest = json.loads((AUDIO/"manifest.json").read_text())
    beats = build_timing(spec,manifest["durations"])
    cues = [cue for beat in beats for cue in beat["cues"]]
    effects = add_effects(beats)
    end = beats[-1]["end"]
    assert end % 2 == 1
    (ROOT/"timeline.json").write_text(json.dumps({
        "fps":FPS,"end":end-1,"beats":beats,"effects":effects,
    },indent=2,ensure_ascii=False)+"\n")
    make_mix(cues,effects,end)
    for beat in beats:
        print(beat["page"], beat["id"], beat["start"], beat["end"]-1,
              f"{(beat['end']-beat['start'])/FPS:.2f}s")
    print("Total",end-1,"cadre",f"{(end-1)/FPS:.2f}s",flush=True)


if __name__ == "__main__":
    main()
