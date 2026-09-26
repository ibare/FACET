// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  dataSizeOf,
  fieldText,
  linkerAlgorithm,
  linkPlan,
  readLinkerData,
  textSizeOf,
  type LinkerData,
} from '../src/algorithm.js';
import { linkerFacet, linkerInitialData } from '../src/facet.js';
import { linkerImperativeIR, linkerIRParams } from '../src/irs.js';
import { linkerProjector } from '../src/projector.js';
import { linkerStageView } from '../src/linker-stage.js';

const data: LinkerData = readLinkerData(linkerInitialData);

/** 사양 실측표 — 차례 × 꼴 (0 오브젝트 · 1 라이브러리) */
const TABLE: { order: number; form: number; longest: number; included: number; result: string; steps: number }[] = [
  { order: 0, form: 0, longest: 2, included: 3, result: 'main+0 @2000 · main+4 +12 · main+8 @2008 · shape+0 +12 · calc+0 @2008', steps: 12 },
  { order: 0, form: 1, longest: 2, included: 3, result: 'main+0 @2000 · main+4 +12 · main+8 @2008 · shape+0 +12 · calc+0 @2008', steps: 12 },
  { order: 1, form: 0, longest: 1, included: 3, result: 'calc+0 @2000 · main+0 @2004 · main+4 +12 · main+8 @2000 · shape+0 -28', steps: 12 },
  { order: 1, form: 1, longest: 2, included: 2, result: 'undefined 2', steps: 5 },
  { order: 2, form: 0, longest: 2, included: 3, result: 'main+0 @2000 · main+4 +24 · main+8 @2008 · calc+0 @2008 · shape+0 -12', steps: 12 },
  { order: 2, form: 1, longest: 2, included: 3, result: 'main+0 @2000 · main+4 +24 · main+8 @2008 · calc+0 @2008 · shape+0 -12', steps: 12 },
];

function planSummary(order: number, form: number): string {
  const r = linkPlan(data, order, form);
  if (!r.ok) return `undefined ${r.missing}`;
  return r.fields.map((f) => `${f.file}+${f.off} ${fieldText(f.relKind, f.val)}`).join(' · ');
}

