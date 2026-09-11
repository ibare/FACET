/**
 * suffix-array — 한 번 줄 세워 두면, 그 뒤로는 이분 탐색으로 찾는다.
 *
 * 조각 `allSuffixesSorted` 는 꼬리를 줄 세우는 데서 멈춘다. 이 완제품은 **줄 세운
 * 것 위에서 실제로 찾기까지** 간다 — 같은 패턴의 등장 자리가 줄에서 한 덩어리로
 * 모여 있으므로, 이분 탐색으로 그 덩어리의 첫 자리만 찾으면 된다.
 *
 * ── 손잡이는 글의 반복성이다
 *
 * 되풀이가 심한 글일수록 줄에서 이웃한 꼬리끼리 앞이 길게 겹친다. 그것이 이
 * 자료구조가 **왜 한 덩어리로 모이는가** 를 눈으로 보이는 수다.
 *
 *   단      글             이웃 겹침 평균
 *   1    buckminster          0.00
 *   2    abracadabra          1.20
 *   3    aabbaabbaab          3.00
 *   4    abababababa          4.50
 *
 * **네 글의 길이를 11 로 맞춘 것은 화면 때문이다.** 꼬리 줄 수가 곧 글자 수라
 * 길이가 달라지면 줄 수가 달라지고, 그러면 캔버스 세로가 바뀐다 (S-view 가 금지).
 *
 * 4단이 4.50 인 까닭도 적어 둔다. 길이 11 에서 평균 4.00 은 **산술적으로 나올 수
 * 없다** — 이웃쌍이 10 개라 합이 40 이어야 하는데, 길이 11 의 모든 글(글자 이름만
 * 바꾼 것을 하나로 친 678,570 개)을 전수로 훑어 그런 글이 없음을 확인했다.
 * 길이 10 이면 4.00 은 되지만 1.20 과 3.00 이 안 된다. 길이 11 이 넷 중 셋을
 * 정확히 맞추는 유일한 자리다.
 *
 * ── 이벤트 (`done` 만 표준. 나머지는 이 facet 고유 — C2)
 *
 *   'setup'    { level, text, pattern }                 글과 패턴을 세운다
 *   'cut'      { tails: { from, text }[] }              자리마다 꼬리를 만든다
 *   'sorted'   { sa, overlaps, overlapSum, overlapAvg } 줄 세운 결과와 이웃 겹침
 *   'probe'    { lo, hi, mid, rank, from, cmp }         이분 탐색 한 걸음
 *                cmp: 'lt' 면 꼬리가 패턴보다 앞 (오른쪽으로),
 *                     'ge' 면 앞이 아니다 (왼쪽으로)
 *   'block'    { start, size, ranks }                   덩어리의 첫 자리와 크기
 *   'match'    { rank, from }                           덩어리 안의 한 자리
 *   'phase'    { phase }                   silent: true 코드 패널용
 *   'done'     { matches, compares }                    한 바퀴의 끝
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'cut' | 'compare-tails' | 'place' | 'pick-mid' | 'compare-pattern' |
 *   'go-right' | 'go-left' | 'block-start' | 'extend-block'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   'overlap-sum'   이웃 겹침의 합. 길이가 11 로 고정이라 평균과 정비례한다
 *                   (평균 = 합 / 10). 배지에 정수만 두는 까닭은 `ctx.metric` 이
 *                   누적 delta 라 소수를 더하면 부동소수 잔차가 그대로 뜨기
 *                   때문이다. 평균은 stage 가 소수 둘째 자리로 그린다.
 *   'compare-count' 이분 탐색이 견준 횟수 (보조 수치)
 *   'match-count'   찾은 자리의 수
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 한 단의 글과, 그 글에서 찾을 패턴. */
export type SuffixArrayText = { text: string; pattern: string };

