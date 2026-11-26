import { group, box, egg, cylinder, rod, loop, path, surface, material, writeGLB } from './kit/toy-glb.mjs';
import { datePalm } from './skete-detail.mjs';

const plaster = material('#d9b27c', .94, 0, { image: 'blender/props/src/skete-limewash.jpg' });
const clay = ['#ceaa74', '#c49a63', '#d3ac76', '#dfb982'];
const masonry = ['#bba489', '#cbb497', '#d1bd9e'];
const sand = '#e6c27a', wood = '#7a5232', full = 2 * Math.PI;
const anchor = (x,z,y=0,face=0) => ({ pos: [x,y,z], face });
const marble = '#f1e6d2';
const shadow = { center: [0,0], radius: 28 };

function floor(root, h, width = 78, depth = 74) {
  const nx = 74, nz = 70, vertices = [], faces = [];
  for (let j=0; j<=nz; j++) for (let i=0; i<=nx; i++) {
    const x=width*(i/nx-.5), z=depth*(j/nz-.5);
    vertices.push([x,h(x,z),z]);
    if (i && j) {
      const k=j*(nx+1)+i;
      faces.push(k-nx-2,k-1,k,k-nx-2,k,k-nx-1);
    }
  }
  surface(group(root,'ground'),vertices,faces,material(sand,.97));
}

function wall(root,name,at,size,mat=plaster) {
  box(root,at,size,mat,.095);
  box(group(root,'col:'+name),at,size,mat);
}

function cross(root,x,y,z,scale=1) {
  box(root,[x,y,z],[.105*scale,.75*scale,.10*scale],'#5a3b24',.018);
  box(root,[x,y+.10*scale,z+.012],[.49*scale,.105*scale,.11*scale],'#5a3b24',.015);
}

const cellSize = {width:8.4, depth:7.1, ceiling:6.25};
const doorway = { left:-.17, right:2.67, depth:.17, height:4.82 };
const doorWidth = doorway.right - doorway.left;
const doorCenter = (doorway.left + doorway.right) / 2;

function doorFrame(root) {
  const jamb = '#956f4b';
  // The stops overlap the closed leaf and seal the curved edges of the plaster opening.
  for (const x of [doorway.left, doorway.right]) {
    box(root,[x,doorway.height/2,.069],[.18,doorway.height+.23,.28],jamb,.025);
  }
  box(root,[doorCenter,doorway.height+.15,.075],[doorWidth+.14,.21,.29],jamb,.025);
  box(root,[doorCenter,.023,-.07],[doorWidth+.12,.046,.48],masonry[0],.02);
}
function doorLeaf(root, interior = false) {
  const door = group(root,'door:cell',[doorway.right,.051,doorway.depth]);
  door.rotation.y = Math.PI;
  const z = interior ? -.065 : 0;
  box(door,[doorWidth/2,doorway.height/2,z],[doorWidth,doorway.height,.21],wood,.06);
  const width = doorWidth / 7;
  for (let i=0;i<7;i++) {
    box(door,[(i+.5)*width,doorway.height/2,interior ? -.192 : .120],
      [width-.021,doorway.height-.15,.046],i%2?'#936743':'#865c3c',.017);
  }
  for (const y of [.75,3.31]) {
    if (!interior) box(door,[doorWidth/2,y,.173],[doorWidth-.15,.145,.10],'#694530',.03);
    box(door,[doorWidth/2,y,interior ? -.238 : -.116],[doorWidth-.15,.145,.10],'#694530',.03);
  }
  if (!interior) loop(door,[doorWidth-.45,1.83,.27],.13,.035,'#392d28',[0,0,0]);
  box(door,[doorWidth-.66,1.99,interior ? -.29 : -.23],[.71,.11,.14],'#503620',.024);
}

