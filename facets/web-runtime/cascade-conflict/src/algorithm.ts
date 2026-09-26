/**
 * cascade-conflict — 한 요소의 한 속성을 두고 규칙들이 자리를 다툰다.
 *
 * 규칙은 원본(스타일시트) 차례대로 하나씩 들어와, 지금 자리를 쥔 규칙과 무게(명시도)를
 * 맞댄다. 무게 (a, b, c) = (아이디 수, 클래스 수, 태그 수) 는 선택자 글자에서 셈한다.
 * 견줌은 a 부터 차례로(사전식). 무거우면 뺏고, 같으면 나중 것이 뺏고, 가벼우면 밀려난다.
 *
 * 선택자 모양은 태그 · `.클래스` · `#아이디` 를 이은 단순 선택자와 자손 결합자(빈칸)뿐이다.
 * 그 밖의 모양(`>` · 속성 · 가상 클래스)을 만나면 던진다. 규칙이 요소에 맞지 않거나,
 * 규칙들이 서로 다른 속성을 정하면 다툼이 성립하지 않으므로 던진다.
 *
 * 이벤트 (모두 silent 아님 — 하나하나가 걸음이다):
 *   take   { order: number, weight: [a, b, c] }
 *          첫 규칙이 빈 자리를 쥔다. order 는 원본 차례(1 부터).
 *   duel   { order: number, weight: [a, b, c], holder: number,
 *            verdict: 'heavier' | 'equal' | 'lighter', column: 0 | 1 | 2 | null }
 *          들어온 규칙 order 가 자리를 쥔 holder 와 맞댄다. column 은 판정을 가른 칸
 *          (같으면 null). heavier · equal 이면 order 가 자리를 뺏고, lighter 면 밀려난다.
 *   apply  { order: number, swaps: number, kept: number }
 *          끝까지 자리를 쥔 규칙 order 의 값이 요소에 붙는다. swaps 는 자리가 바뀐 횟수,
 *          kept 는 쥔 쪽이 지킨 횟수.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Weight = [number, number, number];

export interface CascadeNode {
  tag: string;
  id?: string;
  classes?: string[];
}

export interface CascadeRuleData {
  selector: string;
  prop: string;
  value: string;
}

export interface CascadeConflictFacetData {
  type: 'cascade-conflict';
  stepMs: number;
  /** 뿌리에서 대상 요소까지. 마지막이 대상이다. */
  path: CascadeNode[];
  /** 원본 차례 그대로. */
  rules: CascadeRuleData[];
}

interface Compound {
  tag: string | null;
  classes: string[];
  ids: string[];
}

const COMPOUND = /^([a-z][a-z0-9]*)?((?:[.#][a-z][a-z0-9-]*)*)$/;
const PART = /([.#])([a-z][a-z0-9-]*)/g;

function parseCompound(text: string): Compound {
  const m = COMPOUND.exec(text);
  if (text === '' || m === null) throw new Error(`cascade-conflict: 모르는 선택자 모양 "${text}"`);
  const classes: string[] = [];
  const ids: string[] = [];
  for (const p of (m[2] ?? '').matchAll(PART)) {
    if (p[1] === '.') classes.push(p[2] as string);
    else ids.push(p[2] as string);
  }
  return { tag: m[1] ?? null, classes, ids };
}

function compounds(selector: string): Compound[] {
  const parts = selector.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') {
    throw new Error(`cascade-conflict: 빈 선택자 "${selector}"`);
  }
  return parts.map(parseCompound);
}

/** 명시도 (아이디 수, 클래스 수, 태그 수). */
export function specificity(selector: string): Weight {
  const w: Weight = [0, 0, 0];
  for (const c of compounds(selector)) {
    w[0] += c.ids.length;
    w[1] += c.classes.length;
    w[2] += c.tag === null ? 0 : 1;
  }
  return w;
}

function compoundMatches(c: Compound, node: CascadeNode): boolean {
  if (c.tag !== null && c.tag !== node.tag) return false;
  const cls = node.classes ?? [];
  if (c.classes.some((x) => !cls.includes(x))) return false;
  if (c.ids.some((x) => x !== node.id)) return false;
  return true;
}

/** 자손 결합자만 있는 선택자가 path 의 마지막 요소에 맞는가. */
function matchesTarget(selector: string, path: CascadeNode[]): boolean {
  const parts = compounds(selector);
  const target = path[path.length - 1];
  if (target === undefined) throw new Error('cascade-conflict: 요소가 없다');
  const last = parts[parts.length - 1] as Compound;
  if (!compoundMatches(last, target)) return false;
  let i = parts.length - 2;
  let at = path.length - 2;
  while (i >= 0) {
    const node = path[at];
    if (node === undefined) return false;
    if (compoundMatches(parts[i] as Compound, node)) i -= 1;
    at -= 1;
  }
  return true;
}

/** 사전식 견줌. 가른 칸과 판정. */
function weigh(a: Weight, b: Weight): { verdict: 'heavier' | 'equal' | 'lighter'; column: 0 | 1 | 2 | null } {
  for (const col of [0, 1, 2] as const) {
    if (a[col] > b[col]) return { verdict: 'heavier', column: col };
    if (a[col] < b[col]) return { verdict: 'lighter', column: col };
  }
  return { verdict: 'equal', column: null };
}

export async function cascadeConflict(context: FacetContext<CascadeConflictFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<CascadeConflictFacetData>;
  const { path, rules, stepMs } = ctx.data;
  if (rules.length === 0) throw new Error('cascade-conflict: 규칙이 없다');
  const prop = (rules[0] as CascadeRuleData).prop;
  rules.forEach((r, i) => {
    if (r.prop !== prop) {
      throw new Error(`cascade-conflict: 규칙 #${i + 1} 의 속성 "${r.prop}" 이 "${prop}" 와 다르다`);
    }
    if (!matchesTarget(r.selector, path)) {
      throw new Error(`cascade-conflict: 규칙 #${i + 1} "${r.selector}" 가 요소에 맞지 않는다`);
    }
  });

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let holder: { order: number; weight: Weight } | null = null;
  let swaps = 0;
  let kept = 0;
  for (let i = 0; i < rules.length; i += 1) {
    // 걸음 0 이 요소와 규칙 다섯을 이미 보이므로 첫 발신 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;
    const order = i + 1;
    const weight = specificity((rules[i] as CascadeRuleData).selector);
    if (holder === null) {
      holder = { order, weight };
      await ctx.emit({ type: 'take', payload: { order, weight } });
      continue;
    }
    const { verdict, column } = weigh(weight, holder.weight);
    await ctx.emit({
      type: 'duel',
      payload: { order, weight, holder: holder.order, verdict, column },
    });
    if (verdict === 'lighter') {
      kept += 1;
    } else {
      swaps += 1;
      holder = { order, weight };
    }
  }
  if (holder === null) throw new Error('cascade-conflict: 자리를 쥔 규칙이 없다');
  if (!(await pause())) return;
  await ctx.emit({ type: 'apply', payload: { order: holder.order, swaps, kept } });
}
