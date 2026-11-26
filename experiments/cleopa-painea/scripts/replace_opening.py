"""Replace only frames 1–252; preserve the existing soundtrack and later action.

Usage: python scripts/replace_opening.py previous.mp4 opening_frames/
Render odd PNG frames 1–251 into opening_frames before running this command.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile

from export_episode import FPS, OUTPUT, RENDERS, TIMING, verify_export


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous', type=Path)
    parser.add_argument('frames', type=Path)
    args = parser.parse_args()
    end = TIMING['beats'][1]['start'] - 1
    expected = [f'frame_{frame:04}.png' for frame in range(1, end + 1, 2)]
    assert sorted(p.name for p in args.frames.glob('frame_*.png')) == expected
    duration = TIMING['end'] / FPS
    bitrate = int(4_650_000 * 8 / duration / 1000 - 64)
    with tempfile.TemporaryDirectory(dir=RENDERS, prefix='.opening-') as work:
        movie = Path(work) / OUTPUT.name
        encoded = Path(work) / 'picture.mp4'
        filters = (
            f'[0:v]fps={FPS},scale=768:432:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[opening];'
            f'[1:v]trim=start_frame={end},setpts=PTS-STARTPTS,setsar=1[rest];'
            '[opening][rest]concat=n=2:v=1:a=0[film]'
        )
        base = ['ffmpeg', '-y', '-v', 'error', '-filter_complex_threads', '2',
                '-framerate', str(FPS // 2), '-pattern_type', 'glob', '-i',
                str(args.frames / 'frame_*.png'), '-i', str(args.previous),
                '-filter_complex', filters, '-map', '[film]',
                '-r', str(FPS), '-fps_mode', 'cfr', '-frames:v', str(TIMING['end']),
                '-c:v', 'libx264', '-threads', '3', '-preset', 'medium',
                '-b:v', f'{bitrate}k', '-pix_fmt', 'yuv420p',
                '-passlogfile', str(Path(work) / 'x264')]
        subprocess.run([*base, '-pass', '1', '-an', '-f', 'null', '-'], check=True)
        subprocess.run([*base, '-pass', '2', '-an', str(encoded)], check=True)
        # Mux separately so the frame limit cannot discard the final audio packet.
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(encoded),
                        '-i', str(args.previous), '-map', '0:v:0', '-map', '1:a:0',
                        '-c', 'copy', '-movflags', '+faststart', str(movie)], check=True)
        verify_export(movie)
        movie.replace(OUTPUT)


if __name__ == '__main__':
    main()