// Both views use the same masonry envelope and doorway.
function cellWalls(root, interior) {
  const {width, depth, ceiling} = cellSize;
  const half = width/2, openingTop = doorway.height+.23;
  const left = doorway.left+half, right = half-doorway.right;
  const wallDepth = interior ? .38 : .30;
  wall(root,'fațadă-stânga',[-half+left/2,ceiling/2,0],[left,ceiling,wallDepth]);
  wall(root,'fațadă-dreapta',[half-right/2,ceiling/2,0],[right,ceiling,wallDepth]);
  wall(root,'fațadă-sus',[doorCenter,(ceiling+openingTop)/2,0],[doorWidth,ceiling-openingTop,wallDepth]);
  doorFrame(root);
  for (const x of [-half,half]) wall(root,'lateral'+x,[x,ceiling/2,-depth/2],[wallDepth,ceiling,depth+.26]);
  wall(root,'spate',[0,ceiling/2,-depth],[width,ceiling,wallDepth]);
  box(root,[0,ceiling+.11,-depth/2],[width+.18,.22,depth+.29],plaster,.10);
  doorLeaf(root,interior);
}

function facade(root, little = false) {
  const r=group(root,'chilie');
  if (little) {
    box(r,[0,2.35,-2.5],[7,4.7,5],plaster,.16);
    box(r,[1.25,1.8,.03],[2.1,3.6,.09],wood,.04);
  } else {
    cellWalls(r,false);
    box(r,[doorCenter,.018,.50],[doorWidth+.59,.036,1.56],masonry[0],.016);
    for(let i=0;i<5;i++) box(r,[.02+i*.63,.032,.51],[.58,.03,1.33],masonry[i%3],.014);
    box(r,[2.05,.425,1.12],[.91,.35,.91],masonry[2],.11);
    box(r,[2.05,.57,1.12],[.94,.07,.96],masonry[1],.035);
  }
  if (!little) {
    const lamp = group(r,'door-lamp',[2.94,3.51,.21]);
    box(lamp,[0,.03,-.02],[.44,.54,.12],'#825e42',.06);
    box(lamp,[0,-.16,.20],[.48,.13,.42],'#a5754a',.05);
    egg(lamp,[0,-.08,.27],[.23,.095,.17],'#ab6e46');
    const flame = group(lamp,'door-lamp-flame');
    egg(group(flame,'flame.door', [0,.04,.27], {lightIntensity:3.5,lightDistance:4}),
      [0,0,0],[.055,.102,.047],material('#ffb85c',.53,0,{glow:.8}),undefined,14);
  }
  for(let j=0;j<6;j++) for(let i=0;i<6;i++) {
    const x=-3.22+i*.53+.1*Math.sin(i*3+j*4);
    const y=.44+j*.71+.085*Math.cos(i+j);
    if((i+j)%3!==0) box(r,[x,y,.162],[.36+.11*((i+j)%3),.14+.019*(i%3),.041],clay[(i+j)%4],.03);
  }
  const roof = little ? 4.7 : cellSize.ceiling + .22;
  const domeZ = little ? -2.45 : -cellSize.depth/2;
  cylinder(r,[-1.09,roof+.08,domeZ],1.13,1.25,.28,marble);
  egg(r,[-1.09,roof+.19,domeZ],[1.15,.78,1.14],marble);
  cross(r,-1.09,roof+1.20,domeZ+.03,.78);
  return r;
}

