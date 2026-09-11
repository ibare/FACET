/**
 * zAlgorithm — 자리마다 맨 앞과 겹치는 길이를 한 번 구해 두면, 문자열 찾기가
 * 거기서 떨어져 나온다.
 *
 * 찾는 것 `P` 와 글 `T` 를 칸막이 하나로 이어 `P$T` 를 만든다. 이 이은 글의
 * Z 배열에서 **값이 `|P|` 인 자리가 곧 등장 자리**다 — 칸막이가 둘 어디에도
 * 없는 글자라 겹침이 칸막이를 넘을 수 없고, 그래서 `|P|` 를 넘는 값도 나올 수
 * 없기 때문이다.
 *
 * 그리고 그 Z 배열을 구하는 일 자체가 이미 구한 답을 되빌려 쓴다. 여태 찾은
 * 것 중 가장 오른쪽까지 닿는 겹침 구간 `[left, right]` 를 들고 다니며, 그 안의
 * 자리는 거울 자리의 답을 가져온다.
 *
 * ── 갈래가 둘로 갈리는 자리 (이 방법이 틀리지 않는 까닭)
 *
 * 빌린 값이 구간 끝에 **닿으면** 그 너머는 확인된 적이 없으므로 실제로 견뤄야
 * 한다. 닿지 않으면 빌린 값이 곧 답이다. 두 경우와 "구간 밖" 까지 **조건 하나가
 * 다 덮는다** — `i + k > right`. 구간 밖이면 `right < i` 라 늘 참이고, 구간
 * 안이면 `k` 가 남은 길이에 닿았을 때만 참이다. irs.ts 가 같은 식을 적는다.
 *
 * ── 손잡이 (reactive)
 *
 * 독자가 **글의 반복성** 을 1~4 단으로 민다. 찾는 것은 그대로 두고 글만 바뀐다.
 * 되풀이가 늘수록 빌려오기와 아낀 비교가 함께 는다 (실측: 9→11→13→14 ·
 * 12→16→20→22).
 *
 * ── 1차 데이터 (facet.ts 의 initialData)
 *   pattern · separator · texts · level · stepMs
 * Z 배열 · 등장 자리 · 빌려온 횟수 · 아낀 비교는 전부 여기서 셈한다.
 *
 * ── 이벤트 어휘 (C2) — `done` 과 `phase` 밖은 전부 이 facet 고유 확장이다.
 *   'text-chosen'   { level, pattern, separator, text, joined }
 *                   이번 단의 글이 정해져 화면을 다시 짓는다. silent 아님.
 *   'whole-prefix'  { index, value }
 *                   맨 앞 자리. 이은 글 전체가 곧 맨 앞과의 겹침이다. silent 아님.
 *   'mirror'        { index, from, value }
 *                   구간 안이라 거울 자리 from 의 답을 빌린다. value 는 실제로
 *                   빌린 만큼 — 구간 끝을 넘는 몫은 빌리지 않는다. silent 아님.
 *   'scan'          { index, start, value, mismatch, inside }
 *                   실제로 글자를 견준다. start 가 0 보다 크면 빌린 뒤 이어서
 *                   견주는 갈래다 (inside 가 참). silent 아님.
 *   'window'        { left, right }
 *                   겹침이 여태보다 오른쪽에 닿아 구간을 옮긴다. silent 아님.
 *   'match'         { at, index }
 *                   Z 값이 |P| 와 같아 등장 자리 하나가 떨어져 나왔다.
 *                   at 은 글에서의 자리, index 는 이은 글에서의 자리. silent 아님.
 *   'summary'       { level, borrows, saved, matches, zCompares, naiveCompares }
 *                   이번 단의 셈이 끝났다. silent 아님.
 *   'done'          { level }            표준 이벤트. silent 아님.
 *   'phase'         { phase }            메타 이벤트. silent: true.
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'whole' | 'borrow' | 'scan' | 'window' | 'collect'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   'borrow-count' · 'saved-compare-count' · 'match-count'
 *   셋 다 단마다 0 에서 다시 센다 — 손잡이를 미는 것은 같은 물음을 다른 글에
 *   다시 묻는 일이지 이어 세는 일이 아니다.
 *
 * ── 사용자 입력 (reactive)
 *   { type: 'repeat', payload: { value: 1|2|3|4 } }
 *   control-bar 의 segmented-slider 가 내고 러너가 dispatch 로 넘긴다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ZAlgorithmData = {
  type: string;
  /** 찾는 것. 네 단이 모두 같은 것을 찾는다 — 손잡이가 바꾸는 것은 글이다. */
  pattern: string;
  /** 찾는 것과 글을 가르는 칸막이. 둘 어디에도 없는 글자라야 한다. */
  separator: string;
  /** 되풀이가 늘어나는 차례로 늘어놓은 글. 1차 데이터다. */
  texts: string[];
  /** 지금 몇 단인가 (1 … texts.length). 손잡이가 민다. */
  level: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 한 걸음의 뜻. 화면과 계측이 같은 것을 보게 하려고 한 곳에서 낸다. */
