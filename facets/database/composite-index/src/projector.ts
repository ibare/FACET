/**
 * 복합 인덱스 projector — 알고리즘 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이는 걸음마다 재생 속도를 새로 읽어 셈한다 (걸음 경계를 넘지 않게).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { CompositeIndexStage, StageEntry, StageRow } from './composite-index-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

const MOTION_MAX_MS = 1000;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`composite-index: ${what} payload 가 비었다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`composite-index: ${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`composite-index: ${k} 가 글이 아니다`);
  return v;
}
function arr(o: Record<string, unknown>, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`composite-index: ${k} 가 배열이 아니다`);
  return v;
}
function strings(o: Record<string, unknown>, k: string): string[] {
  return arr(o, k).map((x) => {
    if (typeof x !== 'string') throw new Error(`composite-index: ${k} 에 글이 아닌 것이 있다`);
    return x;
  });
}
function cells(v: unknown[]): (string | number)[] {
  return v.map((x) => {
    if (typeof x !== 'string' && typeof x !== 'number') throw new Error('composite-index: 칸의 값이 비었다');
    return x;
  });
}

export const compositeIndexProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CompositeIndexStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 1400;

  const motionMs = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round(Math.min(MOTION_MAX_MS, stepMs * 0.7) / Math.max(0.01, speed));
  };

  return {
    onInit(data) {
      const d = obj(data, 'initialData');
      stepMs = num(d, 'stepMs');
    },
    onEvent(e) {
      const p = obj(e.payload, e.type);
      switch (e.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          if (!stage) return;
          // 새 판의 걸음 0 — 앞 판의 마지막 줄 강조를 지운다
          code?.highlightPhase?.(null);
          const rows: StageRow[] = arr(p, 'rows').map((r) => {
            const o = obj(r, 'row');
            return { row: num(o, 'row'), cells: cells(arr(o, 'cells')) };
          });
          const targets = arr(p, 'targets').map((x) => {
            if (typeof x !== 'number') throw new Error('composite-index: targets 에 수가 아닌 것이 있다');
            return x;
          });
          stage.showRound({
            order: strings(p, 'order'),
            indexName: str(p, 'indexName'),
            sql: str(p, 'sql'),
            table: str(p, 'table'),
            columns: strings(p, 'columns'),
            rows,
            targets,
          });
          return;
        }
        case 'sort': {
          if (!stage) return;
          const entries: StageEntry[] = arr(p, 'entries').map((x) => {
            const o = obj(x, 'entry');
            return { pos: num(o, 'pos'), row: num(o, 'row'), values: cells(arr(o, 'values')) };
          });
          stage.showSort({ order: strings(p, 'order'), entries }, motionMs());
          return;
        }
        case 'seek': {
          if (!stage) return;
          const mode = str(p, 'mode');
          if (mode !== 'seek' && mode !== 'scan-all') throw new Error(`composite-index: 모르는 mode ${mode}`);
          stage.showSeek({ mode, pos: num(p, 'pos') }, motionMs());
          return;
        }
        case 'scan': {
          if (!stage) return;
          const stopped = p.stoppedAt;
          if (stopped !== null && typeof stopped !== 'number') throw new Error('composite-index: stoppedAt 가 수가 아니다');
          stage.showScan(
            { from: num(p, 'from'), to: num(p, 'to'), scanned: num(p, 'scanned'), stoppedAt: stopped },
            motionMs(),
          );
          return;
        }
        case 'fetch': {
          if (!stage) return;
          const matches = arr(p, 'matches').map((x) => {
            const o = obj(x, 'match');
            return { pos: num(o, 'pos'), row: num(o, 'row') };
          });
          stage.showFetch({ matches, count: num(p, 'count') }, motionMs());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
