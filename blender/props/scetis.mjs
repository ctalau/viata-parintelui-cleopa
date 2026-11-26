import { group, box, egg, cylinder, rod, loop, path, lathe, surface, material, writeGLB } from '../sets/kit/toy-glb.mjs';

const wool=material('#8a4b2c',.97), hem=material('#5e3220',.94), wood='#5a3b24';
const tau=2*Math.PI;
const asset=(name,meta,create)=>{
  const r=group(null,name);
  create(r);
  writeGLB(r,'assets/props/'+name,{name,...meta});
};
function cloakShell(parent, kind) {
  const r=group(parent,kind);
  const segments=36, rows=23, v=[], ind=[], uv=[];
  const short=kind==='draped';
  const hung=kind==='hung';
  const aStart=short?.035:.7;
  for (let j=0;j<=rows;j++) for(let i=0;i<=segments;i++) {
    const u=i/segments, t=j/rows, a=aStart+(tau-2*aStart)*u;
    const side=Math.cos(a), back=Math.sin(a);
    const radius=(.46+.84*t**.74)*(.91+.055*Math.sin(7*a+t*1.4));
    if (short) {
      v.push([side*radius*.60,1.20-t*1.29,-.18+back*radius*.58+.15*Math.sin(t*3)]);
    } else if (hung) {
      v.push([side*radius*.52,-t*1.72,back*radius*.23]);
    } else {
      const y=.99-t*(1.29+.14*(-Math.cos(a)))+.10*Math.sin(2*a)*(1-t);
      v.push([Math.sin(a)*radius,y,Math.cos(a)*radius*.58-.05]);
    }
    uv.push([u,1-t]);
    if (j&&i) {
      const k=j*(segments+1)+i;
      ind.push(k-segments-2,k-1,k,k-segments-2,k,k-segments-1);
    }
  }
  surface(r,v,ind,wool,uv);
  surface(r,v,ind.map((_,i)=>ind[i-i%3+(i%3===0?0:3-i%3)]),wool,uv);
  for (const line of [v.slice(-segments-1),v.filter((_,i)=>i%(segments+1)===0),v.filter((_,i)=>i%(segments+1)===segments)]) {
    path(r,line,.031,hem);
  }
  for(let p=2;p<segments;p+=2){
    const strand=Array.from({length:rows},(_,j)=>v[p+(segments+1)*j].map((n,k)=>n+(k===0?.005*Math.sin(p):0)));
    path(r,strand,.008,p%4?'#945337':'#79402c');
  }
  return r;
}

