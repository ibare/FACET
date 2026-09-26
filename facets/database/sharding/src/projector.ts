/**
 * sharding projector — 알고리즘 이벤트를 stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 비었거나 모양이 틀리면 던진다 (C6 · C9).
 * 운동 길이 = initialData.motionMs ÷ 지금 재생 속도 — 이벤트마다 그때그때 읽는다.
 * stage 메서드가 돌려주는 Promise 를 기다려 걸음 = 운동 + stepMs 가 되게 한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { LayoutView, QueryView, RouteView, ShardingStage, ShareView, StageBound } from './sharding-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`sharding projector: ${what} payload 가 없다`);
  return x as Record<string, unknown>;
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`sharding projector: ${k} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`sharding projector: ${k} 가 글자가 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, k: string): number[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`sharding projector: ${k} 가 수 목록이 아니다`);
  return v as number[];
}

function list(p: Record<string, unknown>, k: string): Record<string, unknown>[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`sharding projector: ${k} 가 목록이 아니다`);
  return v.map((x) => rec(x, k));
}

function readLayout(x: unknown): LayoutView {
  const p = rec(x, 'layout');
  const bounds: StageBound[] = list(p, 'bounds').map((b) => {
    const hi = b.hi;
    if (hi !== null && typeof hi !== 'number') throw new Error('sharding projector: bounds.hi 가 수도 null 도 아니다');
    return { shard: num(b, 'shard'), lo: num(b, 'lo'), hi };
  });
  return {
    mode: num(p, 'mode'),
    shards: num(p, 'shards'),
    table: str(p, 'table'),
    key: str(p, 'key'),
    width: num(p, 'width'),
    count: num(p, 'count'),
    bounds,
  };
}

function readRoute(x: unknown): RouteView {
  const p = rec(x, 'route');
  return { index: num(p, 'index'), key: num(p, 'key'), shard: num(p, 'shard'), load: nums(p, 'load') };
}

function readQuery(x: unknown): QueryView {
  const p = rec(x, 'query');
  return {
    lo: num(p, 'lo'),
    hi: num(p, 'hi'),
    shards: num(p, 'shards'),
    keys: list(p, 'keys').map((k) => ({ key: num(k, 'key'), shard: num(k, 'shard') })),
    opened: nums(p, 'opened'),
    touched: num(p, 'touched'),
  };
}

function readShare(x: unknown): ShareView {
  const p = rec(x, 'share');
  return {
    rows: num(p, 'rows'),
    perShard: nums(p, 'perShard'),
    load: nums(p, 'load'),
    top: num(p, 'top'),
    share: num(p, 'share'),
    busiest: nums(p, 'busiest'),
    count: num(p, 'count'),
  };
}

export const shardingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ShardingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const ms = (): number => {
    if (motionMs === null) throw new Error('sharding projector: initialData.motionMs 를 받지 못했다');
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onInit(data) {
      const d = rec(data, 'initialData');
      motionMs = num(d, 'motionMs');
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = rec(e.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'layout':
          code?.clearHighlight?.();
          await stage?.layout(readLayout(e.payload), ms());
          return;
        case 'route':
          await stage?.route(readRoute(e.payload), ms());
          return;
        case 'query':
          await stage?.query(readQuery(e.payload), ms());
          return;
        case 'share':
          await stage?.share(readShare(e.payload), ms());
          return;
        default:
          throw new Error(`sharding projector: 모르는 이벤트 ${e.type}`);
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
