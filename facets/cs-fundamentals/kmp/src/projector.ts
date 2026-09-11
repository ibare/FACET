/**
 * kmp 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 하나도 지나가지 않는다. 여기서 넘기는 것은 수와 글자뿐이고, 무엇이라
 * 말할지는 stage 가 `facet.ts` 의 messages 에서 받는다 (C10).
 *
 * payload 는 여기서 좁혀 넘긴다 — stage 는 `unknown` 을 받지 않는다 (C9).
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 없는 메서드와도 견디게 전부 optional 이다 (C9). */
type KmpStage = {
  setup?(text: string, pattern: string): void;
  tableCell?(index: number, value: number, compares: number): void;
  naiveSpot?(shift: number, matched: number, mismatch: number, compares: number, hit: boolean): void;
  kmpSpot?(
    start: number,
    keep: number,
    matched: number,
    mismatch: number,
    compares: number,
    hit: boolean,
    border: number,
    to: number,
  ): void;
  naiveEnd?(compares: number): void;
  kmpEnd?(compares: number): void;
  showMeasure?(naive: number, kmp: number, table: number): void;
  showDone?(naive: number, kmp: number, waste: number): void;
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

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export const kmpProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as KmpStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onInit() {
      // 초기 데이터를 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가 한다.
      // 첫 판이 시작하면 곧바로 `setup` 이 와서 화면을 다시 짓는다.
      codePanel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = fields(event.payload);
      switch (event.type) {
        case 'setup': {
          const text = str(p?.text);
          const pattern = str(p?.pattern);
          if (text === null || pattern === null) return;
          stage?.setup?.(text, pattern);
          return;
        }
        case 'table': {
          const index = num(p?.index);
          const value = num(p?.value);
          const compares = num(p?.compares);
          if (index === null || value === null || compares === null) return;
          stage?.tableCell?.(index, value, compares);
          return;
        }
        case 'naive': {
          const shift = num(p?.shift);
          const matched = num(p?.matched);
          const mismatch = num(p?.mismatch);
          const compares = num(p?.compares);
          if (shift === null || matched === null || mismatch === null || compares === null) return;
          stage?.naiveSpot?.(shift, matched, mismatch, compares, p?.hit === true);
          return;
        }
        case 'kmp': {
          const start = num(p?.start);
          const keep = num(p?.keep);
          const matched = num(p?.matched);
          const mismatch = num(p?.mismatch);
          const compares = num(p?.compares);
          const border = num(p?.border);
          const to = num(p?.to);
          if (
            start === null ||
            keep === null ||
            matched === null ||
            mismatch === null ||
            compares === null ||
            border === null ||
            to === null
          ) {
            return;
          }
          stage?.kmpSpot?.(start, keep, matched, mismatch, compares, p?.hit === true, border, to);
          return;
        }
        case 'naive-end': {
          const compares = num(p?.compares);
          if (compares === null) return;
          stage?.naiveEnd?.(compares);
          return;
        }
        case 'kmp-end': {
          const compares = num(p?.compares);
          if (compares === null) return;
          stage?.kmpEnd?.(compares);
          return;
        }
        case 'measured': {
          const naive = num(p?.naive);
          const kmp = num(p?.kmp);
          const table = num(p?.table);
          if (naive === null || kmp === null || table === null) return;
          stage?.showMeasure?.(naive, kmp, table);
          return;
        }
        case 'done': {
          const naive = num(p?.naive);
          const kmp = num(p?.kmp);
          const waste = num(p?.waste);
          if (naive === null || kmp === null || waste === null) return;
          stage?.showDone?.(naive, kmp, waste);
          return;
        }
        case 'phase': {
          // silent 는 "걸음의 경계가 아니다" 는 뜻이지 여기 오지 않는다는 뜻이
          // 아니다. 패널까지 넘기지 않으면 재생 내내 아무 줄도 짚지 않는다.
          const name = str(p?.phase);
          codePanel?.highlightPhase?.(name);
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 내지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
