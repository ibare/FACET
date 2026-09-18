/**
 * beam-search 알고리즘 — 몇 줄기를 함께 끌고 가야 가장 그럴듯한 글을 찾는가.
 *
 * 프롬프트 `For lunch she ate` 뒤에 낱말 셋을 잇는다. 빔은 (앞말, 점수) 줄기들이고,
 * 걸음마다 살아 있는 줄기에서 가지를 뻗은 뒤 점수 높은 `폭` 개만 남긴다. 손잡이
 * `erase` 를 켜면 관사 뒤에 소리가 맞지 않는 낱말(`a apple` · `an banana`)을
 * **점수를 매기기 전에** 지운다.
 *
 * ── 예로 정한 값
 *
 * 다음 낱말 표의 확률(%)은 전부 **예로 정한 값**이다. 실제 모형이 낸 수가 아니다.
 * 특히 `a` 뒤의 `apple` 45 % 는 작은 모형이 저지르는 실수를 일부러 넣은 것이다.
 * 낱말의 첫소리(모음 · 자음)도 자료로 준다 — 글자로 짐작하지 않는다.
 *
 * ── 셈의 규약
 *
 * - 점수는 확률의 곱을 **백만분율 정수**로 들고 간다. 처음 1,000,000, 가지마다
 *   `score × p // 100` (내림. 이 자료에서 나머지는 없다). 로그 합과 순서가 같고,
 *   정수로 견주므로 부동소수점 동률 경계가 없다.
 * - 줄기는 빔 차례대로, 한 줄기의 가지는 표의 등수 차례대로 펼친다. 앞말이 `.` 으로
 *   끝난 줄기는 펼치지 않고 점수 그대로 후보에 넣는다 (견준 수에 안 셈).
 * - 지우기: 앞말의 마지막 낱말이 관사이고 다음 낱말의 첫소리가 그 관사가 바라는
 *   소리가 아니면 지운다. 첫소리가 없는 낱말(`some` · `soup` · `.`)은 지우지 않는다.
 *   지운 것은 "지운 후보" 로 세고 "견준 후보" 로 세지 않는다. 남은 확률을 **다시
 *   나누지 않는다** — 다시 나누면 지운 줄기만 점수가 부풀어 줄기끼리의 견줌이 기운다.
 * - 솎기: 점수 내림차순으로 앞 `폭` 개. **동률이면 먼저 만들어진 후보** (빔 차례 →
 *   등수 차례). 이 자료의 여덟 조합에서 동률은 네 번 걸리고 모두 빔 안쪽이다 —
 *   폭 경계에서 걸리는 것은 0 번 (`test/beam-search.test.ts` 가 센다).
 * - 깊이 3 에 닿으면 끝. 답은 마지막 빔의 첫 줄기다. "올바른가" 는 관사 규칙을 어긴
 *   이음이 없는가다.
 *
 * ── 이벤트 (payload 스키마 · silent)
 *
 *   phase    { phase: 'erase' | 'expand' | 'prune' | 'answer' }            silent
 *   round    { width: number, erase: 0 | 1 }                                 판의 시작 (한 걸음 — 뒤에 sleep)
 *   erase    { depth: number, items: { parent, word, prob, erased }[] }     지우기가 켜졌고 이 깊이에서 지운 것이 있을 때만
 *   expand   { depth: number, items: { parent, word, prob, score, carried }[] }
 *   prune    { depth: number, kept: number[], total: number }               kept 는 expand items 의 번호를 남는 차례(점수 차례)로, total 은 후보 수
 *   answer   { words: string[], score: number, correct: boolean, rank: number }
 *                                                                          rank 는 올바른 글 가운데 등수(1 부터), 틀린 글이면 0
 *
 *   parent 는 앞 깊이 빔 안의 번호(0 부터), word 는 이 가지의 낱말, prob 는 %, carried 는
 *   끝난 줄기를 그대로 옮긴 것.
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *
 *   'erase'  — 점수 전에 지우는 판정 (지우기가 켜졌고 지운 것이 있는 깊이)
 *   'expand' — 줄기에서 가지를 뻗고 점수를 매김
 *   'prune'  — 점수 높은 폭 개만 남김
 *   'answer' — 마지막 빔의 첫 줄기를 답으로
 *
 *   phase 마다 뒤에 걸음 경계(`sleep` 또는 `waitForInput`)가 있어 코드 패널에서 한 번씩 켜진다.
 *
 * ── 메트릭
 *
 *   scored-count  견준 후보 (점수를 매긴 가지 수, 끝난 줄기를 옮긴 것은 빼고)
 *   erased-count  지운 후보
 *   best-permille 고른 글 전체의 천분율 `(score + 500) // 1000`
 *
 *   계기는 누적 채널이라 "지금 보이는 값" 을 들고 차이만 보낸다. 판이 바뀌면 0 으로.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 다음 낱말 표의 한 줄 — 앞에 고른 낱말 전부(공백으로 이음)가 열쇠. */
