/**
 * type-checking projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽는다. 없는 값은 지어내지 않고 던진다.
 * 운동의 길이는 재생 속도를 그때그때 읽어 정한다 (400ms 안쪽).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { TcLineView, TcNodeView, TcSettleMode } from './algorithm.js';
import type {
  TcRiseView,
  TcSettleView,
  TcTypeText,
  TypeCheckingStage,
} from './type-checking-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

const MOTION_MS = 380;

type Rec = Record<string, unknown>;

function rec(x: unknown, what: string): Rec {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`${what} 가 객체가 아니다`);
  return x as Rec;
}
function num(o: Rec, k: string): number {
  const x = o[k];
  if (typeof x !== 'number') throw new Error(`${k} 가 수가 아니다`);
  return x;
}
function str(o: Rec, k: string): string {
  const x = o[k];
  if (typeof x !== 'string') throw new Error(`${k} 가 글자가 아니다`);
  return x;
}
function bool(o: Rec, k: string): boolean {
  const x = o[k];
  if (typeof x !== 'boolean') throw new Error(`${k} 가 참거짓이 아니다`);
  return x;
}
function list(o: Rec, k: string): unknown[] {
  const x = o[k];
  if (!Array.isArray(x)) throw new Error(`${k} 가 목록이 아니다`);
  return x;
}
function strOrNull(o: Rec, k: string): string | null {
  const x = o[k];
  if (x === null) return null;
  if (typeof x !== 'string') throw new Error(`${k} 가 글자도 null 도 아니다`);
  return x;
}
function mark(o: Rec): 0 | 1 | 2 | 3 {
  const m = num(o, 'mark');
  if (m === 0 || m === 1 || m === 2 || m === 3) return m;
  throw new Error(`모르는 줄 표지 ${m}`);
}
function settleMode(o: Rec): TcSettleMode {
  const m = str(o, 'mode');
  if (m === 'bind' || m === 'decl-take' || m === 'decl-fit' || m === 'decl-miss') return m;
  throw new Error(`모르는 자리 걸음 ${m}`);
}
function outcome(o: Rec): 'rise' | 'op-miss' | 'unknown' {
  const m = str(o, 'outcome');
  if (m === 'rise' || m === 'op-miss' || m === 'unknown') return m;
  throw new Error(`모르는 오름 끝 ${m}`);
}
function typeText(o: Rec): TcTypeText {
  return { type: str(o, 'type'), typed: bool(o, 'typed') };
}
function nodeView(x: unknown): TcNodeView {
  const o = rec(x, 'node');
  const kind = str(o, 'kind');
  if (kind !== 'lit' && kind !== 'var' && kind !== 'op') throw new Error(`모르는 마디 ${kind}`);
  const side = o.side;
  if (side !== null && side !== 'left' && side !== 'right') throw new Error('마디의 쪽을 모른다');
  return { id: num(o, 'id'), text: str(o, 'text'), kind, parent: num(o, 'parent'), side };
}
function lineView(x: unknown): TcLineView {
  const o = rec(x, 'line');
  return {
    lineNo: num(o, 'lineNo'),
    text: str(o, 'text'),
    name: str(o, 'name'),
    want: strOrNull(o, 'want'),
    nodes: list(o, 'nodes').map(nodeView),
  };
}

export const typeCheckingProjector: ProjectorFactory = (views, runtime) => {
  const stageOf = (): TypeCheckingStage => {
    const s = views.stage as unknown as TypeCheckingStage | undefined;
    if (!s) throw new Error('stage 가 없다');
    return s;
  };
  const code = views.codePanel as unknown as CodePanel | undefined;
  const dur = (): number => MOTION_MS / Math.max(0.25, runtime ? runtime.getSpeed() : 1);

  return {
    onReset() {
      code?.highlightPhase(null);
      stageOf().reset();
    },
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = rec(event.payload, 'round');
          code?.highlightPhase(null);
          stageOf().startRound(
            {
              ruleId: str(p, 'ruleId'),
              opCells: num(p, 'opCells'),
              opAll: num(p, 'opAll'),
              fitCells: num(p, 'fitCells'),
              fitAll: num(p, 'fitAll'),
              lines: list(p, 'lines').map(lineView),
            },
            dur(),
          );
          return;
        }
        case 'rise': {
          const p = rec(event.payload, 'rise');
          const v: TcRiseView = {
            line: num(p, 'line'),
            lineNo: num(p, 'lineNo'),
            expr: str(p, 'expr'),
            outcome: outcome(p),
            leaves: list(p, 'leaves').map((x) => {
              const o = rec(x, 'leaf');
              return { node: num(o, 'node'), ...typeText(o) };
            }),
            ops: list(p, 'ops').map((x) => {
              const o = rec(x, 'op');
              return {
                node: num(o, 'node'),
                op: str(o, 'op'),
                l: str(o, 'l'),
                r: str(o, 'r'),
                result: str(o, 'result'),
                outcome: str(o, 'outcome'),
                type: str(o, 'result'),
                typed: bool(o, 'typed'),
              };
            }),
            missNode: num(p, 'missNode'),
          };
          stageOf().rise(v, dur());
          return;
        }
        case 'settle': {
          const p = rec(event.payload, 'settle');
          const leafRaw = p.leaf;
          const leaf =
            leafRaw === null
              ? null
              : (() => {
                  const o = rec(leafRaw, 'leaf');
                  return { node: num(o, 'node'), ...typeText(o) };
                })();
          const v: TcSettleView = {
            line: num(p, 'line'),
            lineNo: num(p, 'lineNo'),
            mode: settleMode(p),
            expr: str(p, 'expr'),
            name: str(p, 'name'),
            ...typeText(p),
            want: strOrNull(p, 'want'),
            mark: mark(p),
            leaf,
          };
          stageOf().settle(v, dur());
          return;
        }
        case 'verdict': {
          const p = rec(event.payload, 'verdict');
          stageOf().verdict(
            {
              errors: num(p, 'errors'),
              rejected: bool(p, 'rejected'),
              where: list(p, 'where').map((x) => {
                if (typeof x !== 'number') throw new Error('걸린 줄 번호가 수가 아니다');
                return x;
              }),
              byRule: list(p, 'byRule').map((x) => {
                const o = rec(x, 'byRule');
                return { ruleId: str(o, 'ruleId'), errors: num(o, 'errors'), rejected: bool(o, 'rejected') };
              }),
            },
            dur(),
          );
          return;
        }
        default:
          throw new Error(`모르는 이벤트 ${event.type}`);
      }
    },
  };
};
