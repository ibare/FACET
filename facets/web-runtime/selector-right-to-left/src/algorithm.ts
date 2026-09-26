/**
 * selector-right-to-left — 선택자는 오른쪽 끝부터 읽고, 문서는 후보에서 위로 거슬러 오른다.
 *
 * 규칙은 오른쪽 끝 단순 선택자로 묶여 있다 — 그 단순 선택자에 맞을 수 있는 요소만 후보다.
 * 후보마다 오른쪽 끝을 후보 자신과 견주고, 맞으면 선택자 자리를 한 칸 왼쪽으로 옮긴 뒤
 * 자손 결합자를 따라 부모부터 위로 맞는 조상을 찾는다. 맞으면 선택자 자리도 왼쪽으로,
 * 아니면 문서 자리만 위로. 왼쪽 끝이 맞으면 그 걸음에 "맞음", 뿌리 위로 벗어나면 다음 걸음에
 * "맞지 않음" (이 판정은 견줌이 아니다).
 *
 * 이벤트 (발신 차례):
 *   init      silent: true
 *             payload { parts: string[]; candidates: number[] }
 *             parts — 선택자를 빈칸(자손 결합자)으로 가른 단순 선택자들, 왼쪽부터
 *             candidates — 후보 요소의 dom 번호, 문서 차례
 *   compare   걸음 하나 = 견줌 하나 (단순 선택자 하나 ↔ 요소 하나)
 *             payload { cand: number; part: number; node: number; hit: boolean;
 *                       verdict: 'match' | 'none' | null }
 *             cand — 따지는 후보의 dom 번호, part — parts 번호, node — 견준 요소의 dom 번호
 *             verdict — 이 견줌으로 판정이 났으면 그 판정, 아니면 null
 *   pastRoot  걸음 하나 — 뿌리 위로 벗어나 "맞지 않음" 을 판정한다
 *             payload { cand: number; part: number }  part — 끝내 못 찾은 단순 선택자
 *
 * 선택자 모양은 태그 · .클래스 · #아이디 를 이은 단순 선택자와 자손 결합자(빈칸)뿐이다.
 * 그 밖의 모양(`>` · 속성 · 가상 클래스)은 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 문서 요소 하나. parent 는 부모의 dom 번호 — 뿌리만 없다. 배열 차례가 문서 차례다. */
export type DomNode = {
  tag: string;
  cls?: string[];
  id?: string;
  parent?: number;
};

export type SelectorRightToLeftFacetData = {
  type: 'selector-right-to-left';
  stepMs: number;
  selector: string;
  dom: DomNode[];
};

type Compound = { tag: string | null; cls: string[]; ids: string[] };

const COMPOUND = /^([a-z][a-z0-9]*)?((?:[.#][a-z][a-z0-9-]*)*)$/;
const SIMPLE = /([.#])([a-z][a-z0-9-]*)/g;

/** 단순 선택자 하나를 가른다. 모르는 모양은 던진다. */
function parseCompound(text: string): Compound {
  const m = COMPOUND.exec(text);
  if (text === '' || m === null) {
    throw new Error(`selector-right-to-left: 모르는 선택자 모양 "${text}"`);
  }
  const cls: string[] = [];
  const ids: string[] = [];
  for (const s of (m[2] ?? '').matchAll(SIMPLE)) {
    if (s[1] === '.') cls.push(s[2] as string);
    else ids.push(s[2] as string);
  }
  return { tag: m[1] ?? null, cls, ids };
}

function compoundMatches(c: Compound, el: DomNode): boolean {
  if (c.tag !== null && c.tag !== el.tag) return false;
  const own = el.cls ?? [];
  if (c.cls.some((x) => !own.includes(x))) return false;
  if (c.ids.some((x) => x !== el.id)) return false;
  return true;
}

/** 문서가 트리인지 본다 — 뿌리는 하나, 부모는 늘 앞 차례에 있다. */
function checkDom(dom: DomNode[]): void {
  if (dom.length === 0) throw new Error('selector-right-to-left: 문서가 비었다');
  dom.forEach((el, i) => {
    if (typeof el.tag !== 'string' || el.tag === '') {
      throw new Error(`selector-right-to-left: 요소 ${i} 에 태그가 없다`);
    }
    if (i === 0) {
      if (el.parent !== undefined) throw new Error('selector-right-to-left: 뿌리에 부모가 있다');
      return;
    }
    if (el.parent === undefined) {
      throw new Error(`selector-right-to-left: 요소 ${i} (${el.tag}) 에 부모가 없다 — 뿌리는 하나다`);
    }
    if (!Number.isInteger(el.parent) || el.parent < 0 || el.parent >= i) {
      throw new Error(`selector-right-to-left: 요소 ${i} (${el.tag}) 의 부모 ${el.parent} 가 앞 차례에 없다`);
    }
  });
}

export async function selectorRightToLeft(
  ctx0: FacetContext<SelectorRightToLeftFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<SelectorRightToLeftFacetData>;
  const { selector, dom, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  checkDom(dom);
  const parts = selector.trim().split(/\s+/);
  const compounds = parts.map(parseCompound);
  const last = parts.length - 1;
  const key = compounds[last] as Compound;

  // 규칙은 오른쪽 끝 단순 선택자로 묶인다 — 태그가 있으면 그 태그의 요소만 따진다
  const candidates: number[] = [];
  dom.forEach((el, i) => {
    if (key.tag === null || el.tag === key.tag) candidates.push(i);
  });

  await ctx.emit({ type: 'init', payload: { parts, candidates }, silent: true });

  for (const cand of candidates) {
    // 걸음 0 이 이미 읽을 화면이라 첫 견줌 앞에도 머문다
    if (!(await pause())) return;
    let part = last;
    const selfHit = compoundMatches(key, dom[cand] as DomNode);
    const selfVerdict = !selfHit ? 'none' : part === 0 ? 'match' : null;
    await ctx.emit({
      type: 'compare',
      payload: { cand, part, node: cand, hit: selfHit, verdict: selfVerdict },
    });
    if (selfVerdict !== null) continue;

    part -= 1;
    let matched = false;
    let up = (dom[cand] as DomNode).parent;
    while (up !== undefined) {
      if (!(await pause())) return;
      const hit = compoundMatches(compounds[part] as Compound, dom[up] as DomNode);
      const verdict = hit && part === 0 ? 'match' : null;
      await ctx.emit({
        type: 'compare',
        payload: { cand, part, node: up, hit, verdict },
      });
      if (verdict !== null) {
        matched = true;
        break;
      }
      if (hit) part -= 1;
      up = (dom[up] as DomNode).parent;
    }
    if (!matched) {
      if (!(await pause())) return;
      await ctx.emit({ type: 'pastRoot', payload: { cand, part } });
    }
  }
}
