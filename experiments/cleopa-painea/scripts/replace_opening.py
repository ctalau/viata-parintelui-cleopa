"""Replace an opening shot and copy the existing soundtrack.

Render the selected shot's odd PNG frames as frame_NNNN.png.
Use --shot 1 for the village or --shot 2 for the rooster and piglet.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile

from export_episode import FPS, OUTPUT, RENDERS, TIMING, VIDEO_SIZE, verify_export


def shot_bounds(shot):
    village, wake = TIMING['beats'][:2]
    if shot == 1:
        return village['start'], wake['start']
    return wake['start'], wake['cues'][1]['start'] - 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('previous', type=Path)
    parser.add_argument('frames', type=Path)
    parser.add_argument('--shot', choices=(1, 2), default=1, type=int)
    args = parser.parse_args()
    first, next_cut = shot_bounds(args.shot)
    expected = [f'frame_{frame:04}.png' for frame in range(first, next_cut, 2)]
    if sorted(p.name for p in args.frames.glob('frame_*.png')) != expected:
        parser.error(f'expected every other frame from {expected[0]} to {expected[-1]}')
    duration = TIMING['end'] / FPS
    bitrate = int(4_650_000 * 8 / duration / 1000 - 64)
    width, height = VIDEO_SIZE
    filters = [
        f'[0:v]fps={FPS},scale={width}:{height}:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[shot]',
        f'[1:v]trim=start_frame={next_cut - 1},setpts=PTS-STARTPTS,setsar=1[after]',
    ]
    parts = ['[shot]', '[after]']
    if first > 1:
        filters.append(f'[1:v]trim=end_frame={first - 1},setpts=PTS-STARTPTS,setsar=1[before]')
        parts.insert(0, '[before]')
    filters.append(f'{"".join(parts)}concat=n={len(parts)}:v=1:a=0[film]')
    with tempfile.TemporaryDirectory(dir=RENDERS, prefix='.opening-') as work:
        movie = Path(work) / OUTPUT.name
        encoded = Path(work) / 'picture.mp4'
        base = ['ffmpeg', '-y', '-v', 'error', '-filter_complex_threads', '2',
                '-framerate', str(FPS // 2), '-pattern_type', 'glob', '-i',
                str(args.frames / 'frame_*.png'), '-i', str(args.previous),
                '-filter_complex', ';'.join(filters), '-map', '[film]',
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
