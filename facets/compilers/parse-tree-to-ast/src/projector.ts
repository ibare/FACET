/**
 * parse-tree-to-ast projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 좁힌다. 비거나 모르는 모양이면 던진다 (C6 · C9).
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { TreeOut, TreeOutNode } from './algorithm.js';
import type {
  ParseTreeToAstStage,
  StageParse,
  StageRound,
  StageRule,
  StageToken,
  StageValue,
  StageWalk,
} from './parse-tree-to-ast-stage.js';

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

/** 걸음마다 운동 상한 (재생 속도 1 에서) */
const MOTION_MS = { round: 420, parse: 600, walk: 600, value: 420 } as const;

type Obj = Record<string, unknown>;

function obj(x: unknown, what: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`parse-tree-to-ast: ${what} 가 객체가 아니다`);
  return x as Obj;
}
function num(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`parse-tree-to-ast: payload.${k} 가 수가 아니다`);
  return v;
}
function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`parse-tree-to-ast: payload.${k} 가 글이 아니다`);
  return v;
}
function arr(o: Obj, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`parse-tree-to-ast: payload.${k} 가 배열이 아니다`);
  return v;
}
function strs(o: Obj, k: string): string[] {
  return arr(o, k).map((x) => {
    if (typeof x !== 'string') throw new Error(`parse-tree-to-ast: payload.${k} 에 글이 아닌 것`);
    return x;
  });
}

function readTree(x: unknown): TreeOut {
  const o = obj(x, 'tree');
  const nodes = arr(o, 'nodes').map((raw): TreeOutNode => {
    const n = obj(raw, 'tree.nodes[]');
    const kind = n.kind;
    if (kind !== 'rule' && kind !== 'token' && kind !== 'op') throw new Error(`parse-tree-to-ast: 모르는 마디 종류 ${String(kind)}`);
    const conv = n.conv;
    if (conv !== null && typeof conv !== 'string') throw new Error('parse-tree-to-ast: 마디의 규약이 글도 null 도 아니다');
    return { id: str(n, 'id'), label: str(n, 'label'), kind, conv, kids: strs(n, 'kids') };
  });
  return { root: str(o, 'root'), nodes };
}

function readRound(x: unknown): StageRound {
  const o = obj(x, 'round');
  const tokens = arr(o, 'tokens').map((raw): StageToken => {
    const tk = obj(raw, 'tokens[]');
    return { kind: str(tk, 'kind'), text: str(tk, 'text') };
  });
  const rules = arr(o, 'rules').map((raw): StageRule => {
    const r = obj(raw, 'rules[]');
    return { name: str(r, 'name'), lhs: str(r, 'lhs'), rhs: strs(r, 'rhs'), conv: str(r, 'conv') };
  });
  return { source: str(o, 'source'), tokens, tokenCount: num(o, 'tokenCount'), rules };
}

function readParse(x: unknown): StageParse {
  const o = obj(x, 'parse-tree');
  return {
    tree: readTree(o.tree),
    total: num(o, 'total'),
    inner: num(o, 'inner'),
    leaves: num(o, 'leaves'),
    levels: num(o, 'levels'),
  };
}

function readWalk(x: unknown): StageWalk {
  const o = obj(x, 'walk');
  return {
    conv: str(o, 'conv'),
    count: num(o, 'count'),
    removed: strs(o, 'removed'),
    dropped: strs(o, 'dropped'),
    droppedNow: num(o, 'droppedNow'),
    risen: strs(o, 'risen'),
    tree: readTree(o.tree),
    remaining: num(o, 'remaining'),
    droppedTotal: num(o, 'droppedTotal'),
  };
}

function readValue(x: unknown): StageValue {
  const o = obj(x, 'value');
  const values = arr(o, 'values').map((raw) => {
    const e = obj(raw, 'values[]');
    return { id: str(e, 'id'), value: num(e, 'value') };
  });
  return { ast: str(o, 'ast'), value: num(o, 'value'), astNodes: num(o, 'astNodes'), astLevels: num(o, 'astLevels'), values };
}

export const parseTreeToAstProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ParseTreeToAstStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = (base: number): number => base / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const phase = str(obj(event.payload, 'phase'), 'phase');
          code?.highlightPhase(phase);
          return;
        }
        case 'round': {
          // 파싱은 IR 밖이다 — 판 머리에서 코드 패널 강조를 끈다
          code?.highlightPhase(null);
          await stage?.showRound(readRound(event.payload), motion(MOTION_MS.round));
          return;
        }
        case 'parse-tree':
          await stage?.showParseTree(readParse(event.payload), motion(MOTION_MS.parse));
          return;
        case 'walk':
          await stage?.walk(readWalk(event.payload), motion(MOTION_MS.walk));
          return;
        case 'value':
          await stage?.showValue(readValue(event.payload), motion(MOTION_MS.value));
          return;
        default:
          throw new Error(`parse-tree-to-ast: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
