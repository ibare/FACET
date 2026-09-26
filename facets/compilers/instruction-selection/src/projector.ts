/**
 * instruction-selection projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   round → stage.showRound (+ 코드 패널 강조를 끈다 — 새 판의 걸음 0 에 앞 판의 강조를 남기지 않는다)
 *   tile  → stage.placeTile
 *   emit  → stage.emitLines
 *   phase → codePanel.highlightPhase
 *   onReset → stage.reset · 코드 패널 강조 끔 (되감기에서 앞 화면을 남기지 않는다)
 *
 * 운동 길이는 걸음마다 getSpeed 를 새로 읽어 정한다 (400ms 이하).
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  InstructionSelectionStage,
  StageEmit,
  StageNode,
  StagePattern,
  StageRound,
  StageTile,
} from './instruction-selection-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const MOTION_MS = 380;

type Rec = Record<string, unknown>;

function rec(v: unknown, what: string): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what}: 객체가 아니다`);
  return v as Rec;
}
function num(o: Rec, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`payload.${k}: 수가 아니다`);
  return v;
}
function str(o: Rec, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`payload.${k}: 글자가 아니다`);
  return v;
}
function bool(o: Rec, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`payload.${k}: 참거짓이 아니다`);
  return v;
}
function list(o: Rec, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`payload.${k}: 목록이 아니다`);
  return v;
}
function strList(o: Rec, k: string): string[] {
  return list(o, k).map((x) => {
    if (typeof x !== 'string') throw new Error(`payload.${k}: 글자 목록이 아니다`);
    return x;
  });
}

function readRound(p: Rec): StageRound {
  const nodes: StageNode[] = list(p, 'nodes').map((x) => {
    const o = rec(x, 'node');
    const parent = o['parent'];
    if (parent !== null && typeof parent !== 'string') throw new Error('payload.parent: 글자도 null 도 아니다');
    return { path: str(o, 'path'), parent, depth: num(o, 'depth'), slot: num(o, 'slot'), label: str(o, 'label') };
  });
  const palette: StagePattern[] = list(p, 'palette').map((x) => {
    const o = rec(x, 'pattern');
    return { name: str(o, 'name'), shape: str(o, 'shape'), form: str(o, 'form'), size: num(o, 'size'), inSet: bool(o, 'inSet') };
  });
  return { source: str(p, 'source'), nodeCount: num(p, 'nodeCount'), leafCount: num(p, 'leafCount'), nodes, palette };
}

function readTile(p: Rec): StageTile {
  const edges: [string, string][] = list(p, 'edges').map((x) => {
    if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'string' || typeof x[1] !== 'string') {
      throw new Error('payload.edges: 경로 쌍이 아니다');
    }
    return [x[0], x[1]];
  });
  return {
    order: num(p, 'order'),
    name: str(p, 'name'),
    root: str(p, 'root'),
    size: num(p, 'size'),
    covered: num(p, 'covered'),
    nodeCount: num(p, 'nodeCount'),
    covers: strList(p, 'covers'),
    edges,
    skipped: strList(p, 'skipped'),
  };
}

function readEmit(p: Rec): StageEmit {
  const lines = list(p, 'lines').map((x) => {
    const o = rec(x, 'line');
    return { text: str(o, 'text'), tile: num(o, 'tile') };
  });
  return { lines, instrs: num(p, 'instrs'), temps: num(p, 'temps'), maxLive: num(p, 'maxLive') };
}

export const instructionSelectionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as InstructionSelectionStage | undefined;
  const code = views['codePanel'] as unknown as CodePanel | undefined;
  const motion = () => {
    const speed = runtime ? runtime.getSpeed() : 1;
    if (!(speed > 0)) throw new Error(`재생 속도가 양수가 아니다: ${speed}`);
    return Math.min(MOTION_MS, MOTION_MS / speed);
  };

  return {
    onEvent(event) {
      if (stage === undefined) throw new Error('stage view 가 없다');
      switch (event.type) {
        case 'round':
          code?.highlightPhase?.(null);
          stage.showRound(readRound(rec(event.payload, 'round')), motion());
          return;
        case 'tile':
          stage.placeTile(readTile(rec(event.payload, 'tile')), motion());
          return;
        case 'emit':
          stage.emitLines(readEmit(rec(event.payload, 'emit')), motion());
          return;
        case 'phase': {
          const phase = str(rec(event.payload, 'phase'), 'phase');
          code?.highlightPhase?.(phase);
          return;
        }
        default:
          throw new Error(`모르는 이벤트: ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
  };
};
