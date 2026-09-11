/**
 * prefix-suffix-jump projector — 걸음의 payload 를 좁혀 stage 로 넘긴다 (C9).
 *
 * `event.payload` 를 그대로 건네지 않는다. 수와 참거짓과 배열을 하나씩 걸러
 * 정형 인자로 만들어 부르고, stage 는 필수 필드 타입으로 받는다.
 *
 * `onInit` 은 두지 않는다 — `initialData` 를 좁히는 것은 stage 의 mount 이고
 * 여기서 같은 것을 다시 좁혀 밀어 넣으면 규칙이 두 벌이 된다 (S-piece).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
} from '@ffacet/core/runtime';

/**
 * stage 가 내주는 계약. 애니메이션이 있는 것은 promise 를 돌려주므로
 * `await` 가 곧 "그 걸음이 화면에서 끝났다" 가 된다.
 */
type Stage = {
  focusPrefix?(end: number): Promise<void>;
  tryOverlap?(end: number, border: number, matched: boolean): Promise<void>;
  setFail?(index: number, value: number): Promise<void>;
  scanAlign?(start: number, from: number, matched: number, mismatch: number): Promise<void>;
  borrowOverlap?(start: number, matched: number, border: number): Promise<void>;
  jump?(from: number, to: number, keep: number, skipped: number[]): Promise<void>;
  found?(start: number): Promise<void>;
  rewind?(): void;
};

/** 수로 읽히는 것만 통과시킨다. */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 수의 배열만 통과시킨다. */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export const prefixSuffixJumpProjector: ProjectorFactory = (
  views: ProjectorViews,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = (event.payload ?? {}) as Record<string, unknown>;
      switch (event.type) {
        case 'prefix-focus':
          await stage.focusPrefix?.(num(p.end));
          return;
        case 'overlap-try':
          await stage.tryOverlap?.(num(p.end), num(p.border), p.matched === true);
          return;
        case 'fail-set':
          await stage.setFail?.(num(p.index), num(p.value));
          return;
        case 'scan-align':
          await stage.scanAlign?.(
            num(p.start),
            num(p.from),
            num(p.matched),
            num(p.mismatch, -1),
          );
          return;
        case 'borrow-overlap':
          await stage.borrowOverlap?.(num(p.start), num(p.matched), num(p.border));
          return;
        case 'jump':
          await stage.jump?.(num(p.from), num(p.to), num(p.keep), nums(p.skipped));
          return;
        case 'found':
          await stage.found?.(num(p.start));
          return;
        case 'rewind':
          stage.rewind?.();
          return;
        default:
          // 이 조각이 내는 것은 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
