/**
 * energy-conserving — 들어온 빛 1 이 표면에서 정반사 · 퍼짐 · 흡수로 나뉜다.
 *
 * 들어오는 각 하나마다 한 걸음이다. 셈은 반올림 없이 끝까지 하고, 자르는 것은 표시뿐이다.
 *   F      = F0 + (1 − F0)(1 − cosθ)^5        (Schlick)
 *   안으로 = incoming · (1 − F)
 *   퍼짐   = 안으로 · ρ
 *   흡수   = 안으로 · (1 − ρ)
 *   나간 합 = 정반사 + 퍼짐
 *
 * 이벤트 (silent 없음 — 걸음 0 은 장면의 initial 이 initialData 에서 세운다)
 *   split  { index: number; deg: number; specular: number; inward: number;
 *            diffuse: number; absorbed: number; out: number }
 *          index 번째 들어오는 각 deg 로 들어온 빛이 세 몫으로 갈라졌다.
 *          specular · inward · diffuse · absorbed · out 은 들어온 빛과 같은 단위의 양이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EnergyConservingFacetData = {
  type: 'energy-conserving';
  /** 들어온 빛의 양 (단색 — 채널 하나) */
  incoming: number;
  /** 정면(0°) 반사율 */
  f0: number;
  /** 안으로 들어간 빛 가운데 퍼져 나오는 비율 */
  rho: number;
  /** 법선에서 잰 들어오는 각(도), 차례대로 */
  angles: number[];
  stepMs: number;
};

/** 한 걸음의 몫 — 알고리즘이 셈해 싣는다 */
export type EnergySplit = {
  index: number;
  deg: number;
  specular: number;
  inward: number;
  diffuse: number;
  absorbed: number;
  out: number;
};

function fail(path: string, why: string): never {
  throw new Error(`energy-conserving: ${path} — ${why}`);
}

function finiteIn(value: unknown, path: string, lo: number, hi: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, '유한한 수가 아니다');
  if (value < lo || value > hi) fail(path, `${lo}..${hi} 밖이다 (${value})`);
  return value;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다 */
export function narrowEnergyData(raw: unknown): EnergyConservingFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'energy-conserving') fail('initialData.type', `'energy-conserving' 가 아니다`);
  const incoming = finiteIn(r.incoming, 'initialData.incoming', 0, Number.MAX_VALUE);
  if (incoming === 0) fail('initialData.incoming', '0 이다');
  const f0 = finiteIn(r.f0, 'initialData.f0', 0, 1);
  const rho = finiteIn(r.rho, 'initialData.rho', 0, 1);
  if (!Array.isArray(r.angles) || r.angles.length === 0) fail('initialData.angles', '비어 있거나 배열이 아니다');
  const angles = r.angles.map((a, i) => {
    const deg = finiteIn(a, `initialData.angles[${i}]`, -90, 90);
    // 90° 는 면을 스친다 — cosθ 가 0 이라 들어오는 빛이 없다. 면 뒤와 함께 셈할 수 없다
    if (Math.abs(deg) >= 90) fail(`initialData.angles[${i}]`, '빛이 면 위에 있지 않다');
    return deg;
  });
  const stepMs = finiteIn(r.stepMs, 'initialData.stepMs', 1, Number.MAX_VALUE);
  return { type: 'energy-conserving', incoming, f0, rho, angles, stepMs };
}

/** 법선에서 잰 부호 있는 각의 방향 (sin θ, cos θ) — 면에서 빛 쪽으로 나가는 쪽 */
export function direction(deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

/** Schlick 근사 — 정반사 몫 F */
export function schlick(f0: number, cosTheta: number): number {
  if (!(cosTheta > 0) || cosTheta > 1) fail('cosθ', `0 초과 1 이하가 아니다 (${cosTheta})`);
  return f0 + (1 - f0) * Math.pow(1 - cosTheta, 5);
}

/** 한 각에서 들어온 빛을 세 몫으로 가른다 */
export function splitAt(data: EnergyConservingFacetData, index: number): EnergySplit {
  const deg = data.angles[index];
  if (deg === undefined) fail(`angles[${index}]`, '없다');
  const n = { x: 0, y: 1 };
  const l = direction(deg);
  const cos = n.x * l.x + n.y * l.y;
  const f = schlick(data.f0, cos);
  const specular = data.incoming * f;
  const inward = data.incoming * (1 - f);
  const diffuse = inward * data.rho;
  const absorbed = inward * (1 - data.rho);
  return { index, deg, specular, inward, diffuse, absorbed, out: specular + diffuse };
}

export async function energyConserving(
  context: FacetContext<EnergyConservingFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<EnergyConservingFacetData>;
  const data = narrowEnergyData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 들어온 빛과 표면이 이미 서 있는 화면이라 첫 가름 앞에도 읽을 틈을 둔다
  for (let i = 0; i < data.angles.length; i += 1) {
    if (!(await pause())) return;
    const s = splitAt(data, i);
    await ctx.emit({
      type: 'split',
      payload: {
        index: s.index,
        deg: s.deg,
        specular: s.specular,
        inward: s.inward,
        diffuse: s.diffuse,
        absorbed: s.absorbed,
        out: s.out,
      },
    });
  }
}
