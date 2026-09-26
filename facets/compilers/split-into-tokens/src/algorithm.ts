/**
 * split-into-tokens — 토큰기가 원시 프로그램 한 줄을 왼쪽부터 덩이로 끊는다.
 *
 * 덩이는 둘이다.
 *   - 토큰 — 한 자리에서 규칙 열(키워드 · NAME · NUM · OP) 모두를 대어 가장 길게 맞은 것.
 *     길이가 같으면 규칙 열에서 앞선 것. 토큰 열로 간다.
 *   - 빈칸 덩이 — 이어진 빈칸 통째. 어느 규칙에도 들지 않아 버려진다.
 *
 * 걸음 0 은 장면의 `initial()` 이 원문에서 채운다 (발신 없음). 그 뒤 덩이 하나 = 한 걸음.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩)
 *   - `cut`  { from: number; to: number; kind: string }
 *            [from, to) 를 토큰으로 끊었다. kind 는 토큰 종류 이름 (`LET` · `NAME` · `NUM` · `OP` …)
 *   - `drop` { from: number; to: number }
 *            [from, to) 의 빈칸 덩이를 버렸다
 *
 * 맞는 규칙이 하나도 없는 글자는 자리를 담아 던진다 (C6).
 * `ctx.metric` 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitIntoTokensFacetData = {
  type: 'split-into-tokens';
  /** 원시 프로그램 한 줄 (빈칸 그대로) */
  source: string;
  /** 키워드 규칙 — 낱말 하나가 규칙 하나, 이 차례 */
  keywords: string[];
  /** 연산자 규칙 — 기호 하나가 규칙 하나, 이 차례 */
  operators: string[];
  stepMs: number;
};

export type Chunk = { from: number; to: number; kind: string | null };

const isLower = (c: string): boolean => c >= 'a' && c <= 'z';
const isDigit = (c: string): boolean => c >= '0' && c <= '9';

/** 규칙 하나가 자리 i 에서 맞는 가장 긴 길이. 맞지 않으면 0. */
type Rule = { kind: string; longest(src: string, i: number): number };

function buildRules(keywords: string[], operators: string[]): Rule[] {
  const literal = (kind: string, word: string): Rule => ({
    kind,
    longest: (src, i) => (src.startsWith(word, i) ? word.length : 0),
  });
  const rules: Rule[] = keywords.map((w) => literal(w.toUpperCase(), w));
  // NAME = [a-z]([a-z]|[0-9])*
  rules.push({
    kind: 'NAME',
    longest: (src, i) => {
      if (i >= src.length || !isLower(src.charAt(i))) return 0;
      let j = i + 1;
      while (j < src.length && (isLower(src.charAt(j)) || isDigit(src.charAt(j)))) j += 1;
      return j - i;
    },
  });
  // NUM = [0-9]+
  rules.push({
    kind: 'NUM',
    longest: (src, i) => {
      let j = i;
      while (j < src.length && isDigit(src.charAt(j))) j += 1;
      return j - i;
    },
  });
  for (const op of operators) rules.push(literal('OP', op));
  return rules;
}

/** 원문을 왼쪽부터 덩이로 끊는다. 빈칸 덩이는 kind 가 null. */
export function splitChunks(source: string, keywords: string[], operators: string[]): Chunk[] {
  const rules = buildRules(keywords, operators);
  const out: Chunk[] = [];
  let i = 0;
  while (i < source.length) {
    if (source.charAt(i) === ' ') {
      let j = i;
      while (j < source.length && source.charAt(j) === ' ') j += 1;
      out.push({ from: i, to: j, kind: null });
      i = j;
      continue;
    }
    let bestKind: string | null = null;
    let bestLen = 0;
    for (const rule of rules) {
      const n = rule.longest(source, i);
      // 더 길 때만 바꾼다 — 같으면 앞선 규칙이 남는다
      if (n > bestLen) {
        bestLen = n;
        bestKind = rule.kind;
      }
    }
    if (bestKind === null || bestLen === 0) {
      throw new Error(`split-into-tokens: 자리 ${i} 의 글자 '${source.charAt(i)}' 에 맞는 규칙이 없다`);
    }
    out.push({ from: i, to: i + bestLen, kind: bestKind });
    i += bestLen;
  }
  return out;
}

export async function splitIntoTokens(
  context: FacetContext<SplitIntoTokensFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SplitIntoTokensFacetData>;
  const { source, keywords, operators, stepMs } = ctx.data;
  const chunks = splitChunks(source, keywords, operators);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 원문이 이미 보이는 화면이라 읽을 틈을 둔다
  if (!(await pause())) return;
  for (const c of chunks) {
    if (ctx.cancelled) return;
    if (c.kind === null) {
      await ctx.emit({ type: 'drop', payload: { from: c.from, to: c.to } });
    } else {
      await ctx.emit({ type: 'cut', payload: { from: c.from, to: c.to, kind: c.kind } });
    }
    if (!(await pause())) return;
  }
}
