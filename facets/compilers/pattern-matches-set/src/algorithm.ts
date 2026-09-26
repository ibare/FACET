/**
 * pattern-matches-set — 무늬 하나가 뜻하는 글줄 모임을 펼친다.
 *
 * 무늬(정규 표현식)를 구조로 받아, 무늬 위의 길을 하나씩 골라 끝까지 따라간다.
 * 길 하나가 글줄 하나를 떨군다. 글줄을 입력으로 받지 않는다 — 글줄은 무늬에서 나온다.
 *
 * 길의 차례: 앞 조각이 바깥, 뒤 조각이 안쪽. 갈래는 적힌 차례, `?` 는 없음 먼저 · 있음 다음.
 * 이 차례는 펼치는 차례일 뿐이다 — 모임에는 차례가 없다.
 *
 * 이벤트 (걸음 0 은 장면의 `initial()` 이 무늬만 둔 채로 세운다 — 발신 없음):
 *
 *   - `path` (silent 아님) — 길 하나를 따라가 글줄 하나를 떨궜다. 한 걸음.
 *       payload: {
 *         index: number;         // 몇 번째 길인가 (0 부터)
 *         choices: Choice[];     // 그 길이 갈림마다 고른 것, 무늬를 읽는 차례대로
 *                                //   { at: string; kind: 'alt'; pick: number }  갈래 몇 번째 (0 부터)
 *                                //   { at: string; kind: 'opt'; take: boolean } `?` 있음 / 없음
 *                                //   at = 무늬 구조 속 자리 (`r` · `r.0` · `r.0.2` …)
 *         text: string;          // 그 길이 떨군 글줄
 *         last: boolean;         // 남은 길이 없는가
 *       }
 *
 * 무늬 조각은 `seq` · `alt` · `opt` · `lit` 넷만 셈한다. 되풀이(`star` · `plus`)는 길이 끝없어 펼칠 수 없고,
 * 글자 모임(`class`)은 이 조각의 데이터에 없다 — 만나면 던진다 (C6). 두 길이 같은 글줄을 떨구면 모임이
 * 불어나지 않으므로 이 조각의 주장이 서지 않는다 — 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LitNode = { kind: 'lit'; ch: string };
export type SeqNode = { kind: 'seq'; items: PatternNode[] };
export type AltNode = { kind: 'alt'; options: PatternNode[] };
export type OptNode = { kind: 'opt'; item: PatternNode };
export type PatternNode = LitNode | SeqNode | AltNode | OptNode;

export type Choice =
  | { at: string; kind: 'alt'; pick: number }
  | { at: string; kind: 'opt'; take: boolean };

export type PatternPath = { choices: Choice[]; text: string };

export type PatternMatchesSetFacetData = {
  type: 'pattern-matches-set';
  stepMs: number;
  pattern: PatternNode;
};

const SPECIAL = new Set(['(', ')', '|', '*', '+', '?', '[', ']', '\\', '.']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 무늬 구조를 좁혀 베낀다. 모르는 조각은 자리를 담아 던진다. */
export function readPattern(raw: unknown, at = 'r'): PatternNode {
  if (!isRecord(raw)) throw new Error(`무늬 ${at}: 객체가 아니다`);
  const kind = raw['kind'];
  if (kind === 'lit') {
    const ch = raw['ch'];
    if (typeof ch !== 'string' || [...ch].length !== 1) throw new Error(`무늬 ${at}: lit 의 ch 는 글자 하나여야 한다`);
    return { kind: 'lit', ch };
  }
  if (kind === 'seq' || kind === 'alt') {
    const list = raw[kind === 'seq' ? 'items' : 'options'];
    if (!Array.isArray(list) || list.length === 0) throw new Error(`무늬 ${at}: ${kind} 의 조각이 비었다`);
    const kids = list.map((k, i) => readPattern(k, `${at}.${i}`));
    return kind === 'seq' ? { kind: 'seq', items: kids } : { kind: 'alt', options: kids };
  }
  if (kind === 'opt') return { kind: 'opt', item: readPattern(raw['item'], `${at}.0`) };
  throw new Error(`무늬 ${at}: 펼칠 수 없는 조각 ${String(kind)}`);
}

/** 조각 하나를 괄호 없이 붙여 써도 되는가 (`?` 앞자리). */
function isAtom(node: PatternNode): boolean {
  return node.kind === 'lit' || node.kind === 'alt' || (node.kind === 'seq' && node.items.length === 1 && node.items.every(isAtom));
}