asset('ioan-mantie',{
  hands:2, grip:[0,.11,.18], bone:'chest', origin:[0,2.05,0], soft:true, variants:['folded','worn','hung','draped'], steps:true,
  notes:'Mantie de lână. Varianta purtată are deschizătura în față și cade peste umeri. Originea de purtare este pe piept.'
},r=>{
  const folded=group(r,'folded');
  for(let i=0;i<4;i++) box(folded,[.013*i,.057+i*.071,0],[1.40-.019*i,.116,.81-.018*i],i===0?hem:wool,.15);
  for(let i=0;i<3;i++) path(folded,[[-.65,.28-i*.026,.392],[0,.316-i*.025,.404],[.61,.29-i*.026,.393]],.015,hem);
  cloakShell(r,'worn');
  cloakShell(r,'hung');
  const draped=cloakShell(r,'draped');
  draped.position.y-=.98;
  draped.scale.set(.88,.85,.8);
  group(r,'grip',[0,.13,.14]);
  group(r,'grip.L',[.57,.13,.12]); group(r,'grip.R',[-.57,.13,.12]);
});
asset('scetis-jgheab',{notes:'Jgheab scund de piatră, cu apă pentru frunzele de curmal.',soft:true},r=>{
  box(r,[0,.18,0],[2.75,.35,1.47],'#b9a892',.18);
  for(const x of [-1.26,1.26]) box(r,[x,.36,0],[.35,.46,1.43],'#ac9a83',.11);
  for(const z of [-.62,.62]) box(r,[0,.35,z],[2.55,.45,.29],'#c2b39d',.11);
  const water=material('#8cafaa',.22,0,{glow:.025});
  box(r,[0,.355,0],[2.20,.036,.91],water,.021);
  for(let i=0;i<6;i++) path(r,[[-.9,.383,-.33+i*.126],[-.2,.386,-.3+i*.126],[.45,.382,-.34+i*.126],[.92,.38,-.29+i*.126]],.008,'#c4dace');
});
asset('scetis-cruce',{},r=>{
  box(r,[0,.48,0],[.13,.96,.12],wood,.023);
  box(r,[0,.63,.015],[.58,.131,.12],wood,.024);
});
asset('scetis-cuier',{},r=>{
  box(r,[0,.11,0],[.95,.22,.16],wood,.044);
  for (const x of [-.26,.26]) rod(r,[x,.13,0],[x,.19,.25],.059,wood,.053);
});
asset('scetis-scaunel',{seat:.49,variants:['low','basket']},r=>{
  for (const [name, top] of [['low',.50],['basket',.93]]) {
    const stool = group(r,name);
    box(stool,[0,top-.07,0],[1.09,.14,1.02],wood,.062);
    for(const x of [-.37,.37]) for(const z of [-.33,.33]) rod(stool,[x,.018,z],[x*.94,top-.05,z*.91],.083,wood,.064);
  }
});
const crust = ['#a66530','#bc7c36','#d79b50','#c68742'];
const crumb = material('#f6d69f',.97);
const loafGrip = [0,.14,-.37];
function breadHalf(parent, torn) {
  // Shift the baked half to put its centre near the hand. Both halves meet
  // along the same seam as the whole loaf when they lie on the board.
  const r = group(parent,'crust',[-.24,.18,0]);
  const rx=.61, ry=.18, rz=.48;
  const skin = (lat,lon,offset=0) => {
    const ripple = 1 + .021*Math.sin(19*lon+4*lat)*Math.cos(16*lat);
    const radial = Math.cos(lat)*ripple;
    return [(rx+offset)*radial*Math.cos(lon),(ry+offset)*Math.sin(lat),(rz+offset)*radial*Math.sin(lon)];
  };
  const slabs = 14, slices = 24;
  for (let j=0;j<slabs;j++) {
    const latA = Math.PI*(j/slabs-.5), latB = latA + Math.PI/slabs;
    const vertices=[], faces=[];
    for (let i=0;i<=slices;i++) {
      const angle=Math.PI*(i/slices-.5);
      vertices.push(skin(latA,angle),skin(latB,angle));
      if(i) faces.push(2*i-2,2*i-1,2*i,2*i-1,2*i+1,2*i);
    }
    surface(r,vertices,faces,crust[j<4?0:j<8?1:j%3===0?3:2]);
  }
  for(let i=0;i<104;i++) {
    const lat=.05+1.45*((i*.618034)%1), lon=Math.PI*((i*.381966+.035*i*i)%1-.5);
    const location=skin(lat,lon,.003);
    const grain=i%7===0;
    egg(r,location,grain?[.018,.008,.010]:[.010,.007,.013],
      grain?'#eace97':i%3?'#ad6b37':'#915324',[0,lon,lat],8);
  }
  for(let i=0;i<3;i++) {
    const mark = [];
    for(let j=0;j<10;j++) mark.push(skin(.62+.25*i+.035*j, -.59+.132*j, .012));
    path(r,mark,.013,'#a96935');
  }
  if (!torn) return;
  const edge=[[0,0,0]], faces=[];
  for(let i=0;i<=48;i++) {
    const a=tau*i/48;
    edge.push([.001,(ry-.012)*Math.sin(a),(rz-.015)*Math.cos(a)]);
    if(i) faces.push(0,i,i+1);
  }
  surface(r,edge,faces,crumb);
  for(let i=0;i<84;i++) {
    const a=i*2.39996, q=Math.sqrt((i+.25)/84);
    const size=.005+.009*((i*.618)%1);
    egg(r,[-.001,(ry-.023)*Math.sin(a)*q,(rz-.037)*Math.cos(a)*q],
      [.006,size*.68,size*1.27],i%3?'#d3ae7e':'#be9466',undefined,8);
  }
}
asset('scetis-turta',{grip:loafGrip},r=>{
  breadHalf(group(r,'right',[.24,0,0]),false);
  const left=group(r,'left',[-.24,0,0]);
  left.rotation.y=Math.PI;
  breadHalf(left,false);
  group(r,'grip',loafGrip);
});
const halfGrip = [-.19,.18,.28];
const oppositeHalfGrip = [.08,.19,-.385];
asset('scetis-jumatate',{grip:halfGrip,bite:[.09,.235,.39],biteByGrip:{'grip.opus':[-.18,.23,-.44]},carryPose:'front'},r=>{
  breadHalf(r,true);
  group(r,'grip',halfGrip);
  group(r,'grip.opus',oppositeHalfGrip);
});
asset('scetis-candela',{variants:['cup','stand'],notes:'Candelă de nișă sau sfeșnic înalt, cu lumină deterministă.'},r=>{
  const cup=group(r,'cup');
  lathe(cup,[0,0,0],[[.115,0],[.17,.08],[.18,.26],[.146,.34]],material('#9b393b',.36));
  loop(cup,[0,.322,0],.153,.02,'#c87764');
  const flame=group(cup,'flame.candela',[0,.382,0],{lightIntensity:.85,lightDistance:5,lightColor:'#ffb85c'});
  egg(flame,[0,.024,0],[.053,.096,.052],material('#ffbd69',.55,0,{glow:1}),undefined,18);
  const stand=group(r,'stand');
  const bronze=material('#977044',.68,.33);
  lathe(stand,[0,0,0],[[.36,0],[.41,.07],[.38,.15],[.19,.25],[.11,.37],[.081,1.93],
    [.14,2.08],[.12,2.19],[.25,2.24],[.27,2.32],[.21,2.36]],bronze);
  cylinder(stand,[0,2.59,0],.055,.066,.49,'#ebc78e');
  rod(stand,[0,2.83,0],[0,2.88,0],.012,'#463223');
  const wick=group(stand,'flame.sfesnic',[0,2.93,0],{lightIntensity:.85,lightDistance:5,lightColor:'#ffb85c'});
  egg(wick,[0,0,0],[.036,.071,.036],material('#ffbd69',.55,0,{glow:.65}),undefined,18);
});
asset('scetis-cos',{bone:'pelvis',origin:[0,1.77,1.22],hands:2,soft:true,grip:[0,.19,0],variants:['start','half','done'],steps:true},r=>{
  const colors=['#d8b968','#b99a5d','#e3c77e'];
  for(const [index,name] of ['start','half','done'].entries()){
    const v=group(r,name);
    const h=[.105,.315,.55][index];
    const courses=Math.ceil(h/.033);
    const rimY=.06+(courses-1)*.033;
    group(v,'rim',[.52+rimY*.31,rimY+.019,0]);
    cylinder(v,[0,.03,0],.53,.51,.065,colors[1],36);
    for(let j=0;j<courses;j++) {
      const y=.06+j*.033;
      loop(v,[0,y,0],.52+y*.31,.019,colors[j%3]);
    }
    for(let k=0;k<28;k++){
      let a=k*tau/28, seq=[];
      for(let j=0;j<13;j++){
        const y=.033+j*h/12,rad=.52+y*.31+.014*Math.sin(j*.5+k*1.7);
        seq.push([rad*Math.sin(a+.032*Math.sin(j)),y,rad*Math.cos(a+.032*Math.sin(j))]);
      }
      path(v,seq,.013,colors[k%3]);
    }
  }
  group(r,'grip',[0,.18,0]); group(r,'grip.R',[-.55,.21,0]); group(r,'grip.L',[.55,.21,0]);
});

