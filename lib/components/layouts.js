// Pure (no three.js) layout data for sets: where things are and named anchors.
// Used both by the timeline compiler (Node + browser) and by the 3D set builders.
//
// Coordinates: 1 unit = 1 LEGO stud (8 mm). Ground plane is X/Z, Y is up.
// Heading h (radians): an object with heading h faces direction (sin h, cos h).
// h = 0 faces +Z, which is towards the default camera.

const TAU = Math.PI * 2;

export const headingTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

function circleLavra(opts = {}) {
  const n = opts.cells ?? 4;
  const R = opts.radius ?? 15;
  const anchors = { center: { pos: [0, 0], h: 0 } };
  const cells = [];
  for (let i = 0; i < n; i++) {
    // cell1 sits at +Z (closest to the default camera), the rest go clockwise seen from above
    const a = (i / n) * TAU;
    const c = [R * Math.sin(a), R * Math.cos(a)];
    const h = headingTo(c, [0, 0]); // door faces the center of the lavra
    const church = opts.church === i + 1;           // `church: N` = cell N is the (bigger) church of the lavra
    const dd = church ? 6.0 : 5.5;
    const door = [c[0] + Math.sin(h) * dd, c[1] + Math.cos(h) * dd];
    const name = `cell${i + 1}`;
    cells.push({ name, pos: c, h, colorIndex: i, church });
    anchors[name] = { pos: door, h };            // spot right in front of the door, facing the center
    anchors[`${name}.hut`] = { pos: c, h };     // center of the hut itself
    if (church) { anchors.church = anchors[name]; anchors['church.hut'] = anchors[`${name}.hut`]; }
  }
  // spots far away on the dunes, for entering / leaving the frame
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  // the well sits on the outer ring, between the last cell and the first (keeps the middle open for cameras)
  const wa = ((n - 0.5) / n) * TAU;
  const well = [20 * Math.sin(wa), 20 * Math.cos(wa)];
  anchors.well = { pos: well, h: headingTo(well, [0, 0]) };
  // palms stand between the cells, outside the path, so cameras looking out from the center are not blocked
  const palms = opts.palms ?? Array.from({ length: n - 1 }, (_, i) => {
    const a = ((i + 0.5) / n) * TAU;
    return [21 * Math.sin(a), 21 * Math.cos(a)];
  }).concat([[30, 26], [-31, 22], [-27, -28]]);
  return { size: 80, cells, anchors, palms, well };
}

// A small Egyptian village by the Nile, with a bakery. A desert road comes in from +Z (towards the default
// camera), passes between the dunes and ends in the market square at the centre. The bakery stall faces +Z.
function egyptVillage() {
  const anchors = {
    center: { pos: [0, 0], h: 0 },
    bakery: { pos: [3, -1.4], h: Math.PI },      // customer spot in front of the counter, facing the baker
    baker: { pos: [3, -7.8], h: 0 },             // behind the counter, facing the customer
    counter: { pos: [3, -5.2], h: 0 },           // top of the counter (put things here with y 2.4)
    oven: { pos: [10, -9], h: 0 },
    road: { pos: [0, 14], h: Math.PI },          // where the road enters the village, facing the market
    roadFar: { pos: [0, 30], h: Math.PI },       // far out on the desert road
    nile: { pos: [-27, 0], h: Math.PI / 2 },     // river bank, facing the village
  };
  const houses = [
    { name: 'house1', pos: [-12, -13], h: 0.35 },
    { name: 'house2', pos: [19, -14], h: -0.45 },
    { name: 'house3', pos: [-17, 4], h: Math.PI / 2 },
    { name: 'house4', pos: [18, 6], h: -Math.PI / 2 },
    { name: 'house5', pos: [-2, -22], h: 0 },
  ];
  for (const hs of houses) {
    anchors[`${hs.name}.hut`] = { pos: hs.pos, h: hs.h };
    anchors[hs.name] = { pos: [hs.pos[0] + Math.sin(hs.h) * 5.5, hs.pos[1] + Math.cos(hs.h) * 5.5], h: hs.h };
  }
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = [[-24, -10], [-25, 9], [-23, 20], [-26, -22], [9, 13], [-8, 12], [27, -4], [12, -24]];
  return { size: 80, houses, anchors, palms, road: { x: 0, width: 4, from: 2, to: 40 } };
}

