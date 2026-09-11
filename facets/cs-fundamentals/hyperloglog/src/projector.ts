/**
 * hyperloglog 의 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 정하지 않는다. 키로 조회하고(`runtime.t`) 그 결과 문자열만 stage 로
 * 넘긴다 — 문안 자체는 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { type ProjectorFactory, type ProjectorInstance, makeTranslator } from '@ffacet/core/runtime';

/**
 * stage 가 노출하는 메서드 (C9 — 구체형은 파일 상단에 한 번만 적는다).
 * 전부 optional 로 두고 `?.()` 로 부른다.
 */
type HyperLogLogStage = {
  setLayout?(info: { m: number; p: number; keyCount: number }): void;
  showKey?(frame: {
    key: string;
    bits: string;
    p: number;
    bucket: number;
    rho: number;
    raised: boolean;
    registers: number[];
  }): void;
  showEstimate?(info: { m: number; estimate: number; truth: number; errPct: number }): void;
  setCaption?(text: string): void;
  resetAll?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  // 이 뒤로 필드마다 typeof 로 거른다 — 가드가 뒤따르는 좁히개다 (C9).
  return value as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    out.push(x);
  }
  return out;
}

export const hyperloglogProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views['stage'] as unknown as HyperLogLogStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onReset(): void {
      stage?.resetAll?.();
    },

    onEvent(event): void {
      switch (event.type) {
        case 'hll-config': {
          const p = asRecord(event.payload);
          const m = num(p?.['m']);
          const prefix = num(p?.['p']);
          const keyCount = num(p?.['keyCount']);
          if (m === null || prefix === null || keyCount === null) return;
          stage?.setLayout?.({ m, p: prefix, keyCount });
          stage?.setCaption?.(
            m === 1
              ? tr(
                  'caption.single',
                  'One bucket. All 32 bits count the run, and one lucky key drags the whole answer.',
                )
              : tr('caption.spread', 'Buckets {m}. The top {p} bits pick the bucket, the rest count the run.', {
                  m,
                  p: prefix,
                }),
          );
          return;
        }

        case 'key-hashed': {
          const p = asRecord(event.payload);
          if (!p) return;
          const key = typeof p['key'] === 'string' ? p['key'] : null;
          const bits = typeof p['bits'] === 'string' ? p['bits'] : null;
          const prefix = num(p['p']);
          const bucket = num(p['bucket']);
          const rho = num(p['rho']);
          const kept = num(p['kept']);
          const registers = numArray(p['registers']);
          const raised = typeof p['raised'] === 'boolean' ? p['raised'] : false;
          if (key === null || bits === null || prefix === null) return;
          if (bucket === null || rho === null || kept === null || registers === null) return;

          stage?.showKey?.({ key, bits, p: prefix, bucket, rho, raised, registers });
          stage?.setCaption?.(
            raised
              ? tr('caption.raise', 'Bucket {b} rises to {rho}. That is the longest run it has seen.', {
                  b: bucket,
                  rho,
                })
              : tr('caption.hash', 'Bucket {b} keeps {kept}. This key brought {rho}.', {
                  b: bucket,
                  kept,
                  rho,
                }),
          );
          return;
        }

        case 'estimate-ready': {
          const p = asRecord(event.payload);
          const m = num(p?.['m']);
          const estimate = num(p?.['estimate']);
          const truth = num(p?.['truth']);
          const errPct = num(p?.['errPct']);
          if (m === null || estimate === null || truth === null || errPct === null) return;
          stage?.showEstimate?.({ m, estimate, truth, errPct });
          stage?.setCaption?.(
            tr('caption.read', 'Buckets {m} answer {est}. Truth is {truth}, off by {err} percent.', {
              m,
              est: estimate.toFixed(1),
              truth,
              err: errPct,
            }),
          );
          return;
        }

        case 'done': {
          stage?.setCaption?.(tr('caption.push', 'Push the slider. Fewer buckets, wider miss.'));
          return;
        }

        default:
          // 이 알고리즘이 내는 것은 위 넷뿐이다. 그 밖의 것이 오면 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
