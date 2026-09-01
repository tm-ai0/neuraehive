// Instanced soft-dot rendering of the particle buffer, additive into the
// trail target. Warm-white monochrome as a rule; the life cycle bends it:
// fresh embers glow orange and cool to white, ash grains dim toward the
// background, comets stretch along their flight and burn bright. Crystallized
// grains take their brightness from the camera luminance imprint. The palette
// gradient can recolor each grain along a chosen driver (age, speed, local
// density, parallax depth); three depth layers scale the grains and a cheap
// depth-of-field blows the out-of-focus layers into soft discs.
struct RenderParams {
  viewport: vec2f,   // target size in px
  pointSize: f32,    // grain diameter in px
  crystal: f32,
  baseAlpha: f32,
  count: f32,
  gridCols: f32,
  gridRows: f32,
  titleMode: f32,
  ashLevel: f32,     // must match the simulation's life-cycle threshold
  imprintShape: f32, // 1 = crystal holds a shape imprint, 0 = camera image
  imprintGlow: f32,  // even glow of a held grain, tuned to the point count
  stop0: vec4f,      // palette gradient, evenly spaced stops (rgb)
  stop1: vec4f,
  stop2: vec4f,
  stop3: vec4f,
  stop4: vec4f,
  stopCount: f32,
  colorDriver: f32,  // 0 âge, 1 vitesse, 2 densité, 3 profondeur
  depthAmount: f32,  // parallax layer separation, 0 = off
  focusLayer: f32,   // 0 far, 1 mid, 2 near
  dofBlur: f32,      // out-of-focus blur amount
  presence: f32,     // someone-in-frame envelope 0..1
  presenceSize: f32, // point-size multiplier of portrait grains
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) pointCoord: vec2f,
  @location(1) brightness: f32,
  @location(2) tint: vec3f,
  @location(3) streak: f32, // 0 = round grain, 1 = full comet filament
};

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
@group(0) @binding(2) var field: texture_2d<f32>;
@group(0) @binding(3) var prevTrail: texture_2d<f32>;

fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hash01(n: u32) -> f32 {
  return f32(pcg(n)) / 4294967295.0;
}

fn homeOf(i: u32) -> vec2f {
  let cols = params.gridCols;
  let col = f32(i % u32(cols));
  let row = f32(i / u32(cols));
  let jitter = vec2f(hash01(i * 2u + 1u), hash01(i * 2u + 2u)) - vec2f(0.5);
  return vec2f(
    (col + 0.5 + jitter.x * 0.9) / cols,
    (row + 0.5 + jitter.y * 0.9) / params.gridRows,
  );
}

fn quadCorner(vertexIndex: u32) -> vec2f {
  let cornerIndex = array<u32, 6>(0u, 1u, 2u, 2u, 1u, 3u)[vertexIndex % 6u];
  switch (cornerIndex) {
    case 0u: { return vec2f(-1.0, -1.0); }
    case 1u: { return vec2f( 1.0, -1.0); }
    case 2u: { return vec2f(-1.0,  1.0); }
    default: { return vec2f( 1.0,  1.0); }
  }
}

// 1 = living dust, dips toward the ash floor, releases just before the age
// wrap so rebirth in place is a slow re-brightening, never a pop.
fn lifeTone(age: f32) -> f32 {
  let fall = smoothstep(params.ashLevel, params.ashLevel + 0.04, age);
  let rise = smoothstep(0.965, 1.0, age);
  return mix(1.0, 0.16, fall * (1.0 - rise));
}

// Evenly spaced gradient sample. With the default two white stops this is
// exactly the historical warm-white grain.
fn palette(t: f32) -> vec3f {
  var stops = array<vec4f, 5>(params.stop0, params.stop1, params.stop2, params.stop3, params.stop4);
  let n = clamp(params.stopCount, 2.0, 5.0);
  let x = clamp(t, 0.0, 1.0) * (n - 1.0);
  let i = u32(min(x, n - 2.0));
  let f = clamp(x - f32(i), 0.0, 1.0);
  return mix(stops[i].rgb, stops[i + 1u].rgb, f);
}

