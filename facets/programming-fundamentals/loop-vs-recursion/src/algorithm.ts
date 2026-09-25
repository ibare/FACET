/**
 * loop-vs-recursion 알고리즘 — 같은 셈 1² + 2² + … + n² 을 반복과 재귀로 차례로 푼다.
 *
 * 반복은 한 틀 안에서 조건 칸으로 되돌아가며 풀고, 재귀는 틀을 한 층씩 더 세웠다가 위에서부터 걷으며
 * 값을 한 층 아래 빈자리로 내려보낸다. 판 하나 = 반복 끝까지(2n+3 걸음) → 재귀 끝까지(3n+2 걸음).
 * 판이 끝나면 손잡이 `upTo` 를 기다렸다가 받은 n 으로 다시 푼다.
 *
 * 답 · 검사 수 · 틀 높이는 전부 셈을 **실제로 밟으며** 센다. 재귀 쪽은 이 파일 안의 재귀 함수가
 * 정말로 자기를 불러 푼다.
 *
 * 틀을 셀 때는 그 함수의 틀만 센다 — 바깥(부른 쪽)은 세지 않는다. 층은 1 부터 센다(먼저 선 틀이 1층).
 *
 * 이벤트 (silent 가 아니면 뒤에 걸음 경계 `sleep` 하나):
 *   round        { n }                                      silent — 새 판. 계기를 0 으로 되돌린 뒤
 *   loop-init    { n, acc, k }                              반복 쪽 틀이 선다 (acc = 0, k = 1)
 *   loop-check   { k, n, pass, count, back, backs }         조건 k <= n 을 셈했다. count 는 몇 번째 검사,
 *                                                           back 은 몸 끝에서 되돌아 올라왔는가, backs 는 되돌아간 횟수
 *   loop-add     { k, square, from, to, kNext }             acc 가 square 만큼 자라고 k 가 kNext 가 된다
 *   loop-return  { answer }                                 반복 쪽이 답을 바깥으로 돌려주고 틀이 걷힌다
 *   rec-check    { level, arg, base, count, height }        level 층 틀의 바닥 검사 arg == 0. 1층은 이 걸음에 선다
 *   rec-call     { level, arg, square, child, height }      level 층이 square + □ 로 기다리며 자기를 부른다 —
 *                                                           child 를 인자로 level+1 층 틀이 선다. height 는 지금 틀 수
 *   rec-base     { level, height }                          바닥 틀이 0 을 돌려주고 걷힌다 — level−1 층의 □ 로. height 는 걷힌 뒤 틀 수
 *   rec-return   { level, arg, square, got, result, outside, height }
 *                                                           □ 에 got 이 내려앉아 square + got = result, 돌려주고 걷힌다.
 *                                                           outside 가 참이면 바깥의 답 자리로
 *   verdict      { n, loop, rec, same }                     silent — 판 끝. 두 답과 그 둘을 견준 결과
 *   phase        { phase }                                  silent — 코드 패널 줄
 *
 * phase 어휘 (irs.ts 와 정확히 같다):
 *   loop-init · loop-check · loop-add · loop-return · rec-check · rec-base · rec-recurse
 *   돌아와 값이 내려앉는 걸음도 rec-recurse 다 — 값이 내려앉는 자리가 그 줄의 호출식이다.
 *
 * 계기 (판이 시작하면 넷 다 0 으로 되돌리고, 걸음마다 지금까지의 값으로 오른다):
 *   loop-checks  반복 쪽 조건 k <= n 을 셈한 횟수 (판 끝 n+1)
 *   rec-checks   재귀 쪽 바닥 검사 n == 0 을 셈한 횟수 (판 끝 n+1)
 *   loop-frames  반복 쪽 틀 최고 높이 (판 끝 1)
 *   rec-frames   재귀 쪽 틀 최고 높이 (판 끝 n+1)
 *
 * 동률 규칙 — 견주는 것은 두 답(정수)의 같음 하나뿐이다. 실수를 쓰지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LoopVsRecursionData = {
  type: 'loop-vs-recursion';
  stepMs: number;
  /** 손잡이 사다리 — facet.ts 의 segments[].value 와 같다. */
  upToLadder: number[];
  /** 첫 판의 n — segments 의 default 와 같다. */
  upTo: number;
};

/** 한 판의 셈 결과 — 검사가 IR 과 견준다. */
export type LoopVsRecursionRound = {
  n: number;
  loop: number;
  rec: number;
  loopChecks: number;
  recChecks: number;
  loopFrames: number;
  recFrames: number;
};

function readLadder(data: LoopVsRecursionData): number[] {
  const ladder = data.upToLadder;
  if (!Array.isArray(ladder) || ladder.length === 0) throw new Error('loop-vs-recursion: upToLadder 가 비었다');
  for (const v of ladder) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
      throw new Error(`loop-vs-recursion: upToLadder 에 1 이상 정수가 아닌 값이 있다 (${String(v)})`);
    }
  }
  return ladder;
}

function readStepMs(data: LoopVsRecursionData): number {
  const ms = data.stepMs;
  if (typeof ms !== 'number' || !(ms > 0)) throw new Error('loop-vs-recursion: stepMs 가 양수가 아니다');
  return ms;
}