export type BeamSearchRow = {
  prefix: string;
  words: string[];
  /** % 정수. 예로 정한 값. */
  probs: number[];
};

export type BeamSearchData = {
  type: 'beam-search';
  prompt: string;
  rows: BeamSearchRow[];
  /** 관사 → 그 뒤에 바라는 첫소리. */
  articles: Record<string, 'vowel' | 'consonant'>;
  /** 관사 뒤에 올 수 있는 낱말의 첫소리. 없는 낱말은 첫소리가 없다. */
  sounds: Record<string, 'vowel' | 'consonant'>;
  /** 글을 끝내는 낱말. */
  end: string;
  depth: number;
  /** 손잡이 사다리. 첫 값이 기본. */
  widths: number[];
  erases: number[];
  stepMs: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// 표를 마디 번호로 편다 — IR 과 알고리즘이 같은 표를 읽는다
// ─────────────────────────────────────────────────────────────────────────────

/** 표를 마디(앞말 하나) 번호로 편 것. IR 의 매개변수 모양 그대로. */
export type BeamSearchTables = {
  /** 마디 → 앞말 (빈 앞말이 0). */
  prefixes: string[];
  /** 낱말 번호 → 낱말. */
  vocab: string[];
  /** `child[마디 × 3 + r]` — 자식 마디, 없으면 −1. */
  child: number[];
  /** `prob[마디 × 3 + r]` — %. */
  prob: number[];
  /** 마디 → 그 앞말의 마지막 낱말 번호, 빈 앞말은 −1. */
  lastWord: number[];
  /** 마디 → `.` 으로 끝나면 1. */
  ended: number[];
  /** 낱말 번호 → 0 관사 아님 · 1 자음을 바라는 관사(`a`) · 2 모음을 바라는 관사(`an`). */
  article: number[];
  /** 낱말 번호 → −1 첫소리 없음 · 0 자음 · 1 모음. */
  sound: number[];
};

/** 한 줄의 가지 수 상한 — `child` 의 보폭. */
export const BEAM_ROW_SLOTS = 3;

export function encodeBeamTables(data: BeamSearchData): BeamSearchTables {
  const rowOf = new Map<string, BeamSearchRow>();
  for (const row of data.rows) rowOf.set(row.prefix, row);

  const vocab: string[] = [];
  const wordId = (w: string): number => {
    let i = vocab.indexOf(w);
    if (i < 0) {
      vocab.push(w);
      i = vocab.length - 1;
    }
    return i;
  };

  const prefixes: string[] = [''];
  const lastWord: number[] = [-1];
  const child: number[] = [];
  const prob: number[] = [];
  for (let node = 0; node < prefixes.length; node++) {
    const prefix = prefixes[node]!;
    const row = rowOf.get(prefix);
    for (let r = 0; r < BEAM_ROW_SLOTS; r++) {
      const w = row?.words[r];
      const p = row?.probs[r];
      if (w === undefined || p === undefined) {
        child.push(-1);
        prob.push(0);
        continue;
      }
      prefixes.push(prefix === '' ? w : `${prefix} ${w}`);
      lastWord.push(wordId(w));
      child.push(prefixes.length - 1);
      prob.push(p);
    }
  }
  const ended = lastWord.map((w) => (w >= 0 && vocab[w] === data.end ? 1 : 0));
  const article = vocab.map((w) => {
    const want = data.articles[w];
    return want === 'consonant' ? 1 : want === 'vowel' ? 2 : 0;
  });
  const sound = vocab.map((w) => {
    const s = data.sounds[w];
    return s === 'consonant' ? 0 : s === 'vowel' ? 1 : -1;
  });
  return { prefixes, vocab, child, prob, lastWord, ended, article, sound };
}

/** 마디 `node` 뒤에 낱말 `kid` 를 이으면 관사 규칙을 어기는가. `if` 를 겹쳐 −1 색인을 읽지 않는다. */
function breaksArticle(t: BeamSearchTables, node: number, kid: number): boolean {
  const lw = t.lastWord[node]!;
  if (lw === -1) return false;
  const art = t.article[lw]!;
  if (art === 0) return false;
  const s = t.sound[t.lastWord[kid]!]!;
  if (s === -1) return false;
  return s !== art - 1;
}

/** 마디의 앞말 전체가 관사 규칙을 지키는가. */
function isGrammatical(t: BeamSearchTables, node: number): boolean {
  // 자식 → 부모를 거슬러 이음 하나하나를 본다.
  const parent = new Array<number>(t.prefixes.length).fill(-1);
  for (let n = 0; n < t.prefixes.length; n++) {
    for (let r = 0; r < BEAM_ROW_SLOTS; r++) {
      const c = t.child[n * BEAM_ROW_SLOTS + r]!;
      if (c !== -1) parent[c] = n;
    }
  }
  let cur = node;
  while (parent[cur]! !== -1) {
    const up = parent[cur]!;
    if (breaksArticle(t, up, cur)) return false;
    cur = up;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 빔 서치 한 판 — 화면이 쓸 자취까지 남긴다
// ─────────────────────────────────────────────────────────────────────────────

export type BeamBranch = {
  parent: number;
  node: number;
  word: string;
  prob: number;
  erased: boolean;
};

export type BeamCandidate = {
  parent: number;
  node: number;
  word: string;
  prob: number;
  score: number;
  carried: boolean;
};

export type BeamLayer = {
  depth: number;
  /** 펼친 가지 전부 (지운 것 포함, 끝난 줄기를 옮긴 것은 빼고), 만든 차례. */
  branches: BeamBranch[];
  /** 점수를 받은 후보 (옮긴 것 포함), 만든 차례. */
  candidates: BeamCandidate[];
  /** candidates 의 번호, 남는 차례. */
  kept: number[];
  scored: number;
  erased: number;
  /** 솎기에서 동률이 걸린 번 수 — 고른 것과 같은 점수가 아직 남아 있었다. */
  ties: number;
  /** 폭 경계에서 동률이 걸렸는가 — 마지막으로 남은 것과 첫째로 끊긴 것의 점수가 같다. */
  boundaryTie: boolean;
};

export type BeamRun = {
  layers: BeamLayer[];
  beamNode: number[];
  beamScore: number[];
  scored: number;
  erased: number;
  words: string[];
  score: number;
  correct: boolean;
  /** 올바른 글 가운데 등수 (1 부터). 틀린 글이면 0. */
  rank: number;
};

export function runBeamSearch(data: BeamSearchData, width: number, erase: number): BeamRun {
  const t = encodeBeamTables(data);
  let beamNode = [0];
  let beamScore = [1_000_000];
  const layers: BeamLayer[] = [];
  let scored = 0;
  let erased = 0;
  for (let d = 1; d <= data.depth; d++) {
    const branches: BeamBranch[] = [];
    const candidates: BeamCandidate[] = [];
    let layerScored = 0;
    let layerErased = 0;
    for (let b = 0; b < beamNode.length; b++) {
      const node = beamNode[b]!;
      if (t.ended[node] === 1) {
        const w = t.vocab[t.lastWord[node]!]!;
        candidates.push({ parent: b, node, word: w, prob: 100, score: beamScore[b]!, carried: true });
        continue;
      }
      for (let r = 0; r < BEAM_ROW_SLOTS; r++) {
        const kid = t.child[node * BEAM_ROW_SLOTS + r]!;
        if (kid === -1) continue;
        const p = t.prob[node * BEAM_ROW_SLOTS + r]!;
        const word = t.vocab[t.lastWord[kid]!]!;
        const cut = erase === 1 && breaksArticle(t, node, kid);
        branches.push({ parent: b, node: kid, word, prob: p, erased: cut });
        if (cut) {
          layerErased += 1;
          continue;
        }
        candidates.push({
          parent: b,
          node: kid,
          word,
          prob: p,
          score: Math.floor((beamScore[b]! * p) / 100),
          carried: false,
        });
        layerScored += 1;
      }
    }
    // 솎기 — "가장 큰 것을 폭 번 고르고, 엄격히 클 때만 바꾼다" 와 같은 차례.
    const order = candidates
      .map((c, i) => ({ s: c.score, i }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.i);
    const keep = Math.min(width, candidates.length);
    const kept = order.slice(0, keep);
    let ties = 0;
    for (let k = 0; k < keep; k++) {
      const s = candidates[kept[k]!]!.score;
      if (order.slice(k + 1).some((i) => candidates[i]!.score === s)) ties += 1;
    }
    const boundaryTie =
      keep < candidates.length &&
      candidates[order[keep - 1]!]!.score === candidates[order[keep]!]!.score;
    layers.push({
      depth: d,
      branches,
      candidates,
      kept,
      scored: layerScored,
      erased: layerErased,
      ties,
      boundaryTie,
    });
    scored += layerScored;
    erased += layerErased;
    beamNode = kept.map((i) => candidates[i]!.node);
    beamScore = kept.map((i) => candidates[i]!.score);
  }

  const best = beamNode[0]!;
  const score = beamScore[0]!;
  const correct = isGrammatical(t, best);

  // 올바른 글 전체 — 깊이 3 에 닿았거나 `.` 로 끝난 마디 — 의 점수를 셈해 등수를 매긴다.
  const nodeScore = new Array<number>(t.prefixes.length).fill(0);
  const nodeDepth = new Array<number>(t.prefixes.length).fill(0);
  nodeScore[0] = 1_000_000;
  for (let n = 0; n < t.prefixes.length; n++) {
    for (let r = 0; r < BEAM_ROW_SLOTS; r++) {
      const c = t.child[n * BEAM_ROW_SLOTS + r]!;
      if (c === -1) continue;
      nodeScore[c] = Math.floor((nodeScore[n]! * t.prob[n * BEAM_ROW_SLOTS + r]!) / 100);
      nodeDepth[c] = nodeDepth[n]! + 1;
    }
  }
  let rank = 0;
  if (correct) {
    rank = 1;
    for (let n = 1; n < t.prefixes.length; n++) {
      const whole = t.ended[n] === 1 || nodeDepth[n] === data.depth;
      if (whole && nodeScore[n]! > score && isGrammatical(t, n)) rank += 1;
    }
  }

  return {
    layers,
    beamNode,
    beamScore,
    scored,
    erased,
    words: t.prefixes[best]!.split(' '),
    score,
    correct,
    rank,
  };
}

/** 글 전체의 천분율 — 반올림. */
export function toPermille(score: number): number {
  return Math.floor((score + 500) / 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘
// ─────────────────────────────────────────────────────────────────────────────

/** 손잡이 값을 받는다 — 수이고 사다리에 있을 때만. */
function readKnob(payload: unknown, ladder: number[]): number | null {
  const v = (payload as { value?: unknown } | undefined)?.value;
  if (typeof v !== 'number') return null;
  return ladder.includes(v) ? v : null;
}

const isNumList = (x: unknown): x is number[] =>
  Array.isArray(x) && x.length > 0 && x.every((v) => typeof v === 'number');

const isSoundMap = (x: unknown): x is Record<string, 'vowel' | 'consonant'> =>
  typeof x === 'object' &&
  x !== null &&
  Object.values(x).every((v) => v === 'vowel' || v === 'consonant');

const isRow = (x: unknown): x is BeamSearchRow => {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.prefix === 'string' &&
    Array.isArray(r.words) &&
    r.words.every((w) => typeof w === 'string') &&
    Array.isArray(r.probs) &&
    r.probs.every((p) => typeof p === 'number') &&
    r.words.length === r.probs.length &&
    r.words.length <= BEAM_ROW_SLOTS
  );
};

/** 러너가 준 자료를 좁힌다 (C9). 모양이 어긋나면 null — 알고리즘은 그리지 않고 끝난다. */
export function narrowData(raw: unknown): BeamSearchData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (d.type !== 'beam-search') return null;
  if (typeof d.prompt !== 'string' || typeof d.end !== 'string') return null;
  if (!Array.isArray(d.rows) || !d.rows.every(isRow)) return null;
  if (!isSoundMap(d.articles) || !isSoundMap(d.sounds)) return null;
  if (typeof d.depth !== 'number' || d.depth < 1) return null;
  if (!isNumList(d.widths) || !isNumList(d.erases)) return null;
  if (typeof d.stepMs !== 'number' || d.stepMs <= 0) return null;
  return {
    type: 'beam-search',
    prompt: d.prompt,
    rows: d.rows,
    articles: d.articles,
    sounds: d.sounds,
    end: d.end,
    depth: d.depth,
    widths: d.widths,
    erases: d.erases,
    stepMs: d.stepMs,
  };
}

export async function beamSearchAlgorithm(rawCtx: FacetContext<BeamSearchData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<BeamSearchData>;
  const data = narrowData(ctx.data);
  if (data === null) return;
  const stepMs = data.stepMs;
  let width = data.widths[0]!;
  let erase = data.erases[0]!;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 지금 계기에 보이는 값. 처음 한 번은 차이가 0 이어도 보내 이름을 싣는다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const was = shown.get(name);
    if (was !== undefined && was === value) return;
    ctx.metric(name, value - (was ?? 0));
    shown.set(name, value);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = runBeamSearch(data, width, erase);

      gauge('scored-count', 0);
      gauge('erased-count', 0);
      gauge('best-permille', 0);
      // 판의 시작도 한 걸음이다 — 앞 판의 가지가 뿌리로 걷히고 빔 띠가 새 폭으로 바뀌는
      // 운동이 다음 걸음에 덮이지 않게. 코드 패널은 빔을 세우는 첫 줄들(expand)을 켠다.
      await phase('expand');
      await ctx.emit({ type: 'round', payload: { width, erase } });
      if (!(await ctx.sleep(stepMs))) return;

      let scored = 0;
      let erased = 0;
      for (const layer of run.layers) {
        if (ctx.cancelled) return;
        if (erase === 1 && layer.erased > 0) {
          await phase('erase');
          await ctx.emit({
            type: 'erase',
            payload: {
              depth: layer.depth,
              items: layer.branches.map((b) => ({
                parent: b.parent,
                word: b.word,
                prob: b.prob,
                erased: b.erased,
              })),
            },
          });
          erased += layer.erased;
          gauge('erased-count', erased);
          if (!(await ctx.sleep(stepMs))) return;
        }

        await phase('expand');
        await ctx.emit({
          type: 'expand',
          payload: {
            depth: layer.depth,
            items: layer.candidates.map((c) => ({
              parent: c.parent,
              word: c.word,
              prob: c.prob,
              score: c.score,
              carried: c.carried,
            })),
          },
        });
        scored += layer.scored;
        gauge('scored-count', scored);
        if (!(await ctx.sleep(stepMs))) return;

        await phase('prune');
        await ctx.emit({ type: 'prune', payload: { depth: layer.depth, kept: layer.kept, total: layer.candidates.length } });
        if (!(await ctx.sleep(stepMs))) return;
      }

      await phase('answer');
      await ctx.emit({
        type: 'answer',
        payload: { words: run.words, score: run.score, correct: run.correct, rank: run.rank },
      });
      gauge('best-permille', toPermille(run.score));

      // 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      let changed = false;
      while (!changed) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'width') {
          const v = readKnob(input.payload, data.widths);
          if (v === null) continue;
          width = v;
          changed = true;
        } else if (input.type === 'erase') {
          const v = readKnob(input.payload, data.erases);
          if (v === null) continue;
          erase = v;
          changed = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
