/**
 * paste-the-body 의 장면.
 *
 * 바탕 — 불린 함수의 줄(`callee`)은 처음 그대로 남는다.
 * 자취 — 부르는 함수의 줄(`caller`)에 붙은 줄이 쌓인다. 붙은 줄은 어느 줄에서 왔는지(`from`)를 쥔다.
 * 이번 걸음 — `step`. 흘러 들어온 것이 어디서 어디로 갔는지(글자 자리)를 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { planPaste, readPasteData, type PasteFn, type PasteTheBodyFacetData } from './algorithm.js';

export type PasteRowKind = 'orig' | 'bind' | 'paste' | 'return';

export type PasteRow = {
  indent: number;
  text: string;
  /** 불린 함수의 몇째 줄(머리줄 0)에서 왔는가. 처음부터 있던 줄은 null */
  from: number | null;
  kind: PasteRowKind;
};

export type PasteStep =
  | { kind: 'start'; at: number }
  | {
      kind: 'bind-let';
      at: number;
      from: number;
      param: string;
      paramCol: number;
      paramTo: number;
      arg: string;
      argCol: number;
      argTo: number;
    }
  | { kind: 'bind-direct'; param: string; arg: string }
  | { kind: 'paste'; at: number; from: number }
  | {
      kind: 'return';
      at: number;
      from: number;
      expr: string;
      exprCol: number;
      exprTo: number;
      call: string;
      callCol: number;
    };

export type PasteTheBodyScene = {
  calleeName: string;
  callerName: string;
  callee: PasteRow[];
  caller: PasteRow[];
  step: PasteStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`paste-the-body 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`paste-the-body 장면: ${k} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`paste-the-body 장면: ${k} 가 글자가 아니다`);
  return v;
}

/** 함수 하나의 줄(머리줄 + 몸)을 장면의 줄로 베낀다. */
function rowsOf(d: PasteTheBodyFacetData, f: PasteFn): PasteRow[] {
  return [f.head, ...f.body.map((b) => b.line)].map((i) => {
    const ln = d.lines[i];
    if (!ln) throw new Error(`paste-the-body 장면: L${i + 1} 가 없다`);
    return { indent: ln.indent, text: ln.text, from: null, kind: 'orig' as const };
  });
}

function insertRow(rows: PasteRow[], at: number, row: PasteRow): PasteRow[] {
  if (at < 1 || at > rows.length) throw new Error(`paste-the-body 장면: 줄 자리 ${at} 가 벗어났다`);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

export const pasteTheBodyScene: ScenePlan<PasteTheBodyScene> = {
  initial(initialData: unknown): PasteTheBodyScene {
    const d = readPasteData(initialData);
    const { siteRow, callee, caller } = planPaste(d);
    return {
      calleeName: callee.name,
      callerName: caller.name,
      callee: rowsOf(d, callee),
      caller: rowsOf(d, caller),
      step: { kind: 'start', at: siteRow },
    };
  },

  reduce(scene: PasteTheBodyScene, event: FacetRuntimeEvent): PasteTheBodyScene {
    if (event.type === 'bind-let') {
      const p = rec(event.payload, 'payload');
      const at = num(p, 'at');
      const from = num(p, 'from');
      const indent = scene.caller[at]?.indent ?? scene.caller[at - 1]?.indent;
      if (indent === undefined) throw new Error(`paste-the-body 장면: 줄 자리 ${at} 가 벗어났다`);
      return {
        ...scene,
        caller: insertRow(scene.caller, at, { indent, text: str(p, 'text'), from, kind: 'bind' }),
        step: {
          kind: 'bind-let',
          at,
          from,
          param: str(p, 'param'),
          paramCol: num(p, 'paramCol'),
          paramTo: num(p, 'paramTo'),
          arg: str(p, 'arg'),
          argCol: num(p, 'argCol'),
          argTo: num(p, 'argTo'),
        },
      };
    }
    if (event.type === 'bind-direct') {
      const p = rec(event.payload, 'payload');
      return { ...scene, step: { kind: 'bind-direct', param: str(p, 'param'), arg: str(p, 'arg') } };
    }
    if (event.type === 'paste') {
      const p = rec(event.payload, 'payload');
      const at = num(p, 'at');
      const from = num(p, 'from');
      const site = scene.caller[at];
      if (!site) throw new Error(`paste-the-body 장면: 부른 줄 ${at} 가 없다`);
      return {
        ...scene,
        caller: insertRow(scene.caller, at, { indent: site.indent, text: str(p, 'text'), from, kind: 'paste' }),
        step: { kind: 'paste', at, from },
      };
    }
    if (event.type === 'return') {
      const p = rec(event.payload, 'payload');
      const at = num(p, 'at');
      const from = num(p, 'from');
      const site = scene.caller[at];
      if (!site) throw new Error(`paste-the-body 장면: 부른 줄 ${at} 가 없다`);
      const caller = scene.caller.map((r, i) =>
        i === at ? { indent: r.indent, text: str(p, 'text'), from, kind: 'return' as const } : r,
      );
      return {
        ...scene,
        caller,
        step: {
          kind: 'return',
          at,
          from,
          expr: str(p, 'expr'),
          exprCol: num(p, 'exprCol'),
          exprTo: num(p, 'exprTo'),
          call: str(p, 'call'),
          callCol: num(p, 'callCol'),
        },
      };
    }
    throw new Error(`paste-the-body 장면: 모르는 이벤트 ${event.type}`);
  },
};