export async function loopVsRecursionAlgorithm(ctx: FacetContext<LoopVsRecursionData>): Promise<void> {
  const rc = ctx as ReactiveContext<LoopVsRecursionData>;
  const ladder = readLadder(ctx.data);
  const stepMs = readStepMs(ctx.data);
  if (!ladder.includes(ctx.data.upTo)) throw new Error(`loop-vs-recursion: upTo ${String(ctx.data.upTo)} 가 사다리 밖이다`);
  let n = ctx.data.upTo;

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 이름은 부르는 자리에서 리터럴.
  const shown = new Map<string, number>();
  const meter = (name: string, value: number): void => {
    const before = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - before);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rc.sleep(stepMs);

  /** 판 하나. 취소되면 null. */
  async function playRound(upTo: number): Promise<LoopVsRecursionRound | null> {
    meter('loop-checks', 0);
    meter('rec-checks', 0);
    meter('loop-frames', 0);
    meter('rec-frames', 0);
    await ctx.emit({ type: 'round', payload: { n: upTo }, silent: true });

    // ── 반복: 틀 하나 안에서 조건 칸으로 되돌아간다
    let acc = 0;
    let k = 1;
    let loopChecks = 0;
    let backs = 0;
    meter('loop-frames', 1);
    await ctx.emit({ type: 'loop-init', payload: { n: upTo, acc, k } });
    await phase('loop-init');
    if (!(await pause())) return null;
    for (;;) {
      if (ctx.cancelled) return null;
      const back = loopChecks > 0;
      if (back) backs += 1;
      loopChecks += 1;
      const pass = k <= upTo;
      meter('loop-checks', loopChecks);
      await ctx.emit({ type: 'loop-check', payload: { k, n: upTo, pass, count: loopChecks, back, backs } });
      await phase('loop-check');
      if (!(await pause())) return null;
      if (!pass) break;
      const square = k * k;
      const from = acc;
      acc = acc + square;
      k = k + 1;
      await ctx.emit({ type: 'loop-add', payload: { k: k - 1, square, from, to: acc, kNext: k } });
      await phase('loop-add');
      if (!(await pause())) return null;
    }
    await ctx.emit({ type: 'loop-return', payload: { answer: acc } });
    await phase('loop-return');
    if (!(await pause())) return null;
    const loopAnswer = acc;

    // ── 재귀: 틀을 한 층씩 세우고 위에서부터 걷는다
    let recChecks = 0;
    let height = 0;
    let peak = 0;
    const raise = (h: number): void => {
      height = h;
      if (h > peak) {
        peak = h;
        meter('rec-frames', peak);
      }
    };

    /** 인자 arg 로 level 층 틀에서 푼다. 돌려주는 값, 취소되면 null. */
    async function sumSquaresRec(arg: number, level: number): Promise<number | null> {
      if (ctx.cancelled) return null;
      if (level === 1) raise(1);
      if (height !== level) throw new Error(`loop-vs-recursion: ${level} 층을 셈하는데 틀이 ${height} 층이다`);
      recChecks += 1;
      meter('rec-checks', recChecks);
      const base = arg === 0;
      await ctx.emit({ type: 'rec-check', payload: { level, arg, base, count: recChecks, height } });
      await phase('rec-check');
      if (!(await pause())) return null;
      if (base) {
        if (level < 2) throw new Error('loop-vs-recursion: 바닥 틀 아래에 돌려받을 틀이 없다');
        height = level - 1;
        await ctx.emit({ type: 'rec-base', payload: { level, height } });
        await phase('rec-base');
        if (!(await pause())) return null;
        return 0;
      }
      const square = arg * arg;
      raise(level + 1);
      await ctx.emit({ type: 'rec-call', payload: { level, arg, square, child: arg - 1, height } });
      await phase('rec-recurse');
      if (!(await pause())) return null;
      const got = await sumSquaresRec(arg - 1, level + 1);
      if (got === null) return null;
      const result = square + got;
      height = level - 1;
      await ctx.emit({ type: 'rec-return', payload: { level, arg, square, got, result, outside: level === 1, height } });
      await phase('rec-recurse');
      if (!(await pause())) return null;
      return result;
    }

    const recAnswer = await sumSquaresRec(upTo, 1);
    if (recAnswer === null) return null;
    if (height !== 0) throw new Error(`loop-vs-recursion: 판이 끝났는데 틀이 ${height} 층 남았다`);
    await ctx.emit({
      type: 'verdict',
      payload: { n: upTo, loop: loopAnswer, rec: recAnswer, same: loopAnswer === recAnswer },
      silent: true,
    });
    return { n: upTo, loop: loopAnswer, rec: recAnswer, loopChecks, recChecks, loopFrames: 1, recFrames: peak };
  }

  try {
    while (!ctx.cancelled) {
      const round = await playRound(n);
      if (round === null) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'upTo') continue;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !ladder.includes(value)) {
          throw new Error(`loop-vs-recursion: 손잡이 upTo 의 값 ${String(value)} 가 사다리 밖이다`);
        }
        next = value;
      }
      n = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
