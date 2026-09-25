/**
 * function-as-value 의 장면.
 *
 * 바탕: 코드 줄(글자 · 들여쓰기) — `initial` 이 베껴 둔다.
 * 자취: 만들어진 함수들과 그 몸이 돈 횟수, 살아 있는 틀들(이름 → 값), 출력.
 * 이번 걸음: `step` — 알고리즘이 보낸 걸음을 그대로 옮긴 것. 틀이 걷힌 걸음에는 걷힌 틀
 * (`popped`) 을 계기값으로 싣는다 — 그림이 함수가 어디서 출발하는지 고를 때 쓴다.
 *
 * 셈은 알고리즘이 한다. 여기서는 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SVal = { t: 'num'; n: number } | { t: 'str'; s: string } | { t: 'fn'; id: number } | { t: 'none' };

export type SFn = { id: number; line: number; text: string; params: string[]; lambda: boolean; runs: number };

export type SSlot = { name: string; val: SVal };

export type SFrame = {
  /** 부른 이름. 맨 바깥은 '' */
  callee: string;
  /** 도는 함수 (맨 바깥은 -1) */
  fn: number;
  lambda: boolean;
  depth: number;
  slots: SSlot[];
  /** 몸이 셈해 낸 값 / 돌려줄 값 */
  ret: SVal | null;
};

export type SDone =
  | { k: 'assign'; to: string; declare: boolean; val: SVal; from: string | null }
  | { k: 'show'; val: SVal; from: string | null }
  | { k: 'return'; val: SVal; from: string | null }
  | { k: 'def'; to: string; val: SVal }
  | { k: 'expr' };

export type SStep =
  | { k: 'stmt'; line: number; done: SDone; made: number[] }
  | {
      k: 'call';
      line: number;
      callee: string;
      fn: number;
      lambda: boolean;
      binds: { param: string; val: SVal; from: string | null }[];
      made: number[];
    }
  | { k: 'eval'; line: number; fn: number; shown: string; val: SVal }
  | { k: 'arrive'; line: number; callee: string; lambda: boolean; val: SVal; done: SDone | null; popped: SFrame | null };

export type FunctionAsValueScene = {
  lines: { indent: number; text: string }[];
  fns: SFn[];
  frames: SFrame[];
  out: SVal[];
  step: SStep | null;
};

// ── 좁히개 (payload 는 typeof 로만 좁힌다) ──