// A wheat field ("ogor") by the Nile, at harvest. The field lies behind the action (-Z), the open ground in
// front of it is where people talk, a shade tree stands on the left, the threshing floor (sheaves) on the right,
// the farmer's house at the back right, a path comes in from +Z. `reaped` (0..1) = how much of the field is cut,
// from the front row backwards.
function wheatField(opts = {}) {
  const field = { x0: -10, x1: 10, z0: -16, z1: -2 };
  const reaped = Math.max(0, Math.min(1, opts.reaped ?? 0));
  const cutZ = field.z1 - reaped * (field.z1 - field.z0); // wheat still stands where z < cutZ
  const anchors = {
    center: { pos: [0, 3], h: 0 },
    field: { pos: [0, (field.z0 + field.z1) / 2], h: 0 },
    fieldEdge: { pos: [0, Math.min(cutZ, field.z1) + 1.6], h: Math.PI },   // in front of the standing wheat, facing it
    reapL: { pos: [-4.5, Math.min(cutZ, field.z1) + 1.6], h: Math.PI },
    reapR: { pos: [4.5, Math.min(cutZ, field.z1) + 1.6], h: Math.PI },
    tree: { pos: [-13, 3.5], h: 0.6 },          // in the shade, under the tree, looking at the field and the camera
    threshing: { pos: [14, 2], h: -Math.PI / 2 }, // the threshing floor where the sheaves are piled
    house: { pos: [16, -9.5], h: -0.5 },         // in front of the farmer's door
    'house.hut': { pos: [18.7, -14], h: -0.5 },
    road: { pos: [0, 14], h: Math.PI },
    roadFar: { pos: [0, 32], h: Math.PI },
    canal: { pos: [-11, -9], h: Math.PI / 2 },
  };
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = opts.palms ?? [[-24, -12], [-26, 4], [24, 8], [27, -20], [-20, -26], [6, -28]];
  return { size: 80, field, reaped, cutZ, anchors, palms, tree: [-15, 1.5], threshing: [14, 2], road: { x: 0, width: 4, from: 7, to: 40 } };
}

// A road through the open desert ("drumul prin pustiu"): a sandy path winds from the far back (-Z) to the front (+Z),
// dunes on both sides, a big rock with a shady spot on the left, a small oasis (pool + palms) on the right, and,
// optionally, one or two hermit cells at the back end of the road (`cells`: 0, 1, 2).
export const desertRoadX = (z) => 3 * Math.sin(z / 11);
function desertRoad(opts = {}) {
  const P = (z) => [desertRoadX(z), z];
  const along = (z) => Math.atan2(desertRoadX(z + 0.5) - desertRoadX(z - 0.5), 1); // heading of the road towards +Z
  const anchors = {
    center: { pos: P(0), h: along(0) },
    near: { pos: P(12), h: along(12) },          // on the road, closer to the camera
    far: { pos: P(-12), h: along(-12) },         // on the road, further back
    farther: { pos: P(-24), h: along(-24) },
    roadFar: { pos: P(-36), h: along(-36) },     // where the road disappears behind the dunes
    roadNear: { pos: P(30), h: along(30) + Math.PI }, // far out in front (walk off towards the camera)
  };
  const rock = [-10, -4], pool = [11, -9];
  anchors['rock.big'] = { pos: rock, h: 0 };
  anchors.rock = { pos: [-5.2, -1.6], h: headingTo(rock, [-5.2, -1.6]) };   // in the shade of the big rock, facing the road
  anchors['oasis.pool'] = { pos: pool, h: 0 };
  anchors.oasis = { pos: [7.4, -6.6], h: headingTo(pool, [7.4, -6.6]) };    // by the pool, facing the road
  const cellsN = opts.cells ?? 0;
  const cells = [[-7, -26, 0.25], [8, -27, -0.25]].slice(0, cellsN).map(([x, z, h], i) => ({ name: `cell${i + 1}`, pos: [x, z], h }));
  for (const c of cells) {
    anchors[`${c.name}.hut`] = { pos: c.pos, h: c.h };
    anchors[c.name] = { pos: [c.pos[0] + Math.sin(c.h) * 5.5, c.pos[1] + Math.cos(c.h) * 5.5], h: c.h };
  }
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = opts.palms ?? [[13.5, -11.5], [9, -12.5], [14, -6.5], [-22, 14], [24, 16]];
  return { size: 80, anchors, cells, rock, pool, palms, road: { width: 4, from: -40, to: 40 } };
}

