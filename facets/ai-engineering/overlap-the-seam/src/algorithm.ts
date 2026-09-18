/**
 * 겹쳐 자르기 — 이음매에 걸린 문장을 잃지 않으려면 어떻게 자르는가.
 *
 * 한 문단을 창 크기 `size` 낱말로 두 번 자른다. 먼저 겹침 없이(보폭 = size), 다음에
 * 겹침 `overlap` 으로(보폭 = size − overlap). 겹쳐 자를 때 다음 창은 이음매(앞 창의 끝)에서
 * 시작하지 않고 `overlap` 낱말 물러나 시작한다.
 *
 * 규약 (공통 안내문)
 *   - 낱말 = 공백으로 가른 덩이. 구두점은 붙은 낱말에 딸린다
 *   - 문장 = 마침표로 끝나는 낱말까지
 *   - 창 i = 낱말 [i×보폭, i×보폭+size) (0 기준, 글 끝에서 자름). 창의 끝이 글 끝에 닿으면 멈춘다
 *   - "온전히 든다" = 문장의 첫 낱말과 끝 낱말이 모두 한 창 안
 *   - 한 문장을 온전히 담은 창이 여럿이면 앞 창을 든다
 *
 * 이벤트 (어느 것도 silent 가 아니다 — 모두 걸음이다)
 *   init    { words: string[]; sentences: [number, number][]; size: number; overlap: number;
 *             counts: { plain: number; over: number } }
 *           sentences 는 낱말 구간 [첫, 끝+1). counts 는 두 자르기의 창 수
 *   cut     { windows: [number, number][] }                   겹침 없이 자른 창 전부
 *   judge   { holders: Holder[]; stored: number; whole: number }
 *           holders[r] = 문장 r 을 온전히 담은 창, 또는 걸친 두 창과 칼자리
 *           Holder = { kind: 'whole'; w: number } | { kind: 'split'; a: number; b: number; at: number }
 *           (a · b 는 첫 낱말 · 끝 낱말을 담은 창, at 은 칼자리 낱말 경계 0 기준)
 *   window  { w: number; start: number; end: number; seam: number | null; gained: number[];
 *             rescued: number[] }
 *           겹쳐 자른 창 w 하나. seam 은 앞 창의 끝 (첫 창은 null). gained 는 이 창이 처음으로
 *           온전히 담은 문장, rescued 는 그 가운데 겹침 없이는 온전히 든 창이 없던 문장
 *   done    { stored: number; whole: number }                  겹쳐 자른 쪽의 셈
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OverlapTheSeamFacetData = {
  type: 'overlap-the-seam';
  /** 자를 글 (영어 원문 — 자료다. 번역하지 않는다) */
  text: string;
  /** 창 크기 (낱말) */
  size: number;
  /** 겹쳐 자를 때 겹치는 낱말 수 */
  overlap: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type Span = [number, number];

export type Holder =
  | { kind: 'whole'; w: number }
  | { kind: 'split'; a: number; b: number; at: number };

/** 공백으로 가른 덩이. */
function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0);
}

/** 마침표로 끝나는 낱말까지를 한 문장으로. 마지막에 마침표가 없어도 남은 것을 문장으로 둔다. */
function splitSentences(words: readonly string[]): Span[] {
  const out: Span[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i += 1) {
    if (words[i]!.endsWith('.')) {
      out.push([start, i + 1]);
      start = i + 1;
    }
  }
  if (start < words.length) out.push([start, words.length]);
  return out;
}

/** 창 i = [i×보폭, i×보폭+size), 글 끝에서 자르고 끝이 글 끝에 닿으면 멈춘다. */
function cutWindows(n: number, size: number, stride: number): Span[] {
  const out: Span[] = [];
  for (let s = 0; s < n; s += stride) {
    const e = Math.min(s + size, n);
    out.push([s, e]);
    if (e >= n) break;
  }
  return out;
}

/** 문장이 온전히 든 첫 창. 없으면 -1. */
function wholeIn(windows: readonly Span[], sent: Span): number {
  for (let w = 0; w < windows.length; w += 1) {
    const [s, e] = windows[w]!;
    if (s <= sent[0] && sent[1] <= e) return w;
  }
  return -1;
}

/** 낱말 i 를 담은 첫 창. */
function windowOf(windows: readonly Span[], i: number): number {
  for (let w = 0; w < windows.length; w += 1) {
    const [s, e] = windows[w]!;
    if (s <= i && i < e) return w;
  }
  return -1;
}

function storedWords(windows: readonly Span[]): number {
  let sum = 0;
  for (const [s, e] of windows) sum += e - s;
  return sum;
}

export async function overlapTheSeam(
  ctx: FacetContext<OverlapTheSeamFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<OverlapTheSeamFacetData>;
  const { text, size, overlap, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const words = splitWords(text);
  const sentences = splitSentences(words);
  const plain = cutWindows(words.length, size, size);
  const over = cutWindows(words.length, size, size - overlap);

  // 첫 걸음은 문 밖에서 — 마운트 직후 빈 화면을 두지 않는다
  await ctx.emit({
    type: 'init',
    payload: {
      words,
      sentences,
      size,
      overlap,
      counts: { plain: plain.length, over: over.length },
    },
  });
  if (!(await pause())) return;

  await ctx.emit({ type: 'cut', payload: { windows: plain } });
  if (!(await pause())) return;

  const holders: Holder[] = [];
  for (const sent of sentences) {
    if (ctx.cancelled) return;
    const w = wholeIn(plain, sent);
    if (w >= 0) {
      holders.push({ kind: 'whole', w });
    } else {
      const a = windowOf(plain, sent[0]);
      const b = windowOf(plain, sent[1] - 1);
      holders.push({ kind: 'split', a, b, at: plain[a]![1] });
    }
  }
  const plainWhole = holders.filter((h) => h.kind === 'whole').length;
  await ctx.emit({
    type: 'judge',
    payload: { holders, stored: storedWords(plain), whole: plainWhole },
  });
  if (!(await pause())) return;

  // 겹쳐 자른 창을 하나씩 놓는다 — 창마다 처음으로 온전히 담은 문장을 센다
  const placed: Span[] = [];
  const held = new Set<number>();
  for (let w = 0; w < over.length; w += 1) {
    if (ctx.cancelled) return;
    const [start, end] = over[w]!;
    const seam = w === 0 ? null : placed[w - 1]![1];
    placed.push([start, end]);
    const gained: number[] = [];
    const rescued: number[] = [];
    for (let r = 0; r < sentences.length; r += 1) {
      if (ctx.cancelled) return;
      if (held.has(r)) continue;
      if (wholeIn(placed, sentences[r]!) === w) {
        held.add(r);
        gained.push(r);
        if (holders[r]!.kind === 'split') rescued.push(r);
      }
    }
    await ctx.emit({ type: 'window', payload: { w, start, end, seam, gained, rescued } });
    if (!(await pause())) return;
  }

  await ctx.emit({ type: 'done', payload: { stored: storedWords(over), whole: held.size } });
}