export type SuffixArrayData = {
  type: 'suffix-array';
  /** 손잡이가 고르는 글 넷. 되풀이가 심해지는 차례로 둔다. */
  texts: SuffixArrayText[];
  /** 지금 고른 단 (1부터). 손잡이의 기본값과 같아야 한다. */
  level: number;
  /** 걸음 사이의 정지 시간 (ms). */
  stepMs: number;
};

/** 한 꼬리 — 어느 자리에서 시작했고 어떤 글자들인지. */
export type Tail = { from: number; text: string };

/** 줄 세우기의 결과와, 그러는 동안 몇 번 견주고 몇 번 자리를 바꿨는지. */
export type SuffixSortResult = { sa: number[]; compares: number; swaps: number };

/** 자리 0 부터 끝자리까지, 각 자리에서 끝까지 남는 조각. */
export function buildTails(text: string): Tail[] {
  const out: Tail[] = [];
  for (let i = 0; i < text.length; i += 1) out.push({ from: i, text: text.slice(i) });
  return out;
}

/**
 * 꼬리 `a` 가 꼬리 `b` 보다 사전 순으로 앞서는가.
 *
 * **글자를 하나씩 견주는 루프로 편다.** 자바스크립트의 문자열 비교에 맡기면 한
 * 줄로 끝나지만, 그러면 IR 이 보이는 코드와 화면이 셈하는 것이 갈린다 — IR 에는
 * 문자열을 통째로 견주는 어휘가 없어 어차피 루프로 펴야 하기 때문이다. 두 쪽이
 * 같은 셈을 하도록 여기서도 편다.
 *
 * 앞이 같으면 짧은 쪽이 먼저다 — `a` 가 `ana` 보다 앞이다.
 */
export function suffixLess(text: string, a: number, b: number): boolean {
  let i = 0;
  while (a + i < text.length && b + i < text.length) {
    if (text[a + i] !== text[b + i]) return text[a + i]! < text[b + i]!;
    i += 1;
  }
  return text.length - a < text.length - b;
}

/**
 * 꼬리의 시작 자리를 사전 순으로 줄 세운다 — 삽입 정렬.
 *
 * 빠른 정렬법을 쓰지 않는 것은 **IR 과 같은 셈을 해야** 하기 때문이다. 실제
 * 접미사 배열은 훨씬 빠른 방법으로 만들지만, 여기서 보이려는 것은 만드는 법이
 * 아니라 만들어 둔 것으로 무엇을 하는가다 (`description.ts` 의 전제).
 */
export function sortSuffixes(text: string): SuffixSortResult {
  const n = text.length;
  const sa: number[] = [];
  for (let i = 0; i < n; i += 1) sa.push(i);

  let compares = 0;
  let swaps = 0;
  for (let i = 1; i < n; i += 1) {
    let j = i;
    for (;;) {
      if (j <= 0) break;
      compares += 1;
      if (!suffixLess(text, sa[j]!, sa[j - 1]!)) break;
      const tmp = sa[j]!;
      sa[j] = sa[j - 1]!;
      sa[j - 1] = tmp;
      swaps += 1;
      j -= 1;
    }
  }
  return { sa, compares, swaps };
}

/** 접미사 배열 — 사전 순으로 늘어놓은 꼬리들의 시작 자리. */
export function suffixArrayOf(text: string): number[] {
  return sortSuffixes(text).sa;
}

/** 두 꼬리가 앞에서 몇 글자나 같은가. */
export function overlapOf(text: string, a: number, b: number): number {
  let k = 0;
  while (a + k < text.length && b + k < text.length && text[a + k] === text[b + k]) k += 1;
  return k;
}

/**
 * 줄에서 이웃한 꼬리끼리의 겹침.
 *
 * `out[r]` 은 r 번 줄과 그 **위** 줄의 겹침이다. 첫 줄은 위가 없으므로 0 이며,
 * 평균을 낼 때도 그 자리는 세지 않는다 (이웃쌍은 n-1 개다).
 */
