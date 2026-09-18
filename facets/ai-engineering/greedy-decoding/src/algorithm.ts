/**
 * greedyDecoding — 걸음마다 1 등만 고르면 글 전체도 가장 그럴듯한가.
 *
 * 프롬프트 `The best way to learn is` 의 끝 낱말에서 출발해 **다음 낱말 표**를 걷는다.
 * 첫 걸음만 손잡이가 정한 등수를 고르고, 그 뒤는 늘 1 등(탐욕)이다. 글 전체의 값은
 * 고른 낱말의 확률을 차례로 곱한 것이다.
 *
 * ── 예로 정한 값
 *
 * 다음 낱말 표의 확률(%)은 전부 **예로 정한 값**이다. 실제 언어 모형은 앞 글 전체를
 * 보지만, 이 표는 **앞 낱말 하나만** 보고 다음 낱말을 정한다. 고리가 어디서 생기는지
 * 보이려고 그렇게 줄였다. 조각들이 로짓을 소프트맥스로 셈하는 것과 달리 여기서는
 * 확률을 바로 준다 — 셈 전체를 정수로 두어 코드 패널의 여섯 언어가 같은 수를 내게
 * 하려는 것이다.
 *
 * ── 규약
 *
 * - 걸음 s (0 부터): 지금 낱말의 행에서 s = 0 이면 손잡이 등수, 아니면 1 등을 고른다.
 *   행은 등수 차례로 적혀 있다. **동률은 표에 먼저 적힌 것이 앞선다** — 이 표에는
 *   같은 확률이 한 행에 둘 있는 자리가 없어 실제로 걸리지 않는다.
 * - 고른 것이 끝 표식이면 글이 끝난다. **남은 걸음은 값을 치르지 않는다.**
 * - 글 전체 = 백만분율 정수. 처음 1,000,000, 걸음마다 `score = score × p // 100` (내림).
 *   화면과 계기는 천분율 `(score + 500) // 1000` 로 보인다.
 * - 되풀이 = **만든 글 안에서** 앞에 이미 나온 낱말을 다시 고른 수 (끝 표식 제외).
 *   프롬프트는 세지 않는다.
 * - 정수 중간값 최대 `score × p` = 1,000,000 × 40 = 40,000,000 (int32 안).
 *
 * ── 이벤트 (전부 silent 아님, phase 만 silent)
 *
 *   run-start   { firstRank: number, start: string }
 *               새 판. 앞 판의 글이 갈래 자리까지 되감긴다.
 *   candidates  { step: number, from: string, rank: number,
 *                 options: { word: string, p: number }[] }
 *               지금 낱말의 행 — 후보와 확률(%), 고를 등수(1 부터).
 *   advance     { step: number, from: string, word: string, p: number,
 *                 score: number, permille: number }
 *               한 낱말을 붙였다. score 는 붙인 뒤의 백만분율, permille 은 그 천분율.
 *               화면은 셈하지 않고 이 값을 받는다.
 *   finish      { firstRank: number, score: number, permille: number,
 *                 closed: boolean, steps: number }
 *               걷기를 마쳤다. closed 면 끝 표식에서 멈췄고 남은 걸음은 값을 치르지
 *               않았다. steps 는 실제로 걸은 걸음 수 — 닫힌 글이면 끝 표식을 고른
 *               걸음의 번호(1 부터)와 같다.
 *   tally       { repeats: number, repeatSteps: number[] }
 *               만든 글에서 되풀이한 낱말의 걸음 번호(0 부터).
 *   phase       { phase } — silent
 *
 * ── phase 어휘
 *
 *   'start' | 'pick' | 'score' | 'finish' | 'repeat'
 *
 * ── 메트릭
 *
 *   first-step-percent  첫 걸음에 고른 낱말의 확률 (%)
 *   sequence-permille   글 전체의 확률 (천분율)
 *   repeat-count        만든 글 안의 되풀이 수
 *
 * ── 입력
 *
 *   firstRank  { value: number } — 사다리(`firstRanks`) 안의 값만 받는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 다음 낱말 후보 하나. p 는 백분율 정수(예로 정한 값). */
export type GreedyDecodingOption = { word: string; p: number };

/** 표의 한 행 — 앞 낱말 `word` 다음에 올 후보들, 등수 차례. */
export type GreedyDecodingRow = { word: string; next: GreedyDecodingOption[] };