/** 결정적 섞개 — 선형 합동 생성기 x ← (x · 1103515245 + 12345) mod 2^31 */
function shuffled(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let x = seed;
  for (let i = n - 1; i > 0; i -= 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

type IRRun = { ret: number; stats: number[]; byRel: Map<string, number> };

/** 사양의 거울 lk_ir_run — 파일 · 심볼 · 재배치를 번호로 바꿔 IR 을 부른다 */
function runLinkIR(
  order: number,
  form: number,
  filePerm?: number[],
  symPerm?: number[],
  relPerm?: number[],
  mutate?: (args: Record<string, number | number[]>) => void,
): IRRun {
  const files = data.files;
  const fid = new Map(files.map((f, i) => [f.id, filePerm ? filePerm[i]! : i]));
  const syms: { sym: string; file: string; sec: 'text' | 'data'; off: number }[] = [];
  for (const f of files) for (const d of f.defs) syms.push({ sym: d.sym, file: f.id, sec: d.sec, off: d.off });
  const sid = new Map(syms.map((s, i) => [s.sym, symPerm ? symPerm[i]! : i]));
  const nSym = syms.length;
  const symFile = new Array<number>(nSym).fill(0);
  const symSec = new Array<number>(nSym).fill(0);
  const symOff = new Array<number>(nSym).fill(0);
  for (const s of syms) {
    const i = sid.get(s.sym)!;
    symFile[i] = fid.get(s.file)!;
    symSec[i] = s.sec === 'text' ? 0 : 1;
    symOff[i] = s.off;
  }
  const useFile: number[] = [];
  const useSym: number[] = [];
  for (const f of files) for (const s of f.uses) {
    useFile.push(fid.get(f.id)!);
    useSym.push(sid.get(s)!);
  }
  const rels: { file: string; off: number; sym: string; abs: boolean }[] = [];
  for (const f of files) f.text.forEach((ins, i) => {
    if (ins.rel) rels.push({ file: f.id, off: i * data.wordBytes, sym: ins.rel.sym, abs: ins.rel.kind === 'abs' });
  });
  const nr = rels.length;
  const rp = relPerm ?? rels.map((_, i) => i);
  const relFile = new Array<number>(nr).fill(0);
  const relOff = new Array<number>(nr).fill(0);
  const relSym = new Array<number>(nr).fill(0);
  const relAbs = new Array<number>(nr).fill(0);
  rels.forEach((r, i) => {
    const j = rp[i]!;
    relFile[j] = fid.get(r.file)!;
    relOff[j] = r.off;
    relSym[j] = sid.get(r.sym)!;
    relAbs[j] = r.abs ? 1 : 0;
  });
  const nf = files.length;
  const textSize = new Array<number>(nf).fill(0);
  const dataSize = new Array<number>(nf).fill(0);
  const isLib = new Array<number>(nf).fill(0);
  for (const f of files) {
    const i = fid.get(f.id)!;
    textSize[i] = textSizeOf(data, f);
    dataSize[i] = dataSizeOf(f);
    isLib[i] = f.id === data.libFile && form === 1 ? 1 : 0;
  }
  const fieldVal = new Array<number>(nr).fill(0);
  const stats = [0, 0];
  const args: Record<string, number | number[]> = {
    order: data.orders[order]!.map((id) => fid.get(id)!),
    isLib, textSize, dataSize,
    textStart: data.textStart, dataStart: data.dataStart,
    symFile, symSec, symOff, useFile, useSym, relFile, relOff, relSym, relAbs,
    defined: new Array<number>(nSym).fill(0),
    waiting: new Array<number>(nSym).fill(0),
    included: new Array<number>(nf).fill(0),
    textAt: new Array<number>(nf).fill(0),
    dataAt: new Array<number>(nf).fill(0),
    fieldVal, stats,
  };
  mutate?.(args);
  const ret = runIR(linkerImperativeIR, 'link', linkerIRParams.map((p) => {
    const a = args[p];
    if (a === undefined) throw new Error(`인자 없음: ${p}`);
    return a;
  }));
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  const byRel = new Map<string, number>();
  rels.forEach((r, i) => byRel.set(`${r.file}+${r.off}`, fieldVal[rp[i]!]!));
  return { ret, stats: [...stats], byRel };
}

describe('linker — 사양 표', () => {
  it('여섯 칸 모두 가장 긴 기다림 · 넣은 파일 · 고친 칸 · 걸음 수가 사양과 같다', () => {
    for (const row of TABLE) {
      const r = linkPlan(data, row.order, row.form);
      expect(r.longestWait, `${row.order}/${row.form}`).toBe(row.longest);
      expect(r.included).toBe(row.included);
      expect(planSummary(row.order, row.form)).toBe(row.result);
      expect(r.steps.length).toBe(row.steps);
    }
  });

  it('심볼 주소가 사양과 같다', () => {
    expect(linkPlan(data, 0, 1).symAddr).toEqual({ main: 1000, count: 2000, area: 1016, square: 1028, width: 2008 });
    expect(linkPlan(data, 1, 0).symAddr).toEqual({ square: 1000, width: 2000, main: 1012, count: 2004, area: 1028 });
    expect(linkPlan(data, 2, 1).symAddr).toEqual({ main: 1000, count: 2000, square: 1016, width: 2008, area: 1028 });
  });

  it('기본값 판의 걸음 차례와 명령 글자', () => {
    const r = linkPlan(data, 0, 1);
    expect(r.steps.map((s) => s.kind)).toEqual([
      'start', 'resolve', 'resolve', 'resolve', 'place', 'place', 'place', 'patch', 'patch', 'patch', 'patch', 'patch',
    ]);
    const patches = r.steps.flatMap((s) => (s.kind === 'patch' ? [`${s.before} → ${s.after}`] : []));
    expect(patches).toEqual([
      'load r1, @0 → load r1, @2000',
      'call +0 → call +12',
      'store @0, r1 → store @2008, r1',
      'call +0 → call +12',
      'load r2, @0 → load r2, @2008',
    ]);
    const third = r.steps[3]!;
    expect(third.kind === 'resolve' && third.pulled).toBe(true);
  });
});

describe('linker — IR ↔ algorithm', () => {
  it('모든 손잡이 조합에서 IR 이 algorithm 과 같은 답을 낸다', () => {
    for (const order of data.orderLadder) for (const form of data.formLadder) {
      const r = linkPlan(data, order, form);
      const ir = runLinkIR(order, form);
      expect(ir.stats).toEqual([r.longestWait, r.included]);
      if (r.ok) {
        expect(ir.ret).toBe(r.fields.length);
        for (const f of r.fields) expect(ir.byRel.get(`${f.file}+${f.off}`)).toBe(f.val);
      } else {
        expect(ir.ret).toBe(-r.missing);
      }
    }
  });

  it('파일 번호 · 심볼 번호 · 재배치 차례를 섞어도 같다 (마흔 번)', () => {
    for (let k = 0; k < 40; k += 1) {
      const fp = shuffled(3, 7 + k);
      const sp = shuffled(5, 101 + k * 3);
      const rp = shuffled(5, 997 + k * 5);
      for (const order of data.orderLadder) for (const form of data.formLadder) {
        expect(runLinkIR(order, form, fp, sp, rp)).toEqual(runLinkIR(order, form));
      }
    }
  });

  it('매개변수 배열 길이 · 중간값 최대치', () => {
    expect(linkerIRParams.length).toBe(22);
    expect(data.files.length).toBe(3);
    expect(data.files.reduce((n, f) => n + f.defs.length, 0)).toBe(5);
    let maxVal = 0;
    for (const order of data.orderLadder) for (const form of data.formLadder) {
      for (const v of runLinkIR(order, form).byRel.values()) maxVal = Math.max(maxVal, Math.abs(v));
    }
    expect(maxVal).toBe(2008);
  });
});

describe('linker — 모르는 모양', () => {
  const BAD = -(5 + 1); // 표지 = 0 - (심볼 수 + 1) — 정의 없음의 음수 −1 … −5 와 겹치지 않는다
  const setAt = (args: Record<string, number | number[]>, key: string, i: number, val: number) => {
    const a = args[key];
    if (!Array.isArray(a)) throw new Error(key);
    a[i] = val;
  };

  it('isLib 가 0 · 1 밖(2)이면 TS 는 던지고 IR 은 표지를 돌려준다', () => {
    expect(() => linkPlan(data, 0, 2)).toThrow();
    for (const order of data.orderLadder) {
      expect(runLinkIR(order, 1, undefined, undefined, undefined, (a) => setAt(a, 'isLib', 2, 2)).ret).toBe(BAD);
      expect(runLinkIR(order, 0, undefined, undefined, undefined, (a) => setAt(a, 'isLib', 0, 2)).ret).toBe(BAD);
    }
    // 1 은 라이브러리 — 표지가 아니다
    expect(runLinkIR(1, 0, undefined, undefined, undefined, (a) => setAt(a, 'isLib', 2, 1)).ret).toBe(-2);
  });

  it('symSec · relAbs 가 0 · 1 밖이면 TS 는 던지고 IR 은 표지를 돌려준다', () => {
    const raw = structuredClone(linkerInitialData) as unknown as { files: { defs: { sec: string }[]; text: { rel?: { kind: string } }[] }[] };
    raw.files[0]!.defs[1]!.sec = 'code';
    expect(() => readLinkerData(raw)).toThrow();
    const raw2 = structuredClone(linkerInitialData) as unknown as typeof raw;
    raw2.files[0]!.text[0]!.rel!.kind = 'pc';
    expect(() => readLinkerData(raw2)).toThrow();
    // 심볼 0(main)은 어느 칸의 대상도 아니라 읽히지 않는다 — 대상인 1 … 4 만 표지를 낸다
    expect(runLinkIR(0, 1, undefined, undefined, undefined, (a) => setAt(a, 'symSec', 0, 2)).ret).toBe(5);
    for (const i of [1, 2, 3, 4]) {
      expect(runLinkIR(0, 1, undefined, undefined, undefined, (a) => setAt(a, 'symSec', i, 2)).ret).toBe(BAD);
    }
    for (const i of [0, 1, 2, 3, 4]) {
      expect(runLinkIR(0, 1, undefined, undefined, undefined, (a) => setAt(a, 'relAbs', i, 2)).ret).toBe(BAD);
    }
    // 정의 없음은 표지와 다른 값
    expect(runLinkIR(1, 1).ret).toBe(-2);
  });
});

describe('linker — 사다리 · 기본값', () => {
  it('사다리가 segments[].value 와 같고 기본값이 default 와 같다', () => {
    const controls = (linkerFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = (action: string) =>
      controls.find((c) => (c as { action?: string }).action === action) as { segments: { value: number; default?: boolean }[] };
    expect(knob('order').segments.map((s) => s.value)).toEqual(data.orderLadder);
    expect(knob('form').segments.map((s) => s.value)).toEqual(data.formLadder);
    expect(knob('order').segments.find((s) => s.default)!.value).toBe(data.order);
    expect(knob('form').segments.find((s) => s.default)!.value).toBe(data.form);
    expect(data.orderLadder.at(-1)).toBe(2);
    expect(data.orders.length).toBe(data.orderLadder.length);
  });
});

type Input = { type: string; payload: { value: number } };

/** 알고리즘을 돌려 판마다 계기 합과 걸음별 계기 값을 모은다 */
async function drive(inputs: Input[]) {
  const totals = new Map<string, number>();
  const rounds: { waiting: number; linked: number; patched: number; perStep: string[] }[] = [];
  let perStep: string[] = [];
  const snap = () => `${totals.get('waiting-names') ?? 0}·${totals.get('linked-files') ?? 0}·${totals.get('patched-fields') ?? 0}`;
  let cancelled = false;
  const queue = [...inputs];
  let stepsInRound = 0;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const close = () => {
    if (stepsInRound === 0 && perStep.length === 0) return; // 받지 않은 입력 — 판이 없다
    perStep.push(snap());
    rounds.push({
      waiting: totals.get('waiting-names') ?? 0,
      linked: totals.get('linked-files') ?? 0,
      patched: totals.get('patched-fields') ?? 0,
      perStep,
    });
    perStep = [];
    stepsInRound = 0;
  };
  const ctx = {
    data: structuredClone(linkerInitialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(_e: FacetRuntimeEvent) {},
    async sleep() {
      perStep.push(snap());
      stepsInRound += 1;
      return !cancelled;
    },
    async waitForInput() {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([linkerAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

describe('linker — 회차별 계기', () => {
  it('기본값 → 깨지는 칸 → 기본값으로 돌려도 판마다 사양 표와 같다', async () => {
    const rounds = await drive([
      { type: 'order', payload: { value: 1 } },
      { type: 'order', payload: { value: 0 } },
    ]);
    expect(rounds.length).toBe(3);
    expect(rounds[0]!.perStep).toEqual([
      '0·0·0', '2·1·0', '2·2·0', '0·3·0', '0·3·0', '0·3·0', '0·3·0', '0·3·1', '0·3·2', '0·3·3', '0·3·4', '0·3·5',
    ]);
    expect(rounds[1]!.perStep).toEqual(['0·0·0', '0·0·0', '2·1·0', '2·2·0', '2·2·0']);
    expect(rounds[2]).toEqual(rounds[0]);
  });

  it('꼴을 오브젝트로 돌린 판은 정의 없음이 사라진다', async () => {
    const rounds = await drive([
      { type: 'order', payload: { value: 1 } },
      { type: 'form', payload: { value: 0 } },
      { type: 'nope', payload: { value: 0 } },
      { type: 'order', payload: { value: 9 } },
      { type: 'order', payload: { value: 2 } },
    ]);
    expect(rounds.map((r) => `${r.waiting}·${r.linked}·${r.patched}`)).toEqual(['0·3·5', '2·2·0', '0·3·5', '0·3·5']);
  });
});

describe('linker — 무대', () => {
  it('projector 가 한 판의 이벤트를 무대에 옮기고 캡션의 수가 칸의 수와 같다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(linkerStageView, container, { config: {}, initialData: linkerInitialData, locale: 'en' });
    const lit: (string | null)[] = [];
    const code = { destroy() {}, highlightPhase: (p: string | null) => lit.push(p) };
    const proj = linkerProjector({ stage, codePanel: code });
    proj.onInit?.(linkerInitialData);
    const events: FacetRuntimeEvent[] = [];
    const ctx = {
      data: structuredClone(linkerInitialData),
      cancelled: false,
      metric() {},
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
        await proj.onEvent(e);
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
        return new Promise<never>(() => {});
      },
      pollInput() {
        return null;
      },
    };
    void linkerAlgorithm(ctx as never);
    await new Promise((r) => setTimeout(r, 20));
    const text = container.textContent ?? '';
    expect(text).toContain('load r2, @2008');
    expect(text).toContain('call +12');
    expect(text).toContain('libcalc.a');
    expect(text).toContain('ABS width: S = @2008');
    expect(lit[0]).toBeNull();
    expect(lit).toContain('patch-rel');
    stage.destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    const v = mountView(linkerStageView, container, { config: {} });
    v.destroy();
  });
});
