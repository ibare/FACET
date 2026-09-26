import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { commitById, nameTarget, narrowPickData, parentOf, type DiffOp, type DiffRow, type Hunk, type PickCommit, type PickName } from './algorithm.js';

/**
 * 장면.
 * - 바탕: commits · head · pick (initial 이 initialData 에서 베낀다)
 * - 자취: diff(견준 차이) · landed(얹은 결과) · names(이름이 가리키는 커밋) · made(새 커밋)
 * - 이번 걸음: step
 */
export type PickStep =
  | { kind: 'start' }
  | { kind: 'diff' }
  | { kind: 'land' }
  | { kind: 'commit'; from: string };

export type PickLanded = { branch: string; result: string[]; hunks: Hunk[] };
export type PickDiff = { pick: string; parent: string; rows: DiffRow[] };

export type PickOneOutScene = {
  commits: PickCommit[];
  names: PickName[];
  head: string;
  pick: string;
  diff: PickDiff | null;
  landed: PickLanded | null;
  made: PickCommit | null;
  step: PickStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`pick-one-out 장면: ${path} 는 빈 글자가 아닌 글자여야 한다`);
  return v;
}

function strs(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) throw new Error(`pick-one-out 장면: ${path} 는 목록이어야 한다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`pick-one-out 장면: ${path}[${i}] 는 글자여야 한다`);
    return x;
  });
}

function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`pick-one-out 장면: ${path} 는 0 이상의 정수여야 한다`);
  return v;
}

function op(v: unknown, path: string): DiffOp {
  if (v === ' ' || v === '-' || v === '+') return v;
  throw new Error(`pick-one-out 장면: ${path} 는 ' ' · '-' · '+' 가운데 하나여야 한다`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`pick-one-out 장면: ${event.type} 의 payload 가 객체가 아니다`);
  return event.payload;
}

export const pickOneOutScene: ScenePlan<PickOneOutScene> = {
  initial(initialData: unknown): PickOneOutScene {
    const data = narrowPickData(initialData);
    return {
      commits: data.commits.map((c) => ({ id: c.id, parents: [...c.parents], lines: [...c.lines] })),
      names: data.names.map((n) => ({ name: n.name, commit: n.commit })),
      head: data.head,
      pick: data.pick,
      diff: null,
      landed: null,
      made: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PickOneOutScene, event: FacetRuntimeEvent): PickOneOutScene {
    switch (event.type) {
      case 'diff': {
        const p = payloadOf(event);
        if (!Array.isArray(p.rows)) throw new Error('pick-one-out 장면: diff.payload.rows 는 목록이어야 한다');
        const rows: DiffRow[] = p.rows.map((r, i) => {
          if (!isRecord(r)) throw new Error(`pick-one-out 장면: diff.payload.rows[${i}] 가 객체가 아니다`);
          const text = r.text;
          if (typeof text !== 'string') throw new Error(`pick-one-out 장면: diff.payload.rows[${i}].text 는 글자여야 한다`);
          return { op: op(r.op, `diff.payload.rows[${i}].op`), text };
        });
        const pick = str(p.pick, 'diff.payload.pick');
        if (pick !== scene.pick) throw new Error(`pick-one-out 장면: diff.payload.pick ${pick} 가 고른 커밋 ${scene.pick} 와 다르다`);
        const parent = str(p.parent, 'diff.payload.parent');
        commitById(scene.commits, parent);
        const expected = parentOf(scene.commits, pick);
        if (parent !== expected) throw new Error(`pick-one-out 장면: diff.payload.parent ${parent} 가 ${pick} 의 부모 ${String(expected)} 와 다르다`);
        if (scene.diff !== null) throw new Error('pick-one-out 장면: diff 가 두 번 왔다');
        const diff: PickDiff = { pick, parent, rows };
        return { ...scene, diff, step: { kind: 'diff' } };
      }
      case 'land': {
        const p = payloadOf(event);
        if (!Array.isArray(p.hunks)) throw new Error('pick-one-out 장면: land.payload.hunks 는 목록이어야 한다');
        const hunks: Hunk[] = p.hunks.map((h, i) => {
          if (!isRecord(h)) throw new Error(`pick-one-out 장면: land.payload.hunks[${i}] 가 객체가 아니다`);
          return {
            at: int(h.at, `land.payload.hunks[${i}].at`),
            removed: strs(h.removed, `land.payload.hunks[${i}].removed`),
            added: strs(h.added, `land.payload.hunks[${i}].added`),
          };
        });
        const branch = str(p.branch, 'land.payload.branch');
        if (branch !== scene.head) throw new Error(`pick-one-out 장면: land.payload.branch ${branch} 가 HEAD 의 이름 ${scene.head} 와 다르다`);
        if (scene.diff === null) throw new Error('pick-one-out 장면: 차이를 셈하기 전에 land 가 왔다');
        if (scene.landed !== null) throw new Error('pick-one-out 장면: land 가 두 번 왔다');
        const landed: PickLanded = {
          branch,
          result: strs(p.result, 'land.payload.result'),
          hunks,
        };
        return { ...scene, landed, step: { kind: 'land' } };
      }
      case 'commit': {
        const p = payloadOf(event);
        const id = str(p.id, 'commit.payload.id');
        const parent = str(p.parent, 'commit.payload.parent');
        const branch = str(p.branch, 'commit.payload.branch');
        const from = str(p.from, 'commit.payload.from');
        if (scene.landed === null) throw new Error('pick-one-out 장면: 얹기 전에 commit 이 왔다');
        if (scene.made !== null) throw new Error('pick-one-out 장면: commit 이 두 번 왔다');
        if (branch !== scene.head) throw new Error(`pick-one-out 장면: commit.payload.branch ${branch} 가 HEAD 의 이름 ${scene.head} 와 다르다`);
        const was = nameTarget(scene.names, branch);
        if (from !== was) throw new Error(`pick-one-out 장면: commit.payload.from ${from} 가 ${branch} 가 가리키던 커밋 ${was} 와 다르다`);
        if (parent !== was) throw new Error(`pick-one-out 장면: commit.payload.parent ${parent} 가 ${branch} 가 가리키던 커밋 ${was} 와 다르다`);
        if (scene.commits.some((c) => c.id === id)) throw new Error(`pick-one-out 장면: commit.payload.id ${id} 가 이미 있는 커밋이다`);
        const made: PickCommit = { id, parents: [parent], lines: [...scene.landed.result] };
        const names = scene.names.map((n) => (n.name === branch ? { name: n.name, commit: id } : { name: n.name, commit: n.commit }));
        return { ...scene, made, names, step: { kind: 'commit', from } };
      }
      default:
        throw new Error(`pick-one-out 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
