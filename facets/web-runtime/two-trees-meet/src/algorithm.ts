/**
 * 두 트리가 만난다 — DOM 을 앞 차례 · 깊이 우선으로 밟으며, 요소마다 CSSOM 에서 맞는 규칙을 찾아
 * 그 선언을 붙이고, 렌더 트리의 제 부모(가장 가까운 렌더 트리 조상) 아래에 붙인다.
 * `display: none` 이 맞은 요소는 렌더 트리에 넣지 않고 그 자손을 밟지 않는다 — 가지째 빠진다.
 *
 * 요소 번호는 `flattenDom` 이 매기는 앞 차례 번호다 (장면도 같은 함수로 바탕을 세운다).
 * 규칙 번호는 `initialData.rules` 의 차례다.
 *
 * 이벤트 (모두 silent 아님 — 한 발신이 한 걸음):
 * - `visit`  { el: number; rules: number[]; parent: number | null }
 *     요소 el 을 밟았고 규칙 rules 가 맞았다. 그 선언을 붙이고 렌더 트리의 parent 아래로 들어간다
 *     (parent 가 null 이면 렌더 트리의 뿌리). rules 가 비면 선언 없이 들어간다.
 * - `drop`   { el: number; rules: number[]; skipped: number[] }
 *     요소 el 을 밟았고 맞은 규칙 가운데 `display: none` 이 있다. 렌더 트리에 넣지 않는다.
 *     skipped 는 밟지 않고 함께 빠지는 자손 (앞 차례).
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (DOM · CSSOM · 빈 렌더 트리).
 * 읽을 것이 있는 화면이라 첫 발신 앞에 stepMs 를 둔다.
 *
 * 모르는 선택자 모양 · 모르는 선언 모양 · 한 요소에 같은 속성이 두 번 맞는 일은 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DomNode = {
  tag: string;
  cls?: string[];
  id?: string;
  children?: DomNode[];
};

export type CssRule = {
  selector: string;
  decl: string;
  origin: 'ua' | 'author';
};

export type TwoTreesMeetFacetData = {
  type: 'two-trees-meet';
  stepMs: number;
  dom: DomNode;
  rules: CssRule[];
};

/** 앞 차례로 편 DOM 한 줄 */
export type FlatElement = {
  tag: string;
  cls: string[];
  id: string | null;
  /** 화면 이름 — 태그 · #아이디 · .클래스 */
  name: string;
  depth: number;
  parent: number | null;
  children: number[];
};

const NAME_RE = /^[a-z][a-z0-9-]*$/;

function readNode(v: unknown, path: string): DomNode {
  if (typeof v !== 'object' || v === null) throw new Error(`DOM 노드가 객체가 아니다: ${path}`);
  const o = v as Record<string, unknown>;
  if (typeof o.tag !== 'string' || !NAME_RE.test(o.tag)) throw new Error(`모르는 태그: ${path}`);
  const node: DomNode = { tag: o.tag };
  if (o.cls !== undefined) {
    if (!Array.isArray(o.cls) || !o.cls.every((c) => typeof c === 'string' && NAME_RE.test(c))) {
      throw new Error(`모르는 클래스 목록: ${path}`);
    }
    node.cls = o.cls.map(String);
  }
  if (o.id !== undefined) {
    if (typeof o.id !== 'string' || !NAME_RE.test(o.id)) throw new Error(`모르는 아이디: ${path}`);
    node.id = o.id;
  }
  if (o.children !== undefined) {
    if (!Array.isArray(o.children)) throw new Error(`children 이 배열이 아니다: ${path}`);
    node.children = o.children.map((c, i) => readNode(c, `${path}/${i}`));
  }
  return node;
}

function readRule(v: unknown, i: number): CssRule {
  if (typeof v !== 'object' || v === null) throw new Error(`규칙 ${i} 가 객체가 아니다`);
  const o = v as Record<string, unknown>;
  if (typeof o.selector !== 'string') throw new Error(`규칙 ${i} 의 선택자가 없다`);
  if (typeof o.decl !== 'string') throw new Error(`규칙 ${i} 의 선언이 없다`);
  if (o.origin !== 'ua' && o.origin !== 'author') throw new Error(`규칙 ${i} 의 출처를 모른다`);
  return { selector: o.selector, decl: o.decl, origin: o.origin };
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. */
export function readTwoTreesMeetData(v: unknown): TwoTreesMeetFacetData {
  if (typeof v !== 'object' || v === null) throw new Error('initialData 가 없다');
  const o = v as Record<string, unknown>;
  if (o.type !== 'two-trees-meet') throw new Error('initialData.type 이 two-trees-meet 가 아니다');
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) throw new Error('initialData.stepMs 가 없다');
  if (!Array.isArray(o.rules)) throw new Error('initialData.rules 가 배열이 아니다');
  return {
    type: 'two-trees-meet',
    stepMs: o.stepMs,
    dom: readNode(o.dom, 'dom'),
    rules: o.rules.map((r, i) => readRule(r, i)),
  };
}

