/**
 * bloom-filter 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 하나도 지나가지 않는다. 여기서 넘기는 것은 수와 이름뿐이고, 무엇이라
 * 말할지는 stage 가 `facet.ts` 의 messages 에서 받는다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type BloomStage = {
  setup?(m: number, k: number, keys: string[]): void;
  showHash?(key: string, keyIndex: number, slots: number[]): void;
  setBit?(slot: number, keyIndex: number, shared: boolean): void;
  showMeasure?(queries: number): void;
  showDone?(onBits: number, m: number, percent: number, queries: number): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function slotList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

function keyList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export const bloomFilterProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BloomStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  /**
   * `done` 은 질의 수를 싣지 않는다 — 같은 판의 `measured` 가 이미 말했다.
   * projector 가 시각 상태를 조금 따라 두는 것은 허용된다 (원칙 5). 인스턴스마다
   * 따로 가져야 하므로 모듈이 아니라 팩토리 안에 둔다.
   */
  let lastQueries = 0;

  return {
    onInit() {
      // 초기 데이터를 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가 한다.
      // 첫 판이 시작하면 곧바로 `setup` 이 와서 배열을 다시 짓는다.
      lastQueries = 0;
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = fields(event.payload);
      switch (event.type) {
        case 'setup': {
          const m = num(p?.m);
          const k = num(p?.k);
          if (m === null || k === null) return;
          stage?.setup?.(m, k, keyList(p?.keys));
          return;
        }
        case 'hash-computed': {
          const key = typeof p?.key === 'string' ? p.key : null;
          const keyIndex = num(p?.keyIndex);
          if (key === null || keyIndex === null) return;
          stage?.showHash?.(key, keyIndex, slotList(p?.slots));
          return;
        }
        case 'bit-set': {
          const slot = num(p?.slot);
          const keyIndex = num(p?.keyIndex);
          if (slot === null || keyIndex === null) return;
          stage?.setBit?.(slot, keyIndex, p?.shared === true);
          return;
        }
        case 'measured': {
          const queries = num(p?.queries);
          if (queries === null) return;
          lastQueries = queries;
          stage?.showMeasure?.(queries);
          return;
        }
        case 'done': {
          const onBits = num(p?.onBits);
          const m = num(p?.m);
          const percent = num(p?.percent);
          if (onBits === null || m === null || percent === null) return;
          stage?.showDone?.(onBits, m, percent, lastQueries);
          return;
        }
        case 'phase': {
          const name = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase?.(name);
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset() {
      lastQueries = 0;
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
