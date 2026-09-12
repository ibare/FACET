/**
 * conflict-miss Projector — algorithm 이벤트를 stage 메서드 호출로 번역한다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). `event.payload` 를 그대로
 * 흘려보내지 않는다 — stage 는 필수 필드 타입으로 받는다.
 *
 * `onInit` 을 두지 않는다. `initialData` 를 좁히는 자리는 stage 의 `mount` 이고
 * (S-piece), 여기서 다시 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다.
 *
 * `onEvent` 는 stage 의 애니메이션 promise 를 **기다린다.** 그래야 `ctx.emit` 이
 * 그것을 기다린 뒤에 다음 문이 열리고, `stepMs` 가 애니메이션이 끝난 뒤의
 * 정지 시간이 된다 (S-piece).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 계약. */
type ConflictMissStage = {
  showAccess?(access: AccessView): Promise<void> | void;
  showSummary?(summary: SummaryView): void;
  resetScene?(): void;
};

type AccessView = {
  order: number;
  address: number;
  lineNo: number;
  index: number;
  tag: number;
  hit: boolean;
  evictedAddress: number | null;
  evictedTag: number | null;
  emptyIndices: number[];
  emptyLines: number;
  evictionCount: number;
};

type SummaryView = {
  total: number;
  hitCount: number;
  emptyLines: number;
};

/**
 * 런타임 가드가 뒤따르는 좁히개 (C9). 이 단언 뒤에 필드마다 `typeof` 가 붙는다.
 */
function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function readAccess(payload: unknown): AccessView | null {
  const p = fields(payload);
  if (p === null) return null;
  const emptyIndices = numList(p.emptyIndices);
  return {
    order: num(p.order, 0),
    address: num(p.address, 0),
    lineNo: num(p.lineNo, 0),
    index: num(p.index, 0),
    tag: num(p.tag, 0),
    hit: p.hit === true,
    evictedAddress: numOrNull(p.evictedAddress),
    evictedTag: numOrNull(p.evictedTag),
    emptyIndices,
    emptyLines: num(p.emptyLines, emptyIndices.length),
    evictionCount: num(p.evictionCount, 0),
  };
}

function readSummary(payload: unknown): SummaryView | null {
  const p = fields(payload);
  if (p === null) return null;
  return {
    total: num(p.total, 0),
    hitCount: num(p.hitCount, 0),
    emptyLines: num(p.emptyLines, 0),
  };
}

export const conflictMissProjector: ProjectorFactory = (
  views: ProjectorViews,
): ProjectorInstance => {
  const stage = views.stage as unknown as ConflictMissStage;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'access': {
          const access = readAccess(event.payload);
          if (access !== null) await stage.showAccess?.(access);
          return;
        }
        case 'done': {
          const summary = readSummary(event.payload);
          if (summary !== null) stage.showSummary?.(summary);
          return;
        }
        case 'rewind': {
          stage.resetScene?.();
          return;
        }
        default:
          // 이 algorithm 은 위 셋만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    /**
     * 다시 보기 — `ReactiveMechanism.reset()` 이 알고리즘을 다시 돌리기 전에
     * 여기를 지난다. 지우지 않으면 앞 회차의 밀려난 조각과 셈이 그대로 남는다.
     */
    onReset(): void {
      stage.resetScene?.();
    },
  };
};