export function neighborOverlaps(text: string, sa: readonly number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < sa.length; r += 1) {
    out.push(r === 0 ? 0 : overlapOf(text, sa[r - 1]!, sa[r]!));
  }
  return out;
}

/** 이웃 겹침의 합. */
export function overlapSumOf(overlaps: readonly number[]): number {
  let sum = 0;
  for (const v of overlaps) sum += v;
  return sum;
}

/** 이웃 겹침 평균 — 합을 이웃쌍 수(n-1)로 나눈 것. 이 facet 의 주 수치다. */
export function overlapAverageOf(overlaps: readonly number[]): number {
  const pairs = overlaps.length - 1;
  return pairs > 0 ? overlapSumOf(overlaps) / pairs : 0;
}

/**
 * 꼬리 `s` 의 앞머리를 패턴과 견준다.
 *
 * 패턴 길이만큼만 본다. 앞서면 -1, 뒤서면 1, **패턴이 이 꼬리의 앞머리이면 0** 이다.
 * 0 이 곧 "여기서 패턴이 나온다" 이므로, 0 인 줄들이 모여 있는 구간이 답이다.
 */
export function prefixCompare(text: string, s: number, pattern: string): number {
  for (let i = 0; i < pattern.length; i += 1) {
    if (s + i >= text.length) return -1;
    if (text[s + i] !== pattern[i]) return text[s + i]! < pattern[i]! ? -1 : 1;
  }
  return 0;
}

/** 이분 탐색이 한 걸음마다 남기는 것. */
export type ProbeStep = { lo: number; hi: number; mid: number; rank: number; cmp: 'lt' | 'ge' };

/** 덩어리를 찾은 결과. */
export type BlockResult = { start: number; size: number; steps: ProbeStep[] };

/**
 * 줄 세워 둔 것 위에서 패턴이 이루는 덩어리를 찾는다.
 *
 * 이분 탐색으로 **덩어리의 첫 자리**(패턴보다 앞서지 않는 첫 줄)를 찾고, 거기서
 * 앞머리가 패턴인 동안 아래로 나아간다. 줄 세워 두었으므로 그 사이가 통째로 답이다.
 */
export function findBlock(text: string, sa: readonly number[], pattern: string): BlockResult {
  const steps: ProbeStep[] = [];
  let lo = 0;
  let hi = sa.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cmp = prefixCompare(text, sa[mid]!, pattern);
    if (cmp < 0) {
      steps.push({ lo, hi, mid, rank: mid, cmp: 'lt' });
      lo = mid + 1;
    } else {
      steps.push({ lo, hi, mid, rank: mid, cmp: 'ge' });
      hi = mid;
    }
  }
  const start = lo;
  let k = start;
  while (k < sa.length && prefixCompare(text, sa[k]!, pattern) === 0) k += 1;
  return { start, size: k - start, steps };
}

/** 한 단의 대조용 요약. 화면에 쓰지 않고 테스트가 쓴다. */
export function computeSuffixArrayResult(data: SuffixArrayData): {
  text: string;
  pattern: string;
  sa: number[];
  overlapSum: number;
  overlapAvg: number;
  matches: number;
}[] {
  return data.texts.map((entry) => {
    const sa = suffixArrayOf(entry.text);
    const overlaps = neighborOverlaps(entry.text, sa);
    const block = findBlock(entry.text, sa, entry.pattern);
    return {
      text: entry.text,
      pattern: entry.pattern,
      sa,
      overlapSum: overlapSumOf(overlaps),
      overlapAvg: overlapAverageOf(overlaps),
      matches: block.size,
    };
  });
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: SuffixArrayData, input: ReactiveInputEvent): void {
  if (input.type !== 'repetition') return;
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return;
  if (value >= 1 && value <= data.texts.length) data.level = Math.round(value);
}

