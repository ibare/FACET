/**
 * all-suffixes-sorted — 한 문자열의 모든 꼬리를 줄 세우는 조각.
 *
 * 답하는 질문: 모든 꼬리를 줄 세워 두면 무엇이 쉬워지는가.
 * 동사는 "줄 선다" — 뒤섞인 꼬리들이 제자리를 찾아 옮겨 간다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 인 것은 없다)
 *
 *   cut-tails   자리마다 잘라 꼬리를 만든다. 꼬리 i 는 문자열의 칸 i 에서
 *               시작해 끝까지 간다.
 *               payload 없음.
 *   align-left  꼬리들의 왼쪽 끝을 맞춘다 — 서로 견줄 수 있는 꼴로.
 *               payload 없음.
 *   take-place  사전 순으로 다음 차례인 꼬리가 줄의 제 자리로 건너간다.
 *               payload { from: number }
 *                 from  원래 자리 (꼬리가 시작하는 칸)
 *               줄에서 선 자리도 꼬리의 글자들도 싣지 않는다 — 앞의 것은 지금까지
 *               앉은 수이고 뒤의 것은 바탕 글을 `from` 에서 자른 것이라 장면이
 *               셈한다. 걸음이 말하는 것은 다음 차례가 어느 꼬리인가 하나다.
 *   cluster     앞머리가 같은 꼬리들이 이룬 구간을 짚는다.
 *               payload 없음 — 구간은 줄에서 나온다. 장면이 `largestSharedHeadRun`
 *               을 제 줄에 대고 셈하므로, 그림과 결론이 같은 자료를 쓴다.
 *   rewind      줄 세우기 전으로 되감는다. 한 걸음씩 다시 볼 때만 발신한다.
 *               payload 없음.
 *
 * 메트릭은 없다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AllSuffixesSortedData = {
  type: 'all-suffixes-sorted';
  /** 꼬리를 뗄 원본 문자열. */
  text: string;
  /** 걸음 사이의 정지 시간(ms). 애니메이션이 끝난 뒤부터 잰다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 820;

/** 한 꼬리 — 어느 자리에서 시작했고 어떤 글자들인지. */
export type Tail = { from: number; text: string };

/** 꼬리 목록 — 자리 0 부터 끝자리까지, 각 자리에서 끝까지 남는 조각. */
export function buildTails(text: string): Tail[] {
  const out: Tail[] = [];
  for (let i = 0; i < text.length; i += 1) {
    out.push({ from: i, text: text.slice(i) });
  }
  return out;
}

/**
 * 사전 순으로 줄 세운다.
 *
 * 앞이 같으면 짧은 쪽이 먼저다 — `a` 가 `ana` 보다 앞이다. 자바스크립트의
 * 문자열 비교가 이미 그 규칙이라 따로 셈하지 않는다.
 */
export function sortTails(tails: readonly Tail[]): Tail[] {
  return [...tails].sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

/** 접미사 배열 — 사전 순으로 늘어놓은 꼬리들의 시작 자리. */
export function computeAllSuffixesSortedResult(data: AllSuffixesSortedData): number[] {
  return sortTails(buildTails(data.text)).map((tail) => tail.from);
}

/**
 * 줄 세우고 나면 앞머리가 같은 꼬리는 반드시 이웃한다. 그렇게 생긴 덩어리 중
 * 가장 큰 것을 고른다 — 줄 세우기의 값어치를 가장 잘 보이는 구간이다.
 *
 * 줄 세우기 자체가 아니라 **줄 세운 결과를 읽는 규칙**이라 내준다. 이 함수를 떼어
 * 내도 꼬리들이 줄 서는 것은 그대로 남는다. 장면이 제 줄에 대고 이것을 부르므로
 * 화면과 결론이 같은 자료를 쓴다 (프로토콜 2-4 절).
 */
export function largestSharedHeadRun(sorted: readonly Tail[]): { ranks: number[]; prefix: string } {
  let best: number[] = [];
  let bestHead = '';
  let run: number[] = [];
  let head = '';
  const settle = (): void => {
    if (run.length > best.length) {
      best = run;
      bestHead = head;
    }
  };
  for (const [rank, tail] of sorted.entries()) {
    const first = tail.text.slice(0, 1);
    if (first !== head) {
      settle();
      run = [];
      head = first;
    }
    run.push(rank);
  }
  settle();
  return { ranks: best, prefix: bestHead };
}

export const allSuffixesSortedAlgorithm = async (
  ctxIn: FacetContext<AllSuffixesSortedData>,
): Promise<void> => {
  const ctx = ctxIn as ReactiveContext<AllSuffixesSortedData>;
  const text = typeof ctx.data.text === 'string' ? ctx.data.text : '';
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  const sorted = sortTails(buildTails(text));

  /** 한 번의 완주. auto 면 스스로 나아가고, 아니면 한 걸음씩 기다린다. */
  const walk = async (auto: boolean): Promise<boolean> => {
    let first = true;
    const gate = async (): Promise<boolean> => {
      // 문은 걸음 *사이*의 것이다. 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece).
      if (first) {
        first = false;
        return !ctx.cancelled;
      }
      if (auto) return ctx.sleep(stepMs);
      for (;;) {
        // 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세이지 않게.
        if ((await ctx.waitForInput()).type === 'advance') return !ctx.cancelled;
      }
    };

    if (!(await gate())) return false;
    await ctx.emit({ type: 'cut-tails' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'align-left' });

    for (const tail of sorted) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'take-place', payload: { from: tail.from } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'cluster' });
    return true;
  };

  if (!(await walk(true))) return;

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 기다린다.
  for (;;) {
    if (ctx.cancelled) return;
    if ((await ctx.waitForInput()).type !== 'advance') continue;
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 — 첫 걸음까지 보인다.
    await ctx.emit({ type: 'rewind' });
    if (!(await walk(false))) return;
  }
};
