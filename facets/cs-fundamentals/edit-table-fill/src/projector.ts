/**
 * edit-table-fill projector — algorithm 의 걸음을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). 문안은 키로만 들고 있고 문장은
 * facet.ts 의 messages 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type CellFrom = 'origin' | 'up' | 'left' | 'diag';
type StageCell = { i: number; j: number; value: number; cost: number; from: CellFrom };
type StageWave = { k: number; cells: StageCell[] };
type StageFinal = { i: number; j: number; value: number };

type EditTableStage = {
  spread?(wave: StageWave): Promise<void> | void;
  finish?(final: StageFinal): Promise<void> | void;
  setCaption?(text: string): void;
  reset?(): void;
};

function isFrom(v: unknown): v is CellFrom {
  return v === 'origin' || v === 'up' || v === 'left' || v === 'diag';
}

/** 걸음마다 오는 payload 를 정형으로 조립한다. 가드가 뒤따르는 좁히개다 (C9). */
function readWave(payload: unknown): StageWave | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.k !== 'number' || !Array.isArray(p.cells)) return null;

  const cells: StageCell[] = [];
  for (const raw of p.cells) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    if (
      typeof c.i !== 'number' ||
      typeof c.j !== 'number' ||
      typeof c.value !== 'number' ||
      typeof c.cost !== 'number' ||
      !isFrom(c.from)
    ) {
      continue;
    }
    cells.push({ i: c.i, j: c.j, value: c.value, cost: c.cost, from: c.from });
  }
  if (cells.length === 0) return null;
  return { k: p.k, cells };
}

function readFinal(payload: unknown): StageFinal | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.i !== 'number' || typeof p.j !== 'number' || typeof p.value !== 'number') {
    return null;
  }
  return { i: p.i, j: p.j, value: p.value };
}

export const editTableFillProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as EditTableStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 한 논증의 단계 — 전제(구석) → 가장자리 → 안쪽 규칙 → 답. */
  function captionFor(k: number): string {
    if (k === 0) return tr('caption.corner', 'Empty into empty: the corner starts at 0.');
    if (k === 1) {
      return tr('caption.edges', 'Along the edges each letter costs one insert or one delete.');
    }
    return tr('caption.spread', 'Each cell takes the cheapest of three neighbours already filled.');
  }

  return {
    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'diagonal-filled': {
          const wave = readWave(event.payload);
          if (!wave) return;
          stage?.setCaption?.(captionFor(wave.k));
          await stage?.spread?.(wave);
          return;
        }
        case 'done': {
          const final = readFinal(event.payload);
          if (!final) return;
          stage?.setCaption?.(
            tr('caption.answer', 'The last cell answers for the whole pair: {n}.', {
              n: final.value,
            }),
          );
          await stage?.finish?.(final);
          return;
        }
        case 'rewind': {
          stage?.reset?.();
          return;
        }
        default:
          // 이 algorithm 은 위 셋만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