function bench(r) {
  for(const x of [-4.68,-2.06]) box(r,[x,.27,1.06],[1.0,.53,.86],masonry[0],.12);
  box(r,[-3.34,.57,1.06],[4.18,.19,1.15],masonry[1],.10);
  box(group(r,'col:banca'),[-3.34,.33,1.04],[4.08,.64,1.04],masonry[1]);
}
function scrub(r,x,z,y=0,scale=1) {
  const plant=group(r,'tufă',[x,y,z]);
  plant.scale.setScalar(scale);
  for(let i=0;i<9;i++) {
    const a=i*2.4;
    const at=[Math.sin(a)*.34,.25+.16*Math.sin(i*3.1),Math.cos(a)*.28];
    rod(plant,[0,0,0],at,.018,'#805b3c',.007);
    egg(plant,at,[.23,.113,.14],i%2?'#9aa07a':'#7c895b',undefined,12);
  }
}
function footpath(root,points) {
  const v=[], ind=[];
  for(let i=0;i<points.length;i++) {
    const [x,z]=points[i];
    for(const s of [-1,1]) v.push([x+s*(1.1+.12*Math.sin(i*1.6)),.018,z]);
    if(i) ind.push(2*i-2,2*i-1,2*i+1,2*i-2,2*i+1,2*i);
  }
  surface(root,v,ind,'#d6ac6d');
}
const gate={ hinge:[doorway.right,doorway.depth], length:doorWidth, out:[0,-1], swing:-1.62 };
const seats={ elder:anchor(-4.57,1.02,.67,16), ioan:anchor(-2.01,1.02,.67,-15), threshold:anchor(2.05,1.26,.60,16) };
const exterior=group(null,'scetis-cell');
for (const [name, seat] of Object.entries(seats)) {
  group(exterior, 'seat:'+name, seat.pos).rotation.y = seat.face*Math.PI/180;
}
floor(exterior,()=>0);
facade(exterior);
bench(exterior);
datePalm(exterior,-6.4,-.5,6.6,.75);
datePalm(exterior,7.8,-9.4,5.6,2.4);
datePalm(exterior,-13,-10,7.3,3);
box(group(exterior,'col:palm'),[-6.4,2.9,-.5],[.48,5.8,.5],'#99784c');
footpath(exterior,[[1.34,1.19],[1.35,3.6],[2.3,6],[4.7,8.7],[7.3,12],[10,18],[12,29]]);
for(let i=0;i<16;i++){
  const a=i*2.4;
  egg(exterior,[Math.sin(a)*(8.4+i*.53),.31,Math.cos(a)*(7+i*.64)],[.37+i%4*.20,.27,.42],masonry[i%3],undefined,12);
  scrub(exterior,8+Math.sin(i)*9,-6+Math.cos(i*.87)*12,0,.86);
}
for (const [x,z,scale] of [[-7.45,1.18,1.3],[-6.74,1.52,.8],[-5.82,4.66,.75],[.16,4.35,1.1],[.87,4.94,.72],[4.38,1.37,1.2],[3.34,4.57,1.25],[5.21,6.3,.98],[7.52,6.31,1.36],[5.07,8.64,.8],[9.15,9.58,1.13]]) {
  scrub(exterior,x,z,0,scale);
}
for (const [x,z,s] of [[-24,-22,1.1],[23,-28,1.25],[-8,-28,.8],[18,27,.65]]) {
  egg(exterior,[x,-1.5,z],[13*s,4*s,7*s],'#d6ad6c',undefined,26);
}
const outsideAnchors={
  'bench:elder':anchor(-4.36,1.6), 'bench:ioan':anchor(-2.18,1.6),
  'door-out':anchor(1.27,1.42,0,180), threshold:anchor(1.76,.92),
  'door-in':anchor(1.27,-1.55,0,0), 'lamp-corner':anchor(-.9,-3.45,0,-156),
  'path-start':anchor(1.6,4.15,0,16), 'path-far':anchor(7.4,12,0,24),
  'offstage-path':anchor(12.55,26,0,19), 'fox-spot':anchor(2.98,2.19,0,0),
  'bench-basket':anchor(-.89,1.04,.67), 'jar-place':anchor(-6.85,2.57),
  'bench-front':anchor(-3.2,3.1), 'bread-front':anchor(-3.15,2.45), 'gate-step':anchor(1.35,1.95,0,0),
  'hand-over':anchor(-.48,2.99,0,-90),
};
writeGLB(exterior,'assets/sets/scetis-cell',{
  name:'scetis-cell', anchors:outsideAnchors, seats, doors:['cell'], doorLeaves:{cell:gate},
  colliders:[{ name:'banca', at:[-3.34,1.05], size:[4.08,1.04],seats:['elder','ioan'] }],
  shadow,
});