// A sandy bank of the Nile ("malul Nilului"): the river runs along the back (water for z < `waterZ`), a small hermit
// hut (Avva's cell) stands at the back right, a net-drying rack on the left, palms and papyrus along the water,
// a little boat on the river and a sandy path coming in from +Z.
function nileBank(opts = {}) {
  const waterZ = -18;
  const hut = { pos: [11, -9], h: -0.3 };
  const anchors = {
    center: { pos: [0, 0], h: 0 },
    hut: { pos: [hut.pos[0] + Math.sin(hut.h) * 5.5, hut.pos[1] + Math.cos(hut.h) * 5.5], h: hut.h },  // in front of the door
    'hut.hut': { pos: hut.pos, h: hut.h },
    bank: { pos: [-2, -13], h: 0 },                 // on the sand by the water, facing the camera, the river behind
    rack: { pos: [-10, -3.5], h: 0.2 },             // in front of the net-drying rack
    'rack.rack': { pos: [-10, -8], h: 0.2 },
    boat: { pos: [-9, -22.5], h: Math.PI / 2 },     // the little boat on the water
    shade: { pos: [-17, 2], h: 0.5 },               // in the shade of the left palm
    road: { pos: [0, 16], h: Math.PI },
    roadFar: { pos: [0, 32], h: Math.PI },
  };
  anchors.cell1 = anchors.hut; anchors['cell1.hut'] = anchors['hut.hut'];
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = opts.palms ?? [[-21, -9], [19, -15], [-26, 12], [25, 14]];
  return { size: 80, waterZ, hut, anchors, palms, rack: { pos: [-10, -8], h: 0.2 }, boat: { pos: [-9, -22.5], h: Math.PI / 2 }, road: { x: 0, width: 3, from: 12, to: 40 } };
}

// A lonely sandstone cell in the desert ("chilia din pustie", the poster of "Ușa prieteniei"): the cell stands at the
// back right with its big arched door facing +Z, a palm on the left, a path coming in from the front left, dunes and grey
// rocks all around. The door is a prop (`plankDoor` at `door.hinge`) so it can open.
function desertHermitage(opts = {}) {
  const cell = { pos: [8, -10], h: 0 };
  const L = (dx, dz) => [cell.pos[0] + dx, cell.pos[1] + dz];
  const anchors = {
    center: { pos: [2, 1], h: 0 },
    'cell.hut': { pos: cell.pos, h: 0 },
    door: { pos: L(3.5, 6.6), h: Math.PI },          // right in front of the door, facing it (close enough to knock)
    'door.in': { pos: L(3.5, 4.0), h: 0 },           // in the doorway, facing out
    'door.hinge': { pos: L(5, 4.9), h: 0 },          // where the `plankDoor` prop goes
    inside: { pos: L(1, 0), h: 0 },                  // inside the room (hidden by the walls)
    window: { pos: L(-2, 7.4), h: Math.PI },         // outside, in front of the window
    'window.in': { pos: L(-2, 3.4), h: 0 },          // inside, looking out of the window
    wait: { pos: L(-3.5, 9.5), h: 2.6 },             // on the path left of the door, facing it (the visitors wait here)
    palm: { pos: [-5, -2.5], h: 0.4 },               // in the shade of the palm
    road: { pos: [-15, 9], h: 2.2 },                 // where the path comes in, facing the cell
    roadFar: { pos: [-32, 20], h: 2.2 },
  };
  anchors.cell1 = anchors.door; anchors['cell1.hut'] = anchors['cell.hut'];
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = opts.palms ?? [[-8, -6.5, 11], [24, -17, 9], [-24, -14, 8]];
  const path = [[-24, 15.5], [-15, 9], [-3, 1.5], [L(3.5, 7.4)[0], L(3.5, 7.4)[1]]];
  return { size: 80, cell, anchors, palms, path };
}

