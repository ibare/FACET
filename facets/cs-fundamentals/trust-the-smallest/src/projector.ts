/**
 * trust-the-smallest projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * `event.payload` 는 열린 타입이므로 여기서 좁혀 정형 객체로 만들어 넘긴다 (C9).
 * stage 는 필수 필드 타입으로 받으므로, 좁히기에 실패한 걸음은 넘기지 않고 버린다.
 *
 * `onInit` 을 두지 않는다 — `initialData` 를 받는 자리는 stage 의 `mount` 이고,
 * 여기서 한 번 더 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece).
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';

type Cell = { row: number; col: number; value: number };

/**
 * stage 가 내주는 표면.
 *
 * optional 로 선언하고 `?.()` 로 부른다 — 그 메서드를 갖지 않는 view 가 자리에
 * 앉아도 터지지 않게 (C9).
 */
type TrustStage = {
  ingest?(input: { key: string; count: number; cells: Cell[] }): Promise<void> | void;
  probe?(input: { key: string; truth: number; min: number; reads: Cell[] }): Promise<void> | void;
  verdict?(input: { keys: number }): Promise<void> | void;
  rewind?(): void;
};

/** 칸 배열을 좁힌다. 하나라도 모양이 어긋나면 통째로 버린다. */
function readCells(value: unknown): Cell[] | null {
  if (!Array.isArray(value)) return null;
  const out: Cell[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const cell = raw as Record<string, unknown>;
    const { row, col, value: v } = cell;
    if (typeof row !== 'number' || typeof col !== 'number' || typeof v !== 'number') return null;
    out.push({ row, col, value: v });
  }
  return out;
}

/** payload 를 열린 타입에서 한 번에 좁힌다. 필드는 아래에서 하나씩 본다. */
function fields(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

export const trustTheSmallestProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as TrustStage;

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'ingest': {
          const p = fields(event.payload);
          const cells = readCells(p?.cells);
          if (!p || !cells) break;
          if (typeof p.key !== 'string' || typeof p.count !== 'number') break;
          await stage.ingest?.({ key: p.key, count: p.count, cells });
          break;
        }
        case 'probe': {
          const p = fields(event.payload);
          const reads = readCells(p?.reads);
          if (!p || !reads) break;
          if (typeof p.key !== 'string') break;
          if (typeof p.truth !== 'number' || typeof p.min !== 'number') break;
          await stage.probe?.({ key: p.key, truth: p.truth, min: p.min, reads });
          break;
        }
        case 'done': {
          const p = fields(event.payload);
          if (!p || typeof p.keys !== 'number') break;
          await stage.verdict?.({ keys: p.keys });
          break;
        }
        case 'rewind': {
          stage.rewind?.();
          break;
        }
        default:
          // 그 밖의 어휘는 이 조각이 내지 않는다. 와도 조용히 버린다 (C2).
          break;
      }
    },

    onReset() {
      stage.rewind?.();
    },
  };
};
