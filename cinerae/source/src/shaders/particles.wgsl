// Instanced soft-dot rendering of the particle buffer, additive into the
// trail target. Warm-white monochrome; crystallized grains take their
// brightness from the camera luminance imprint stored in the field texture.
struct RenderParams {
  viewport: vec2f,   // target size in px
  pointSize: f32,    // grain diameter in px
  crystal: f32,
  baseAlpha: f32,
  count: f32,
  gridCols: f32,
  gridRows: f32,
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) pointCoord: vec2f,
  @location(1) brightness: f32,
};

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
@group(0) @binding(2) var field: texture_2d<f32>;

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

@vertex fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOut {
  var out: VertexOut;
  if (f32(instanceIndex) >= params.count) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0); // off-screen, degenerate
    out.pointCoord = vec2f(0.0);
    out.brightness = 0.0;
    return out;
  }

  let p = particles[instanceIndex];
  let pos = p.xy;
  let speed = length(p.zw);

  // Crystallized grains inherit the luminance imprint at their home cell;
  // dark cells go out, bright cells stay lit -> the frozen image emerges.
  let home = homeOf(instanceIndex);
  let dims = vec2f(textureDimensions(field, 0));
  let texel = vec2u(clamp(home, vec2f(0.0), vec2f(0.9995)) * dims);
  let imprint = textureLoad(field, texel, 0).b;
  let fluid = 0.55 + min(speed * 9.0, 1.4);
  let frozen = 0.12 + imprint * 1.7;
  out.brightness = mix(fluid, frozen, params.crystal * params.crystal);

  let corner = quadCorner(vertexIndex);
  let ndc = vec2f(pos.x * 2.0 - 1.0, 1.0 - pos.y * 2.0);
  let offset = corner * params.pointSize / params.viewport;
  out.position = vec4f(ndc + offset, 0.0, 1.0);
  out.pointCoord = corner;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let d2 = dot(in.pointCoord, in.pointCoord);
  if (d2 > 1.0) {
    discard;
  }
  let falloff = (1.0 - d2) * (1.0 - d2);
  // Pure intensity; the present pass owns tint and grade.
  let a = params.baseAlpha * falloff * in.brightness;
  return vec4f(a, a, a, a);
}
