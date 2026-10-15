/**
 * Portal: a VR headset whose left lens is a door. At rest the door stands
 * ajar on its hinge; as the pointer comes near, it swings out on a spring and
 * the doorway's depth shows through the visor. The right lens stays a lens,
 * the strap loops round behind. The slider is how far the door can open.
 *
 * The pattern: one continuous answer. A spring on the door's angle, a falloff
 * by distance measured on a fixed plane through the visor (never on the
 * swinging leaf), and a rest pose that already tells the story: ajar.
 */
const {
  Cam, clamp, facing, fillet, fit, open, poly, prism, proj, rings, ringAt, run, rad, unproj,
  spring, stepS, mk, place, pointer, put, register, disposer, solid,
} = HL;

const W = 124, D = 40, H = 70, R = 16;           // visor body: x across, y depth, z up; the face is y = D
const U0 = 15, U1 = 64, V0 = 6, V1 = 63, DR = 16; // the doorway on the face, its top rounded
const LX = 94, LZ = 36, LR = 15;                  // the right lens
const REST = 22, REVEAL = 9, T = 2.4;             // ajar angle, wall depth seen in the doorway, leaf thickness

/** The door outline in its own plane: d across from the hinge, v up. */
const DOOR = fillet([[0, V0], [U1 - U0, V0], [U1 - U0, V1], [0, V1]], [0.6, 0.6, DR, DR], 6);

/** Share of the full swing at distance r from the doorway: 1 close by, easing to a floor of 0. */
const reach = (r) => (r <= 18 ? 1 : r >= 120 ? 0 : 1 - Math.pow((r - 18) / 102, 0.8));

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let MAX = value;
  const C = Cam(45, 0.5, 1.5);
  const far = (a) => [U0 + (U1 - U0) * Math.cos(rad(a)), D + (U1 - U0) * Math.sin(rad(a))];
  fit(C, [[-4, -70, 30], [W + 4, -70, 30], [W, D, 0], [0, D, 0], [62, -20, H + 24], [...far(140), V1], [...far(140), V0]], 200, 170);
  const P = proj(C), front = facing(C);
  const F = (u, v, y = D) => P(u, y, v); // a point on the visor's face

  const g = mk("g", {}, svg);

  // the strap, back half only: painted first, so the visor covers where they meet
  const [sr] = rings(-4, -70, W + 4, 20, 30, 1);
  const behind = run(sr, (q) => q.v < 2);
  mk("path", { d: open(ringAt(P, behind, 27)) + open(ringAt(P, behind, 41)), class: "nf" }, g);

  // the facial interface: a narrower step behind the visor, where the face goes
  const [gr, gi] = rings(8, -14, W - 8, 4, 12, 1.6);
  put(solid(g), prism(P, front, gr, gi, 7, H - 7));

  // the visor body: a rounded slab, one silhouette and one crease
  const [ring, inner] = rings(0, 0, W, D, R, 2);
  put(solid(g), prism(P, front, ring, inner, 0, H));

  // top strap over the crown of the head
  const arc = (x) => Array.from({ length: 25 }, (_, i) => {
    const t = i / 24;
    return P(x, 12 - 78 * t, H - 2 + 24 * Math.sin(Math.PI * t) - 26 * t * t);
  });
  mk("path", { d: open(arc(55)) + open(arc(69)), class: "nf lo" }, g);

  // the right lens: two rings on the face
  const circle = (r) => Array.from({ length: 40 }, (_, i) => F(LX + r * Math.cos((i / 40) * Math.PI * 2), LZ + r * Math.sin((i / 40) * Math.PI * 2)));
  mk("path", { d: poly(circle(LR)), class: "nf" }, g);
  mk("path", { d: poly(circle(LR - 5)), class: "nf lo" }, g);

  // the doorway: its outline, the wall's thickness on the jamb and the sill, and light at the far end
  mk("path", { d: poly(DOOR.map(([d, v]) => F(U0 + d, v))), class: "nf" }, g);
  const jamb = [F(U0, V0), F(U0, V1 - DR), F(U0, V1 - DR, D - REVEAL), F(U0, V0, D - REVEAL)];
  const sill = [F(U0, V0), F(U1, V0), F(U1, V0, D - REVEAL), F(U0, V0, D - REVEAL)];
  mk("path", { d: poly(jamb), class: "lo" }, g);
  mk("path", { d: poly(sill), class: "lo" }, g);
  const glow = mk("circle", { r: 1.6, class: "dot m" }, g);
  place(glow, F((U0 + U1) / 2 + 4, V0 + 14, D - REVEAL));

  // the door leaf: back face (thickness), then the front, bright, and its handle
  const leaf = mk("g", {}, g);
  const back = mk("path", { class: "lo" }, leaf);
  const face = mk("path", { class: "sil hi" }, leaf);
  const knob = mk("circle", { r: 1.2, class: "dot" }, leaf);

  const sp = spring(REST, { eps: 0.05 });
  let drawn = NaN;
  function draw() {
    const a = sp.x;
    if (a === drawn) return;
    drawn = a;
    const c = Math.cos(rad(a)), s = Math.sin(rad(a));
    const at = (d, v, off) => P(U0 + d * c - s * off, D + d * s + c * off, v);
    back.setAttribute("d", poly(DOOR.map(([d, v]) => at(d, v, -T))));
    face.setAttribute("d", poly(DOOR.map(([d, v]) => at(d, v, 0))));
    place(knob, at(U1 - U0 - 6, 32, 0.6));
    // the far end lights up as the door opens
    glow.setAttribute("class", a > (REST + MAX) / 2 ? "dot" : "dot m");
  }

  const B = register(stage, (dt) => { const m = stepS(sp, dt); draw(); return m; });
  bag.add(B.unregister);

  let over = null;
  function retarget() {
    if (!over) { sp.t = REST; read.textContent = "rest"; B.wake(); return; }
    // distance from the doorway on a fixed plane at mid-door height: the leaf never moves the hit
    const r = Math.hypot(over[0] - (U0 + U1) / 2, (over[1] - D) * 1.2);
    sp.t = REST + (MAX - REST) * reach(r);
    read.textContent = `open ${Math.round(clamp(sp.t, 0, 180))}°`;
    B.wake();
  }
  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], (V0 + V1) / 2); retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());
  draw();

  return {
    set: (v) => { MAX = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "portal",
  means: "A VR headset whose left lens is a door: bring the pointer near and it swings open onto somewhere else.",
  rules: [1, 3, 5, 6],
  range: [85, 115, 140],
  tour: [[150, 220], [118, 196], [250, 150], null],
  mount,
});
