#!/usr/bin/env python3
"""Contact sheet of preview stills: python3 blender/preview/contact.py out.jpg a.png b.png ... [--cols 2 --w 960]"""
import sys
from PIL import Image, ImageDraw
args = sys.argv[1:]
cols = int(args[args.index('--cols') + 1]) if '--cols' in args else 2
tw = int(args[args.index('--w') + 1]) if '--w' in args else 960
files = [a for i, a in enumerate(args[1:], 1) if not a.startswith('--') and not args[i - 1].startswith('--')]
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d.text((x + 8, y + 6), f.split('/')[-1], fill=(255, 255, 255))
sheet.save(args[0], quality=88)
