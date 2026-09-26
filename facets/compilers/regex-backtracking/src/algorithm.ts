/**
 * regex-backtracking — 역추적 엔진은 안 맞는 글줄에서 얼마나 일하는가.
 *
 * 무늬 구조 `(a|aa)*b` 를 명령 배열(CHAR · SPLIT · JMP · MATCH)로 옮기고, 역추적 기계 `matchFrom` 을
 * 한 번 돌리며 갈고리로 걸음 경계를 모은 뒤 그 기록을 걸음으로 편다. `matchFrom` 은 irs.ts 의 IR 과
 * 같은 함수다 — 걸음을 위해 다른 셈을 짜지 않는다.
 *
 * ── 규약 (lexical common)
 *   - 갈래 왼쪽 먼저 · 되풀이는 욕심(몸 먼저, 나감 나중) · 막히면 가장 최근 SPLIT 의 둘째 길
 *   - 무늬는 글줄 **전체**에 맞아야 한다 — MATCH 는 sp = 글줄 길이일 때만
 *   - tries (대어 본 글자) = CHAR 명령을 실행한 수. 글줄 끝(견줄 글자가 없음)과 견준 것도 하나
 *   - 자리마다 대어 본 수 = 그 CHAR 가 선 자리 sp 별 tries. 글줄 길이 자리(끝 칸)도 한 칸. 합 = tries
 *   - retries (다시 고른 갈래) = SPLIT 에서 첫 길이 실패해 둘째 길로 간 수
 *   - 동률 규칙은 없다 — 모든 수가 정수 셈이고 견주기가 없다
 *
 * ── 걸음 경계
 *   #0 시작 · #1 내려감(첫 CHAR 실패 직전) · 되풀이 SPLIT 이 자리 sp 에서 처음으로 실패를 돌려준 순간마다
 *   한 걸음(sp 는 줄어드는 차례로만 온다 — 아니면 던진다) · MATCH 가 맞은 순간 · 끝에 판정 한 걸음.
 *
 * ── 이벤트 (payload 스키마)
 *   board    { aCount: number, lastChar: number, letters: string[], patternText: string, cells: number,
 *              capacity: number, triesScale: number, hitsScale: number, dfaSteps: number, motionMs: number }
 *            판 머리. capacity · triesScale · hitsScale 은 사다리 전체에서 셈한 고정 눈금
 *   step     { kind: 'descend' | 'exhaust' | 'accept', sp: number, tries: number, retries: number,
 *              delta: number, hits: number[], fresh: number[], motionMs: number }
 *            fresh = 이 걸음에 새로 대어 본 수(자리마다), delta = 그 합
 *   verdict  { matched: boolean, tries: number, retries: number, dfaSteps: number, motionMs: number }
 *   phase    { phase: string }  — silent
 *
 * ── phase 어휘 (irs.ts 와 같다): try-char · back-off · accept · verdict
 *   #0 없음(projector 가 board 에서 코드 패널을 끈다) · 내려감 try-char · 다 대 봄 back-off · MATCH accept · 판정 verdict
 *
 * ── 계기 (누적 채널, 지금 값을 들고 차이만 보낸다)
 *   tries · retries · dfa-steps
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 무늬 구조 — 1차 데이터. 화면 글자 `(a|aa)*b` 는 여기서 찍는다. */
export type RxNode =
  | { kind: 'lit'; letter: string }
  | { kind: 'seq'; items: RxNode[] }
  | { kind: 'alt'; items: RxNode[] }
  | { kind: 'star'; body: RxNode };

export type RegexBacktrackingData = {
  type: 'regex-backtracking';
  stepMs: number;
  /** 한 걸음의 운동 길이 (ms, 재생 속도 1 기준). 걸음 = 운동 + stepMs */
  motionMs: number;
  pattern: RxNode;
  /** 글자 번호표 — 번호 = 이 배열의 색인 */
  alphabet: string[];
  /** 글줄을 채우는 글자 */
  fill: string;
  /** 손잡이 ① 사다리 — a 의 수 */
  aCounts: number[];
  /** 손잡이 ② 사다리 — 값 = 색인. 끝 글자가 fill 과 같으면 덧붙이지 않는다 */
  lastLetters: string[];
  /** 첫 판의 손잡이 값 */
  start: { aCount: number; lastChar: number };
};