@vertex fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  var out: VertexOut;
  if (f32(instanceIndex) >= params.count) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0); // off-screen, degenerate
    out.pointCoord = vec2f(0.0);
    out.brightness = 0.0;
    out.tint = vec3f(0.0);
    out.streak = 0.0;
    return out;
  }

  let p = particles[instanceIndex * 2u];
  let extra = particles[instanceIndex * 2u + 1u];
  let pos = p.xy;
  let speed = length(p.zw);
  let heat = extra.x;
  let age = extra.y;
  let comet = extra.z;
  // Presence: the simulation packs the trame luminance of a held grain into
  // the spare channel — 0 means this grain plays no part in the portrait.
  let presMix = select(0.0, params.presence, extra.w > 0.001);
  let presLum = clamp((extra.w - 0.02) / 0.98, 0.0, 1.0);

  // Parallax layer of this grain: 0 far, 1 mid, 2 near (same as simulate).
  let layer = f32(instanceIndex % 3u);

  // Crystallized grains inherit the luminance imprint at their home cell;
  // dark cells go out, bright cells stay lit -> the frozen image emerges.
  let home = homeOf(instanceIndex);
  let dims = vec2f(textureDimensions(field, 0));
  let texel = vec2u(clamp(home, vec2f(0.0), vec2f(0.9995)) * dims);
  let imprint = textureLoad(field, texel, 0).b;
  let fluid = 0.55 + min(speed * 9.0, 1.4);
  let frozen = 0.10 + imprint * 1.2;
  // Shape imprints glow evenly (the additive pile-up on the strokes does the
  // drawing); only the camera imprint reads the frozen luminance image.
  let held = select(frozen, params.imprintGlow, params.imprintShape > 0.5);
  let crystalWeight = params.crystal * (1.0 - params.titleMode);
  var brightness = mix(fluid, held, crystalWeight * crystalWeight);
  // The life cycle darkens ash; embers and comets burn over everything.
  brightness *= lifeTone(age);
  brightness *= 1.0 + heat * 1.1 + comet * 0.8;
  // While the imprint holds the matter, every grain glows evenly; the
  // additive pile-up on the strokes does the rest.
  brightness = mix(brightness, params.imprintGlow, params.titleMode * params.titleMode);
  // Presence portrait: a held grain glows with the light it stands on, so
  // the bichromie lumière/ombre reads even on a plain white palette. The
  // free dust steps back while someone is there — the matter gathers on them.
  brightness = mix(brightness, 0.30 + presLum * 1.15, presMix);
  let heldFlag = select(0.0, 1.0, extra.w > 0.001);
  brightness *= 1.0 - params.presence * 0.4 * (1.0 - heldFlag);

  // Palette color along the chosen driver; ember orange burns over it.
  var t = age;
  if (params.colorDriver > 2.5) {
    t = layer * 0.5;
  } else if (params.colorDriver > 1.5) {
    let tdims = vec2f(textureDimensions(prevTrail, 0));
    let ttexel = vec2u(clamp(pos, vec2f(0.0), vec2f(0.9995)) * tdims);
    let dens = textureLoad(prevTrail, ttexel, 0).rgb;
    t = 1.0 - exp(-dot(dens, vec3f(0.5, 0.6, 0.35)) * 3.0);
  } else if (params.colorDriver > 0.5) {
    t = clamp(speed * 9.0, 0.0, 1.0);
  }
  // The portrait hooks the driver to the camera light: shadow reads the low
  // end of the palette gradient, light the high end — bichromie lumière/ombre.
  t = mix(t, presLum, presMix);
  let hotness = clamp(heat * 1.15, 0.0, 1.0);
  out.tint = mix(palette(t), vec3f(1.0, 0.42, 0.16), hotness);

  // Depth layers: far grains smaller and dimmer, near ones bigger; the
  // out-of-focus layers spread into soft low-alpha discs (cheap bokeh).
  let layerSize = mix(0.62, 1.5, layer * 0.5);
  let sizeF = mix(1.0, layerSize, params.depthAmount);
  brightness *= mix(1.0, mix(0.8, 1.15, layer * 0.5), params.depthAmount);
  let blur = params.dofBlur * abs(layer - params.focusLayer);
  let blurMul = 1.0 + blur * 2.2;
  brightness /= blurMul * blurMul;

  let corner = quadCorner(vertexIndex);
  let px = params.pointSize * sizeF * blurMul * mix(1.0, params.presenceSize, presMix);
  var offsetPx = corner * px;
  out.streak = 0.0;
  // Comets stretch along their flight. The stretch follows speed but
  // saturates, and the light spreads over the length instead of stacking —
  // a luminous filament at any speed, never a bar.
  if (comet > 0.02 && speed > 1e-4) {
    let dir = p.zw / speed;
    let stretch = 1.0 + comet * 11.0 * speed / (speed + 0.35);
    offsetPx = (dir * corner.x * stretch + vec2f(-dir.y, dir.x) * corner.y) * px;
    out.streak = min(comet * 2.0, 1.0);
    brightness *= inverseSqrt(stretch);
  }
  out.brightness = brightness;
  let ndc = vec2f(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0);
  // UV y grows downward, NDC y upward: flip the offset's y.
  out.position = vec4f(ndc + vec2f(offsetPx.x, -offsetPx.y) / params.viewport, 0.0, 1.0);
  out.pointCoord = corner;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let d2 = dot(in.pointCoord, in.pointCoord);
  if (d2 > 1.0) {
    discard;
  }
  var falloff = (1.0 - d2) * (1.0 - d2);
  // Comet profile: bright head, breathing tail.
  falloff *= mix(1.0, 0.35 + 0.65 * (in.pointCoord.x * 0.5 + 0.5), in.streak);
  // Intensity with the life-cycle tint; the present pass owns the grade.
  let a = params.baseAlpha * falloff * in.brightness;
  return vec4f(in.tint * a, a);
}