export type ZStep =
  | { kind: 'whole'; index: number; value: number; savedTotal?: number }
  | { kind: 'borrow'; index: number; from: number; value: number; savedTotal?: number }
  | {
      kind: 'scan';
      index: number;
      start: number;
      value: number;
      mismatch: boolean;
      /** 구간 안에서 빌린 뒤 이어 견주는 갈래인가. */
      inside: boolean;
      savedTotal?: number;
    }
  | { kind: 'window'; left: number; right: number; savedTotal?: number };

export type ZTrace = {
  steps: ZStep[];
  z: number[];
  borrows: number;
  compares: number;
};

/**
 * 이은 글의 Z 배열을 셈하면서 걸음과 계측을 함께 낸다.
 *
 * **화면도 요약도 테스트도 이 함수 하나만 본다.** 애니메이션용 루프를 따로 두면
 * 둘이 말없이 어긋나고, 그때 화면은 멀쩡해 보인다.
 */
export function zTrace(joined: string): ZTrace {
  const n = joined.length;
  const z = new Array<number>(n).fill(0);
  const steps: ZStep[] = [];
  let borrows = 0;
  let compares = 0;
  /** 여태 아낀 비교의 누계. 걸음마다 올라야 손잡이의 논증이 화면에서 보인다. */
  let savedSoFar = 0;
  if (n === 0) return { steps, z, borrows, compares };

  z[0] = n;
  steps.push({ kind: 'whole', index: 0, value: n });

  // 아직 겹침 구간이 없다 — right 가 left 보다 작으면 빈 구간이다.
  let left = 0;
  let right = -1;

  for (let i = 1; i < n; i += 1) {
    const inside = i <= right;
    let k = 0;
    /** 이 자리에서 실제로 치른 비교. 곧은 방법과의 차가 곧 아낀 몫이다. */
    let costHere = 0;

    if (inside) {
      const from = i - left;
      // 구간 끝을 넘는 몫은 확인된 적이 없으므로 빌리지 않는다.
      const limit = right - i + 1;
      const borrowed = z[from] ?? 0;
      k = borrowed < limit ? borrowed : limit;
      borrows += 1;
      steps.push({ kind: 'borrow', index: i, from, value: k });
    }

    // 구간 밖이거나, 빌린 것이 구간 끝에 닿았을 때만 실제로 견준다.
    // 구간 밖이면 right < i 라 이 조건이 늘 참이다 — 조건 하나가 둘을 덮는다.
    if (i + k > right) {
      const start = k;
      let m = k;
      while (i + m < n) {
        compares += 1;
        costHere += 1;
        if (joined[m] === joined[i + m]) m += 1;
        else break;
      }
      steps.push({ kind: 'scan', index: i, start, value: m, mismatch: i + m < n, inside });
      k = m;
    }

    z[i] = k;

    /*
     * 이 자리의 답이 정해졌다. 곧은 방법이라면 맞은 만큼(k) 견주고, 글 끝에
     * 닿지 않았다면 어긋난 한 번을 더 견뎠을 것이다. 실제로 치른 것과의 차가
     * 이 자리에서 아낀 몫이고, 셈해 보면 그것이 정확히 **빌려 온 만큼**이다.
     *
     * 걸음마다 올려 두는 까닭은 계측이 논증과 같은 속도로 움직여야 하기
     * 때문이다 — 마지막에 한 번에 튀면 재생 내내 0 으로 보인다.
     */
    const naiveHere = k + (i + k < n ? 1 : 0);
    savedSoFar += naiveHere - costHere;
    const concluding = steps[steps.length - 1];
    if (concluding !== undefined) concluding.savedTotal = savedSoFar;

    if (k > 0 && i + k - 1 > right) {
      left = i;
      right = i + k - 1;
      steps.push({ kind: 'window', left, right });
    }
  }

  return { steps, z, borrows, compares };
}

