/**
 * copyVsShare — 같은 +1 을 k 번 부르되, 건네는 것이 수 · 목록 · 목록의 칸 중 무엇이냐에 따라
 * 부른 쪽의 값이 그대로이거나 자란다.
 *
 * 부르기마다 세 걸음(부른다 · 몸이 쓴다 · 돌아온다), 끝에 읽기 한 걸음 — 한 판은 3k + 1 걸음이다.
 * 걸음 경계는 `ctx.sleep` 셋(부르기마다)과 판 끝의 입력 대기다.
 *
 * 손잡이 (reactive — 한 판을 끝까지 재생한 뒤 `waitForInput` 으로 받아 다시 재생)
 *   pass   0 · 1 · 2 — `data.passKinds` 의 순번 (number · list · cell)
 *   times  1 · 2 · 3 · 4 — `data.timesLadder` 의 값 (부른 횟수 k)
 *
 * 이벤트
 *   phase   { phase: string }                                   silent
 *   run     { pass: 'number'|'list'|'cell', times: number,
 *             level: number, cells: number[], at: number,
 *             callerValue: number }                             silent. 판 시작 — 부른 쪽을 새로 놓는다.
 *                                                               걸음 경계가 아니다 (첫 부르기와 한 걸음)
 *   call    { pass, n: number, times: number,
 *             copied: number | null }                           n 번째 부르기. 불린 쪽 틀이 열린다.
 *                                                               수 · 칸 판은 베낀 값, 목록 판은 null (주소만)
 *   write   { pass, from: number, to: number,
 *             cells: number[], callerValue: number }            몸이 쓴다. 수 · 칸 판은 x, 목록 판은 at 칸
 *   return  { pass, n: number, lost: number | null,
 *             cells: number[], callerValue: number }            돌아온다. 틀이 닫힌다. lost 는 사라진 x
 *   read    { pass, value: number }                             부른 쪽이 읽는다 (판 끝)
 *
 * phase 어휘 (irs.ts 와 정확히 같다, 여덟)
 *   num-call · num-read · list-call · list-read · cell-call · cell-read · copy-write · shared-write
 *   돌아오는 걸음은 부르는 줄의 phase(`*-call`)를 다시 켠다 — 흐름이 그 줄로 돌아왔기 때문이다.
 *
 * 계기 (판마다 0 에서 다시 오른다 — 지금 값을 들고 차이만 보내는 헬퍼)
 *   calls         이 판에서 부른 횟수
 *   copies        값을 베껴 새 자리(x)에 넣은 횟수 — 목록 판은 0
 *   caller-value  부른 쪽이 지금 읽을 값 (수 판은 level, 목록 · 칸 판은 cells[at])
 *
 * 동률 규칙 — 견주는 곳이 없어 해당 없음. 중간값 최대 11 (목록 판 · k = 4).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CopyVsSharePassKind = 'number' | 'list' | 'cell';

export type CopyVsShareData = {
  type: 'copy-vs-share';
  stepMs: number;
  level: number;
  cells: number[];
  at: number;
  passKinds: CopyVsSharePassKind[];
  timesLadder: number[];
};

/** 손잡이의 기본값 — facet.ts 의 segments default 와 같다 (검사로 잠근다). */
export const COPY_VS_SHARE_DEFAULT_PASS = 1;
export const COPY_VS_SHARE_DEFAULT_TIMES = 3;

const PASS_KINDS: readonly CopyVsSharePassKind[] = ['number', 'list', 'cell'];

function isPassKind(v: unknown): v is CopyVsSharePassKind {
  return typeof v === 'string' && (PASS_KINDS as readonly string[]).includes(v);
}

/** 셈할 수 없는 자료는 조용히 메우지 않고 던진다 (C6). */
function checkData(d: CopyVsShareData): void {
  if (!Number.isInteger(d.level)) throw new Error('copyVsShare: level 이 정수가 아니다');
  if (!Array.isArray(d.cells) || d.cells.length === 0 || !d.cells.every((c) => Number.isInteger(c))) {
    throw new Error('copyVsShare: cells 가 정수 목록이 아니다');
  }
  if (!Number.isInteger(d.at) || d.at < 0 || d.at >= d.cells.length) {
    throw new Error(`copyVsShare: at ${String(d.at)} 이 cells 밖이다`);
  }
  if (!Array.isArray(d.passKinds) || d.passKinds.length !== PASS_KINDS.length || !d.passKinds.every(isPassKind)) {
    throw new Error('copyVsShare: passKinds 가 number · list · cell 이 아니다');
  }
  if (!Array.isArray(d.timesLadder) || d.timesLadder.length === 0 || !d.timesLadder.every((k) => Number.isInteger(k) && k >= 1)) {
    throw new Error('copyVsShare: timesLadder 가 1 이상의 정수 목록이 아니다');
  }
  if (!Number.isFinite(d.stepMs) || d.stepMs <= 0) throw new Error('copyVsShare: stepMs 가 양수가 아니다');
}

type Knobs = { pass: number; times: number };

/** 입력 payload 에서 손잡이 값을 읽는다. 사다리 밖이면 던진다. */
function readKnob(raw: unknown, ladder: readonly number[], name: string): number | null {
  if (raw === undefined || raw === null) return null;
  const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!ladder.includes(v)) throw new Error(`copyVsShare: ${name} 값 ${String(raw)} 이 사다리 밖이다`);
  return v;
}

