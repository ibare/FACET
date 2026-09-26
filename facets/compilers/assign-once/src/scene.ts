/**
 * assign-once 의 장면.
 *
 * 바탕 — `code`(세 주소 코드 명령, initialData 에서 베낌) · `names`(판을 매기는 이름과 그 넣기 줄, init 이 정함)
 * 자취 — `renamed`(줄마다 SSA 로 바뀐 판. 아직 안 바뀐 줄은 null)
 * 이번 걸음 — `step`(방금 바꾼 줄 번호)
 *
 * 명령의 모양 · 좁히개 · 글자 찍기(`instrTokens`)는 algorithm.ts 에 있다. 장면 · 그림이 그것을 가져다 쓴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { isRecord, readCode, type Instr } from './algorithm.js';

/** 이름 하나와 그 판. 판이 없는 이름(읽기만 하는 이름 · 임시)은 ver 가 null. */
export type Ver = { name: string; ver: number | null };

export type Renamed = { dst: { name: string; ver: number } | null; reads: Ver[] };

/** 판을 매기는 이름 하나 — 넣는 줄(1 부터) 목록. */
export type NameInfo = { name: string; lines: number[] };

/** 판 하나와 그 판에 넣은 횟수 — 알고리즘이 끝 걸음에 센다. */
export type VersionCount = { name: string; ver: number; n: number };

export type AssignOnceScene = {
  code: Instr[];
  names: NameInfo[];
  renamed: (Renamed | null)[];
  step: { line: number } | null;
  /** 끝 걸음에만 선다 — 판마다 넣은 횟수 (판이 생긴 차례). */
  end: VersionCount[] | null;
};

function bad(what: string): never {
  throw new Error(`assign-once 장면: ${what}`);
}

function readPosInt(v: unknown, what: string): number {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  return bad(`${what} 이 양의 정수가 아니다`);
}

function readVer(v: unknown, what: string): Ver {
  if (!isRecord(v) || typeof v.name !== 'string' || v.name === '') return bad(`${what} 의 이름 모양이 틀렸다`);
  if (v.ver === null) return { name: v.name, ver: null };
  return { name: v.name, ver: readPosInt(v.ver, `${what} 의 판`) };
}

function readList(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) return bad(`${what} 가 목록이 아니다`);
  return v as unknown[];
}

export const assignOnceScene: ScenePlan<AssignOnceScene> = {
  initial(initialData: unknown): AssignOnceScene {
    const code = readCode(initialData);
    return { code, names: [], renamed: code.map(() => null), step: null, end: null };
  },

  reduce(scene: AssignOnceScene, event: FacetRuntimeEvent): AssignOnceScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p)) return bad('init payload 가 객체가 아니다');
      const names: NameInfo[] = readList(p.names, 'init.names').map((n, k) => {
        if (!isRecord(n) || typeof n.name !== 'string' || n.name === '') return bad(`init.names[${k}] 모양이 틀렸다`);
        const lines = readList(n.lines, `init.names[${k}].lines`).map((x) => {
          const line = readPosInt(x, `init.names[${k}] 의 줄`);
          if (line > scene.code.length) return bad(`init.names[${k}] 의 줄 ${line} 이 코드 밖이다`);
          return line;
        });
        return { name: n.name, lines };
      });
      return { ...scene, names };
    }
    if (event.type === 'rename') {
      if (!isRecord(p)) return bad('rename payload 가 객체가 아니다');
      const line = readPosInt(p.line, 'rename.line');
      if (line > scene.code.length) return bad(`rename.line ${line} 이 코드 밖이다`);
      const reads = readList(p.reads, 'rename.reads').map((r, k) => readVer(r, `rename.reads[${k}]`));
      let dst: Renamed['dst'] = null;
      if (p.dst !== null) {
        const v = readVer(p.dst, 'rename.dst');
        if (v.ver === null) return bad('rename.dst 에 판이 없다');
        dst = { name: v.name, ver: v.ver };
      }
      let end: VersionCount[] | null = null;
      if (p.end !== null) {
        end = readList(p.end, 'rename.end').map((c, k) => {
          if (!isRecord(c) || typeof c.name !== 'string' || c.name === '') return bad(`rename.end[${k}] 모양이 틀렸다`);
          return {
            name: c.name,
            ver: readPosInt(c.ver, `rename.end[${k}].ver`),
            n: readPosInt(c.n, `rename.end[${k}].n`),
          };
        });
      }
      const renamed = scene.renamed.slice();
      renamed[line - 1] = { dst, reads };
      return { ...scene, renamed, step: { line }, end };
    }
    return bad(`모르는 이벤트 ${event.type}`);
  },
};