// 2D engine ("engine": "2d"): a painted lavra seen from the front, like a stage. x = left/right, z = depth
// (+z towards the viewer, as in 3D). Cells stand in a row at the back, the church in the middle, a sandy yard in front.
// `cells` (2–4), `church` (true = the middle building is the church). Anchors: cellN / church = in front of the door
// (facing the viewer), center, left / right (far edges for entering / leaving), well.
export function lavra2d(opts = {}) {
  const n = Math.max(2, Math.min(4, opts.cells ?? 4));
  const church = opts.church !== false;
  const xs = { 2: [-13, 13], 3: [-18, 0, 18], 4: [-27, -11, 11, 27] }[n];
  const anchors = { center: { pos: [0, 0], h: 0 }, left: { pos: [-38, 3], h: Math.PI / 2 }, right: { pos: [38, 3], h: -Math.PI / 2 } };
  // `varied: true` → cells of different sizes (deterministic per index); `roofs`: "flat" | "vault" | "mixed"
  const VW = [7.2, 8.6, 7.6, 8.2], VH = [5.4, 6.8, 6.0, 5.6];
  const roofOf = (i) => (opts.roofs === 'vault' ? 'vault' : opts.roofs === 'mixed' ? (i % 2 ? 'vault' : 'flat') : 'flat');
  const cells = xs.map((x, i) => {
    const name = `cell${i + 1}`;
    const c = { name, x, z: -10, w: opts.varied ? VW[i % 4] : 8, d: 6, h: opts.varied ? VH[i % 4] : 6, roof: roofOf(i) };
    anchors[name] = { pos: [x, -10 + 3 + 2.2], h: 0 };
    anchors[`${name}.hut`] = { pos: [x, -10], h: 0 };
    return c;
  });
  // the church: `dome` "round" (a low Coptic mud-brick dome, default) | "drum" (a dome on a tall drum with little
  // windows) | "bell" (no dome: a bell gable on the roof) | "twin" (a big dome and a small one)
  const ch = church ? { x: 0, z: -18, w: 12, d: 9, h: 8.5, dome: opts.dome || 'round' } : null;
  if (ch) anchors.church = { pos: [0, -18 + 4.5 + 2.4], h: 0 };
  anchors.well = { pos: [n === 3 ? -9 : 0, -1.5], h: 0 };
  const palms = opts.palms ?? [[-40, -14], [-19, -16], [19, -15], [41, -12], [-34, 6], [33, 8]];
  return { size: 90, cells, church: ch, palms, anchors, twoD: true };
}

// 2D engine: "hermitage2d" — a hermit's cell cut into a rock in the stony desert (painterly, muted, like an old book
// illustration). A big sandstone outcrop on the left with an arched cave door and a wooden cross, a flat sitting stone in
// the open middle, a rocky gully (râpă) among boulders on the right, tall leaning date palms.
// Anchors: `cave` (in front of the cave door, facing the viewer), `cave.door`, `seat` (the sitting stone: cast with
// "posture": "sit", "seat": 0.8), `ravine` (inside the gully, among the boulders), `center`, `left` / `right`.
function hermitage2d(opts = {}) {
  const anchors = { center: { pos: [0, 0], h: 0 }, left: { pos: [-40, 3], h: Math.PI / 2 }, right: { pos: [40, 3], h: -Math.PI / 2 } };
  const rock = { name: 'cave', x: -15, z: -9, w: 17, d: 6, h: 10.5 };
  anchors.cave = { pos: [rock.x + 1, rock.z + rock.d / 2 + 2], h: 0 };
  anchors['cave.door'] = { pos: [rock.x + 1, rock.z + rock.d / 2 + 0.2], h: 0 };
  const seat = opts.seat === false ? null : { x: 3, z: -2, w: 3.4, h: 0.8 };
  if (seat) anchors.seat = { pos: [seat.x, seat.z], h: 0 };
  const ravine = { x: 31, z: -5 };
  anchors.ravine = { pos: [ravine.x, ravine.z], h: 0 };
  anchors.well = anchors.center;
  const palms = opts.palms ?? [[18, -8], [-36, -13], [44, -15]];
  return { size: 90, cells: [], rocks: [rock], seat, ravine, church: null, palms, anchors, twoD: true, hermitage: true };
}


// "cave-hermitage" (peștera din stâncă — the poster of „Avva Siluan și rugăciunea spusă altfel”): a big grey rock on the right
// with an arched cave mouth of chunky stone blocks; inside, a warm room with an icon on the back wall and a candle on a wooden
// shelf; stone blocks to sit on at the mouth; a terraced sandstone hill with a little monastery, cypresses behind on the left,
// purple mountains and (best) a `sunset` sky. The rock faces +Z turned a little to the left (`h`).
// Anchors: `cave` (the elder's seat at the cave mouth, on a stone block: cast with "posture": "sit", "seat": 1.2, facing the
// guest seat), `seat` (the guest's stone block in front, left of the mouth, facing the cave seat: same seat height),
// `cave.in` (inside, in front of the icon, facing it), `icon` (on the back wall, where the `icon` prop goes; `icon.y`),
// `shelf` (the wooden shelf with the candle), `door` (standing in the mouth, facing out), `pray` (outside the mouth facing in,
// left of `door`), `path` / `road` / `roadFar` (the path coming in from the front left), `center`, `edge0`…`edge315`.
function caveHermitage(opts = {}) {
  const h = (opts.h ?? -22) * Math.PI / 180;
  const cave = { pos: [8, -9], h };
  const L = (dx, dz) => [cave.pos[0] + dx * Math.cos(h) + dz * Math.sin(h), cave.pos[1] - dx * Math.sin(h) + dz * Math.cos(h)];
  const seatC = L(-3.2, 4.6), seatG = L(-7.6, 6.4);
  const anchors = {
    center: { pos: [0, 2], h: 0 },
    'cave.hut': { pos: cave.pos, h },
    cave: { pos: seatC, h: headingTo(seatC, seatG) },
    seat: { pos: seatG, h: headingTo(seatG, seatC) },
    'cave.in': { pos: L(1.2, -0.6), h: h + Math.PI },
    icon: { pos: L(0.2, -3.1), h },
    shelf: { pos: L(4.3, -1.4), h: h - Math.PI / 2 },
    door: { pos: L(0.6, 3.2), h },
    pray: { pos: L(0.2, 6.8), h: h + Math.PI },
    path: { pos: [-6, 9], h: 2.4 },
    road: { pos: [-15, 15], h: 2.4 },
    roadFar: { pos: [-30, 26], h: 2.4 },
  };
  anchors.cell1 = anchors.door; anchors['cell1.hut'] = anchors['cave.hut'];
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const seats = [seatC, seatG];
  const path = [[-30, 26], [-15, 15], [-6, 9], L(-0.5, 8.5)];
  return { size: 90, cave, anchors, seats, path, iconY: 3.2, local: L };
}