asset('desert-flower',{grip:[0,.36,0],small:true,notes:'Floare de pustie cu tulpină prinsă în mână și corolă articulată prin bend.'},root=>{
  const leaf = material('#6d873e',.97), stem = material('#738845',.96);
  egg(root,[0,.016,0],[.094,.063,.087],material('#946134',.99),undefined,12);
  path(root,[[0,0,0],[0,.33,0],[.035,.61,.005]],.021,stem);
  for (const side of [-1,1]) {
    const y = side<0 ? .19 : .30;
    const blade = group(root,'frunză',[0,y,0]);
    blade.rotation.y = .36*side;
    surface(blade,[[0,0,0],[side*.10,.04,-.05],[side*.13,.06,0],[side*.10,.03,.05],
      [side*.235,.12,.015]],[0,1,2,0,2,3,1,4,2,2,4,3],leaf);
  }
  const bloom = group(root,'corolă',[.035,.61,.005],{bendX:53});
  const pink = [material('#e98599',.95),material('#f4a4ab',.94),material('#d76b85',.95)];
  const disk = material('#f3b947',.97);
  for (let i=0;i<7;i++) {
    const petal = group(bloom,'petală');
    petal.rotation.y = i*tau/7;
    egg(petal,[0,.036,.137],[.086,.029,.143],pink[i%pink.length],[.23,0,0],16);
  }
  egg(bloom,[0,.033,0],[.098,.052,.098],disk,undefined,20);
  for (let i=0;i<18;i++) {
    const a=i*2.39996, r=.08*Math.sqrt((i+.4)/18);
    egg(bloom,[Math.cos(a)*r,.079-.20*r,Math.sin(a)*r],[.015,.014,.015],'#d68d2b',undefined,8);
  }
  group(root,'grip',[0,.36,0]);
});