const room=group(null,'scetis-cell-interior');
floor(room,()=>0,36,33);
cellWalls(room,true);
const iconWall = -cellSize.depth+.32;
box(room,[-.85,1.99,iconWall+.30],[2.02,.19,.74],clay[1],.046);
box(room,[2.92,2.87,-.6],[.14,.23,1.25],wood,.025);
for(const z of [-.2,-.97]) rod(room,[2.89,2.9,z],[2.62,2.94,z],.072,wood,.058);
box(room,[-2.5,.432,-2.1],[1.04,.115,.91],wood,.085);
for(const x of [-2.85,-2.17]) for(const z of [-2.43,-1.77]) rod(room,[x,.04,z],[x,.403,z],.082,wood,.05);
writeGLB(room,'assets/sets/scetis-cell-interior',{
  name:'scetis-cell-interior',anchors:{...outsideAnchors,cuier:anchor(2.65,-.52,2.78,-90),
    icon:anchor(-.85,iconWall,2.10),candela:anchor(-.85,iconWall+.48,2.09),
    'prayer-mat':anchor(-.85,-4.65,0,180)},
  doors:['cell'],doorLeaves:{cell:gate},shadow,
  lights:[{pos:[-2.85,3.9,-5.7],color:'#ffddba',intensity:.8,distance:8},
    {pos:[1.75,3.6,-2.0],color:'#ffe0b8',intensity:2.1,distance:8}]
});

const dunes=group(null,'scetis-dunes');
const height=(x,z)=>.17+1.34*Math.exp(-((x+4)**2/76+(z+6)**2/33))
  +1.57*Math.exp(-((x-23)**2/121+(z+19)**2/27))
  +1.33*Math.exp(-((x+24)**2/75+(z-14)**2/31));
