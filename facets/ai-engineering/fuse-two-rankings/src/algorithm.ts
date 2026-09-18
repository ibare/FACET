/**
 * fuse-two-rankings — 두 등수를 RRF(역순위 합치기)로 하나로 합친다.
 *
 * 두 검색이 같은 질의에 낸 결과는 점수 단위가 다르다(BM25 와 코사인). 그래서 점수는
 * 버리고 **등수만** 쓴다. 목록마다 등수 r 자리의 문서에 몫 1/(k + r) 을 주고, 문서마다
 * 받은 몫을 더해 그 합으로 다시 줄을 세운다. 목록에 없는 문서는 그 목록에서 0 을 받는다.
 *
 * 두 등수는 **예로 정한 값**이다 — 실제 모형이나 검색기에서 나온 값이 아니다. 이 조각은
 * 등수를 셈하지 않는다(그것은 낱말 쪽 · 뜻 쪽 검색의 몫이다).
 *
 * 견주기는 분수로 정확히 한다. 합을 기약분수 num/den 으로 쥐고 `a.num × b.den` 과
 * `b.num × a.den` 을 정수로 견준다 — 실수 합은 `5.7000000000000002` 대
 * `5.699999999999999` 처럼 끝자리에서 순서를 가를 수 있다. 같으면 식별자 오름차순.
 * 이 데이터에서 정확한 동률은 없다.
 *
 * 이벤트 (모두 걸음 경계 — silent 없음)
 *   init  { query: string; k: number;
 *           docs: { id: string; title: string }[];
 *           lists: { id: string; ranking: string[] }[] }
 *         바탕. 질의 · 문서 · 두 등수 · k 를 한 번 내놓는다.
 *   drop  { rank: number; k: number;
 *           shares: { list: number; doc: string; den: number }[] }
 *         등수 rank 자리의 몫이 목록마다 하나씩 떨어져 제 문서로 간다. 몫 = 1/den,
 *         den = k + rank. list 는 lists 의 번호(0 부터).
 *   fuse  { order: { doc: string; num: number; den: number }[];
 *           top: string; places: number[]; firstInNone: boolean }
 *         받은 몫의 합(기약분수 num/den)으로 다시 선 줄. places 는 맨 앞 문서가 각
 *         목록에서 선 등수(1 부터, 목록에 없으면 0). firstInNone 은 그 등수에 1 이
 *         하나도 없는가.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface FuseTwoRankingsFacetData {
  type: 'fuse-two-rankings';
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
  /** RRF 의 k. 등수 r 의 몫은 1/(k + r). */
  k: number;
  /** 질의 (영어 원문, 자료). */
  query: string;
  /** 문서 식별자와 제목 (영어 원문, 자료). */
  docs: { id: string; title: string }[];
  /** 목록마다 1 등부터 늘어선 문서 식별자. 예로 정한 값. */
  lists: { id: string; ranking: string[] }[];
}

/** 기약분수. 분모는 늘 양수. */
interface Fraction {
  num: number;
  den: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0 ? 1 : x;
}

/** a + 1/den, 기약. */
function addUnit(a: Fraction, den: number): Fraction {
  const num = a.num * den + a.den;
  const d = a.den * den;
  const g = gcd(num, d);
  return { num: num / g, den: d / g };
}

/** 큰 쪽이 앞 — 정수 교차곱으로 견준다. */
function compareDesc(a: Fraction, b: Fraction): number {
  return b.num * a.den - a.num * b.den;
}

export async function fuseTwoRankings(
  context: FacetContext<FuseTwoRankingsFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FuseTwoRankingsFacetData>;
  const { stepMs, k, query, docs, lists } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 첫 걸음은 문 밖 — 마운트 직후 빈 화면을 두지 않는다.
  await ctx.emit({
    type: 'init',
    payload: {
      query,
      k,
      docs: docs.map((d) => ({ id: d.id, title: d.title })),
      lists: lists.map((l) => ({ id: l.id, ranking: [...l.ranking] })),
    },
  });

  const depth = lists.reduce((m, l) => Math.max(m, l.ranking.length), 0);
  const sums = new Map<string, Fraction>(docs.map((d) => [d.id, { num: 0, den: 1 }]));

  for (let rank = 1; rank <= depth; rank += 1) {
    if (!(await pause())) return;
    const den = k + rank;
    const shares: { list: number; doc: string; den: number }[] = [];
    lists.forEach((l, list) => {
      const doc = l.ranking[rank - 1];
      if (doc === undefined) return;
      shares.push({ list, doc, den });
      sums.set(doc, addUnit(sums.get(doc) ?? { num: 0, den: 1 }, den));
    });
    await ctx.emit({ type: 'drop', payload: { rank, k, shares } });
  }

  if (!(await pause())) return;

  const order = [...sums.entries()]
    .map(([doc, f]) => ({ doc, num: f.num, den: f.den }))
    .sort((a, b) => compareDesc(a, b) || (a.doc < b.doc ? -1 : a.doc > b.doc ? 1 : 0));
  const top = order[0]?.doc ?? '';
  const places = lists.map((l) => l.ranking.indexOf(top) + 1);
  const firstInNone = !places.includes(1);

  await ctx.emit({ type: 'fuse', payload: { order, top, places, firstInNone } });
}