export type GreedyDecodingData = {
  type: 'greedy-decoding';
  /** 소재 글. 마지막 낱말이 걷기의 출발점이다. */
  prompt: string;
  /** 앞 낱말 하나만 보는 다음 낱말 표. 행 차례가 곧 IR 에 건네는 번호 차례다. */
  table: GreedyDecodingRow[];
  /** 만들 걸음 수. */
  steps: number;
  /** 끝 표식. */
  endToken: string;
  /** 손잡이 사다리 — 첫 걸음 등수. */
  firstRanks: number[];
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

/** 한 걸음의 기록. */
export type GreedyDecodingStep = {
  step: number;
  from: string;
  rank: number;
  options: GreedyDecodingOption[];
  word: string;
  p: number;
  /** 이 걸음을 붙인 뒤의 백만분율. */
  score: number;
  /** 이 걸음의 `score × p` — 32비트 확인용 중간값. */
  product: number;
};

export type GreedyDecodingResult = {
  firstRank: number;
  start: string;
  steps: GreedyDecodingStep[];
  /** 만든 낱말 (끝 표식 포함). */
  words: string[];
  score: number;
  permille: number;
  repeats: number;
  repeatSteps: number[];
  /** 끝 표식에서 멈췄는가. */
  closed: boolean;
};

/** 백만분율을 천분율로 — 반올림. */
export function toPermille(score: number): number {
  return Math.floor((score + 500) / 1000);
}

/** 프롬프트의 마지막 낱말 (공백으로 가른 덩이). */
export function lastWord(prompt: string): string {
  const parts = prompt.split(' ').filter((w) => w.length > 0);
  return parts[parts.length - 1] ?? '';
}

/**
 * 표를 걷는다 — 알고리즘과 검사가 같은 셈을 쓴다.
 *
 * 걸음마다 지금 낱말의 행에서 등수를 골라 붙이고 `score × p // 100` 으로 깎는다.
 */
export function computeGreedyDecodingResult(
  data: GreedyDecodingData,
  firstRank: number,
): GreedyDecodingResult {
  const rows = new Map<string, GreedyDecodingOption[]>();
  for (const row of data.table) rows.set(row.word, row.next);

  const start = lastWord(data.prompt);
  const steps: GreedyDecodingStep[] = [];
  const words: string[] = [];
  let score = 1_000_000;
  let cur = start;
  let closed = false;

  for (let s = 0; s < data.steps; s++) {
    const options = rows.get(cur) ?? [];
    const rank = s === 0 ? firstRank : 1;
    const chosen = options[rank - 1];
    // 그 등수의 후보가 없으면 걷기를 멈춘다 — 이 표에서는 걸리지 않는다. IR 은 tok == -1 로 같은 자리에서 멈춘다.
    if (chosen === undefined) break;
    const product = score * chosen.p;
    score = Math.floor(product / 100);
    steps.push({ step: s, from: cur, rank, options, word: chosen.word, p: chosen.p, score, product });
    words.push(chosen.word);
    if (chosen.word === data.endToken) {
      closed = true;
      break;
    }
    cur = chosen.word;
  }

  const repeatSteps: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (w === data.endToken) continue;
    if (words.slice(0, i).includes(w)) repeatSteps.push(i);
  }

  return {
    firstRank,
    start,
    steps,
    words,
    score,
    permille: toPermille(score),
    repeats: repeatSteps.length,
    repeatSteps,
    closed,
  };
}

/** 원자료를 좁힌다 — 모양이 어긋나면 null (C9). */
export function narrowGreedyDecodingData(raw: unknown): GreedyDecodingData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (d.type !== 'greedy-decoding') return null;
  if (typeof d.prompt !== 'string') return null;
  if (typeof d.steps !== 'number' || typeof d.endToken !== 'string') return null;
  if (typeof d.stepMs !== 'number') return null;
  if (!Array.isArray(d.firstRanks) || !d.firstRanks.every((v) => typeof v === 'number')) return null;
  if (!Array.isArray(d.table)) return null;
  const table: GreedyDecodingRow[] = [];
  for (const row of d.table) {
    if (typeof row !== 'object' || row === null) return null;
    const r = row as Record<string, unknown>;
    if (typeof r.word !== 'string' || !Array.isArray(r.next)) return null;
    const next: GreedyDecodingOption[] = [];
    for (const o of r.next) {
      if (typeof o !== 'object' || o === null) return null;
      const opt = o as Record<string, unknown>;
      if (typeof opt.word !== 'string' || typeof opt.p !== 'number') return null;
      next.push({ word: opt.word, p: opt.p });
    }
    table.push({ word: r.word, next });
  }
  return {
    type: 'greedy-decoding',
    prompt: d.prompt,
    table,
    steps: d.steps,
    endToken: d.endToken,
    firstRanks: d.firstRanks as number[],
    stepMs: d.stepMs,
  };
}

export async function greedyDecodingAlgorithm(ctx: FacetContext<GreedyDecodingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GreedyDecodingData>;
  const data = narrowGreedyDecodingData(ctx.data);
  if (!data) return;
  const ladder = data.firstRanks;
  const stepMs = data.stepMs;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 더하기만 한다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 취소됐으면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  };

  /** 한 판을 끝까지 재생한다. 취소되면 false. */
  const play = async (firstRank: number): Promise<boolean> => {
    const result = computeGreedyDecodingResult(data, firstRank);

    await phase('start');
    await ctx.emit({ type: 'run-start', payload: { firstRank, start: result.start } });
    gauge('first-step-percent', 0);
    gauge('sequence-permille', toPermille(1_000_000));
    gauge('repeat-count', 0);
    if (!(await pause())) return false;

    for (const st of result.steps) {
      if (ctx.cancelled) return false;
      await phase('pick');
      await ctx.emit({
        type: 'candidates',
        payload: { step: st.step, from: st.from, rank: st.rank, options: st.options.map((o) => ({ ...o })) },
      });
      if (!(await pause())) return false;
      await phase('score');
      await ctx.emit({
        type: 'advance',
        payload: {
          step: st.step,
          from: st.from,
          word: st.word,
          p: st.p,
          score: st.score,
          permille: toPermille(st.score),
        },
      });
      if (st.step === 0) gauge('first-step-percent', st.p);
      gauge('sequence-permille', toPermille(st.score));
      if (!(await pause())) return false;
    }

    await phase('finish');
    await ctx.emit({
      type: 'finish',
      payload: {
        firstRank,
        score: result.score,
        permille: result.permille,
        closed: result.closed,
        steps: result.steps.length,
      },
    });
    if (!(await pause())) return false;
    await phase('repeat');
    await ctx.emit({ type: 'tally', payload: { repeats: result.repeats, repeatSteps: [...result.repeatSteps] } });
    gauge('repeat-count', result.repeats);
    return true;
  };

  const initial = ladder.includes(1) ? 1 : (ladder[0] ?? 1);
  let rank = initial;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play(rank))) return;
      // 판을 마쳤다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'firstRank') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !ladder.includes(value)) continue;
        rank = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