/** 구조에서 무늬 글자를 찍는다 — 사양의 무늬 글자와 같아야 한다. */
export function printPattern(node: PatternNode): string {
  switch (node.kind) {
    case 'lit':
      return SPECIAL.has(node.ch) ? `\\${node.ch}` : node.ch;
    case 'seq':
      return node.items.map(printPattern).join('');
    case 'alt':
      return `(${node.options.map(printPattern).join('|')})`;
    case 'opt': {
      const inner = printPattern(node.item);
      return isAtom(node.item) ? `${inner}?` : `(${inner})?`;
    }
  }
}

/** 조각 `node` 위의 모든 길. 앞 조각이 바깥, 뒤 조각이 안쪽. */
function pathsOf(node: PatternNode, at: string): PatternPath[] {
  switch (node.kind) {
    case 'lit':
      return [{ choices: [], text: node.ch }];
    case 'seq': {
      let acc: PatternPath[] = [{ choices: [], text: '' }];
      node.items.forEach((item, i) => {
        const tails = pathsOf(item, `${at}.${i}`);
        const next: PatternPath[] = [];
        for (const head of acc) {
          for (const tail of tails) {
            next.push({ choices: [...head.choices, ...tail.choices], text: head.text + tail.text });
          }
        }
        acc = next;
      });
      return acc;
    }
    case 'alt': {
      const out: PatternPath[] = [];
      node.options.forEach((opt, pick) => {
        for (const p of pathsOf(opt, `${at}.${pick}`)) {
          out.push({ choices: [{ at, kind: 'alt', pick }, ...p.choices], text: p.text });
        }
      });
      return out;
    }
    case 'opt': {
      const out: PatternPath[] = [{ choices: [{ at, kind: 'opt', take: false }], text: '' }];
      for (const p of pathsOf(node.item, `${at}.0`)) {
        out.push({ choices: [{ at, kind: 'opt', take: true }, ...p.choices], text: p.text });
      }
      return out;
    }
  }
}

/** 무늬 위의 길을 펼친다. 같은 글줄을 떨구는 두 길은 던진다. */
export function enumeratePaths(pattern: PatternNode): PatternPath[] {
  const paths = pathsOf(pattern, 'r');
  const seen = new Set<string>();
  for (const p of paths) {
    if (seen.has(p.text)) throw new Error(`두 길이 같은 글줄 "${p.text}" 을 떨군다 — 모임이 불어나지 않는다`);
    seen.add(p.text);
  }
  return paths;
}

/** 갈림 자리 하나 — 무늬를 읽는 차례대로. 몇 갈래로 갈리는가. */
export type DecisionPoint = { at: string; kind: 'alt' | 'opt'; arity: number };

/**
 * 무늬의 갈림 자리를 늘어놓는다 (바탕 — 장면 · 그림이 같은 함수를 부른다).
 * 갈림 안에 또 갈림이 있으면 길마다 갈림 수가 달라 칸을 셈할 수 없다 — 던진다.
 */
export function decisionPoints(pattern: PatternNode): DecisionPoint[] {
  const out: DecisionPoint[] = [];
  const hasDecision = (n: PatternNode): boolean =>
    n.kind === 'alt' || n.kind === 'opt' || (n.kind === 'seq' && n.items.some(hasDecision));
  const walk = (n: PatternNode, at: string): void => {
    if (n.kind === 'lit') return;
    if (n.kind === 'seq') {
      n.items.forEach((it, i) => walk(it, `${at}.${i}`));
      return;
    }
    const kids = n.kind === 'alt' ? n.options : [n.item];
    if (kids.some(hasDecision)) throw new Error(`무늬 ${at}: 갈림 안의 갈림은 칸을 셈할 수 없다`);
    out.push({ at, kind: n.kind, arity: n.kind === 'alt' ? n.options.length : 2 });
  };
  walk(pattern, 'r');
  return out;
}

/** 초기 데이터를 좁힌다. */
export function readData(raw: unknown): PatternMatchesSetFacetData {
  if (!isRecord(raw)) throw new Error('pattern-matches-set: initialData 가 없다');
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('pattern-matches-set: stepMs 가 없다');
  return { type: 'pattern-matches-set', stepMs, pattern: readPattern(raw['pattern']) };
}

export async function patternMatchesSet(ctxBase: FacetContext<PatternMatchesSetFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<PatternMatchesSetFacetData>;
  const { stepMs, pattern } = readData(ctx.data);
  const paths = enumeratePaths(pattern);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (무늬만) 이 이미 읽을 화면이라 첫 길 앞에도 문을 둔다.
  for (const [index, p] of paths.entries()) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'path',
      payload: {
        index,
        choices: p.choices.map((c) => ({ ...c })),
        text: p.text,
        last: index === paths.length - 1,
      },
    });
  }
}