// "monastery-yard" (curtea mănăstirii — the scene of „Avva Teodor și grâul cel bun”): a paved sandy courtyard; on the left a
// grey rock with the elder's cave cell (arched mouth turned to the yard, a bed and a torch inside); at the back a long
// sandstone wing with an arcade of round arches and a domed bell tower on its right; a roofed stone well on the right, palms,
// red-ochre mountains far away. The gate (road) comes in from the front right.
// Anchors: `cave` (in front of the cave mouth, facing the yard), `cave.in` (inside, facing out), `door` (in the mouth),
// `store` (a free spot right of the cave where sacks of grain stand), `yard` (the middle of the court, facing the cave side),
// `arcade` (under the arches, facing the yard), `well` (in front of the well), `gate` / `road` / `roadFar` (front right),
// `center`, `edge0`…`edge315`.
function monasteryYard(opts = {}) {
  const h = (opts.h ?? 58) * Math.PI / 180;
  const cave = { pos: [-20, -2], h };
  const L = (dx, dz) => [cave.pos[0] + dx * Math.cos(h) + dz * Math.sin(h), cave.pos[1] - dx * Math.sin(h) + dz * Math.cos(h)];
  const cloister = { pos: [2, -18], h: 0 };
  const well = { pos: [21, -11], h: -Math.PI / 2 };
  const anchors = {
    center: { pos: [0, 0], h: 0 },
    'cave.hut': { pos: cave.pos, h },
    cave: { pos: L(0, 6.2), h },
    'cave.in': { pos: L(0.4, 0.2), h },
    door: { pos: L(0, 3.4), h },
    store: { pos: [-8, -6.5], h: 0.3 },
    yard: { pos: [-2, 1], h: -1.2 },
    arcade: { pos: [2, -15.5], h: 0 },
    'cloister.hut': { pos: cloister.pos, h: 0 },
    'well.hut': { pos: well.pos, h: well.h },
    well: { pos: [well.pos[0] - 4, well.pos[1]], h: Math.PI / 2 },
    gate: { pos: [14, 12], h: -2.3 },
    road: { pos: [20, 18], h: -2.3 },
    roadFar: { pos: [32, 30], h: -2.3 },
  };
  anchors.cell1 = anchors.cave; anchors['cell1.hut'] = anchors['cave.hut'];
  for (let d = 0; d < 360; d += 45) {
    const a = (d / 360) * TAU;
    anchors[`edge${d}`] = { pos: [34 * Math.sin(a), 34 * Math.cos(a)], h: a + Math.PI };
  }
  const palms = opts.palms ?? [[-6, -26, 10], [26, -16, 9], [-30, -16, 9], [27, 4, 8]];
  return { size: 90, cave, cloister, well, palms, anchors, local: L };
}

const LAYOUTS = {
  'monastery-yard': monasteryYard,
  'cave-hermitage': caveHermitage,
  'nile-bank': nileBank,
  'desert-hermitage': desertHermitage,
  'desert-lavra': circleLavra,
  'egypt-village': egyptVillage,
  'wheat-field': wheatField,
  'desert-road': desertRoad,
  'lavra2d': lavra2d,
  'hermitage2d': hermitage2d,
};

export function getLayout(setDef) {
  const type = typeof setDef === 'string' ? setDef : setDef?.type;
  const fn = LAYOUTS[type];
  if (!fn) throw new Error(`Unknown set type "${type}". Known: ${Object.keys(LAYOUTS).join(', ')}`);
  return fn(typeof setDef === 'object' ? setDef : {});
}