/**
 * 곧은 방법 — 자리마다 맨 앞으로 돌아가 글자를 하나씩 견준다.
 *
 * "아낀 비교" 의 기준선이다. **재는 단위는 글자 견줌 한 번**이고, 빠른 쪽의
 * `compares` 와 **글자 그대로 같은 단위**다:
 *
 *   - 같은 이은 글에서 잰다.
 *   - 같은 자리 범위를 돈다 (`i = 1 … n-1`). 한쪽만 더 읽는 꼬리가 없다.
 *   - 같은 식 `joined[m] === joined[i + m]` 을 한 번 셀 때마다 1 을 더한다.
 *
 * **단위가 갈리면 대비가 통째로 거짓이 된다.** 자리 단위와 글자 단위를 섞으면
 * 한쪽만 꼬리를 더 읽어 수가 벌어지기 때문이다. 그래서 Z 배열도 함께 돌려준다 —
 * 두 방법이 **같은 표**를 낸다는 것이 곧 같은 범위를 같은 뜻으로 돌았다는
 * 증거이고, 테스트가 그것을 네 단 전부에서 잠근다.
 */
export function naiveZ(joined: string): { z: number[]; compares: number } {
  const n = joined.length;
  const z = new Array<number>(n).fill(0);
  let compares = 0;
  if (n === 0) return { z, compares };

  z[0] = n;
  for (let i = 1; i < n; i += 1) {
    let m = 0;
    while (i + m < n) {
      compares += 1;
      if (joined[m] === joined[i + m]) m += 1;
      else break;
    }
    z[i] = m;
  }
  return { z, compares };
}

/**
 * Z 배열에서 등장 자리를 거둔다.
 *
 * 값이 패턴 길이와 꼭 같은 자리가 등장 자리다. 칸막이가 둘 어디에도 없는
 * 글자라 그보다 큰 값은 나올 수 없다.
 *
 * @returns 글에서의 자리 (이은 글의 자리가 아니다).
 */
export function zHits(z: readonly number[], patternLen: number, sepLen: number): number[] {
  const out: number[] = [];
  const off = patternLen + sepLen;
  for (let i = off; i < z.length; i += 1) {
    if (z[i] === patternLen) out.push(i - off);
  }
  return out;
}

/** 이번 단의 이은 글. 화면·IR·테스트가 모두 이 한 줄을 본다. */
export function joinedOf(pattern: string, separator: string, text: string): string {
  return pattern + separator + text;
}

/** 손잡이가 보낸 입력에서 단을 읽는다. 모르는 값이면 null. */
function readLevel(input: ReactiveInputEvent, count: number): number | null {
  if (input.type !== 'repeat') return null;
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  // 가드가 뒤따르는 좁히개다 — 꺼낸 값을 아래에서 거른다 (C9).
  const raw = (p as Record<string, unknown>)['value'];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const level = Math.trunc(n);
  return level >= 1 && level <= count ? level : null;
}

