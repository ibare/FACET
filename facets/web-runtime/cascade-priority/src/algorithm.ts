/**
 * cascade-priority — 캐스케이드: 표식이 바뀌면 후보 집합 자체가 바뀐다.
 *
 * 개념: 스타일 계산(style-calculation) — 선택자 맞춤과 캐스케이드.
 * 요소(`<p>`)의 표식(태그·클래스·아이디)과 부모(`<div>`)의 클래스에 따라, 다섯 규칙 중
 * "후보"로 걸리는 규칙의 얼굴이 바뀌고, 후보마다 조상을 거슬러 올라가 맞는지 판정되며,
 * 맞은 규칙들은 명시도(무게)로 "자리를 쥔 규칙"을 다툰다. 무게가 같으면 원본 차례가
 * 나중인 규칙이 이긴다.
 *
 * ── 이벤트 (모두 await ctx.emit)
 *   round-init  { mark, parent, elementMarkup, parentMarkup, weights: Record<number, number> }
 *               새 판 시작 — 요소/부모 표기와 다섯 규칙의 무게 갱신
 *   filter      { candidates: number[] }                             후보 규칙 id 목록(원본 차례)
 *   judge       { ruleId, matched }                                  후보 하나의 판정 결과
 *   compare     { ruleId, heldBefore, heldAfter }                    무게 다툼 — 자리를 쥔 규칙 갱신
 *   assign      { ruleId, value }                                    이긴 규칙의 값이 요소에 붙는다
 *   phase       { phase }                                            silent: true. 코드 패널 하이라이트용
 *
 * ── phase 어휘 (irs.ts 와 정확히 같은 집합)
 *   specDone       spec() 의 명시도 셈이 끝난 자리 — 무게를 표시/비교할 때
 *   filterCheck    compoundMatches() 의 판정이 끝난 자리 — 후보 거르기, 그리고 부분 선택자가
 *                  하나뿐인 규칙(`p` · `p.note` · `#lead`)의 판정이 여기서 끝난다
 *   ancestorSearch match_rtl() 이 조상을 거슬러 올라가며 다음 부분 선택자를 찾는 자리 — 부분
 *                  선택자가 둘인 규칙(`.card p` · `.card .note`)의 판정이 여기를 거친다
 *
 * ── 계기 (누적 채널 — setMetric 헬퍼로 "지금 값" 을 매번 다시 보낸다)
 *   candidates    이번 판의 후보 수
 *   comparisons   이번 판 누적 견줌 수 (판정 단계에서 조상 노드 하나를 시험할 때마다 +1)
 *   swaps         이번 판 누적 바꿈 수 ("자리를 쥔 규칙" 이 실제로 다른 규칙으로 바뀔 때만 +1 —
 *                 처음 아무도 안 쥔 자리에 처음 앉는 것은 바꿈이 아니다)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 단순 선택자 조각 — 명시도를 셀 때 쓰는 부품. */
export type SpecificityPart = 'tag' | 'class' | 'id';

/**
 * 규칙 하나.
 *
 * `compounds` 는 오른쪽(요소에 가까운 쪽)부터 순서대로 둔 부분 선택자 배열이다.
 * 각 부분 선택자는 "요구되는 자질" 문자열의 배열이다(`tag:p` · `class:note` · `id:lead`).
 * `compounds[0]` 은 언제나 요소 자신과 견주고, 그 뒤는 조상을 거슬러 올라가며 찾는다.
 */
export type CascadeRule = {
  id: number;
  /** 원본 선택자 글자 — 화면과 코드에 그대로 쓰는 자료(번역하지 않는다). */
  selector: string;
  /** 이 규칙이 이겼을 때 요소에 붙는 값 — 자료(번역하지 않는다). */
  value: string;
  compounds: string[][];
  /** 명시도를 셀 flat 목록 — spec() 의 입력. */
  parts: SpecificityPart[];
};

export type CascadePriorityData = {
  type: 'cascade-priority';
  stepMs: number;
  /** 0=p · 1=.note · 2=#lead · 3=#lead.note */
  mark: number;
  /** 0=div · 1=div.card */
  parent: number;
  rules: CascadeRule[];
};

const MARK_VALUES = [0, 1, 2, 3];
const PARENT_VALUES = [0, 1];

