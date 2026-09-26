/**
 * 병합과 리베이스 — projector.
 *
 * 알고리즘의 이벤트를 무대 메서드로 옮긴다. payload 는 typeof 로 읽고, 빠진 필드는 이름을 담아 던진다.
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 를 읽어 줄인다. 코드 패널이 없어 phase 를 받지 않는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  RebaseVsMergeStage,
  RvmBoard,
  RvmCommit,
  RvmFork,
  RvmLabelName,
  RvmMerge,
  RvmMoveLabel,
  RvmReplay,
  RvmRow,
} from './rebase-vs-merge-stage.js';

/** 한 걸음의 운동 길이 (재생 속도 1 에서) — 사양: 600ms 안쪽 */
const MOTION_MS = 560;

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`rebaseVsMergeProjector: ${where} 가 객체가 아니다`);
  return v as Obj;
}
function str(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`rebaseVsMergeProjector: ${where}.${key} 가 문자열이 아니다`);
  return v;
}
function num(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`rebaseVsMergeProjector: ${where}.${key} 가 수가 아니다`);
  return v;
}
function bool(o: Obj, key: string, where: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`rebaseVsMergeProjector: ${where}.${key} 가 참거짓이 아니다`);
  return v;
}
function strs(o: Obj, key: string, where: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`rebaseVsMergeProjector: ${where}.${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`rebaseVsMergeProjector: ${where}.${key}[${i}] 가 문자열이 아니다`);
    return x;
  });
}
function row(o: Obj, where: string): RvmRow {
  const v = str(o, 'row', where);
  if (v !== 'main' && v !== 'feature') throw new Error(`rebaseVsMergeProjector: ${where}.row 가 '${v}'`);
  return v;
}
function commit(v: unknown, where: string): RvmCommit {
  const o = obj(v, where);
  return {
    id: str(o, 'id', where),
    change: str(o, 'change', where),
    hash: str(o, 'hash', where),
    parents: strs(o, 'parents', where),
    row: row(o, where),
    col: num(o, 'col', where),
  };
}
function pair(v: unknown, where: string): { main: string; feature: string } {
  const o = obj(v, where);
  return { main: str(o, 'main', where), feature: str(o, 'feature', where) };
}

function readBoard(p: Obj): RvmBoard {
  const list = p.commits;
  if (!Array.isArray(list)) throw new Error('rebaseVsMergeProjector: board.commits 가 배열이 아니다');
  return {
    ahead: num(p, 'ahead', 'board'),
    commits: list.map((c, i) => commit(c, `board.commits[${i}]`)),
    labels: pair(p.labels, 'board.labels'),
    names: pair(p.names, 'board.names'),
  };
}

function readFork(p: Obj): RvmFork {
  return {
    at: str(p, 'at', 'fork'),
    mainSide: num(p, 'mainSide', 'fork'),
    featureSide: num(p, 'featureSide', 'fork'),
    mainIsAncestor: bool(p, 'mainIsAncestor', 'fork'),
    rebasing: bool(p, 'rebasing', 'fork'),
    replay: strs(p, 'replay', 'fork'),
  };
}

function readMerge(p: Obj): RvmMerge {
  return { ...commit(p, 'merge-commit'), parentHashes: strs(p, 'parentHashes', 'merge-commit') };
}

function readReplay(p: Obj): RvmReplay {
  const w = 'replay';
  return {
    from: str(p, 'from', w),
    id: str(p, 'id', w),
    change: str(p, 'change', w),
    oldHash: str(p, 'oldHash', w),
    hash: str(p, 'hash', w),
    oldParent: str(p, 'oldParent', w),
    parent: str(p, 'parent', w),
    oldParentHash: str(p, 'oldParentHash', w),
    parentHash: str(p, 'parentHash', w),
    row: row(p, w),
    col: num(p, 'col', w),
  };
}

function readMove(p: Obj): RvmMoveLabel {
  const w = 'move-label';
  const name = str(p, 'name', w);
  if (name !== 'main' && name !== 'feature') throw new Error(`rebaseVsMergeProjector: move-label.name 가 '${name}'`);
  const kind = str(p, 'kind', w);
  if (kind !== 'advance' && kind !== 'fast-forward' && kind !== 'move') throw new Error(`rebaseVsMergeProjector: move-label.kind 가 '${kind}'`);
  return {
    name: name as RvmLabelName,
    from: str(p, 'from', w),
    to: str(p, 'to', w),
    path: strs(p, 'path', w),
    kind,
    unreachable: strs(p, 'unreachable', w),
  };
}

export const rebaseVsMergeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RebaseVsMergeStage | undefined;
  if (!stage) throw new Error('rebaseVsMergeProjector: stage 블록이 없다');
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return MOTION_MS / (speed > 0 ? speed : 1);
  };

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const payload = obj(event.payload, `${event.type}.payload`);
      switch (event.type) {
        case 'board':
          await stage.board(readBoard(payload), motion());
          return;
        case 'fork':
          await stage.fork(readFork(payload), motion());
          return;
        case 'merge-commit':
          await stage.mergeCommit(readMerge(payload), motion());
          return;
        case 'replay':
          await stage.replay(readReplay(payload), motion());
          return;
        case 'move-label':
          await stage.moveLabel(readMove(payload), motion());
          return;
        default:
          throw new Error(`rebaseVsMergeProjector: 모르는 이벤트 '${event.type}'`);
      }
    },
    onReset(): void {
      stage.clear();
    },
  };
};
