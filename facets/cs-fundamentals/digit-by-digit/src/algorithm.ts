/**
 * digit-by-digit — 자릿수 정렬(LSD 기수 정렬) 조각.
 *
 * 한 자리씩만 보고 줄 세우기를 되풀이하면 전체가 줄 선다. 낮은 자리부터 하고
 * 라운드마다 앞 라운드의 순서를 뒤엎지 않으면(같은 통 안은 들어온 차례 그대로),
 * 마지막 자리를 마쳤을 때 줄이 다 서 있다.
 *
 * ── 식별자
 * payload 의 `ids` 는 **초기 배열에서의 자리**(0..n-1)다. 라운드가 바뀌어 줄
 * 순서가 흩어져도 같은 수는 같은 id 를 지킨다. `target` 은 쓰지 않는다 — 이
 * 조각의 걸음은 줄 하나를 통째로 옮기는 일이라 낱개로 가리킬 대상이 없다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장, silent 아님)
 * `focus-place`  { round, total, place, column }
 *     보는 자리가 옮겨 간다. place 는 자리값(1 · 10 · 100), column 은 왼쪽부터
 *     센 글자 칸 번호. 라운드마다 오른쪽에서 왼쪽으로 한 칸 옮겨 간다.
 * `scatter`      { round, place, ids, bins, slots }
 *     줄 전체가 통으로 내려간다. ids[k] 가 bins[k] 번 통의 slots[k] 번째 칸에
 *     놓인다. ids 는 **내려가기 직전 줄 순서**라 같은 통에 들어가는 차례가
 *     곧 안정성이다.
 * `gather`       { round, place, column, ids, digits }
 *     통을 0 부터 9 까지 읽어 다시 줄로 올린다. ids 는 새 줄 순서, digits[k] 는
 *     그 수의 이번 라운드 자릿수 (오름차순임을 화면이 보인다).
 * `done`         { rounds }
 * `rewind`       {}  — advance 로 처음부터 되짚을 때 화면을 초기 상태로 되돌린다.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DigitByDigitData = {
  type: 'digit-by-digit';
  /** 줄 세울 수. 음수는 다루지 않는다. */
  values: number[];
  /** 걸음 사이에 두는 읽을 시간 (ms). 저작 선언 (S-piece). */
  stepMs: number;
};

/** 한 수가 이번 라운드에 들어갈 통과 그 통 안에서의 칸 번호. */
export type DigitPlacement = { id: number; bin: number; slot: number };

/** 라운드 하나의 결과 — 어디로 흩어졌고 어떤 줄로 모였는가. */
export type DigitRound = {
  /** 자리값. 1 → 10 → 100 순으로 커진다. */
  place: number;
  /** 왼쪽부터 센 글자 칸 번호. place 가 커질수록 왼쪽으로 옮겨 간다. */
  column: number;
  /** 흩어짐. 내려가기 직전 줄 순서대로 담긴다. */
  scatter: DigitPlacement[];
  /** 라운드 뒤의 줄 순서 (id). */
  order: number[];
  /** order 와 짝 — 그 수의 이번 라운드 자릿수. */
  digits: number[];
};

/** 가장 긴 수의 자릿수. 라운드 수이기도 하다. */
function digitWidth(values: number[]): number {
  let w = 1;
  for (const v of values) {
    const len = String(Math.trunc(Math.abs(v))).length;
    if (len > w) w = len;
  }
  return w;
}

function digitAt(value: number, place: number): number {
  return Math.floor(Math.trunc(Math.abs(value)) / place) % 10;
}

/**
 * 라운드 전부를 미리 셈한다 (순수 함수).
 *
 * 통은 언제나 0..9 열 개이고, 각 수는 자기 자릿수가 가리키는 통으로 갈 뿐이다 —
 * 값끼리 견주는 곳이 한 군데도 없다. 통을 0 부터 차례로 이어 붙이면 다음 줄이
 * 되고, 같은 통 안은 들어온 차례를 그대로 지키므로 앞 라운드의 순서가 남는다.
 */