/** 요소의 자질 목록 — mark 값에 따라 태그/클래스/아이디가 붙는다. */
function elementFeatures(mark: number): string[] {
  const out = ['tag:p'];
  if (mark === 1 || mark === 3) out.push('class:note');
  if (mark === 2 || mark === 3) out.push('id:lead');
  return out;
}

/** 부모의 자질 목록 — parent 값에 따라 .card 가 붙는다. */
function parentFeatures(parent: number): string[] {
  const out = ['tag:div'];
  if (parent === 1) out.push('class:card');
  return out;
}

/** 화면·코드 패널이 그대로 보일 HTML 표기 — 자료(번역하지 않는다). */
function elementMarkupOf(mark: number): string {
  const id = mark === 2 || mark === 3 ? ' id="lead"' : '';
  const cls = mark === 1 || mark === 3 ? ' class="note"' : '';
  return `<p${id}${cls}>`;
}

function parentMarkupOf(parent: number): string {
  return parent === 1 ? '<div class="card">' : '<div>';
}

const BODY_FEATURES = ['tag:body'];
const HTML_FEATURES = ['tag:html'];

/** 조상 사슬 — 색인 0 이 요소 자신, 그 뒤로 부모·body·html. */
function chainOf(mark: number, parent: number): string[][] {
  return [elementFeatures(mark), parentFeatures(parent), BODY_FEATURES, HTML_FEATURES];
}

/**
 * 한 부분 선택자(compound)가 한 노드의 자질에 전부 있는지 — irs.ts 의 `compoundMatches` 와
 * 같은 계산. 배열을 새로 짓지 않고 읽기만 한다.
 */
function compoundMatches(reqs: string[], features: string[]): boolean {
  for (const req of reqs) {
    let found = false;
    for (const f of features) if (f === req) found = true;
    if (!found) return false;
  }
  return true;
}

/** 명시도 — spec() 과 같은 셈. (id, class, tag) 개수를 idCount*100+classCount*10+tagCount 로 편다. */
function computeSpecificity(parts: SpecificityPart[]): number {
  let idCount = 0;
  let classCount = 0;
  let tagCount = 0;
  for (const p of parts) {
    if (p === 'id') idCount += 1;
    if (p === 'class') classCount += 1;
    if (p === 'tag') tagCount += 1;
  }
  return idCount * 100 + classCount * 10 + tagCount;
}

type JudgeResult = { matched: boolean; count: number };

/**
 * 규칙 하나를 조상 사슬에 대해 판정 — irs.ts 의 `match_rtl` 과 같은 계산.
 *
 * `compounds[0]` 은 이미 "후보" 로 걸러진 조건(요소 자신과 맞음)이라 다시 셈해 확인만
 * 한다(개별 반복문 안에 await 이 없어 취소 검사 대상이 아니다 — 전부 순수 계산).
 * `count` 는 "노드 하나를 시험한 횟수" 다 — 부분 선택자 안의 낱개 자질 수와 무관하게
 * 한 노드에 한 번씩 잰다(실측표의 "견줌" 이 그 단위로 셌다).
 */
function judgeRule(rule: CascadeRule, chain: string[][]): JudgeResult {
  let count = 1;
  const selfOk = compoundMatches(rule.compounds[0]!, chain[0]!);
  if (!selfOk) {
    throw new Error(`후보로 걸러진 규칙 #${rule.id} 이 자기 자신과도 맞지 않는다 — 필터링이 잘못됐다`);
  }
  if (rule.compounds.length === 1) return { matched: true, count };

  let chainIdx = 1;
  let compoundIdx = 1;
  let ok = true;
  while (compoundIdx < rule.compounds.length) {
    let found = false;
    while (chainIdx < chain.length) {
      count += 1;
      if (compoundMatches(rule.compounds[compoundIdx]!, chain[chainIdx]!)) {
        found = true;
        chainIdx += 1;
        break;
      }
      chainIdx += 1;
    }
    if (!found) {
      ok = false;
      break;
    }
    compoundIdx += 1;
  }
  return { matched: ok, count };
}

/** 계기는 누적 채널이다 — 지금 값을 들고 차이만 보내는 헬퍼. 판이 바뀌면 0 으로 되돌린다. */
function makeSetMetric(ctx: FacetContext<CascadePriorityData>): (name: string, value: number) => void {
  const last = new Map<string, number>();
  return (name, value) => {
    const prev = last.get(name) ?? 0;
    ctx.metric(name, value - prev);
    last.set(name, value);
  };
}