export const suffixArrayAlgorithm = async (
  base: FacetContext<SuffixArrayData>,
): Promise<void> => {
  // registerAlgorithm 의 시그니처는 FacetContext 그대로이고, 입력 반응형 facet 의
  // algorithm 은 주입받은 ctx 를 ReactiveContext 로 단언해 쓴다 (context.ts 의 규약).
  // 설계상 열린 경계라 이 단언은 C9 가 허용하는 자리다.
  const ctx = base as ReactiveContext<SuffixArrayData>;

  // ctx.metric 은 **더하는** 채널이라 (mechanism 이 누적한다) 값을 그대로 앉히려면
  // 차이를 보내야 한다. 손잡이를 밀어 다시 짓는 것은 되돌리기가 아니므로, 그냥
  // 더하면 두 번째 판부터 수가 불어난다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    const index = Math.min(Math.max(1, Math.round(data.level)), data.texts.length) - 1;
    const entry = data.texts[index];
    if (entry === undefined) return true;
    const { text, pattern } = entry;

    setMetric('overlap-sum', 0);
    setMetric('compare-count', 0);
    setMetric('match-count', 0);

    await ctx.emit({
      type: 'setup',
      payload: { level: index + 1, text, pattern },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // ── 자리마다 꼬리를 만든다.
    await phase('cut');
    await ctx.emit({
      type: 'cut',
      payload: { tails: buildTails(text).map((t) => ({ from: t.from, text: t.text })) },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // ── 줄 세운다. 조각이 이미 걸음마다 보여 준 일이라 여기서는 한 걸음에 끝낸다.
    //    다만 코드 패널은 그 사이 무엇이 도는지 짚어야 하므로 두 phase 를 낸다.
    const { sa } = sortSuffixes(text);
    await phase('compare-tails');
    await phase('place');
    const overlaps = neighborOverlaps(text, sa);
    const overlapSum = overlapSumOf(overlaps);
    const overlapAvg = overlapAverageOf(overlaps);
    setMetric('overlap-sum', overlapSum);
    await ctx.emit({
      type: 'sorted',
      payload: { sa: [...sa], overlaps: [...overlaps], overlapSum, overlapAvg },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // ── 줄 세워 둔 것 위에서 이분 탐색.
    const block = findBlock(text, sa, pattern);
    let compares = 0;
    for (const step of block.steps) {
      if (ctx.cancelled) return false;
      await phase('pick-mid');
      await phase('compare-pattern');
      if (step.cmp === 'lt') await phase('go-right');
      else await phase('go-left');
      compares += 1;
      setMetric('compare-count', compares);
      await ctx.emit({
        type: 'probe',
        payload: {
          lo: step.lo,
          hi: step.hi,
          mid: step.mid,
          rank: step.rank,
          from: sa[step.mid],
          cmp: step.cmp,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    // ── 덩어리의 첫 자리. 여기서부터가 답이다.
    await phase('block-start');
    // 루프가 아니라 한 번에 짓는다. emit 도 await 도 없는 순수 색인 조립이라
    // 취소 검사가 필요 없는데, `for` 꼴로 두면 C8 의 "모든 루프 진입부에 검사" 와
    // 헷갈리는 자리가 된다 — 모양에서 드러나게 해 그 물음 자체를 없앤다.
    const ranks = Array.from({ length: block.size }, (_, i) => block.start + i);
    await ctx.emit({
      type: 'block',
      payload: { start: block.start, size: block.size, ranks: [...ranks] },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // ── 앞머리가 패턴인 동안 아래로 나아간다. 줄 세워 두었으므로 한 덩어리다.
    let matches = 0;
    for (const rank of ranks) {
      if (ctx.cancelled) return false;
      await phase('extend-block');
      matches += 1;
      setMetric('match-count', matches);
      await ctx.emit({ type: 'match', payload: { rank, from: sa[rank] } });
      if (!(await ctx.sleep(data.stepMs * 0.55))) return false;
    }

    await ctx.emit({ type: 'done', payload: { matches, compares } });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;
      // 여기서부터 입력 대기다 — 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
