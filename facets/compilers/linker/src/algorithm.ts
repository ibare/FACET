/**
 * linker — 링커가 파일을 차례대로 읽어 이름을 정의에 잇고(해석), 절을 주소 띠에 놓고(놓기),
 * 명령 속 주소 칸을 고쳐 적는다(고치기). 손잡이 둘이 차례와 calc 의 꼴을 바꾼다.
 *
 * 규약 (사양 그대로):
 *   - 해석 — 파일을 차례대로, 파일 하나 = 한 걸음. 파일 안은 D 항목 먼저, 그다음 U 항목 (적힌 차례).
 *     D s → 정의 표에 s (이미 있으면 던진다), 기다림에 s 가 있으면 메우고 뺀다.
 *     U s → 정의 표에 있으면 곧바로 메움, 없으면 기다림 끝에 (이미 기다리면 그대로).
 *   - 라이브러리 — 그 순간의 기다림 가운데 이 파일이 정의하는 이름이 하나라도 있을 때만 끌려온다.
 *     없으면 건너뛰고 다시 돌아가 보지 않는다 (한 번 훑는 링커). 오브젝트는 늘 넣는다.
 *   - 끝에 기다림이 남으면 정의 없음 — 놓기 · 고치기를 하지 않는다 (던지지 않고 이 판의 결과로 보인다).
 *   - 놓기 — 넣은 파일 차례로 text 절을 textStart 부터, data 절을 dataStart 부터 이어 붙인다.
 *   - 고치기 — 넣은 파일 차례 · text 의 재배치 차례로 한 칸 = 한 걸음.
 *     S = 제 절이 놓인 자리 + 절 안 자리, P = 그 파일 text 의 자리 + 명령 자리. ABS 칸 = S · REL 칸 = S − P.
 *   - 동률 — 파일 · 항목은 적힌 차례. 이 데이터에서 같은 이름을 둘이 기다리는 일은 없다
 *     (기다림의 주인은 먼저 기다린 파일 하나로 적는다).
 *
 * 이벤트 (payload 스키마 · silent 여부):
 *   phase     { phase: string }                                                 silent
 *   round     { order: string[], names: string[], libs: string[] }
 *             걸음 0 — 파일 id 차례 · 찍을 파일 이름 · 이 판에 라이브러리인 파일 id
 *   resolve   { file, pulled: boolean, defs: string[], filled: {sym, waiter}[], direct: {sym, definer}[],
 *               added: string[], waiting: string[] }                         파일 하나를 읽었다
 *   skip      { file, waiting: string[] }                                       라이브러리를 건너뛰었다
 *   missing   { names: string[] }                                               정의 없음 — 링크 멈춤
 *   place     { file, textAt, textSize, textEnd, dataAt, dataSize, dataEnd }    절 둘을 놓았다 (dataSize 0 이면 text 만.
 *             End 는 절의 마지막 바이트 주소)
 *   patch     { file, index, off, sym, kind: 'abs'|'rel', site, target, targetSec: 'text'|'data', val, before, after }
 *             index = 그 파일 text 의 명령 번호(0 부터), site = P, target = S, targetSec = S 가 있는 절,
 *             before · after = 명령 글자
 *
 * phase 어휘 (irs.ts 와 같다): resolve-def · resolve-use · skip-lib · undefined · place · patch-abs · patch-rel
 *
 * 계기 (걸음마다 지금 값, 판 머리에서 0 으로):
 *   waiting-names   지금 기다리는 이름 수
 *   linked-files    넣은 파일 수
 *   patched-fields  고친 칸 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LinkerRelKind = 'abs' | 'rel';

/** 명령 하나 — 주소 칸이 있으면 head + 칸 + tail 로 찍는다 (글자를 파싱하지 않는다) */
export type LinkerInstr = {
  head: string;
  tail: string;
  rel?: { sym: string; kind: LinkerRelKind };
};

export type LinkerDef = { sym: string; sec: 'text' | 'data'; off: number };

