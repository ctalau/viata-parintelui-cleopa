"""Encode the numbered Blender PNGs and verify the resulting video streams."""
import argparse
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RENDERS = ROOT / "renders"


def run(*args):
    subprocess.run(args, check=True)


def check_sequence(directory, count, expected_size=None):
    frames = sorted(directory.glob("frame_*.png"))
    assert [frame.name for frame in frames] == [
        f"frame_{n:04d}.png" for n in range(1, count + 1)
    ], f"Incomplete or unexpected numbering in {directory}"
    size = expected_size
    for frame in frames:
        with frame.open("rb") as stream:
            header = stream.read(24)
        assert header[:8] == b"\x89PNG\r\n\x1a\n", frame
        dims = struct.unpack(">II", header[16:24])
        size = size or dims
        assert dims == size, (frame, dims)
    return size


def encode_mp4(source, out, final_size=None):
    scaling = ("-vf", f"scale={final_size[0]}:{final_size[1]}:flags=lanczos") if final_size else ()
    run("ffmpeg", "-y", "-v", "error", "-filter_threads", "2",
        "-framerate", "24", "-start_number", "1", "-i", str(source / "frame_%04d.png"),
        *scaling, "-c:v", "libx264", "-threads", "3", "-preset", "medium",
        "-pix_fmt", "yuv420p", "-crf", "17", "-movflags", "+faststart", str(out))


def encode_gif(source, out):
    graph = (
        "[0:v]fps=12,scale=720:-1:flags=lanczos,split[picture][colors];"
        "[colors]palettegen[palette];"
        "[picture][palette]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
    )
    run("ffmpeg", "-y", "-v", "error", "-filter_complex_threads", "2",
        "-i", str(source), "-filter_complex", graph, "-loop", "0", str(out))


def probe(out, count, dimensions, duration):
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-count_frames", "-show_streams",
        "-show_format", "-of", "json", str(out),
    ])
    metadata = json.loads(output)
    streams = metadata["streams"]
    assert len(streams) == 1 and streams[0]["codec_type"] == "video"
    stream = streams[0]
    assert int(stream["nb_read_frames"]) == count, stream
    assert (stream["width"], stream["height"]) == dimensions, stream
    assert abs(float(metadata["format"]["duration"]) - duration) <= .04, metadata["format"]
    if out.suffix == ".mp4":
        assert stream["avg_frame_rate"] == "24/1", stream
    print(out.name, stream["codec_name"], dimensions, count, "frames",
          metadata["format"]["duration"], "seconds", flush=True)


def export_study():
    source = RENDERS / "cross_frames"
    check_sequence(source, 108)
    out = RENDERS / "cleopa_cross_test.mp4"
    encode_mp4(source, out, (1280, 720))
    probe(out, 108, (1280, 720), 4.5)


def export_family():
    source = RENDERS / "frames"
    check_sequence(source, 720, (1920, 1080))
    mp4 = RENDERS / "prayer_at_table.mp4"
    gif = RENDERS / "prayer_at_table.gif"
    encode_mp4(source, mp4)
    probe(mp4, 720, (1920, 1080), 30)
    encode_gif(mp4, gif)
    probe(gif, 360, (720, 405), 30)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=("study", "family", "all"), default="all", nargs="?")
    target = parser.parse_args().target
    if target in ("study", "all"):
        export_study()
    if target in ("family", "all"):
        export_family()
