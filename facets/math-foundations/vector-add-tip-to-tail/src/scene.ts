/**
 * 벡터 덧셈 장면 — 바탕(화살표 · 범위) · 자취(꼬리 자리 · 이은 수 · 누적 · 합) · 이번 걸음.
 * 좌표 · 문안 · DOM 은 담지 않는다. 자리는 수학 좌표의 수로만 적는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowVectorAddTipToTailData,
  type Bounds,
  type NamedVec,
  type Vec2,
} from './algorithm.js';

export type SumResult = {
  head: Vec2;
  label: string;
  exprX: string;
  exprY: string;
  pathLength: number;
  sumLength: number;
};

export type TipToTailStep =
  | { kind: 'init' }
  | { kind: 'attach'; index: number; fromTail: Vec2; fromHead: Vec2; fromCumulative: Vec2 }
  | { kind: 'sum' };

export type VectorAddTipToTailScene = {
  /** 바탕 — init 이 한 번 정한다. init 전에는 null. */
  base: { vectors: NamedVec[]; bounds: Bounds } | null;
  /** 자취 — 화살표마다 지금 꼬리 자리. */
  tails: Vec2[];
  /** 자취 — 화살표마다 지금 머리 자리. 알고리즘이 셈한 값만 담는다. */
  heads: Vec2[];
  /** 이음에 든 화살표 수 (첫 마디 포함). */
  linked: number;
  /** 이은 끝. */
  cumulative: Vec2 | null;
  sum: SumResult | null;
  step: TipToTailStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`vectorAddTipToTailScene: ${path} ${why}`);
}

function readNum(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${key}`, '는 유한한 수여야 한다');
  return v;
}

function readRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(path, '가 객체가 아니다');
  return v as Record<string, unknown>;
}

function readVec(v: unknown, path: string): Vec2 {
  const rec = readRecord(v, path);
  return { x: readNum(rec, 'x', path), y: readNum(rec, 'y', path) };
}

function readString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) fail(`${path}.${key}`, '는 빈 글자가 아니어야 한다');
  return v;
}

function sameVec(p: Vec2, q: Vec2): boolean {
  return Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
}

export const vectorAddTipToTailScene: ScenePlan<VectorAddTipToTailScene> = {
  initial(initialData: unknown): VectorAddTipToTailScene {
    // 자료 모양만 확인한다. 걸음 0 의 바탕은 silent init 이 채운다.
    narrowVectorAddTipToTailData(initialData);
    return { base: null, tails: [], heads: [], linked: 0, cumulative: null, sum: null, step: null };
  },

  reduce(scene: VectorAddTipToTailScene, event: FacetRuntimeEvent): VectorAddTipToTailScene {
    const payload = readRecord(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        const list = payload.vectors;
        if (!Array.isArray(list) || list.length < 2) fail('init.payload.vectors', '는 화살표 둘 이상이어야 한다');
        const vectors: NamedVec[] = list.map((item: unknown, i: number) => {
          const path = `init.payload.vectors[${i}]`;
          const rec = readRecord(item, path);
          return { name: readString(rec, 'name', path), x: readNum(rec, 'x', path), y: readNum(rec, 'y', path) };
        });
        const tailList = payload.tails;
        if (!Array.isArray(tailList) || tailList.length !== vectors.length) {
          fail('init.payload.tails', '의 길이가 화살표 수와 다르다');
        }
        const tails = tailList.map((item: unknown, i: number) => readVec(item, `init.payload.tails[${i}]`));
        const headList = payload.heads;
        if (!Array.isArray(headList) || headList.length !== vectors.length) {
          fail('init.payload.heads', '의 길이가 화살표 수와 다르다');
        }
        const heads = headList.map((item: unknown, i: number) => readVec(item, `init.payload.heads[${i}]`));
        const b = readRecord(payload.bounds, 'init.payload.bounds');
        const bounds: Bounds = {
          minX: readNum(b, 'minX', 'init.payload.bounds'),
          maxX: readNum(b, 'maxX', 'init.payload.bounds'),
          minY: readNum(b, 'minY', 'init.payload.bounds'),
          maxY: readNum(b, 'maxY', 'init.payload.bounds'),
        };
        return {
          base: { vectors, bounds },
          tails,
          heads,
          linked: 1,
          cumulative: readVec(payload.cumulative, 'init.payload.cumulative'),
          sum: null,
          step: { kind: 'init' },
        };
      }
      case 'attach': {
        if (scene.base === null || scene.cumulative === null) fail('attach', '이 init 보다 먼저 왔다');
        const index = readNum(payload, 'index', 'attach.payload');
        if (index !== scene.linked) fail('attach.payload.index', `가 다음 차례(${scene.linked})가 아니다: ${index}`);
        const from = readVec(payload.from, 'attach.payload.from');
        const tail = readVec(payload.tail, 'attach.payload.tail');
        const head = readVec(payload.head, 'attach.payload.head');
        const was = scene.tails[index];
        const wasHead = scene.heads[index];
        if (was === undefined || wasHead === undefined) fail('attach.payload.index', `가 바탕 밖이다: ${index}`);
        if (!sameVec(was, from)) fail('attach.payload.from', '가 지금 꼬리와 다르다');
        if (!sameVec(tail, scene.cumulative)) fail('attach.payload.tail', '가 지금 누적과 다르다');
        const tails = scene.tails.map((p, i) => (i === index ? tail : { x: p.x, y: p.y }));
        const heads = scene.heads.map((p, i) => (i === index ? head : { x: p.x, y: p.y }));
        return {
          base: scene.base,
          tails,
          heads,
          linked: scene.linked + 1,
          cumulative: head,
          sum: null,
          step: { kind: 'attach', index, fromTail: was, fromHead: wasHead, fromCumulative: scene.cumulative },
        };
      }
      case 'sum': {
        if (scene.base === null || scene.cumulative === null) fail('sum', '이 init 보다 먼저 왔다');
        if (scene.linked !== scene.base.vectors.length) fail('sum', '이 이음을 다 마치기 전에 왔다');
        const head = readVec(payload.head, 'sum.payload.head');
        if (!sameVec(head, scene.cumulative)) fail('sum.payload.head', '가 마지막 누적과 다르다');
        return {
          base: scene.base,
          tails: scene.tails.map((p) => ({ x: p.x, y: p.y })),
          heads: scene.heads.map((p) => ({ x: p.x, y: p.y })),
          linked: scene.linked,
          cumulative: scene.cumulative,
          sum: {
            head,
            label: readString(payload, 'label', 'sum.payload'),
            exprX: readString(payload, 'exprX', 'sum.payload'),
            exprY: readString(payload, 'exprY', 'sum.payload'),
            pathLength: readNum(payload, 'pathLength', 'sum.payload'),
            sumLength: readNum(payload, 'sumLength', 'sum.payload'),
          },
          step: { kind: 'sum' },
        };
      }
      default:
        throw new Error(`vectorAddTipToTailScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
