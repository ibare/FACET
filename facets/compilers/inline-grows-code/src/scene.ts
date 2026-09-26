/**
 * inline-grows-code 의 장면.
 *
 * - 바탕: `entry`(셈의 기준이 되는 함수) · `start`(걸음 0 의 부른 자리 수 · 불리는 함수 · 그림의 축척)
 * - 자취: `program`(지금의 코드) · `counts`(걸음마다의 크기 · 실행) · `trace`(지금 `entry` 한 번에 밟는 차례)
 * - 이번 걸음: `step` — 어느 부른 자리를 무엇으로 바꿨는가, 그리고 바꾸기 전의 코드와 밟는 차례(`was` · `wasTrace`)
 *
 * 줄 구조와 셈은 알고리즘(`algorithm.ts`)이 가진다. 장면은 좁히개만 빌려 이벤트를 잇고, 셈을 다시 돌리지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { insText, readIns, readProgram, type Line, type TraceRow } from './algorithm.js';

export type Counts = { size: number; exec: number };

export type Start = { calls: number; callee: string; extent: Counts };

export type InlineStep = {
  kind: 'inline';
  callId: string;
  dst: string;
  fn: string;
  pastedIds: string[];
  remaining: number;
  /** 바꾸기 전의 코드 — 흐름의 출발 자리를 셈하는 계기값 */
  was: Line[];
  /** 바꾸기 전의 밟는 차례 */
  wasTrace: TraceRow[];
};

export type InlineGrowsCodeScene = {
  entry: string;
  /** `init` 이 오기 전에는 없다 */
  start: Start | null;
  program: Line[];
  counts: Counts[];
  /** `init` 이 오기 전에는 없다 */
  trace: TraceRow[] | null;
  step: InlineStep | null;
};

function int(u: unknown, where: string): number {
  if (typeof u !== 'number' || !Number.isInteger(u)) throw new Error(`${where}: 정수가 아니다`);
  return u;
}

function str(u: unknown, where: string): string {
  if (typeof u !== 'string') throw new Error(`${where}: 글자가 아니다`);
  return u;
}

function readLine(u: unknown, where: string): Line {
  if (typeof u !== 'object' || u === null) throw new Error(`${where}: 줄이 객체가 아니다`);
  const o = u as Record<string, unknown>;
  const ins = readIns(o.ins, where);
  const text = str(o.text, `${where}.text`);
  if (text !== insText(ins)) throw new Error(`${where}: 글자 "${text}" 이 구조와 어긋난다`);
  if (o.src !== null && typeof o.src !== 'string') throw new Error(`${where}: src 가 글자도 null 도 아니다`);
  return { id: str(o.id, `${where}.id`), ins, text, fn: str(o.fn, `${where}.fn`), origin: str(o.origin, `${where}.origin`), src: o.src };
}

function readTrace(u: unknown, where: string): TraceRow[] {
  if (!Array.isArray(u)) throw new Error(`${where}: 밟는 차례가 배열이 아니다`);
  return u.map((r, i) => {
    const at = `${where}[${i}]`;
    if (typeof r !== 'object' || r === null) throw new Error(`${at}: 객체가 아니다`);
    const o = r as Record<string, unknown>;
    const kind = o.kind;
    if (kind !== 'op' && kind !== 'call' && kind !== 'return') throw new Error(`${at}: 모르는 종류 ${String(kind)}`);
    return { key: str(o.key, `${at}.key`), kind, origin: str(o.origin, `${at}.origin`) };
  });
}

export const inlineGrowsCodeScene: ScenePlan<InlineGrowsCodeScene> = {
  initial(initialData: unknown): InlineGrowsCodeScene {
    if (typeof initialData !== 'object' || initialData === null) throw new Error('initialData 가 객체가 아니다');
    const d = initialData as Record<string, unknown>;
    return { entry: str(d.entry, 'entry'), start: null, program: readProgram(d.program), counts: [], trace: null, step: null };
  },

  reduce(scene: InlineGrowsCodeScene, event: FacetRuntimeEvent): InlineGrowsCodeScene {
    if (typeof event.payload !== 'object' || event.payload === null) throw new Error(`${event.type}: payload 가 없다`);
    const p = event.payload as Record<string, unknown>;
    if (event.type === 'init') {
      const extent = { size: int(p.peakSize, 'init.peakSize'), exec: int(p.peakExec, 'init.peakExec') };
      return {
        ...scene,
        start: { calls: int(p.calls, 'init.calls'), callee: str(p.callee, 'init.callee'), extent },
        counts: [{ size: int(p.size, 'init.size'), exec: int(p.exec, 'init.exec') }],
        trace: readTrace(p.trace, 'init.trace'),
        step: null,
      };
    }
    if (event.type === 'inline') {
      if (scene.trace === null) throw new Error('inline: init 보다 먼저 왔다');
      const callId = str(p.callId, 'inline.callId');
      if (!Array.isArray(p.pasted)) throw new Error('inline.pasted: 배열이 아니다');
      const at = scene.program.findIndex((l) => l.id === callId);
      const site = scene.program[at];
      if (at < 0 || !site || site.ins.k !== 'call') throw new Error(`inline: ${callId} 이 부르는 줄이 아니다`);
      const pasted = p.pasted.map((u, i) => readLine(u, `${callId} 의 ${i} 번째 붙인 줄`));
      const program = [...scene.program.slice(0, at), ...pasted, ...scene.program.slice(at + 1)];
      return {
        ...scene,
        program,
        counts: [...scene.counts, { size: int(p.size, 'inline.size'), exec: int(p.exec, 'inline.exec') }],
        trace: readTrace(p.trace, 'inline.trace'),
        step: {
          kind: 'inline',
          callId,
          dst: site.ins.dst,
          fn: site.ins.fn,
          pastedIds: pasted.map((l) => l.id),
          remaining: int(p.remaining, 'inline.remaining'),
          was: scene.program,
          wasTrace: scene.trace,
        },
      };
    }
    throw new Error(`모르는 이벤트 ${event.type}`);
  },
};
