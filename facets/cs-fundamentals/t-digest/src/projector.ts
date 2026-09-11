/**
 * t-digest projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 이 파일은 그리지 않고 셈하지도 않는다. `event.payload` 를 가드로 좁혀 정형
 * 객체로 만든 뒤 넘기는 것이 전부다 (C9). 좁히개는 파일 상단에 모아 두고 cast
 * 지점은 짧게 유지한다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드를 부르지 않도록 전부 optional 로 둔다. */
type TDigestStage = {
  showDigest?: (d: { delta: number; total: number; buckets: StageBucket[] }) => void;
  showProbe?: (p: {
    key: 'tail' | 'middle';
    q: number;
    estimate: number;
    truth: number;
    valueError: number;
  }) => void;
  showSweep?: (s: {
    current: number;
    rows: { delta: number; tailError: number; middleError: number }[];
  }) => void;
  resetToInitial?: () => void;
};

type StageBucket = {
  q0: number;
  q1: number;
  weight: number;
  mean: number;
  centerQ: number;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readBuckets(v: unknown): StageBucket[] | null {
  if (!Array.isArray(v)) return null;
  const out: StageBucket[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const b = raw as Record<string, unknown>;
    const q0 = num(b.q0);
    const q1 = num(b.q1);
    const weight = num(b.weight);
    const mean = num(b.mean);
    const centerQ = num(b.centerQ);
    if (q0 === null || q1 === null || weight === null || mean === null || centerQ === null) {
      return null;
    }
    out.push({ q0, q1, weight, mean, centerQ });
  }
  return out;
}

function readRows(
  v: unknown,
): { delta: number; tailError: number; middleError: number }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { delta: number; tailError: number; middleError: number }[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const delta = num(r.delta);
    const tailError = num(r.tailError);
    const middleError = num(r.middleError);
    if (delta === null || tailError === null || middleError === null) return null;
    out.push({ delta, tailError, middleError });
  }
  return out;
}

export const tDigestProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = views.stage as unknown as TDigestStage | undefined;

  return {
    onInit() {
      // initialData 를 여기서 좁혀 밀어 넣지 않는다 — 처음 그림은 stage 의
      // mount 가 자기 initialData 로 이미 세웠다. reactive 의 reset 은 데이터를
      // 되돌린 뒤 onInit 을 다시 부르므로 (S-runtime), 여기서는 stage 를 그
      // 처음 자리로 돌려놓기만 하면 된다.
      stage?.resetToInitial?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'digest-built': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const delta = num(p.delta);
          const total = num(p.total);
          const buckets = readBuckets(p.buckets);
          if (delta === null || total === null || buckets === null) return;
          stage?.showDigest?.({ delta, total, buckets });
          return;
        }
        case 'probe': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const key = p.key === 'tail' || p.key === 'middle' ? p.key : null;
          const q = num(p.q);
          const estimate = num(p.estimate);
          const truth = num(p.truth);
          const valueError = num(p.valueError);
          if (key === null || q === null || estimate === null || truth === null || valueError === null) {
            return;
          }
          stage?.showProbe?.({ key, q, estimate, truth, valueError });
          return;
        }
        case 'sweep': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const current = num(p.current);
          const rows = readRows(p.rows);
          if (current === null || rows === null) return;
          stage?.showSweep?.({ current, rows });
          return;
        }
        case 'done':
          // 한 바퀴의 끝. 화면은 이미 마지막 상태를 보이고 있으므로 할 일이 없다.
          return;
        default:
          // 그 밖의 이벤트는 의도적으로 흘려보낸다 (C2).
          return;
      }
    },

    onReset() {
      stage?.resetToInitial?.();
    },
  };
};