export type LinkerFile = {
  id: string;
  /** 오브젝트로 찍는 이름 */
  name: string;
  /** 라이브러리로 찍는 이름 (form 손잡이가 꼴을 바꾸는 파일만) */
  libName?: string;
  defs: LinkerDef[];
  uses: string[];
  text: LinkerInstr[];
  data: { name: string; bytes: number }[];
};

export type LinkerData = {
  type: 'linker';
  stepMs: number;
  /** 명령 하나의 바이트 */
  wordBytes: number;
  textStart: number;
  dataStart: number;
  files: LinkerFile[];
  /** form 손잡이가 꼴을 바꾸는 파일 id */
  libFile: string;
  /** order 손잡이 값 → 파일 id 차례 */
  orders: string[][];
  orderLadder: number[];
  /** 0 오브젝트 · 1 라이브러리 */
  formLadder: number[];
  order: number;
  form: number;
};

export type LinkerMetrics = { waiting: number; linked: number; patched: number };

export type LinkerStep =
  | { kind: 'start'; metrics: LinkerMetrics }
  | {
      kind: 'resolve';
      file: string;
      pulled: boolean;
      defs: string[];
      filled: { sym: string; waiter: string }[];
      direct: { sym: string; definer: string }[];
      added: string[];
      waiting: string[];
      metrics: LinkerMetrics;
    }
  | { kind: 'skip'; file: string; waiting: string[]; metrics: LinkerMetrics }
  | { kind: 'missing'; names: string[]; metrics: LinkerMetrics }
  | { kind: 'place'; file: string; textAt: number; textSize: number; dataAt: number; dataSize: number; metrics: LinkerMetrics }
  | {
      kind: 'patch';
      file: string;
      index: number;
      off: number;
      sym: string;
      relKind: LinkerRelKind;
      site: number;
      target: number;
      targetSec: 'text' | 'data';
      val: number;
      before: string;
      after: string;
      metrics: LinkerMetrics;
    };

export type LinkerResult = {
  order: string[];
  steps: LinkerStep[];
  ok: boolean;
  longestWait: number;
  included: number;
  /** 정의 없는 이름 수 (링크가 됐으면 0) */
  missing: number;
  /** 고친 칸 — 파일 차례 · 재배치 차례 */
  fields: { file: string; off: number; relKind: LinkerRelKind; val: number }[];
  /** 심볼 주소 (링크가 됐을 때만) */
  symAddr: Record<string, number>;
};

/** 주소 칸의 글자 — ABS 는 `@2000`, REL 은 부호를 늘 붙인다 (`+12` · `-28`) */
export function fieldText(kind: LinkerRelKind, val: number): string {
  if (kind === 'abs') return `@${val}`;
  return val >= 0 ? `+${val}` : `${val}`;
}

/** 명령 글자 — val 이 null 이면 고치기 전(`@0` · `+0`) */
export function instrText(ins: LinkerInstr, val: number | null): string {
  if (!ins.rel) return ins.head + ins.tail;
  return ins.head + fieldText(ins.rel.kind, val ?? 0) + ins.tail;
}

/** 파일 이름 — form 손잡이가 꼴을 바꾸는 파일은 라이브러리일 때 libName 으로 찍는다 */
export function fileName(data: LinkerData, file: LinkerFile, form: number): string {
  if (file.id !== data.libFile || form === 0) return file.name;
  if (file.libName === undefined) throw new Error(`라이브러리 이름이 없다: ${file.id}`);
  return file.libName;
}

export function findFile(data: LinkerData, id: string): LinkerFile {
  const f = data.files.find((x) => x.id === id);
  if (!f) throw new Error(`모르는 파일: ${id}`);
  return f;
}

export function textSizeOf(data: LinkerData, file: LinkerFile): number {
  return data.wordBytes * file.text.length;
}