function rec(x: unknown): Record<string, unknown> | null {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function num(x: unknown, d = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : d;
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function nameOrNull(x: unknown): string | null {
  return typeof x === 'string' ? x : null;
}

function readVal(x: unknown): SVal {
  const r = rec(x);
  if (!r) return { t: 'none' };
  if (r.t === 'num' && typeof r.n === 'number') return { t: 'num', n: r.n };
  if (r.t === 'str' && typeof r.s === 'string') return { t: 'str', s: r.s };
  if (r.t === 'fn' && typeof r.id === 'number') return { t: 'fn', id: r.id };
  return { t: 'none' };
}

function readDone(x: unknown): SDone | null {
  const r = rec(x);
  if (!r) return null;
  if (r.k === 'assign') return { k: 'assign', to: str(r.to), declare: r.declare === true, val: readVal(r.val), from: nameOrNull(r.from) };
  if (r.k === 'show') return { k: 'show', val: readVal(r.val), from: nameOrNull(r.from) };
  if (r.k === 'return') return { k: 'return', val: readVal(r.val), from: nameOrNull(r.from) };
  if (r.k === 'def') return { k: 'def', to: str(r.to), val: readVal(r.val) };
  if (r.k === 'expr') return { k: 'expr' };
  return null;
}

function readMade(x: unknown): SFn[] {
  if (!Array.isArray(x)) return [];
  const out: SFn[] = [];
  for (const m of x) {
    const r = rec(m);
    if (!r) continue;
    const params = Array.isArray(r.params) ? r.params.filter((p): p is string => typeof p === 'string') : [];
    out.push({ id: num(r.id), line: num(r.line), text: str(r.text), params, lambda: r.lambda === true, runs: 0 });
  }
  return out;
}

function readLines(x: unknown): { indent: number; text: string }[] {
  const r = rec(x);
  if (!r || !Array.isArray(r.lines)) return [];
  const out: { indent: number; text: string }[] = [];
  for (const l of r.lines) {
    const lr = rec(l);
    if (lr) out.push({ indent: num(lr.indent), text: str(lr.text) });
  }
  return out;
}

// ── 틀 다루기 (늘 새 객체) ──

function withSlot(frames: SFrame[], name: string, val: SVal, declare: boolean): SFrame[] {
  const topIdx = frames.length - 1;
  let at = -1;
  if (!declare) {
    for (let i = topIdx; i >= 0; i -= 1) {
      if (frames[i].slots.some((s) => s.name === name)) {
        at = i;
        break;
      }
    }
  }
  if (at < 0) at = topIdx;
  return frames.map((f, i) => {
    if (i !== at) return f;
    const has = f.slots.some((s) => s.name === name);
    const slots = has ? f.slots.map((s) => (s.name === name ? { name, val } : s)) : [...f.slots, { name, val }];
    return { ...f, slots };
  });
}

function applyDone(scene: FunctionAsValueScene, done: SDone | null): FunctionAsValueScene {
  if (!done) return scene;
  if (done.k === 'assign') return { ...scene, frames: withSlot(scene.frames, done.to, done.val, done.declare) };
  if (done.k === 'def') return { ...scene, frames: withSlot(scene.frames, done.to, done.val, true) };
  if (done.k === 'show') return { ...scene, out: [...scene.out, done.val] };
  if (done.k === 'return') {
    const frames = scene.frames.map((f, i) => (i === scene.frames.length - 1 ? { ...f, ret: done.val } : f));
    return { ...scene, frames };
  }
  return scene;
}

function topFrame(): SFrame {
  return { callee: '', fn: -1, lambda: false, depth: 0, slots: [], ret: null };
}

export const functionAsValueScene: ScenePlan<FunctionAsValueScene> = {
  initial(initialData: unknown): FunctionAsValueScene {
    return { lines: readLines(initialData), fns: [], frames: [topFrame()], out: [], step: null };
  },

  reduce(scene: FunctionAsValueScene, event: FacetRuntimeEvent): FunctionAsValueScene {
    const p = rec(event.payload);
    if (!p) return scene;
    const line = num(p.line);

    if (event.type === 'stmt') {
      const done = readDone(p.done) ?? { k: 'expr' };
      const made = readMade(p.made);
      const base = { ...scene, fns: [...scene.fns, ...made] };
      const next = applyDone(base, done);
      return { ...next, step: { k: 'stmt', line, done, made: made.map((m) => m.id) } };
    }

    if (event.type === 'call') {
      const made = readMade(p.made);
      const binds = (Array.isArray(p.binds) ? p.binds : []).map((b) => {
        const r = rec(b);
        return { param: str(r?.param), val: readVal(r?.val), from: nameOrNull(r?.from) };
      });
      const fn = num(p.fn, -1);
      const lambda = p.lambda === true;
      const frame: SFrame = {
        callee: str(p.callee),
        fn,
        lambda,
        depth: num(p.depth) + 1,
        slots: binds.map((b) => ({ name: b.param, val: b.val })),
        ret: null,
      };
      return {
        ...scene,
        fns: [...scene.fns, ...made],
        frames: [...scene.frames, frame],
        step: { k: 'call', line, callee: frame.callee, fn, lambda, binds, made: made.map((m) => m.id) },
      };
    }

    if (event.type === 'eval') {
      const fn = num(p.fn, -1);
      const val = readVal(p.val);
      const last = scene.frames.length - 1;
      return {
        ...scene,
        fns: scene.fns.map((f) => (f.id === fn ? { ...f, runs: f.runs + 1 } : f)),
        frames: scene.frames.map((f, i) => (i === last ? { ...f, ret: val } : f)),
        step: { k: 'eval', line, fn, shown: str(p.shown), val },
      };
    }

    if (event.type === 'arrive') {
      const popped = scene.frames.length > 1 ? scene.frames[scene.frames.length - 1] : null;
      const base = { ...scene, frames: popped ? scene.frames.slice(0, -1) : scene.frames };
      const done = readDone(p.done);
      const next = applyDone(base, done);
      return {
        ...next,
        step: {
          k: 'arrive',
          line,
          callee: str(p.callee),
          lambda: p.lambda === true,
          val: readVal(p.val),
          done,
          popped,
        },
      };
    }

    return scene;
  },
};