/**
 * 한 판을 끝까지 재생한다. 반환값 false 면 취소로 중간에 멈춘 것.
 *
 * 걸음 — 0(round-init) · 1(filter) · 후보 수만큼(judge) · 맞은 규칙 수만큼(compare) ·
 * 1(assign, 자기 sleep 없이 다음 waitForInput 이 그 경계다).
 */
async function playRound(
  ctx: FacetContext<CascadePriorityData>,
  rc: ReactiveContext<CascadePriorityData>,
  mark: number,
  parent: number,
  setMetric: (name: string, value: number) => void,
): Promise<boolean> {
  const emitPhase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  setMetric('candidates', 0);
  setMetric('comparisons', 0);
  setMetric('swaps', 0);

  const rules = ctx.data.rules;
  const weights = new Map<number, number>();
  for (const rule of rules) weights.set(rule.id, computeSpecificity(rule.parts));

  await ctx.emit({
    type: 'round-init',
    payload: {
      mark,
      parent,
      elementMarkup: elementMarkupOf(mark),
      parentMarkup: parentMarkupOf(parent),
      weights: Object.fromEntries(weights),
    },
  });
  await emitPhase('specDone');
  if (!(await rc.sleep(ctx.data.stepMs))) return false;
  if (ctx.cancelled) return false;

  const chain = chainOf(mark, parent);
  const candidates = rules.filter((r) => compoundMatches(r.compounds[0]!, chain[0]!)).map((r) => r.id);
  await ctx.emit({ type: 'filter', payload: { candidates } });
  setMetric('candidates', candidates.length);
  await emitPhase('filterCheck');
  if (!(await rc.sleep(ctx.data.stepMs))) return false;
  if (ctx.cancelled) return false;

  let comparisons = 0;
  const matched: number[] = [];
  for (const id of candidates) {
    if (ctx.cancelled) return false;
    const rule = rules.find((r) => r.id === id);
    if (!rule) throw new Error(`알 수 없는 규칙 id: ${id}`);
    const result = judgeRule(rule, chain);
    comparisons += result.count;
    setMetric('comparisons', comparisons);
    await ctx.emit({ type: 'judge', payload: { ruleId: id, matched: result.matched } });
    await emitPhase(rule.compounds.length === 1 ? 'filterCheck' : 'ancestorSearch');
    if (result.matched) matched.push(id);
    if (!(await rc.sleep(ctx.data.stepMs))) return false;
  }

  let heldId: number | null = null;
  let heldWeight = -1;
  let swaps = 0;
  for (const id of matched) {
    if (ctx.cancelled) return false;
    const w = weights.get(id) ?? 0;
    const before = heldId;
    const wins = heldId === null || w >= heldWeight;
    if (wins) {
      if (heldId !== null && heldId !== id) swaps += 1;
      heldId = id;
      heldWeight = w;
    }
    setMetric('swaps', swaps);
    await ctx.emit({ type: 'compare', payload: { ruleId: id, heldBefore: before, heldAfter: heldId } });
    await emitPhase('specDone');
    if (!(await rc.sleep(ctx.data.stepMs))) return false;
  }

  if (heldId !== null) {
    const winner = rules.find((r) => r.id === heldId);
    if (!winner) throw new Error('이긴 규칙을 찾지 못했다');
    await ctx.emit({ type: 'assign', payload: { ruleId: heldId, value: winner.value } });
  }
  return true;
}

export async function cascadePriorityAlgorithm(ctx: FacetContext<CascadePriorityData>): Promise<void> {
  const rc = ctx as ReactiveContext<CascadePriorityData>;
  let mark = ctx.data.mark;
  let parent = ctx.data.parent;
  const setMetric = makeSetMetric(ctx);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const finished = await playRound(ctx, rc, mark, parent, setMetric);
      if (!finished || ctx.cancelled) return;

      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload as { value?: unknown } | undefined;
        const value = payload?.value;
        if (input.type === 'mark' && typeof value === 'number' && MARK_VALUES.includes(value)) {
          mark = value;
          break;
        }
        if (input.type === 'parent' && typeof value === 'number' && PARENT_VALUES.includes(value)) {
          parent = value;
          break;
        }
        // 우리 것이 아닌 입력은 흘려보낸다.
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