export function dataSizeOf(file: LinkerFile): number {
  let n = 0;
  for (const d of file.data) n += d.bytes;
  return n;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isStrs = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
const isNums = (x: unknown): x is number[] => Array.isArray(x) && x.every((s) => typeof s === 'number');

function readInstr(x: unknown): LinkerInstr {
  if (!isObj(x) || typeof x.head !== 'string' || typeof x.tail !== 'string') throw new Error('명령 모양이 아니다');
  if (x.rel === undefined) return { head: x.head, tail: x.tail };
  const r = x.rel;
  if (!isObj(r) || typeof r.sym !== 'string' || (r.kind !== 'abs' && r.kind !== 'rel')) throw new Error('재배치 모양이 아니다');
  return { head: x.head, tail: x.tail, rel: { sym: r.sym, kind: r.kind } };
}

function readFile(x: unknown): LinkerFile {
  if (!isObj(x) || typeof x.id !== 'string' || typeof x.name !== 'string') throw new Error('파일 모양이 아니다');
  if (!Array.isArray(x.defs) || !isStrs(x.uses) || !Array.isArray(x.text) || !Array.isArray(x.data)) throw new Error(`파일 항목이 없다: ${x.id}`);
  const defs = x.defs.map((d): LinkerDef => {
    if (!isObj(d) || typeof d.sym !== 'string' || (d.sec !== 'text' && d.sec !== 'data') || typeof d.off !== 'number') {
      throw new Error(`정의 모양이 아니다: ${String(x.id)}`);
    }
    return { sym: d.sym, sec: d.sec, off: d.off };
  });
  const dataItems = x.data.map((d) => {
    if (!isObj(d) || typeof d.name !== 'string' || typeof d.bytes !== 'number') throw new Error(`data 모양이 아니다: ${String(x.id)}`);
    return { name: d.name, bytes: d.bytes };
  });
  const file: LinkerFile = { id: x.id, name: x.name, defs, uses: [...x.uses], text: x.text.map(readInstr), data: dataItems };
  if (typeof x.libName === 'string') file.libName = x.libName;
  return file;
}

/** initialData 를 좁힌다 — 모양이 다르면 던진다 (stage 가 쓴다) */
export function readLinkerData(x: unknown): LinkerData {
  if (!isObj(x) || x.type !== 'linker') throw new Error('linker 자료가 아니다');
  const { stepMs, wordBytes, textStart, dataStart, libFile, order, form } = x;
  if (typeof stepMs !== 'number' || typeof wordBytes !== 'number' || typeof textStart !== 'number' || typeof dataStart !== 'number') {
    throw new Error('linker 자료의 수가 없다');
  }
  if (typeof libFile !== 'string' || typeof order !== 'number' || typeof form !== 'number') throw new Error('linker 자료의 손잡이 값이 없다');
  if (!Array.isArray(x.files) || !Array.isArray(x.orders) || !x.orders.every(isStrs)) throw new Error('linker 자료의 파일이 없다');
  if (!isNums(x.orderLadder) || !isNums(x.formLadder)) throw new Error('linker 자료의 사다리가 없다');
  return {
    type: 'linker',
    stepMs,
    wordBytes,
    textStart,
    dataStart,
    files: x.files.map(readFile),
    libFile,
    orders: x.orders.map((o) => [...o]),
    orderLadder: [...x.orderLadder],
    formLadder: [...x.formLadder],
    order,
    form,
  };
}

/** 한 판의 셈 — 손잡이 값 둘로 정해진다. 걸음 0 은 늘 원래 파일들이다 */
export function linkPlan(data: LinkerData, orderValue: number, form: number): LinkerResult {
  const order = data.orders[orderValue];
  if (!order) throw new Error(`모르는 차례: ${orderValue}`);
  if (!data.formLadder.includes(form)) throw new Error(`모르는 꼴: ${form}`);

  const steps: LinkerStep[] = [{ kind: 'start', metrics: { waiting: 0, linked: 0, patched: 0 } }];
  const definer = new Map<string, string>();
  const waiting: string[] = [];
  const waiter = new Map<string, string>();
  const included: string[] = [];
  let longest = 0;

  for (const id of order) {
    const file = findFile(data, id);
    const isLib = id === data.libFile && form === 1;
    if (isLib && !file.defs.some((d) => waiting.includes(d.sym))) {
      steps.push({ kind: 'skip', file: id, waiting: [...waiting], metrics: { waiting: waiting.length, linked: included.length, patched: 0 } });
      continue;
    }
    included.push(id);
    const filled: { sym: string; waiter: string }[] = [];
    for (const d of file.defs) {
      if (definer.has(d.sym)) throw new Error(`두 번 정의: ${d.sym}`);
      definer.set(d.sym, id);
      const at = waiting.indexOf(d.sym);
      if (at >= 0) {
        const w = waiter.get(d.sym);
        if (w === undefined) throw new Error(`기다림의 주인이 없다: ${d.sym}`);
        waiting.splice(at, 1);
        filled.push({ sym: d.sym, waiter: w });
      }
    }
    const direct: { sym: string; definer: string }[] = [];
    const added: string[] = [];
    for (const s of file.uses) {
      const def = definer.get(s);
      if (def !== undefined) direct.push({ sym: s, definer: def });
      else if (!waiting.includes(s)) {
        waiting.push(s);
        waiter.set(s, id);
        added.push(s);
      }
    }
    longest = Math.max(longest, waiting.length);
    steps.push({
      kind: 'resolve',
      file: id,
      pulled: isLib,
      defs: file.defs.map((d) => d.sym),
      filled,
      direct,
      added,
      waiting: [...waiting],
      metrics: { waiting: waiting.length, linked: included.length, patched: 0 },
    });
  }

  if (waiting.length > 0) {
    steps.push({ kind: 'missing', names: [...waiting], metrics: { waiting: waiting.length, linked: included.length, patched: 0 } });
    return { order: [...order], steps, ok: false, longestWait: longest, included: included.length, missing: waiting.length, fields: [], symAddr: {} };
  }

  const textAt = new Map<string, number>();
  const dataAt = new Map<string, number>();
  let tAt = data.textStart;
  let dAt = data.dataStart;
  const linked = included.length;
  for (const id of included) {
    const file = findFile(data, id);
    const tSize = textSizeOf(data, file);
    const dSize = dataSizeOf(file);
    textAt.set(id, tAt);
    dataAt.set(id, dAt);
    steps.push({ kind: 'place', file: id, textAt: tAt, textSize: tSize, dataAt: dAt, dataSize: dSize, metrics: { waiting: 0, linked, patched: 0 } });
    tAt += tSize;
    dAt += dSize;
  }

  const symAddr: Record<string, number> = {};
  const symSec = new Map<string, 'text' | 'data'>();
  for (const id of included) {
    const file = findFile(data, id);
    for (const d of file.defs) {
      symSec.set(d.sym, d.sec);
      const base = d.sec === 'text' ? textAt.get(id) : dataAt.get(id);
      if (base === undefined) throw new Error(`놓이지 않은 파일: ${id}`);
      symAddr[d.sym] = base + d.off;
    }
  }

  const fields: LinkerResult['fields'] = [];
  for (const id of included) {
    const file = findFile(data, id);
    const at = textAt.get(id);
    if (at === undefined) throw new Error(`놓이지 않은 파일: ${id}`);
    file.text.forEach((ins, index) => {
      if (!ins.rel) return;
      const off = index * data.wordBytes;
      const site = at + off;
      const target = symAddr[ins.rel.sym];
      if (target === undefined) throw new Error(`주소 없는 심볼: ${ins.rel.sym}`);
      const targetSec = symSec.get(ins.rel.sym);
      if (targetSec === undefined) throw new Error(`절 없는 심볼: ${ins.rel.sym}`);
      const val = ins.rel.kind === 'abs' ? target : target - site;
      fields.push({ file: id, off, relKind: ins.rel.kind, val });
      steps.push({
        kind: 'patch',
        file: id,
        index,
        off,
        sym: ins.rel.sym,
        relKind: ins.rel.kind,
        site,
        target,
        targetSec,
        val,
        before: instrText(ins, null),
        after: instrText(ins, val),
        metrics: { waiting: 0, linked, patched: fields.length },
      });
    });
  }

  return { order: [...order], steps, ok: true, longestWait: longest, included: linked, missing: 0, fields, symAddr };
}

export async function linkerAlgorithm(ctx: FacetContext<LinkerData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LinkerData>;
  const data = ctx.data;
  let orderValue = data.order;
  let form = data.form;
  const shown = { waiting: 0, linked: 0, patched: 0 };

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const showMetrics = (m: LinkerMetrics): void => {
    ctx.metric('waiting-names', m.waiting - shown.waiting);
    shown.waiting = m.waiting;
    ctx.metric('linked-files', m.linked - shown.linked);
    shown.linked = m.linked;
    ctx.metric('patched-fields', m.patched - shown.patched);
    shown.patched = m.patched;
  };

  /** 한 판을 끝까지. 취소되면 false */
  const playRound = async (): Promise<boolean> => {
    const plan = linkPlan(data, orderValue, form);
    for (let i = 0; i < plan.steps.length; i += 1) {
      if (ctx.cancelled) return false;
      const step = plan.steps[i]!;
      if (i > 0 && !(await rctx.sleep(data.stepMs))) return false;
      switch (step.kind) {
        case 'start':
          await ctx.emit({
            type: 'round',
            payload: {
              order: plan.order,
              names: plan.order.map((id) => fileName(data, findFile(data, id), form)),
              libs: form === 1 ? [data.libFile] : [],
            },
          });
          break;
        case 'resolve':
          if (findFile(data, step.file).uses.length > 0) await phase('resolve-use');
          else await phase('resolve-def');
          await ctx.emit({
            type: 'resolve',
            payload: {
              file: step.file,
              pulled: step.pulled,
              defs: step.defs,
              filled: step.filled,
              direct: step.direct,
              added: step.added,
              waiting: step.waiting,
            },
          });
          break;
        case 'skip':
          await phase('skip-lib');
          await ctx.emit({ type: 'skip', payload: { file: step.file, waiting: step.waiting } });
          break;
        case 'missing':
          await phase('undefined');
          await ctx.emit({ type: 'missing', payload: { names: step.names } });
          break;
        case 'place':
          await phase('place');
          await ctx.emit({
            type: 'place',
            payload: {
              file: step.file,
              textAt: step.textAt,
              textSize: step.textSize,
              textEnd: step.textAt + step.textSize - 1,
              dataAt: step.dataAt,
              dataSize: step.dataSize,
              dataEnd: step.dataAt + step.dataSize - 1,
            },
          });
          break;
        case 'patch':
          if (step.relKind === 'abs') await phase('patch-abs');
          else await phase('patch-rel');
          await ctx.emit({
            type: 'patch',
            payload: {
              file: step.file,
              index: step.index,
              off: step.off,
              sym: step.sym,
              kind: step.relKind,
              site: step.site,
              target: step.target,
              targetSec: step.targetSec,
              val: step.val,
              before: step.before,
              after: step.after,
            },
          });
          break;
        default:
          throw new Error('모르는 걸음');
      }
      showMetrics(step.metrics);
    }
    return true;
  };

  try {
    while (true) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 입력 대기 — 우리 손잡이이고 사다리에 있는 값만 받는다
      while (true) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const v = (payload as { value?: unknown }).value;
        if (typeof v !== 'number') continue;
        if (input.type === 'order' && data.orderLadder.includes(v)) {
          orderValue = v;
          break;
        }
        if (input.type === 'form' && data.formLadder.includes(v)) {
          form = v;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