export function computeDigitByDigitRounds(values: number[]): DigitRound[] {
  if (values.length === 0) return [];
  const width = digitWidth(values);
  const rounds: DigitRound[] = [];
  let order = values.map((_, i) => i);

  for (let r = 0; r < width; r += 1) {
    const place = 10 ** r;
    const buckets: number[][] = [];
    for (let b = 0; b < 10; b += 1) buckets.push([]);

    const scatter: DigitPlacement[] = [];
    for (const id of order) {
      const bin = digitAt(values[id] ?? 0, place);
      const bucket = buckets[bin] ?? [];
      scatter.push({ id, bin, slot: bucket.length });
      bucket.push(id);
    }

    const next: number[] = [];
    for (const bucket of buckets) for (const id of bucket) next.push(id);

    rounds.push({
      place,
      column: width - 1 - r,
      scatter,
      order: next,
      digits: next.map((id) => digitAt(values[id] ?? 0, place)),
    });
    order = next;
  }
  return rounds;
}

const FALLBACK_STEP_MS = 800;

/**
 * 자동으로 한 번 재생하고, 그 뒤 `advance` 입력마다 처음부터 한 걸음씩 짚는다.
 *
 * 걸음표(`steps`)는 손으로 적은 것이 아니라 **라운드 순회의 결과**다 — 라운드
 * 수는 가장 긴 수의 자릿수가 정하고, 라운드마다 같은 짜임의 세 걸음(보는 자리를
 * 옮긴다 · 흩는다 · 모은다)이 나온다 (S-piece).
 */
export async function digitByDigit(ctx: FacetContext<DigitByDigitData>): Promise<void> {
  const rctx = ctx as ReactiveContext<DigitByDigitData>;
  const values = Array.isArray(rctx.data.values) ? [...rctx.data.values] : [];
  const stepMs = Number.isFinite(rctx.data.stepMs) ? rctx.data.stepMs : FALLBACK_STEP_MS;
  const rounds = computeDigitByDigitRounds(values);

  const steps: Array<() => Promise<void>> = [];
  for (let r = 0; r < rounds.length; r += 1) {
    const round = rounds[r];
    if (!round) continue;
    const roundNo = r + 1;
    steps.push(async () => {
      await rctx.emit({
        type: 'focus-place',
        payload: {
          round: roundNo,
          total: rounds.length,
          place: round.place,
          column: round.column,
        },
      });
    });
    steps.push(async () => {
      await rctx.emit({
        type: 'scatter',
        payload: {
          round: roundNo,
          place: round.place,
          ids: round.scatter.map((p) => p.id),
          bins: round.scatter.map((p) => p.bin),
          slots: round.scatter.map((p) => p.slot),
        },
      });
    });
    steps.push(async () => {
      await rctx.emit({
        type: 'gather',
        payload: {
          round: roundNo,
          place: round.place,
          column: round.column,
          ids: round.order,
          digits: round.digits,
        },
      });
    });
  }
  steps.push(async () => {
    await rctx.emit({ type: 'done', payload: { rounds: rounds.length } });
  });

  // 자동 재생 — 누르지 않아도 화면이 할 말을 마친다.
  //
  // 읽을 시간은 걸음 **앞** 에 둔다. 뒤에 두면 첫 걸음이 mount 와 동시에 터져
  // 시작 줄을 볼 틈이 없고, 마지막 걸음 뒤에는 아무도 기다리지 않는 빈 박자가
  // 남는다.
  for (const step of steps) {
    if (rctx.cancelled) return;
    if (!(await rctx.sleep(stepMs))) return;
    await step();
  }

  // 마친 뒤 곱씹는 사람을 위해. 끝난 상태에서 처음 누르는 advance 는 되감고
  // 첫 걸음까지 보인다 — 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다.
  let cursor = steps.length;
  for (;;) {
    if (rctx.cancelled) return;
    let input;
    try {
      input = await rctx.waitForInput();
    } catch {
      return;
    }
    if (input.type !== 'advance') continue;
    if (cursor >= steps.length) {
      await rctx.emit({ type: 'rewind', payload: {} });
      cursor = 0;
    }
    const step = steps[cursor];
    if (!step) return;
    await step();
    cursor += 1;
  }
}