/** 명령 종류 번호 — IR 주석의 번호표와 같다 */
export const OP_CHAR = 0;
export const OP_SPLIT = 1;
export const OP_JMP = 2;
export const OP_MATCH = 3;

export type Program = { op: number[]; arg1: number[]; arg2: number[]; starPc: number };

/** 무늬 구조를 글자로 찍는다 (공용 — stage 는 payload 로 받는다). */
export function showPattern(p: RxNode): string {
  switch (p.kind) {
    case 'lit':
      return p.letter;
    case 'seq':
      return p.items.map(showPattern).join('');
    case 'alt':
      return '(' + p.items.map(showPattern).join('|') + ')';
    case 'star': {
      const inner = showPattern(p.body);
      return (inner.startsWith('(') ? inner : '(' + inner + ')') + '*';
    }
    default:
      throw new Error(`모르는 무늬 마디: ${JSON.stringify(p)}`);
  }
}

/**
 * 무늬 구조 → 명령 배열. 적힌 차례로 낸다.
 *   lit c → CHAR c → 다음 · seq → 차례로 · star(e) → L: SPLIT 몸, 나감 · e · JMP L ·
 *   alt(x, y) → SPLIT x, y · x · JMP 끝 · y · 무늬 끝에 MATCH
 */
export function compilePattern(pattern: RxNode, alphabet: string[]): Program {
  const op: number[] = [];
  const arg1: number[] = [];
  const arg2: number[] = [];
  const stars: number[] = [];
  const put = (k: number, a: number, b: number): number => {
    op.push(k);
    arg1.push(a);
    arg2.push(b);
    return op.length - 1;
  };
  const gen = (p: RxNode): void => {
    switch (p.kind) {
      case 'lit': {
        const code = alphabet.indexOf(p.letter);
        if (code < 0) throw new Error(`글자 번호표에 없는 글자: ${p.letter}`);
        const i = put(OP_CHAR, code, -1);
        arg2[i] = op.length;
        return;
      }
      case 'seq':
        for (const x of p.items) gen(x);
        return;
      case 'alt': {
        if (p.items.length !== 2) throw new Error(`갈래는 둘이어야 한다: ${p.items.length}`);
        const s = put(OP_SPLIT, -1, -1);
        arg1[s] = op.length;
        gen(p.items[0]!);
        const j = put(OP_JMP, -1, -1);
        arg2[s] = op.length;
        gen(p.items[1]!);
        arg1[j] = op.length;
        return;
      }
      case 'star': {
        const s = put(OP_SPLIT, -1, -1);
        stars.push(s);
        arg1[s] = op.length;
        gen(p.body);
        put(OP_JMP, s, -1);
        arg2[s] = op.length;
        return;
      }
      default:
        throw new Error(`모르는 무늬 마디: ${JSON.stringify(p)}`);
    }
  };
  gen(pattern);
  put(OP_MATCH, -1, -1);
  if (stars.length !== 1) throw new Error(`되풀이가 하나여야 걸음 경계를 잡는다: ${stars.length}`);
  return { op, arg1, arg2, starPc: stars[0]! };
}

/** 갈고리 — 걸음 경계를 잡는다. 셈은 바꾸지 않는다. */
export type MatchHook = {
  char?(pc: number, sp: number, willMatch: boolean): void;
  splitDone?(pc: number, sp: number, result: number): void;
  accept?(pc: number, sp: number): void;
};

/**
 * IR `matchFrom` 과 같은 길. counts[0] 대어 본 글자 · counts[1] 다시 고른 갈래 · hits[sp] 자리마다 대어 본 수.
 * 1 = 맞음 · 0 = 실패.
 */