asset('fenec',{walker:true,notes:'Vulpe de deșert cu bot ascuțit, urechi triunghiulare și coadă stufoasă.'},root=>{
  const fur=material('#c87438',.98), cheek=material('#e09352',.98);
  const cream=material('#f6dfb8',1), dark=material('#342722',.89);
  egg(root,[0,.49,-.11],[.20,.206,.40],fur,undefined,25);
  egg(root,[0,.415,.12],[.159,.171,.24],cream,[.44,0,0],20);
  egg(root,[0,.57,.14],[.16,.23,.19],fur,[.37,0,0],22);
  const tail=group(root,'tail',[0,.49,-.42],{anim:'swish',swishAmp:.64});
  const tailPoints=[[0,0,0],[.035,-.06,-.12],[.105,-.071,-.30],[.195,-.018,-.50],[.26,.06,-.67],[.27,.11,-.82]];
  const widths=[.079,.104,.145,.163,.112,.012];
  for(let i=1;i<tailPoints.length;i++) {
    rod(tail,tailPoints[i-1],tailPoints[i],widths[i-1],i<4?fur:cream,widths[i]);
    if(i<tailPoints.length-1) egg(tail,tailPoints[i],[widths[i],widths[i],.13],i<4?fur:cream,[.25,-.35,0],18);
  }
  const head=group(root,'head',[0,.651,.235],{anim:'browse'});
  group(root,'pet:start',[0,.71,.11]);
  group(root,'pet:end',[0,.73,-.27]);
  egg(head,[0,.038,.067],[.177,.163,.193],fur,undefined,24);
  egg(head,[0,-.063,.19],[.151,.081,.139],cream,undefined,18);
  // Taper the nose bridge and give the white jaw a separate, readable profile.
  rod(head,[0,.007,.13],[0,-.060,.395],.123,cheek,.030);
  rod(head,[0,-.076,.159],[0,-.084,.381],.102,cream,.026);
  egg(head,[0,-.058,.397],[.043,.033,.034],dark,undefined,16);
  for(const side of [-1,1]){
    egg(head,[side*.106,-.028,.168],[.076,.078,.113],cream,[.19,side*.14,-side*.30],18);
    egg(head,[side*.117,.061,.179],[.050,.037,.039],dark,[0,side*.50,side*.32],18);
    egg(head,[side*.128,.067,.207],[.020,.022,.014],'#a2612c',[0,side*.43,0],12);
    egg(head,[side*.135,.074,.218],[.008,.008,.006],'#fff1d7',undefined,8);
    const ear=group(head,'ureche'+side,[side*.100,.115,-.017],{anim:'ear',side});
    const earTip=[side*.096,.34,-.054];
    surface(ear,[[-side*.068,0,.033],[side*.083,-.025,.028],earTip,[side*.013,.085,-.078]],
      [0,1,2,0,2,3,1,3,2,0,3,1],fur);
    surface(ear,[[-side*.045,.026,.038],[side*.054,.009,.033],[side*.080,.279,-.039]],
      [0,1,2],material('#cf8e68',1));
    for (const z of [-.33,.22]){
      const leg=group(root,'picior',[side*.115,.405,z],{anim:'gait',leg:(side>0?2:0)+(z>0?1:0),swing:.48});
      const knee=[side*.012,-.192,z<0?-.036:.014];
      rod(leg,[0,.040,0],knee,.060,fur,.043);
      rod(leg,knee,[side*.018,-.369,.047],.043,dark,.026);
      egg(leg,[side*.019,-.365,.072],[.046,.035,.072],dark,undefined,14);
    }
  }
});

