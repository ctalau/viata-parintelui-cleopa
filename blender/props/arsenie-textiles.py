"""Repeatable linen weave and hand stitching, for the UVs of the little pillow."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
folder=Path(__file__).parent / 'src'
folder.mkdir(exist_ok=True)
n=512
rng=np.random.default_rng(76)
y,x=np.mgrid[:n,:n]
def weave(base,amount):
    twist=3.6*np.sin(x*2.0)+3.3*np.cos(y*1.5)+2.7*np.sin(x*.90+1.7*np.cos(y*.52))
    noise=rng.normal(0,2.3,(n,n))
    return np.uint8(np.clip(np.array(base)[None,None,:]+(twist*amount+noise)[:,:,None],0,255))
fabric=Image.fromarray(weave([207,201,189],2.10))
piece=Image.fromarray(weave([127,104,85],1.80))
q=[(61,156),(206,137),(228,292),(79,310)]
mask=Image.new('L',(n,n));ImageDraw.Draw(mask).polygon(q,fill=255);fabric.paste(piece,mask=mask)
d=ImageDraw.Draw(fabric)
for i,a in enumerate(q):
 b=q[(i+1)%4]
 for j in range(10):
  t=(j+.15)/10;u=(j+.63)/10
  d.line([(a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v) for v in [t,u]], fill=(236,219,187),width=4)
for a in range(18,496,12):
 for v in [14,497]:
  d.line((a,v,a+6,v),fill=(161,139,109),width=2);d.line((v,a,v,a+6),fill=(162,139,109),width=2)
fabric.save(folder/'small-pillow-linen.jpg',quality=90)
Image.fromarray(weave([190,174,145],1.8)).save(folder/'thin-blanket-wool.jpg',quality=88)
# Dappled limewash and fine mineral speckles soften the toy architecture at close focus.
def grain(name,base,size):
 coarse=Image.fromarray(np.uint8(rng.uniform(0,255,(size,size)))).resize((n,n),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(3))
 grain=(np.array(coarse).astype(float)-125)*.12+rng.normal(0,3,(n,n))
 Image.fromarray(np.uint8(np.clip(np.array(base)+grain[:,:,None],0,255))).save(folder/name,quality=84)
grain('skete-limewash.jpg',[247,234,212],24)
grain('skete-limestone.jpg',[229,210,186],45)