export function matchFrom(
  op: number[],
  arg1: number[],
  arg2: number[],
  text: number[],
  pc: number,
  sp: number,
  counts: number[],
  hits: number[],
  hook?: MatchHook,
): number {
  const k = op[pc];
  if (k === OP_CHAR) {
    const willMatch = sp < text.length && text[sp] === arg1[pc];
    hook?.char?.(pc, sp, willMatch);
    counts[0] = counts[0]! + 1;
    hits[sp] = hits[sp]! + 1;
    if (willMatch) return matchFrom(op, arg1, arg2, text, arg2[pc]!, sp + 1, counts, hits, hook);
    return 0;
  }
  if (k === OP_SPLIT) {
    const first = matchFrom(op, arg1, arg2, text, arg1[pc]!, sp, counts, hits, hook);
    if (first !== 0) return first;
    counts[1] = counts[1]! + 1;
    const r = matchFrom(op, arg1, arg2, text, arg2[pc]!, sp, counts, hits, hook);
    hook?.splitDone?.(pc, sp, r);
    return r;
  }
  if (k === OP_JMP) return matchFrom(op, arg1, arg2, text, arg1[pc]!, sp, counts, hits, hook);
  if (k === OP_MATCH) {
    if (sp === text.length) {
      hook?.accept?.(pc, sp);
      return 1;
    }
    return 0;
  }
  throw new Error(`모르는 명령 종류: ${String(k)} (명령 ${pc})`);
}

/** IR `matchAll` 과 같은 길 — 버퍼를 비우고 명령 0, 자리 0 에서 시작한다. */
export function matchAll(
  op: number[],
  arg1: number[],
  arg2: number[],
  text: number[],
  counts: number[],
  hits: number[],
  hook?: MatchHook,
): number {
  counts[0] = 0;
  counts[1] = 0;
  for (let i = 0; i < hits.length; i++) hits[i] = 0;
  return matchFrom(op, arg1, arg2, text, 0, 0, counts, hits, hook);
}

/** 손잡이 값 → 글줄 글자들. */
export function buildText(d: RegexBacktrackingData, aCount: number, lastChar: number): string[] {
  const last = d.lastLetters[lastChar];
  if (last === undefined) throw new Error(`끝 글자 사다리에 없는 값: ${lastChar}`);
  const out: string[] = [];
  for (let i = 0; i < aCount; i++) out.push(d.fill);
  if (last !== d.fill) out.push(last);
  return out;
}

/** 글자 → 번호. 번호표에 없으면 던진다. */
export function encodeText(letters: string[], alphabet: string[]): number[] {
  return letters.map((c) => {
    const code = alphabet.indexOf(c);
    if (code < 0) throw new Error(`글자 번호표에 없는 글자: ${c}`);
    return code;
  });
}

export type BoardStep = {
  kind: 'descend' | 'exhaust' | 'accept';
  sp: number;
  tries: number;
  retries: number;
  hits: number[];
};

export type Board = {
  letters: string[];
  matched: boolean;
  tries: number;
  retries: number;
  hits: number[];
  steps: BoardStep[];
};

/** 한 판 — matchAll 을 한 번 돌리며 갈고리로 걸음 경계의 기록을 모은다. */
export function runBoard(d: RegexBacktrackingData, prog: Program, aCount: number, lastChar: number): Board {
  const letters = buildText(d, aCount, lastChar);
  const text = encodeText(letters, d.alphabet);
  const counts = [0, 0];
  const hits = new Array<number>(text.length + 1).fill(0);
  const steps: BoardStep[] = [];
  const snap = (kind: BoardStep['kind'], sp: number): void => {
    steps.push({ kind, sp, tries: counts[0]!, retries: counts[1]!, hits: hits.slice() });
  };
  let descended = false;
  const exhausted = new Set<number>();
  const hook: MatchHook = {
    char(_pc, sp, willMatch) {
      if (!descended && !willMatch) {
        descended = true;
        snap('descend', sp);
      }
    },
    splitDone(pc, sp, result) {
      if (pc === prog.starPc && result === 0 && !exhausted.has(sp)) {
        exhausted.add(sp);
        snap('exhaust', sp);
      }
    },
    accept(_pc, sp) {
      snap('accept', sp);
    },
  };
  const r = matchAll(prog.op, prog.arg1, prog.arg2, text, counts, hits, hook);
  const order = steps.filter((s) => s.kind === 'exhaust').map((s) => s.sp);
  for (let i = 1; i < order.length; i++) {
    if (order[i]! >= order[i - 1]!) throw new Error(`다 대 본 자리가 줄어드는 차례가 아니다: ${order.join(',')}`);
  }
  if (steps[0]?.kind !== 'descend') throw new Error('첫 걸음 경계가 내려감이 아니다');
  return { letters, matched: r === 1, tries: counts[0]!, retries: counts[1]!, hits, steps };
}

