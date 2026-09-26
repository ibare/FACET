/**
 * longest-match-wins — 한 자리에 규칙 여럿이 맞으면 토큰기는 가장 길게 맞은 것을 집는다.
 * 길이가 같으면 규칙 열에서 앞선 것을 집는다.
 *
 * 규칙 열(`rules`)은 차례가 곧 우선순위다. 규칙은 둘 중 하나다.
 * - 글자 그대로(`lit`) — 키워드 하나 · 연산자 기호 하나
 * - 무늬(`first` · `more`) — 첫 글자는 `first` 의 글자 모임에, 그 뒤는 `more` 의 글자 모임에
 *   드는 글자가 0 개 이상 (`[a-z]([a-z]|[0-9])*` · `[0-9]+` 를 이 꼴로 둔다)
 *
 * 빈칸(' ')은 어느 규칙에도 들지 않고 걸음도 아니다 — 건너서 다음 자리로 간다.
 * 빈칸이 아닌 글자에 맞는 규칙이 하나도 없으면 던진다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `candidates` — 한 자리에서 길이가 0 보다 큰 규칙 모두 (규칙 열 차례)
 *   payload: { pos: number; cands: { rule: number; name: string; kind: string; text: string; len: number }[] }
 *     rule = 규칙 열의 번호(0 부터), name = 규칙 이름(`IF` · `NAME` · `OP >=`), text = 맞은 원문 글자
 * - `pick` — 가장 긴 것을 집는다. 동률이면 규칙 열의 앞
 *   payload: { pos: number; rule: number; kind: string; text: string; len: number; why: 'only' | 'longer' | 'tie' }
 *
 * 걸음 0 은 원문만 선 화면이다 (장면의 initial). 첫 발신 앞에 stepMs 를 두어 읽을 틈을 준다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 글자 모임 — `a-z` · `0-9` 처럼 처음-끝 한 구간 */
export type CharRange = string;

export type LitRule = { kind: string; lit: string };
export type PatternRule = { kind: string; first: CharRange[]; more: CharRange[] };
export type TokenRule = LitRule | PatternRule;

export type LongestMatchWinsFacetData = {
  type: 'longest-match-wins';
  source: string;
  rules: TokenRule[];
  stepMs: number;
};

export type Candidate = { rule: number; name: string; kind: string; text: string; len: number };

const BLANK = ' ';

function inRange(range: CharRange, ch: string): boolean {
  if (range.length !== 3 || range[1] !== '-') {
    throw new Error(`글자 모임 "${range}" 은 알 수 없는 꼴이다 — "a-z" 처럼 적는다`);
  }
  return ch >= range[0]! && ch <= range[2]!;
}

function inAny(ranges: CharRange[], ch: string): boolean {
  return ranges.some((r) => inRange(r, ch));
}

/** 규칙 하나가 자리 i 에서 맞는 가장 긴 길이 (안 맞으면 0) */
function reach(rule: TokenRule, s: string, i: number): number {
  if ('lit' in rule) {
    if (rule.lit.length === 0) throw new Error(`규칙 ${rule.kind} 의 글자가 비었다`);
    return s.startsWith(rule.lit, i) ? rule.lit.length : 0;
  }
  if ('first' in rule && 'more' in rule) {
    const head = s[i];
    if (head === undefined || !inAny(rule.first, head)) return 0;
    let j = i + 1;
    while (j < s.length && inAny(rule.more, s[j]!)) j += 1;
    return j - i;
  }
  throw new Error('알 수 없는 규칙 꼴이다 — lit 이나 first · more 를 둔다');
}

/** 규칙 이름 — 낱말 규칙은 종류 그대로(`IF`), 기호 규칙은 종류와 기호(`OP >=`), 무늬 규칙은 종류(`NAME`) */
function ruleName(rule: TokenRule): string {
  if ('lit' in rule && rule.kind !== rule.lit.toUpperCase()) return `${rule.kind} ${rule.lit}`;
  return rule.kind;
}

function skipBlanks(s: string, i: number): number {
  let j = i;
  while (j < s.length && s[j] === BLANK) j += 1;
  return j;
}

export async function longestMatchWins(ctx: FacetContext<LongestMatchWinsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LongestMatchWinsFacetData>;
  const { source, rules, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let pos = skipBlanks(source, 0);
  while (pos < source.length) {
    if (!(await pause())) return;

    const cands: Candidate[] = [];
    rules.forEach((rule, index) => {
      const len = reach(rule, source, pos);
      if (len > 0) {
        cands.push({ rule: index, name: ruleName(rule), kind: rule.kind, text: source.slice(pos, pos + len), len });
      }
    });
    const first = cands[0];
    if (first === undefined) {
      throw new Error(`자리 ${pos} 의 글자 "${source[pos]}" 에 맞는 규칙이 없다`);
    }
    await ctx.emit({ type: 'candidates', payload: { pos, cands } });
    if (!(await pause())) return;

    // 엄격히 더 길 때만 바꾼다 — 동률이면 규칙 열에서 앞선 것이 남는다
    const best = cands.reduce((b, c) => (c.len > b.len ? c : b), first);
    const sameLen = cands.filter((c) => c.len === best.len).length;
    const why = cands.length === 1 ? 'only' : sameLen > 1 ? 'tie' : 'longer';
    await ctx.emit({
      type: 'pick',
      payload: { pos, rule: best.rule, kind: best.kind, text: best.text, len: best.len, why },
    });

    pos = skipBlanks(source, pos + best.len);
  }
}
