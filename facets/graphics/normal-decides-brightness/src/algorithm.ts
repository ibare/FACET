/**
 * normal-decides-brightness — 면이 향한 쪽이 밝기를 정한다 (램버트 코사인 법칙).
 *
 * 폭이 같은 평행 빛줄기 하나가 차례로 기울어 가는 면 일곱에 떨어진다. 면마다
 * 법선 N = (sin θ, cos θ, 0) 과 빛 쪽 방향 L(길이 1 로 맞춘 것)의 내적을 셈하고,
 * 밝기 = 세기 · k_d · max(0, N·L), 덮는 길이 = 빛줄기 폭 / (N·L) (N·L > 0 일 때만).
 *
 * 이벤트 (발신 차례 = 데이터의 면 차례, 걸음 하나 = 면 하나):
 *
 * - `lit` (silent 아님) — 한 면이 빛줄기를 받았다
 *   payload: {
 *     face: string;          // 면 식별자 (initialData.faces[].id)
 *     cos: number;           // N·L — 자르기 전 값. 화면 수로는 쓰지 않고 그림의 기하에만 쓴다
 *     brightness: number;    // 세기 · k_d · max(0, N·L)
 *     cover: number | null;  // 빛줄기가 덮는 면의 길이 (빛줄기 폭 단위). N·L ≤ 0 이면 null (닿지 않음)
 *   }
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (빛 · 면 일곱, 밝기 없음).
 * init 이벤트는 없다. 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export type FaceSpec = { id: string; tilt: number };

export type NormalDecidesBrightnessFacetData = {
  type: 'normal-decides-brightness';
  stepMs: number;
  light: {
    /** 면에서 빛 쪽으로 향하는 방향 (평행광). 길이 1 로 맞춰 쓴다 */
    direction: Vec3;
    /** 빛줄기 폭 */
    beamWidth: number;
    /** 빛의 세기 */
    intensity: number;
  };
  /** 면 일곱 — tilt 는 면의 법선이 빛 쪽에서 기운 각(도) */
  faces: FaceSpec[];
  material: { kd: number };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`normal-decides-brightness: ${path} 는 유한한 수여야 한다 (받은 값: ${String(v)})`);
  }
  return v;
}

function positive(v: unknown, path: string): number {
  const n = finite(v, path);
  if (n <= 0) throw new Error(`normal-decides-brightness: ${path} 는 0 보다 커야 한다 (받은 값: ${n})`);
  return n;
}

function vec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) {
    throw new Error(`normal-decides-brightness: ${path} 는 수 셋의 배열이어야 한다`);
  }
  return [finite(v[0], `${path}[0]`), finite(v[1], `${path}[1]`), finite(v[2], `${path}[2]`)];
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowNormalDecidesBrightnessData(raw: unknown): NormalDecidesBrightnessFacetData {
  if (!isRecord(raw)) throw new Error('normal-decides-brightness: initialData 가 객체가 아니다');
  if (raw.type !== 'normal-decides-brightness') {
    throw new Error(`normal-decides-brightness: initialData.type 이 어긋났다 (받은 값: ${String(raw.type)})`);
  }
  const stepMs = positive(raw.stepMs, 'initialData.stepMs');
  const light = raw.light;
  if (!isRecord(light)) throw new Error('normal-decides-brightness: initialData.light 가 객체가 아니다');
  const direction = vec3(light.direction, 'initialData.light.direction');
  const beamWidth = positive(light.beamWidth, 'initialData.light.beamWidth');
  const intensity = positive(light.intensity, 'initialData.light.intensity');
  const material = raw.material;
  if (!isRecord(material)) throw new Error('normal-decides-brightness: initialData.material 이 객체가 아니다');
  const kd = finite(material.kd, 'initialData.material.kd');
  if (kd < 0 || kd > 1) throw new Error(`normal-decides-brightness: initialData.material.kd 는 0..1 이어야 한다 (받은 값: ${kd})`);
  if (!Array.isArray(raw.faces) || raw.faces.length === 0) {
    throw new Error('normal-decides-brightness: initialData.faces 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const faces = raw.faces.map((f: unknown, i: number): FaceSpec => {
    if (!isRecord(f)) throw new Error(`normal-decides-brightness: initialData.faces[${i}] 가 객체가 아니다`);
    if (typeof f.id !== 'string' || f.id === '') {
      throw new Error(`normal-decides-brightness: initialData.faces[${i}].id 는 비지 않은 문자열이어야 한다`);
    }
    if (seen.has(f.id)) throw new Error(`normal-decides-brightness: initialData.faces[${i}].id '${f.id}' 가 겹친다`);
    seen.add(f.id);
    const tilt = finite(f.tilt, `initialData.faces[${i}].tilt`);
    if (tilt < 0 || tilt > 180) {
      throw new Error(`normal-decides-brightness: initialData.faces[${i}].tilt 는 0..180 도여야 한다 (받은 값: ${tilt})`);
    }
    return { id: f.id, tilt };
  });
  return {
    type: 'normal-decides-brightness',
    stepMs,
    light: { direction, beamWidth, intensity },
    faces,
    material: { kd },
  };
}

/** 법선에서 잰 부호 있는 각 θ(도)의 방향 (sin θ, cos θ, 0) — 기운 면의 법선. */
export function faceNormal(tiltDeg: number): Vec3 {
  const r = (tiltDeg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r), 0];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 길이 1 로 맞춘다. 길이 0 이면 던진다. */
export function normalize(v: Vec3): Vec3 {
  const n = Math.sqrt(dot(v, v));
  if (n === 0) throw new Error('normal-decides-brightness: 길이 0 벡터는 맞출 수 없다');
  return [v[0] / n, v[1] / n, v[2] / n];
}

/** 빛줄기가 덮는 면의 길이 = 폭 / cosθ. cosθ ≤ 0 이면 닿지 않으므로 던진다. */
export function coverLength(beamWidth: number, cos: number): number {
  if (!(cos > 0)) {
    throw new Error(`normal-decides-brightness: N·L = ${cos} 이라 빛줄기가 앞면에 닿지 않는다 — 덮는 길이를 셈할 수 없다`);
  }
  return beamWidth / cos;
}

/** 램버트 밝기 = 세기 · k_d · max(0, N·L). 0 으로 자르는 것은 식의 일부다. */
export function lambert(intensity: number, kd: number, cos: number): number {
  return intensity * kd * Math.max(0, cos);
}

export async function normalDecidesBrightness(
  ctx: FacetContext<NormalDecidesBrightnessFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<NormalDecidesBrightnessFacetData>;
  const data = narrowNormalDecidesBrightnessData(ctx.data);
  const L = normalize(data.light.direction);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  for (const face of data.faces) {
    if (!(await pause())) return;
    const cos = dot(faceNormal(face.tilt), L);
    const brightness = lambert(data.light.intensity, data.material.kd, cos);
    const cover = cos > 0 ? coverLength(data.light.beamWidth, cos) : null;
    await rctx.emit({ type: 'lit', payload: { face: face.id, cos, brightness, cover } });
  }
}
