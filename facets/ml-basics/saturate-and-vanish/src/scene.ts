/**
 * saturate-and-vanish 장면.
 *
 * - 바탕 `base` — silent init 이 한 번 정한다 (축 범위 · 꼭대기 · 표본 곡선)
 * - 자취 `probes` — 지금까지 짚은 자리들 (차례대로)
 * - 이번 걸음 `step` — 걸음 0 이면 start, 짚은 걸음이면 probe 와 운동의 출발 자리 `fromZ`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSaturateAndVanishData, type CurvePoint } from './algorithm.js';

export type SaturateBase = {
  zMin: number;
  zMax: number;
  peak: number;
  curve: CurvePoint[];
};

export type Probe = {
  z: number;
  s: number;
  g: number;
  ratio: number;
  /** 앞서 짚은 거울 자리 −z 와 그 σ′ — 캡션이 두 값을 나란히 보인다. */
  mirror: { z: number; g: number } | null;
};

export type SaturateStep =
  | { kind: 'start' }
  | { kind: 'probe'; index: number; fromZ: number | null };

export type SaturateAndVanishScene = {
  base: SaturateBase | null;
  probes: Probe[];
  step: SaturateStep;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`saturate-and-vanish 장면: ${path} 가 수가 아니다`);
  }
  return v;
}

function field(obj: unknown, path: string): Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`saturate-and-vanish 장면: ${path} 가 객체가 아니다`);
  }
  return obj as Record<string, unknown>;
}

function readBase(payload: unknown): SaturateBase {
  const p = field(payload, 'init.payload');
  const zMin = num(p.zMin, 'init.payload.zMin');
  const zMax = num(p.zMax, 'init.payload.zMax');
  const peak = num(p.peak, 'init.payload.peak');
  if (!Array.isArray(p.curve) || p.curve.length < 2) {
    throw new Error('saturate-and-vanish 장면: init.payload.curve 가 둘보다 짧다');
  }
  const curve: CurvePoint[] = p.curve.map((raw: unknown, i: number) => {
    const c = field(raw, `init.payload.curve[${i}]`);
    return {
      z: num(c.z, `init.payload.curve[${i}].z`),
      s: num(c.s, `init.payload.curve[${i}].s`),
      g: num(c.g, `init.payload.curve[${i}].g`),
    };
  });
  return { zMin, zMax, peak, curve };
}

function readProbe(payload: unknown, scene: SaturateAndVanishScene): { index: number; probe: Probe } {
  const p = field(payload, 'probe.payload');
  const index = num(p.index, 'probe.payload.index');
  if (index !== scene.probes.length) {
    throw new Error(
      `saturate-and-vanish 장면: probe.payload.index ${index} 가 짚은 수 ${scene.probes.length} 와 어긋났다`,
    );
  }
  const z = num(p.z, 'probe.payload.z');
  const base = scene.base;
  if (base === null) throw new Error('saturate-and-vanish 장면: init 앞에 probe 가 왔다');
  if (z < base.zMin || z > base.zMax) {
    throw new Error(`saturate-and-vanish 장면: probe.payload.z ${z} 가 축 범위 밖이다`);
  }
  let mirror: { z: number; g: number } | null;
  if (p.mirror === null) mirror = null;
  else {
    const m = field(p.mirror, 'probe.payload.mirror');
    const mz = num(m.z, 'probe.payload.mirror.z');
    const mg = num(m.g, 'probe.payload.mirror.g');
    const before = scene.probes.find((q) => q.z === mz);
    if (before === undefined) {
      throw new Error(`saturate-and-vanish 장면: probe.payload.mirror.z ${mz} 를 앞서 짚은 적이 없다`);
    }
    if (before.g !== mg) {
      throw new Error(`saturate-and-vanish 장면: probe.payload.mirror.g 가 앞서 짚은 z = ${mz} 의 σ′ 와 어긋났다`);
    }
    mirror = { z: mz, g: mg };
  }
  return {
    index,
    probe: {
      z,
      s: num(p.s, 'probe.payload.s'),
      g: num(p.g, 'probe.payload.g'),
      ratio: num(p.ratio, 'probe.payload.ratio'),
      mirror,
    },
  };
}

export const saturateAndVanishScene: ScenePlan<SaturateAndVanishScene> = {
  initial(initialData: unknown): SaturateAndVanishScene {
    // 모양만 검사한다. 곡선은 알고리즘이 셈해 silent init 으로 싣는다.
    narrowSaturateAndVanishData(initialData);
    return { base: null, probes: [], step: { kind: 'start' } };
  },
  reduce(scene: SaturateAndVanishScene, event: FacetRuntimeEvent): SaturateAndVanishScene {
    switch (event.type) {
      case 'init':
        return { base: readBase(event.payload), probes: [], step: { kind: 'start' } };
      case 'probe': {
        const { index, probe } = readProbe(event.payload, scene);
        const last = scene.probes[scene.probes.length - 1];
        return {
          base: scene.base,
          probes: [...scene.probes, probe],
          step: { kind: 'probe', index, fromZ: last === undefined ? null : last.z },
        };
      }
      default:
        throw new Error(`saturate-and-vanish 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