asset('scetis-soparla',{soft:true,walker:true,stepBob:0},root=>{
  const olive = ['#777b48','#9b995d','#ad9c64','#c4ad76'];
  const body = group(root,'body');
  egg(body,[0,.146,0],[.103,.074,.265],olive[0]);
  egg(body,[0,.104,.024],[.087,.036,.217],olive[3]);
  for (let j=0;j<13;j++) for (let i=0;i<9;i++) {
    const z=-.214+j*.036,a=(i-4+(j%2)*.45)*.30;
    const width=Math.sqrt(Math.max(0,1-(z/.27)**2));
    egg(body,[.104*width*Math.sin(a),.151+.070*width*Math.cos(a),z],
      [.016,.010,.021],olive[(j*3+i+(j+i)%3)%4],[0,.15*i,a],8);
  }
  const head=group(body,'head',[0,.146,.187],{anim:'sway',axis:'x',freq:1.15,amp:.12});
  egg(head,[0,.015,.055],[.080,.056,.110],olive[2]);
  egg(head,[0,-.017,.097],[.064,.027,.072],olive[3]);
  for (const side of [-1,1]) {
    egg(head,[side*.056,.046,.091],[.025,.024,.024],'#b7924e',undefined,14);
    egg(head,[side*.069,.051,.102],[.013,.015,.014],'#211e17',undefined,12);
    egg(head,[side*.073,.058,.111],[.005,.005,.005],'#e5deb4',undefined,8);
    egg(head,[side*.035,.006,.149],[.009,.006,.009],'#51472f',undefined,8);
    for (const [i,z] of [-.14,.115].entries()) {
      const leg=side>0?2+i:i;
      const knee=[side*.092,-.046,-.004], ankle=[side*.062,-.064,.045];
      const limb=group(body,'upper-leg',[side*.066,.116,z],
        {anim:'gait',leg,swing:.50,stride:.28,spread:.66});
      rod(limb,[0,0,0],knee,.028,olive[1],.021);
      const shin=group(limb,'lower-leg',knee,{anim:'knee',leg,bend:.68,stride:.28});
      rod(shin,[0,0,0],ankle,.019,olive[2],.011);
      for(let j=0;j<4;j++){
        rod(shin,ankle,[ankle[0]+side*(.024+.013*j),ankle[1]-.004,ankle[2]+.044-.017*j],
          .008,olive[3],.004);
      }
    }
  }
  let tail=group(body,'tail-base',[0,.144,-.193],{anim:'sway',freq:1.3,amp:.18});
  for(let i=0;i<6;i++) {
    const length=.08+i*.008, end=[i===0?.023:.018,i<3?.014:.004,-length];
    rod(tail,[0,0,0],end,.044-i*.006,olive[i%2],.038-i*.006);
    tail=group(tail,'tail-joint',end,{anim:'swish',swishAmp:.35+i*.055});
  }
});

asset('scetis-turturica',{soft:true,flyer:true},root=>{
  const grey='#a68f87', buff='#dbc0ad', brown='#a67558', flight='#685a5d';
  egg(root,[0,.305,0],[.206,.218,.35],grey);
  egg(root,[0,.275,.155],[.184,.183,.23],buff,[-.26,0,0]);
  const head=group(root,'head',[0,.463,.22],{anim:'peck'});
  egg(head,[0,.081,.067],[.130,.118,.133],'#a69ca5');
  rod(head,[0,.067,.15],[0,.055,.267],.044,'#614f52',.012);
  for (const side of [-1,1]) {
    egg(head,[side*.111,.105,.101],[.024,.028,.028],'#b95640',undefined,12);
    egg(head,[side*.124,.105,.108],[.017,.021,.020],'#282328',undefined,12);
    for (let i=0;i<5;i++) rod(root,[side*.117,.42+.018*i,.117],[side*.135,.431+.018*i,.214],.009,i%2?'#efe0d5':'#433c42',.008);
    const wing=group(root,'wing'+side,[side*.153,.378,.012],{anim:'flight-wing',side});
    egg(wing,[side*.162,-.012,-.105],[.255,.065,.242],brown);
    for(let i=0;i<8;i++) {
      const x=side*(.14+i*.056), z=-.27+i*.027;
      egg(wing,[x,.012,z],[.062,.026,.175-i*.006],i%2?flight:'#83716b',[0,-side*.26,0],12);
      egg(wing,[x*.58,.052,z+.079],[.053,.021,.094],i%2?'#c69472':'#b18367',[0,-side*.26,0],12);
    }
    rod(root,[side*.079,.155,.072],[side*.092,.024,.103],.022,'#a1786e',.016);
    for(let i=0;i<3;i++) rod(root,[side*.092,.024,.103],[side*(.055+i*.036),.013,.177],.010,'#a1786e',.007);
  }
  for(let i=-2;i<=2;i++) egg(root,[.065*i,.257,-.373],[.064,.035,.225],i%2?flight:'#857777',[.12,-.13*i,0],14);
});
