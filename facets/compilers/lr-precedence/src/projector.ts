/**
 * lr-precedence projector — algorithm 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이 = MOTION_MS / 재생 속도 (그때그때 읽는다). 무대의 운동이 끝나야 onEvent 가 돌아와 걸음 = 운동 + stepMs 가 된다.
 * payload 는 typeof 가드로 읽고, 빈 값은 지어내지 않고 던진다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { LrNode } from './algorithm.js';
import type { LrPrecedenceStage } from './lr-precedence-stage.js';

const MOTION_MS = 300;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };
type Rec = Record<string, unknown>;

function rec(x: unknown, what: string): Rec {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`lr-precedence projector: ${what} 가 객체가 아니다`);
  return x as Rec;
}
function num(p: Rec, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`lr-precedence projector: ${k} 가 수가 아니다`);
  return v;
}
function str(p: Rec, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`lr-precedence projector: ${k} 가 글자가 아니다`);
  return v;
}
function strs(p: Rec, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`lr-precedence projector: ${k} 가 글자 목록이 아니다`);
  return v as string[];
}
function recs(p: Rec, k: string): Rec[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`lr-precedence projector: ${k} 가 목록이 아니다`);
  return v.map((x) => rec(x, k));
}
function readNode(x: unknown): LrNode {
  const p = rec(x, 'node');
  const kids = p['kids'];
  if (!Array.isArray(kids) || !kids.every((k) => typeof k === 'number')) throw new Error('lr-precedence projector: kids 가 수 목록이 아니다');
  return { id: num(p, 'id'), x: num(p, 'x'), level: num(p, 'level'), label: str(p, 'label'), value: num(p, 'value'), kids: kids as number[] };
}

export const lrPrecedenceProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as LrPrecedenceStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase payload');
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round-start': {
          const p = rec(event.payload, 'round-start payload');
          // 판 머리 — 표 짓기는 IR 밖이라 코드 패널을 끈다
          code?.highlightPhase?.(null);
          return stage?.start(
            {
            tokens: strs(p, 'tokens'),
            remaining: num(p, 'remaining'),
            conflicts: recs(p, 'conflicts').map((cf) => ({ item: str(cf, 'item'), look: str(cf, 'look'), reduceRule: str(cf, 'reduceRule') })),
            ops: recs(p, 'ops').map((o) => ({ op: str(o, 'op'), level: num(o, 'level'), assoc: str(o, 'assoc') })),
            },
            motion(),
          );
        }
        case 'resolve': {
          const p = rec(event.payload, 'resolve payload');
          return stage?.resolve(
            {
              cells: recs(p, 'cells').map((cl) => ({ action: str(cl, 'action'), rule: str(cl, 'rule') })),
              shiftCells: num(p, 'shiftCells'),
              reduceCells: num(p, 'reduceCells'),
            },
            motion(),
          );
        }
        case 'shift': {
          const p = rec(event.payload, 'shift payload');
          return stage?.shift(
            {
              token: num(p, 'token'),
              look: str(p, 'look'),
              symbol: str(p, 'symbol'),
              stack: strs(p, 'stack'),
              cell: num(p, 'cell'),
              remaining: num(p, 'remaining'),
            },
            motion(),
          );
        }
        case 'reduce': {
          const p = rec(event.payload, 'reduce payload');
          return stage?.reduce(
            {
              rule: str(p, 'rule'),
              pop: num(p, 'pop'),
              look: str(p, 'look'),
              stack: strs(p, 'stack'),
              value: num(p, 'value'),
              cell: num(p, 'cell'),
              node: readNode(p['node']),
            },
            motion(),
          );
        }
        case 'accept': {
          const p = rec(event.payload, 'accept payload');
          return stage?.accept(
            { value: num(p, 'value'), tree: str(p, 'tree'), look: str(p, 'look'), root: num(p, 'root') },
            motion(),
          );
        }
        default:
          throw new Error(`lr-precedence projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      // 되감기 — 러너가 로그를 다시 먹이기 전에 앞 화면을 걷는다
      code?.highlightPhase?.(null);
      stage?.clear();
    },
  };
};
