/**
 * saturate-and-vanish — 시그모이드 하나 위에서 짚는 자리가 z = 0 에서 양쪽 바깥으로
 * 번갈아 나갈 때 그 자리의 기울기 σ′ 가 0 에 붙는 것을 보인다.
 *
 * σ(z) = 1 / (1 + e^−z) · σ′(z) = σ(z)·(1 − σ(z)) · 꼭대기 = σ′(0).
 *
 * 이벤트
 *
 * - `init` (silent: true) — 바탕. 걸음 0 을 갈아 끼운다.
 *   payload: {
 *     zMin: number; zMax: number;        // z 축 범위 (자료 그대로)
 *     peak: number;                      // σ′(0) — 몫의 분모
 *     curve: { z: number; s: number; g: number }[];  // z 를 고르게 찍은 σ · σ′ (그림의 곡선과 운동 경로)
 *   }
 * - `probe` — 한 자리를 짚는다. 걸음 하나.
 *   payload: {
 *     index: number;             // 몇 번째로 짚는가 (0 부터)
 *     z: number;                 // 짚은 자리
 *     s: number;                 // σ(z)
 *     g: number;                 // σ′(z)
 *     ratio: number;             // g / peak
 *     mirror: { z: number; g: number } | null;  // 앞서 짚은 자리 가운데 −z 가 있으면 그 자리와 그 σ′, 없으면 null
 *                                              // (판정을 싣지 않는다 — 두 σ′ 를 나란히 보이려는 값이다)
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SaturateAndVanishFacetData = {
  type: 'saturate-and-vanish';
  zMin: number;
  zMax: number;
  probes: number[];
  stepMs: number;
};

export type CurvePoint = { z: number; s: number; g: number };

/** 곡선을 z 한 칸에 몇 점 찍는가. 정수 z 가 표본에 정확히 들도록 정수로 둔다. */
const SAMPLES_PER_UNIT = 10;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 자료 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowSaturateAndVanishData(raw: unknown): SaturateAndVanishFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('saturate-and-vanish: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'saturate-and-vanish') {
    throw new Error(`saturate-and-vanish: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  const { zMin, zMax, probes, stepMs } = r;
  if (!isFiniteNumber(zMin) || !isFiniteNumber(zMax) || !Number.isInteger(zMin) || !Number.isInteger(zMax)) {
    throw new Error('saturate-and-vanish: initialData.zMin · zMax 는 정수여야 한다');
  }
  if (!(zMin < 0 && zMax > 0)) {
    throw new Error('saturate-and-vanish: initialData.zMin < 0 < zMax 가 아니다');
  }
  if (!isFiniteNumber(stepMs) || stepMs <= 0) {
    throw new Error('saturate-and-vanish: initialData.stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(probes) || probes.length === 0) {
    throw new Error('saturate-and-vanish: initialData.probes 가 비었거나 배열이 아니다');
  }
  const list: number[] = [];
  probes.forEach((z, i) => {
    if (!isFiniteNumber(z) || z < zMin || z > zMax) {
      throw new Error(`saturate-and-vanish: initialData.probes[${i}] 가 범위 밖이거나 수가 아니다`);
    }
    list.push(z);
  });
  return { type: 'saturate-and-vanish', zMin, zMax, probes: list, stepMs };
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function sigmoidSlope(z: number): number {
  const s = sigmoid(z);
  return s * (1 - s);
}

/**
 * 표본 곡선 위의 z 자리 값을 이웃 두 표본 사이의 직선으로 읽는다 — 그림이 운동 도중의
 * 자리를 얻는 작은 셈. σ 를 다시 셈하지 않는다. 범위 밖이면 던진다.
 */
export function readCurve(curve: readonly CurvePoint[], z: number): { s: number; g: number } {
  const first = curve[0];
  const second = curve[1];
  const last = curve[curve.length - 1];
  if (first === undefined || second === undefined || last === undefined) {
    throw new Error('saturate-and-vanish: 곡선 표본이 둘보다 적다');
  }
  if (z < first.z || z > last.z) {
    throw new Error(`saturate-and-vanish: z = ${z} 가 곡선 범위 밖이다`);
  }
  const dz = second.z - first.z;
  const pos = (z - first.z) / dz;
  const i = Math.min(Math.floor(pos), curve.length - 2);
  const a = curve[i];
  const b = curve[i + 1];
  if (a === undefined || b === undefined) {
    throw new Error(`saturate-and-vanish: z = ${z} 의 이웃 표본이 없다`);
  }
  const f = pos - i;
  return { s: a.s + (b.s - a.s) * f, g: a.g + (b.g - a.g) * f };
}

export async function saturateAndVanish(
  context: FacetContext<SaturateAndVanishFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SaturateAndVanishFacetData>;
  const data = narrowSaturateAndVanishData(ctx.data);
  const { stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const count = (data.zMax - data.zMin) * SAMPLES_PER_UNIT;
  const curve: CurvePoint[] = [];
  for (let i = 0; i <= count; i += 1) {
    if (ctx.cancelled) return;
    const z = (data.zMin * SAMPLES_PER_UNIT + i) / SAMPLES_PER_UNIT;
    curve.push({ z, s: sigmoid(z), g: sigmoidSlope(z) });
  }
  const peak = sigmoidSlope(0);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { zMin: data.zMin, zMax: data.zMax, peak, curve },
  });

  const seen: { z: number; g: number }[] = [];
  for (let index = 0; index < data.probes.length; index += 1) {
    // 걸음 0 은 곡선이 이미 선 화면이라 첫 짚기 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const z = data.probes[index];
    if (z === undefined) throw new Error(`saturate-and-vanish: probes[${index}] 가 없다`);
    const s = sigmoid(z);
    const g = sigmoidSlope(z);
    const other = z === 0 ? undefined : seen.find((q) => q.z === -z);
    const mirror = other === undefined ? null : { z: other.z, g: other.g };
    await ctx.emit({
      type: 'probe',
      payload: { index, z, s, g, ratio: g / peak, mirror },
    });
    seen.push({ z, g });
  }
}
