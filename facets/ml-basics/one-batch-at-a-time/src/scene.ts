/**
 * one-batch-at-a-time 장면.
 *
 * 바탕: 점 여덟 · 묶음 차례 (initialData 에서) + 처음 w · 처음 손실 · w 축 (silent init 에서)
 * 자취: 두 쪽의 지금 w · 전체 손실 · 지나온 갱신들, 들어온 점, 전체 쪽이 모은 점
 * 이번 걸음: 들어온 묶음과 두 쪽이 한 일 (움직임의 출발값을 계기로 싣는다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowOneBatchData, type Axis } from './algorithm.js';

export type Hop = { from: number; to: number };

export type Lane = {
  w: number;
  loss: number;
  hops: Hop[];
};

export type OneBatchStep =
  | { kind: 'start' }
  | {
      kind: 'batch';
      k: number;
      idx: number[];
      mini: { g: number; from: number; to: number; lossFrom: number; lossTo: number };
      full:
        | { kind: 'wait'; seen: number }
        | { kind: 'move'; seen: number; g: number; from: number; to: number; lossFrom: number; lossTo: number };
    };

export type OneBatchScene = {
  points: { x: number; y: number }[];
  batches: number[][];
  eta: number;
  /** silent init 이 채운다 — 그 전에는 null */
  run: {
    axis: Axis;
    loss0: number;
    mini: Lane;
    full: Lane;
    /** 들어온 점 번호 (들어온 차례) */
    arrived: number[];
    /** 미니배치 쪽이 지금 쥔 묶음 */
    pocket: number[];
    step: OneBatchStep;
  } | null;
};

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`oneBatchAtATimeScene: ${path} 가 수가 아니다`);
  return v;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`oneBatchAtATimeScene: ${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function numList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) throw new Error(`oneBatchAtATimeScene: ${path} 가 배열이 아니다`);
  return v.map((n, i) => num(n, `${path}[${i}]`));
}

export const oneBatchAtATimeScene: ScenePlan<OneBatchScene> = {
  initial(initialData: unknown): OneBatchScene {
    const d = narrowOneBatchData(initialData);
    return {
      points: d.xs.map((x, i) => ({ x, y: d.ys[i]! })),
      batches: d.batches.map((b) => [...b]),
      eta: d.eta,
      run: null,
    };
  },

  reduce(scene: OneBatchScene, event: FacetRuntimeEvent): OneBatchScene {
    switch (event.type) {
      case 'init': {
        const p = obj(event.payload, 'init.payload');
        const a = obj(p.axis, 'init.payload.axis');
        const w0 = num(p.w0, 'init.payload.w0');
        const loss0 = num(p.loss0, 'init.payload.loss0');
        const axis: Axis = {
          lo: num(a.lo, 'init.payload.axis.lo'),
          hi: num(a.hi, 'init.payload.axis.hi'),
          tick: num(a.tick, 'init.payload.axis.tick'),
        };
        return {
          ...scene,
          run: {
            axis,
            loss0,
            mini: { w: w0, loss: loss0, hops: [] },
            full: { w: w0, loss: loss0, hops: [] },
            arrived: [],
            pocket: [],
            step: { kind: 'start' },
          },
        };
      }
      case 'batch': {
        const run = scene.run;
        if (run === null) throw new Error('oneBatchAtATimeScene: init 전에 batch 가 왔다');
        const p = obj(event.payload, 'batch.payload');
        const k = num(p.k, 'batch.payload.k');
        const expectedK = run.mini.hops.length + 1;
        if (k !== expectedK) throw new Error(`oneBatchAtATimeScene: batch.payload.k 가 ${k} 인데 차례는 ${expectedK} 다`);
        const idx = numList(p.idx, 'batch.payload.idx');
        const planned = scene.batches[k - 1];
        if (planned === undefined || planned.join(',') !== idx.join(',')) {
          throw new Error(`oneBatchAtATimeScene: batch.payload.idx 가 바탕의 묶음 ${k} 와 다르다`);
        }
        const m = obj(p.mini, 'batch.payload.mini');
        const mFrom = num(m.from, 'batch.payload.mini.from');
        if (mFrom !== run.mini.w) throw new Error('oneBatchAtATimeScene: batch.payload.mini.from 이 지금 w 와 다르다');
        const mini = {
          g: num(m.g, 'batch.payload.mini.g'),
          from: mFrom,
          to: num(m.to, 'batch.payload.mini.to'),
          lossFrom: run.mini.loss,
          lossTo: num(m.loss, 'batch.payload.mini.loss'),
        };
        const f = obj(p.full, 'batch.payload.full');
        const seen = num(f.seen, 'batch.payload.full.seen');
        const arrived = [...run.arrived, ...idx];
        if (seen !== arrived.length) throw new Error('oneBatchAtATimeScene: batch.payload.full.seen 이 들어온 점 수와 다르다');
        let full: Extract<OneBatchStep, { kind: 'batch' }>['full'];
        let fullLane: Lane = { ...run.full, hops: run.full.hops.map((h) => ({ ...h })) };
        if (f.kind === 'wait') {
          full = { kind: 'wait', seen };
        } else if (f.kind === 'move') {
          const fFrom = num(f.from, 'batch.payload.full.from');
          if (fFrom !== run.full.w) throw new Error('oneBatchAtATimeScene: batch.payload.full.from 이 지금 w 와 다르다');
          full = {
            kind: 'move',
            seen,
            g: num(f.g, 'batch.payload.full.g'),
            from: fFrom,
            to: num(f.to, 'batch.payload.full.to'),
            lossFrom: run.full.loss,
            lossTo: num(f.loss, 'batch.payload.full.loss'),
          };
          fullLane = { w: full.to, loss: full.lossTo, hops: [...fullLane.hops, { from: full.from, to: full.to }] };
        } else {
          throw new Error(`oneBatchAtATimeScene: batch.payload.full.kind 를 모른다 (${String(f.kind)})`);
        }
        return {
          ...scene,
          run: {
            ...run,
            mini: {
              w: mini.to,
              loss: mini.lossTo,
              hops: [...run.mini.hops.map((h) => ({ ...h })), { from: mini.from, to: mini.to }],
            },
            full: fullLane,
            arrived,
            pocket: [...idx],
            step: { kind: 'batch', k, idx, mini, full },
          },
        };
      }
      default:
        throw new Error(`oneBatchAtATimeScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
