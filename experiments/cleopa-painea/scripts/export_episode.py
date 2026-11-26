"""Encode the sampled drawings at 24 fps with the measured Romanian soundtrack."""
import json
from pathlib import Path
import struct
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
RENDERS=ROOT/"renders"
TIMING=json.loads((ROOT/"timeline.json").read_text())
FPS=TIMING["fps"]
DRAWING_SIZE=(1280,720)
VIDEO_SIZE=(768,432)
DOWNLOAD_LIMIT=5_000_000
OUTPUT=RENDERS/"painea_care_poate_sa_astepte.mp4"


def check_drawings():
    paths=sorted((RENDERS/"frames").glob("frame_*.png"))
    expected=[f"frame_{frame:04}.png" for frame in range(1,TIMING["end"]+1,2)]
    assert [path.name for path in paths]==expected, (len(paths),len(expected))
    for path in paths:
        with path.open("rb") as image:
            header=image.read(24)
        assert header[:8]==b"\x89PNG\r\n\x1a\n",path
        assert struct.unpack(">II",header[16:24])==DRAWING_SIZE,path


def encode():
    duration = TIMING["end"]/FPS
    # Leave room for AAC and MP4 overhead below the download limit.
    bitrate = int(4_700_000*8/duration/1000-64)
    with tempfile.TemporaryDirectory(dir=RENDERS,prefix=".cleopa-encode-") as work:
        frames = str(RENDERS/"frames"/"frame_*.png")
        video_input = ("-framerate",str(FPS//2),"-pattern_type","glob","-i",frames)
        width,height = VIDEO_SIZE
        options = (
            "-vf",f"fps={FPS},scale={width}:{height}:flags=lanczos",
            "-c:v","libx264","-threads","3","-preset","medium","-b:v",f"{bitrate}k",
            "-pix_fmt","yuv420p","-passlogfile",str(Path(work)/"x264"),
        )
        ffmpeg = ("ffmpeg","-y","-v","error","-filter_threads","2")
        subprocess.run([*ffmpeg,*video_input,*options,
                        "-pass","1","-an","-f","null","-"],check=True)
        movie = Path(work)/OUTPUT.name
        subprocess.run([
            *ffmpeg,*video_input,"-i",str(ROOT/"audio"/"mix.wav"),
            "-map","0:v","-map","1:a",*options,"-pass","2",
            "-c:a","aac","-b:a","64k","-movflags","+faststart",str(movie),
        ],check=True)
        verify_export(movie)
        movie.replace(OUTPUT)


def verify_export(movie):
    result=subprocess.check_output([
        "ffprobe","-v","error","-count_frames","-show_streams","-show_format","-of","json",str(movie),
    ])
    metadata=json.loads(result)
    visual=next(s for s in metadata["streams"] if s["codec_type"]=="video")
    sound=next(s for s in metadata["streams"] if s["codec_type"]=="audio")
    assert (visual["width"],visual["height"])==VIDEO_SIZE
    assert visual["avg_frame_rate"]==f"{FPS}/1"
    assert int(visual["nb_read_frames"])==TIMING["end"]
    assert abs(float(visual["duration"])-float(sound["duration"]))<.025
    assert sound["channels"]==2
    assert movie.stat().st_size < DOWNLOAD_LIMIT, movie.stat().st_size
    print("MEDIA_OK",OUTPUT.name,TIMING["end"],"cadre",visual["duration"],"secunde, stereo",flush=True)


def contact_sheet():
    width,height=489,275
    gutter=14
    beats=TIMING["beats"]
    rows=(len(beats)+1)//2
    canvas=Image.new("RGB",(2*width+3*gutter,rows*(height+37)+78),"#38261f")
    text=ImageDraw.Draw(canvas)
    title="Micuțul Cleopa · Pâinea care poate să aștepte"
    bold=ImageFont.truetype("DejaVuSans.ttf",27)
    regular=ImageFont.truetype("DejaVuSans.ttf",15)
    text.text((gutter,15),title,fill="#fae5bf",font=bold)
    original_labels={
        "sat":"Satul în zori","trezire":"Trezirea","burtica":"Ghiorrr!","troaca":"La troacă",
        "mihai":"Mihai și cartea","cuptor":"Pâinea caldă","traista":"Drumul spre școală",
        "aproape":"Încă puțin…","prag":"Tata în prag","intai":"Întâi ne rugăm",
    }
    for index,beat in enumerate(beats):
        label=beat.get("title") or original_labels[beat["id"]]
        f=beat["cues"][-1]["start"]+10 if beat["cues"] else (beat["start"]+beat["end"])//2
        if beat["id"]=="sat":
            f=29
        elif beat["id"]=="trezire":
            f=beat["start"]+16
        elif beat["id"]=="burtica":
            f=beat["start"]+8
        f=min(f,beat["end"]-1)
        f=f if f%2 else f-1
        with Image.open(RENDERS/"frames"/f"frame_{f:04}.png") as full:
            preview=full.resize((width,height), Image.Resampling.LANCZOS)
        x=gutter+(index%2)*(width+gutter)
        y=60+(index//2)*(height+37)
        canvas.paste(preview,(x,y))
        text.text((x,y+height+5),f"{index+1:02d}  {label}",fill="#e5be93",font=regular)
    canvas.save(RENDERS/"foaie_contact.jpg",quality=93,subsampling=0,optimize=True)


if __name__=="__main__":
    check_drawings()
    encode()
    contact_sheet()