export const zAlgorithmAlgorithm = async (ctx: FacetContext<ZAlgorithmData>): Promise<void> => {
  // reactive 메커니즘이 주입하는 확장 컨텍스트. registerAlgorithm 의 시그니처는
  // FacetContext 그대로라 여기서 단언한다 (context.ts 의 규약).
  const rc = ctx as ReactiveContext<ZAlgorithmData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 다른
   * 글로 가는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 단부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 단의 수를 보이게 한다.
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const beat = (ratio: number): Promise<boolean> =>
    rc.sleep(Math.max(30, ctx.data.stepMs * ratio));

  /** 한 단. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    const pattern = typeof data.pattern === 'string' ? data.pattern : '';
    const separator = typeof data.separator === 'string' ? data.separator : '$';
    const texts = Array.isArray(data.texts) ? data.texts : [];
    if (texts.length === 0 || pattern === '') return true;

    const level = Math.min(Math.max(1, Math.trunc(data.level)), texts.length);
    const text = texts[level - 1] ?? '';
    const joined = joinedOf(pattern, separator, text);

    const { steps, z, borrows, compares } = zTrace(joined);
    const saved = naiveZ(joined).compares - compares;
    const hits = zHits(z, pattern.length, separator.length);

    setMetric('borrow-count', 0);
    setMetric('saved-compare-count', 0);
    setMetric('match-count', 0);

    await ctx.emit({
      type: 'text-chosen',
      payload: { level, pattern, separator, text, joined },
    });
    if (!(await beat(1))) return false;

    let borrowSoFar = 0;

    for (const step of steps) {
      if (ctx.cancelled) return false;

      switch (step.kind) {
        case 'whole': {
          await phase('whole');
          await ctx.emit({
            type: 'whole-prefix',
            target: `index:${step.index}`,
            payload: { index: step.index, value: step.value },
          });
          break;
        }
        case 'borrow': {
          borrowSoFar += 1;
          setMetric('borrow-count', borrowSoFar);
          await phase('borrow');
          await ctx.emit({
            type: 'mirror',
            target: `index:${step.index}`,
            payload: { index: step.index, from: step.from, value: step.value },
          });
          break;
        }
        case 'scan': {
          await phase('scan');
          await ctx.emit({
            type: 'scan',
            target: `index:${step.index}`,
            payload: {
              index: step.index,
              start: step.start,
              value: step.value,
              mismatch: step.mismatch,
              inside: step.inside,
            },
          });
          break;
        }
        case 'window': {
          await phase('window');
          await ctx.emit({
            type: 'window',
            payload: { left: step.left, right: step.right },
          });
          break;
        }
      }

      // 아낀 비교도 걸음마다 올린다. 이 수가 재생 내내 0 이면 "빌릴수록 덜
      // 견준다" 는 손잡이의 논증이 화면 어디에도 보이지 않는다.
      if (step.savedTotal !== undefined) setMetric('saved-compare-count', step.savedTotal);

      if (!(await beat(1))) return false;
    }

    // 표가 다 찼다. 이제 값이 |P| 인 자리를 거두면 그것이 곧 등장 자리다.
    await phase('collect');
    const off = pattern.length + separator.length;
    for (const [n, at] of hits.entries()) {
      if (ctx.cancelled) return false;
      setMetric('match-count', n + 1);
      await ctx.emit({
        type: 'match',
        target: `index:${at + off}`,
        payload: { at, index: at + off },
      });
      if (!(await beat(1.2))) return false;
    }

    setMetric('borrow-count', borrows);
    setMetric('saved-compare-count', saved);
    setMetric('match-count', hits.length);

    await ctx.emit({
      type: 'summary',
      payload: {
        level,
        borrows,
        saved,
        matches: hits.length,
        zCompares: compares,
        naiveCompares: compares + saved,
      },
    });
    if (!(await beat(1.4))) return false;

    await ctx.emit({ type: 'done', payload: { level } });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await runOnce())) return;

      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      const next = readLevel(input, ctx.data.texts.length);
      if (next !== null) ctx.data.level = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