/** 사다리 전체의 고정 눈금 — 판 사이에 눈금이 바뀌면 커짐이 안 보인다. */
export function ladderScale(d: RegexBacktrackingData, prog: Program): { capacity: number; triesScale: number; hitsScale: number } {
  let capacity = 0;
  let triesScale = 0;
  let hitsScale = 0;
  for (const n of d.aCounts) {
    for (let last = 0; last < d.lastLetters.length; last++) {
      const b = runBoard(d, prog, n, last);
      capacity = Math.max(capacity, b.letters.length + 1);
      triesScale = Math.max(triesScale, b.tries);
      hitsScale = Math.max(hitsScale, ...b.hits);
    }
  }
  return { capacity, triesScale, hitsScale };
}

function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  return typeof v === 'number' ? v : null;
}

export async function regexBacktrackingAlgorithm(ctxIn: FacetContext<RegexBacktrackingData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<RegexBacktrackingData>;
  const d = ctx.data;
  const prog = compilePattern(d.pattern, d.alphabet);
  const patternText = showPattern(d.pattern);
  const scale = ladderScale(d, prog);

  let aCount = d.start.aCount;
  let lastChar = d.start.lastChar;
  if (!d.aCounts.includes(aCount)) throw new Error(`첫 a 의 수가 사다리에 없다: ${aCount}`);
  if (lastChar < 0 || lastChar >= d.lastLetters.length) throw new Error(`첫 끝 글자가 사다리에 없다: ${lastChar}`);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown: Record<string, number | undefined> = {};
  const setMetric = (name: string, value: number): void => {
    const before = shown[name];
    const delta = before === undefined ? value : value - before;
    if (before === undefined || delta !== 0) ctx.metric(name, delta);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(d.stepMs + d.motionMs);

  for (;;) {
    if (ctx.cancelled) return;
    const board = runBoard(d, prog, aCount, lastChar);
    const dfaSteps = board.letters.length;

    // #0 시작
    setMetric('tries', 0);
    setMetric('retries', 0);
    setMetric('dfa-steps', dfaSteps);
    await ctx.emit({
      type: 'board',
      payload: {
        aCount,
        lastChar,
        letters: board.letters,
        patternText,
        cells: board.letters.length + 1,
        capacity: scale.capacity,
        triesScale: scale.triesScale,
        hitsScale: scale.hitsScale,
        dfaSteps,
        motionMs: d.motionMs,
      },
    });
    if (!(await pause())) return;

    let prevHits: number[] = new Array<number>(board.letters.length + 1).fill(0);
    let prevTries = 0;
    for (const st of board.steps) {
      if (ctx.cancelled) return;
      if (st.kind === 'descend') await phase('try-char');
      else if (st.kind === 'exhaust') await phase('back-off');
      else await phase('accept');
      setMetric('tries', st.tries);
      setMetric('retries', st.retries);
      const fresh = st.hits.map((h, i) => h - prevHits[i]!);
      await ctx.emit({
        type: 'step',
        payload: {
          kind: st.kind,
          sp: st.sp,
          tries: st.tries,
          retries: st.retries,
          delta: st.tries - prevTries,
          hits: st.hits,
          fresh,
          motionMs: d.motionMs,
        },
      });
      prevHits = st.hits;
      prevTries = st.tries;
      if (!(await pause())) return;
    }

    // 끝 — 판정 (판 전체의 셈과 마지막 걸음의 기록이 같아야 한다)
    await phase('verdict');
    setMetric('tries', board.tries);
    setMetric('retries', board.retries);
    await ctx.emit({
      type: 'verdict',
      payload: {
        matched: board.matched,
        tries: board.tries,
        retries: board.retries,
        dfaSteps,
        motionMs: d.motionMs,
      },
    });

    // 입력 대기 — 우리 손잡이만 받는다
    for (;;) {
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      const v = readValue(input.payload);
      if (input.type === 'aCount') {
        if (v === null || !d.aCounts.includes(v)) continue;
        aCount = v;
        break;
      }
      if (input.type === 'lastChar') {
        if (v === null || !Number.isInteger(v) || v < 0 || v >= d.lastLetters.length) continue;
        lastChar = v;
        break;
      }
    }
  }
}
