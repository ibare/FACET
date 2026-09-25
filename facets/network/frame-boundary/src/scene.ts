/**
 * frame-boundary 장면 — 알고리즘의 init · read 를 이어 받는 쪽의 지금을 담는다.
 *
 * 바탕  data · wire · flag · escape · mask (init 이 한 번 정한다)
 * 자취  pos · state · openAt · closeAt · dropped · got (read 가 쌓는다)
 * 이번  step
 *
 * 셈(채워 넣기 · XOR 되돌림 · 상태 옮김)은 알고리즘이 한다. 장면은 payload 를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ReceiverState = 'idle' | 'open' | 'escaped' | 'closed';
export type ReadKind = 'open' | 'keep' | 'escape' | 'restore' | 'close';

export type GotByte = {
  value: number;
  /** 선 위 자리 */
  wire: number;
  /** 탈출 뒤에 되돌린 값이면 선 위 바이트 */
  from: number | null;
};

export type FrameStep =
  | { kind: 'start' }
  | { kind: 'open' | 'close' | 'escape'; index: number; byte: number }
  | { kind: 'keep' | 'restore'; index: number; byte: number; value: number; slot: number };

export type FrameBoundaryScene = {
  data: number[];
  wire: number[];
  flag: number | null;
  escape: number | null;
  mask: number | null;
  /** 마지막으로 읽은 선 위 자리 (-1 = 아직) */
  pos: number;
  state: ReceiverState;
  openAt: number | null;
  closeAt: number | null;
  dropped: number[];
  got: GotByte[];
  step: FrameStep;
};

function blank(): FrameBoundaryScene {
  return {
    data: [],
    wire: [],
    flag: null,
    escape: null,
    mask: null,
    pos: -1,
    state: 'idle',
    openAt: null,
    closeAt: null,
    dropped: [],
    got: [],
    step: { kind: 'start' },
  };
}

function numList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

function field(p: unknown, key: string): unknown {
  if (typeof p !== 'object' || p === null) return undefined;
  return (p as Record<string, unknown>)[key];
}

function isKind(v: unknown): v is ReadKind {
  return v === 'open' || v === 'keep' || v === 'escape' || v === 'restore' || v === 'close';
}

export const frameBoundaryScene: ScenePlan<FrameBoundaryScene> = {
  initial(): FrameBoundaryScene {
    // 선 위 열은 알고리즘이 채워 넣어 만든다 — silent init 이 걸음 0 을 갈아 끼운다.
    return blank();
  },

  reduce(scene: FrameBoundaryScene, event: FacetRuntimeEvent): FrameBoundaryScene {
    const p = event.payload;
    if (event.type === 'init') {
      const data = numList(field(p, 'data'));
      const wire = numList(field(p, 'wire'));
      const flag = field(p, 'flag');
      const escape = field(p, 'escape');
      const mask = field(p, 'mask');
      if (!data || !wire || typeof flag !== 'number' || typeof escape !== 'number' || typeof mask !== 'number') {
        return scene;
      }
      return { ...blank(), data, wire, flag, escape, mask };
    }
    if (event.type === 'read') {
      const index = field(p, 'index');
      const byte = field(p, 'byte');
      const kind = field(p, 'kind');
      const value = field(p, 'value');
      if (typeof index !== 'number' || typeof byte !== 'number' || !isKind(kind)) return scene;
      const base = { ...scene, pos: index, dropped: [...scene.dropped], got: [...scene.got] };
      if (kind === 'open') {
        return { ...base, state: 'open', openAt: index, step: { kind, index, byte } };
      }
      if (kind === 'close') {
        return { ...base, state: 'closed', closeAt: index, step: { kind, index, byte } };
      }
      if (kind === 'escape') {
        return { ...base, state: 'escaped', dropped: [...scene.dropped, index], step: { kind, index, byte } };
      }
      if (typeof value !== 'number') return scene;
      const slot = scene.got.length;
      const got: GotByte = { value, wire: index, from: kind === 'restore' ? byte : null };
      return {
        ...base,
        state: 'open',
        got: [...scene.got, got],
        step: { kind, index, byte, value, slot },
      };
    }
    return scene;
  },
};