/** DOM 을 앞 차례 · 깊이 우선으로 편다. 번호가 곧 요소 식별자다. */
export function flattenDom(root: DomNode): FlatElement[] {
  const out: FlatElement[] = [];
  const walk = (node: DomNode, depth: number, parent: number | null): number => {
    const index = out.length;
    const cls = node.cls ? [...node.cls] : [];
    const id = node.id ?? null;
    const name = node.tag + (id === null ? '' : `#${id}`) + cls.map((c) => `.${c}`).join('');
    const row: FlatElement = { tag: node.tag, cls, id, name, depth, parent, children: [] };
    out.push(row);
    for (const child of node.children ?? []) row.children.push(walk(child, depth + 1, index));
    return index;
  };
  walk(root, 0, null);
  return out;
}

type Compound = { tag: string | null; cls: string[]; ids: string[] };

const COMPOUND_RE = /^([a-z][a-z0-9]*)?((?:[.#][a-z][a-z0-9-]*)*)$/;

/** 단순 선택자 하나(태그 · .클래스 · #아이디 의 이음)만 읽는다. 결합자 · 속성 · 가상 클래스는 던진다. */
function parseCompound(selector: string): Compound {
  const m = COMPOUND_RE.exec(selector);
  if (!m || selector === '') throw new Error(`모르는 선택자 모양: "${selector}"`);
  const out: Compound = { tag: m[1] ?? null, cls: [], ids: [] };
  for (const part of (m[2] ?? '').matchAll(/([.#])([a-z][a-z0-9-]*)/g)) {
    if (part[1] === '.') out.cls.push(String(part[2]));
    else out.ids.push(String(part[2]));
  }
  return out;
}

function matches(c: Compound, el: FlatElement): boolean {
  if (c.tag !== null && c.tag !== el.tag) return false;
  if (c.cls.some((x) => !el.cls.includes(x))) return false;
  if (c.ids.some((x) => x !== el.id)) return false;
  return true;
}

type Declaration = { prop: string; value: string };

const DECL_RE = /^([a-z-]+)\s*:\s*(\S(?:.*\S)?)$/;

function parseDecl(decl: string, i: number): Declaration {
  const m = DECL_RE.exec(decl);
  if (!m) throw new Error(`규칙 ${i} 의 선언 모양을 모른다: "${decl}"`);
  return { prop: String(m[1]), value: String(m[2]) };
}

/** el 아래 자손 전부 (앞 차례) */
function descendants(flat: FlatElement[], el: number): number[] {
  const out: number[] = [];
  const walk = (i: number): void => {
    for (const c of flat[i]!.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

export async function twoTreesMeet(context: FacetContext<TwoTreesMeetFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TwoTreesMeetFacetData>;
  const data = readTwoTreesMeetData(ctx.data);
  const stepMs = data.stepMs;
  const flat = flattenDom(data.dom);
  const rules = data.rules.map((r, i) => ({
    compound: parseCompound(r.selector),
    decl: parseDecl(r.decl, i),
  }));

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  /** el 을 밟는다. 취소되면 false. rparent 는 가장 가까운 렌더 트리 조상. */
  async function visit(el: number, rparent: number | null): Promise<boolean> {
    if (!(await pause())) return false;
    const element = flat[el]!;
    const matched: number[] = [];
    const props = new Set<string>();
    rules.forEach((r, i) => {
      if (!matches(r.compound, element)) return;
      if (props.has(r.decl.prop)) {
        throw new Error(`${element.name} 에 속성 ${r.decl.prop} 이 두 번 맞았다 — 이 조각은 다툼을 셈하지 않는다`);
      }
      props.add(r.decl.prop);
      matched.push(i);
    });
    const hidden = matched.some((i) => {
      const d = rules[i]!.decl;
      return d.prop === 'display' && d.value === 'none';
    });
    if (hidden) {
      await ctx.emit({
        type: 'drop',
        payload: { el, rules: matched, skipped: descendants(flat, el) },
      });
      return true;
    }
    await ctx.emit({ type: 'visit', payload: { el, rules: matched, parent: rparent } });
    for (const child of element.children) {
      if (ctx.cancelled) return false;
      if (!(await visit(child, el))) return false;
    }
    return true;
  }

  await visit(0, null);
}