export async function copyVsShareAlgorithm(ctx0: FacetContext<CopyVsShareData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<CopyVsShareData>;
  const data = ctx.data;
  checkData(data);

  const passLadder = data.passKinds.map((_, i) => i);
  const timesLadder = data.timesLadder;
  if (!passLadder.includes(COPY_VS_SHARE_DEFAULT_PASS) || !timesLadder.includes(COPY_VS_SHARE_DEFAULT_TIMES)) {
    throw new Error('copyVsShare: 기본 손잡이 값이 사다리 밖이다');
  }

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판. 취소되면 false. */
  const play = async ({ pass, times }: Knobs): Promise<boolean> => {
    const kind = data.passKinds[pass];
    if (kind === undefined) throw new Error(`copyVsShare: pass ${String(pass)} 이 passKinds 밖이다`);
    const at = data.at;
    // 판마다 새로 — 앞 판의 고침이 남지 않는다.
    const level = data.level;
    const cells = data.cells.slice();
    const readCaller = (): number => {
      if (kind === 'number') return level;
      const v = cells[at];
      if (v === undefined) throw new Error('copyVsShare: at 칸이 없다');
      return v;
    };

    let calls = 0;
    let copies = 0;
    await ctx.emit({
      type: 'run',
      payload: { pass: kind, times, level, cells: cells.slice(), at, callerValue: readCaller() },
      silent: true,
    });
    setMetric('calls', calls);
    setMetric('copies', copies);
    setMetric('caller-value', readCaller());

    for (let j = 0; j < times; j += 1) {
      if (ctx.cancelled) return false;
      const n = j + 1;

      // 1. 부른다 — 불린 쪽 틀이 열리고 무엇이 건너간다
      if (kind === 'number') await phase('num-call');
      else if (kind === 'list') await phase('list-call');
      else await phase('cell-call');

      let x: number | null = null; // 불린 쪽의 새 자리 (수 · 칸 판)
      let param: number[] | null = null; // 불린 쪽의 이름 cells (목록 판) — 같은 목록을 가리킨다
      if (kind === 'list') {
        param = cells;
      } else {
        x = readCaller();
        copies += 1;
      }
      calls += 1;
      await ctx.emit({ type: 'call', payload: { pass: kind, n, times, copied: x } });
      setMetric('calls', calls);
      setMetric('copies', copies);
      if (!(await ctx.sleep(data.stepMs))) return false;
      if (ctx.cancelled) return false;

      // 2. 몸이 쓴다 — +1
      let from: number;
      let to: number;
      if (param !== null) {
        await phase('shared-write');
        const before = param[at];
        if (before === undefined) throw new Error('copyVsShare: at 칸이 없다');
        param[at] = before + 1;
        from = before;
        to = before + 1;
      } else {
        await phase('copy-write');
        if (x === null) throw new Error('copyVsShare: 베낀 자리 x 가 없다');
        from = x;
        x = x + 1;
        to = x;
      }
      await ctx.emit({
        type: 'write',
        payload: { pass: kind, from, to, cells: cells.slice(), callerValue: readCaller() },
      });
      setMetric('caller-value', readCaller());
      if (!(await ctx.sleep(data.stepMs))) return false;
      if (ctx.cancelled) return false;

      // 3. 돌아온다 — 틀이 닫힌다. x 는 틀과 함께 사라지고, 이름 cells 는 떨어진다
      if (kind === 'number') await phase('num-call');
      else if (kind === 'list') await phase('list-call');
      else await phase('cell-call');
      const lost = x;
      x = null;
      param = null;
      await ctx.emit({
        type: 'return',
        payload: { pass: kind, n, lost, cells: cells.slice(), callerValue: readCaller() },
      });
      setMetric('caller-value', readCaller());
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    if (ctx.cancelled) return false;

    // (끝) 부른 쪽이 읽는다 — 이 걸음의 경계는 뒤따르는 입력 대기다
    if (kind === 'number') await phase('num-read');
    else if (kind === 'list') await phase('list-read');
    else await phase('cell-read');
    await ctx.emit({ type: 'read', payload: { pass: kind, value: readCaller() } });
    setMetric('caller-value', readCaller());
    return true;
  };

  let knobs: Knobs = { pass: COPY_VS_SHARE_DEFAULT_PASS, times: COPY_VS_SHARE_DEFAULT_TIMES };
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play(knobs))) return;

      // 입력을 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const type = input.type;
        if (type !== 'pass' && type !== 'times') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error(`copyVsShare: ${type} 입력에 payload 가 없다`);
        const p = payload as Record<string, unknown>;
        const value = p.value;
        if (typeof value !== 'number') throw new Error(`copyVsShare: ${type} 값이 수가 아니다`);
        const next: Knobs = { ...knobs };
        if (type === 'pass') {
          if (!passLadder.includes(value)) throw new Error(`copyVsShare: pass ${String(value)} 이 사다리 밖이다`);
          next.pass = value;
          const other = readKnob(p.times, timesLadder, 'times');
          if (other !== null) next.times = other;
        } else {
          if (!timesLadder.includes(value)) throw new Error(`copyVsShare: times ${String(value)} 이 사다리 밖이다`);
          next.times = value;
          const other = readKnob(p.pass, passLadder, 'pass');
          if (other !== null) next.pass = other;
        }
        knobs = next;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