floor(dunes,height);
for(const [x,z,rx,ry,rz] of [[4.8,-5.4,2.35,1.87,1.65],[6.23,-6.23,1.6,2.1,1.4],[3.5,-6.07,.88,.81,1],[9,1,.7,.51,.64],[-13,-11,1.9,1.08,.88]]){
  const y=height(x,z);
  egg(dunes,[x,y+ry*.54,z],[rx,ry,rz],'#a8603f',undefined,16);
  box(group(dunes,'col:piatră'),[x,y+ry*.84,z],[rx*1.46,ry*1.56,rz*1.45],'#a8603f');
}
const tree=group(dunes,'salcâm',[-9,height(-9,2.7),2.7]);
rod(tree,[0,0,0],[.22,2.89,.12],.22,'#785239',.11);
for(let i=0;i<7;i++){
  const a=i*2.4,x=Math.sin(a)*(1.8+.25*Math.cos(i)),z=Math.cos(a)*1.35;
  rod(tree,[.2,1.76+.19*(i%3),.11],[x,3.18+.29*Math.cos(i),z],.11,'#785239',.026);
  egg(tree,[x,3.27+.29*Math.cos(i),z],[1.05,.40,.72],i%2?'#788c58':'#91a168');
}
const oliveX = 3.19, oliveZ = -3.55;
const olive = group(dunes,'olive',[oliveX,height(oliveX,oliveZ),oliveZ]);
olive.scale.set(1.26,1.32,1.26);
const bark = ['#6e553c','#8a6d4c','#987858'];
const crown = ['#657a53','#7e905e','#82916c','#a1ad8d','#adb79b'].map(color => material(color,.99));
const leafRib = material('#7d885c',.98);
for (let i=0;i<7;i++) {
  const a=i*full/7;
  const x=Math.sin(a), z=Math.cos(a);
  const tip=[.25+x*1.45,3.58+.29*Math.cos(i*1.9),z*1.34];
  rod(olive,[x*.32,-.08,z*.29],[x*.13,1.17,z*.12],.23,bark[i%3],.18);
  rod(olive,[x*.13,.92,z*.12],[.22,2.24,0],.187,bark[i%3],.122);
  rod(olive,[.20,1.91+.13*(i%3),0],tip,.124,bark[i%3],.033);
  const foliage = group(olive,'ramură de măslin',tip,{anim:'sway',amp:.028,freq:.45,phase:i});
  for (let branch=0;branch<9;branch++) {
    const bearing = a + branch*2.39996;
    const length = .38+.51*((branch*.618+.14*i)%1);
    const twig = group(foliage,'mlădiță',[.10*Math.sin(bearing),0,.10*Math.cos(bearing)]);
    twig.rotation.set(.27*Math.sin(branch+i),bearing,.32*Math.cos(branch*1.9));
    rod(twig,[0,0,0],[0,.13,length],.017,bark[i%3],.005);
    for (let pair=0;pair<6;pair++) for (const side of [-1,1]) {
      const progress = (pair+.5)/6;
      const leaf = group(twig,'frunză',[0,.13*progress,length*progress]);
      leaf.rotation.set(-.22+.35*Math.sin(pair*2.8+branch),side*(.72+.33*Math.sin(pair)),side*.18*Math.cos(branch+pair));
      const h = (.23+.10*Math.sin(pair*1.8+branch)**2)*(1-.28*progress), w = .23*h;
      const color = crown[(branch*3+pair+i+(side>0?1:0))%crown.length];
      surface(leaf,[[0,0,0],[-w,.012,h*.37],[0,.047,h*.49],[w,.007,h*.40],
        [-w*.62,.019,h*.75],[w*.67,.028,h*.79],[0,.037,h]],
      [0,1,2,0,2,3,1,4,2,2,5,3,2,4,6,2,6,5],color);
      rod(leaf,[0,.001,0],[0,.049,h*.53],.006,leafRib,.002);
    }
    if (branch%3===0) egg(twig,[.037,-.04,length*.64],[.047,.070,.048],material('#525839',.93),undefined,10);
  }
}
box(group(dunes,'col:olive'),[oliveX,height(oliveX,oliveZ)+1.30,oliveZ],[.96,2.60,.91],bark[0]);
const tiny=group(dunes,'chilia din depărtare',[19,height(19,-24),-24]);
tiny.scale.setScalar(.49);
facade(tiny,true);
for(let i=0;i<24;i++){
  const a=i*2.4,x=13*Math.sin(a)+i*.52,z=18*Math.cos(a);
  scrub(dunes,x,z,height(x,z),.67+.17*Math.sin(i));
}
for (const [x,z,scale] of [[-4.81,-.19,1.45],[-3.97,1.29,.9],[-1.79,1.64,1.15],[.49,1.78,.71],
  [1.98,-1.49,1.15],[2.51,-2.22,.81],[3.62,-3.66,1.38],[-2.96,-5.9,1.04]]) {
  scrub(dunes,x,z,height(x,z),scale);
}
for (const [x,z,scale] of [[-4.45,.75,.47],[-2.43,.86,.24],[.4,.15,.38],[2.68,-2.65,.32],[3.39,-3.42,.62]]) {
  egg(dunes,[x,height(x,z)+scale*.18,z],[scale,scale*.43,scale*.69],'#b27a52',undefined,12);
}
for(let i=0;i<12;i++) {
  const x=5.1+.14*i,z=1.7+i*.49;
  egg(dunes,[x+(i%2?.14:-.14),height(x,z)+.014,z],[.11,.018,.19],'#c89551',undefined,10);
}
const d=(x,z,face=0)=>anchor(x,z,height(x,z),face);
writeGLB(dunes,'assets/sets/scetis-dunes',{
  name:'scetis-dunes',anchors:{'pray-dune':d(-3.8,-5.2),'olive-shade':d(1.69,-4.38,21),
  'walk-a':d(-3.45,-1.2),'walk-b':d(2.3,1.25),'home-view':d(4.1,1.5,151),
  'home-path':d(8,-5.07,155),'rock-lizard':d(3.3,-4.9)},shadow
});
