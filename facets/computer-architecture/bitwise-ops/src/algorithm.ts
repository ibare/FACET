/**
 * bitwiseOps — 비트 연산은 자리마다 독립적으로, 그러나 한꺼번에 일어난다.
 *
 * 여덟 자리가 서로를 모른 채 같은 규칙을 각자 적용하고, 그 결과가 모여 하나의
 * 수가 된다. 자리끼리 영향을 주고받는 것은 자리 옮기기(shift)뿐이고, 그때도
 * 규칙은 "옆으로 간다" 하나다 — 각 자리가 제자리 대신 이웃 자리를 읽을 뿐이다.
 *
 * ── 식별자 (C1)
 *   bit:<i>   자리 하나. i 는 **왼쪽부터** 센 번호 (0 = 맨 왼쪽 = 가장 무거운 자리).
 *             표준 prefix (index / node / edge / queue / list / tree) 에 뜻이 맞는
 *             것이 없어 새로 지었다. 자리는 배열 칸이 아니라 무게를 지닌 자리다.
 *
 * ── 이벤트 (C2)
 *   state-changed  { opIndex, width, a, b, aBits, bBits, binary, shift }
 *                  연산이 바뀌어 장면을 처음부터 다시 세운다. silent 아님.
 *   highlight      target 'bit:<i>'
 *                  { index, weight, srcIndex, aBit, bBit, binary }
 *                  이 자리를 짚고 읽어 올 자리를 보인다. srcIndex 는 제자리면
 *                  index 와 같고, 여덟 자리 밖이라 0 이 들어오면 null. silent 아님.
 *   mark           target 'bit:<i>'
 *                  { index, outBit, weight, runningValue }
 *                  이 자리의 답을 놓는다. runningValue 는 코드 패널의 `result` 와
 *                  같은 값이다 (거기까지 더해진 부분합). silent 아님.
 *   bit-dropped    { index, bit, side: 'left' | 'right' }
 *                  자리 옮기기에서 여덟 자리 밖으로 떨어져 나간 비트. silent 아님.
 *   done           { value, onesCount, flipCount }  silent 아님.
 *   phase          { phase }  — silent: true (C2 · C3)
 *
 * ── phase 어휘 — irs.ts 와 집합이 정확히 일치한다 (C3)
 *   setup · digit · rule · place · done
 *
 * ── 메트릭 — facet.ts 의 metrics[] 와 일치 (C5)
 *   ones-count  결과에서 켜진 비트 수
 *   flip-count  결과가 a 와 달라진 자리 수
 *   둘 다 연산마다 갈린다: 켜진 비트 3·7·4·3·4·5, 달라진 자리 2·2·5·8·5·6.
 *
 * ── 왜 reactive 인가
 *
 * 이 완제품은 손잡이가 논증을 진다 — 같은 두 수에 규칙만 갈아 끼우면 결과가
 * 전부 달라지는 것을 보는 것이 전부다. 그러려면 고른 연산이 algorithm 까지
 * 닿아야 하는데 그 길은 **dispatch → waitForInput 하나뿐**이다 (S-runtime 의
 * 직교 분리).
 *
 * coroutine 으로는 설 수 없다. `CoroutineMechanism.supportedControls` 에 facet
 * 고유 어휘가 없어 `assertControlsSupported` 가 mount 전에 throw 하고, 설령
 * 통과하더라도 `CoroutineMechanism.dispatch` 가 no-op 이라 고른 연산이 영영
 * 도달하지 못한다. 저장소의 `segmented-slider` 를 단 facet 34 종이 모두
 * reactive 인 것도 같은 까닭이다.
 *
 * 재생 셋(play/pause/step)은 `ReactiveMechanism` 이 `ctx.sleep` 의 걸음 경계에서
 * 스스로 지므로 완제품의 표준 컨트롤 묶음을 그대로 쓴다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type BitwiseOpsData = {
  type: string;
  /** 첫째 피연산자. 한 바이트. */
  a: number;
  /** 둘째 피연산자. 한 바이트. NOT 과 자리 옮기기는 쓰지 않는다. */
  b: number;
  /** 자리 폭. */
  width: number;
  /** 연산 식별자. 사람이 읽는 이름은 facet.ts 의 messages 가 진다 (C10). */
  ops: string[];
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (원칙 2). */
  stepMs: number;
};

/** 연산 코드 — `initialData.ops` 의 차례이자 irs.ts 의 `code` 와 같다. */
const OP_AND = 0;
const OP_OR = 1;
const OP_XOR = 2;
const OP_NOT = 3;
const OP_SHL = 4;
const OP_SHR = 5;

/**
 * ── 아래 셋은 irs.ts 의 같은 이름 함수와 글자 그대로 같은 셈이다.
 *
 * 화면이 보이는 값과 코드 패널이 셈하는 값이 어긋나면 그것이 거짓말이고 완제품이
 * 코드 패널을 다는 까닭 자체가 지워진다. 그래서 여기서도 비트 연산자를 쓰지 않고
 * `Math.floor` 나눗셈과 `% 2` 로만 셈한다 — `test/bitwise-ops.test.ts` 가 여섯
 * 연산 전부에서 두 자리의 답을 대조한다.
 */

/** `(value // weight) % 2`. 여덟 자리 밖이면 읽을 것이 없다. */
function digitAt(value: number, weight: number): number {
  if (weight < 1) return 0;
  return Math.floor(value / weight) % 2;
}

/** 어느 자리에서 읽어 오는가 — 자리끼리 영향을 주고받는 유일한 자리. */
function sourceWeightOf(weight: number, code: number): number {
  if (code === OP_SHL) return Math.floor(weight / 2);
  if (code === OP_SHR) return weight * 2;
  return weight;
}

/** 자리 하나에 규칙을 적용한다. 이웃을 인자로 받지 않는다. */
function applyRule(x: number, y: number, code: number): number {
  if (code === OP_AND) return x * y;
  if (code === OP_OR) return x + y - x * y;
  if (code === OP_XOR) return (x + y) % 2;
  if (code === OP_NOT) return 1 - x;
  return x;
}

/** 2^(width-1). IR 에 pow 가 없으므로 여기서도 곱으로 쌓는다. */
export function topWeight(width: number): number {
  let top = 1;
  for (let i = 1; i < width; i += 1) top *= 2;
  return top;
}

/** 왼쪽부터 센 비트 배열 (0 = 가장 무거운 자리). */
export function bitsOf(value: number, width: number): number[] {
  const out: number[] = [];
  let weight = topWeight(width);
  while (weight >= 1) {
    out.push(digitAt(value, weight));
    weight = Math.floor(weight / 2);
  }
  return out;
}

export type BitwiseOpsOutcome = {
  /** 결과 비트, 왼쪽부터. */
  bits: number[];
  value: number;
  onesCount: number;
  /** 결과가 a 와 달라진 자리 수. */
  flipCount: number;
};

/**
 * 한 연산의 결과를 그 자리에서 셈한다. 순수 함수이므로 ctx 를 받지 않는다 (C8 Exception).
 *
 * 비트열 · 결과 · 켜진 비트 수를 선언에 두지 않고 여기서 셈하는 까닭은, 선언에
 * 둔 파생값은 데이터가 바뀔 때 따라오지 못하기 때문이다.
 */
export function computeBitwiseOpsResult(
  data: BitwiseOpsData,
  opIndex: number,
): BitwiseOpsOutcome {
  const { a, b, width } = data;
  const aBits = bitsOf(a, width);
  const bits: number[] = [];
  let value = 0;
  let onesCount = 0;
  let flipCount = 0;

  let weight = topWeight(width);
  let index = 0;
  while (weight >= 1) {
    const src = sourceWeightOf(weight, opIndex);
    const x = digitAt(a, src);
    const y = digitAt(b, weight);
    const z = applyRule(x, y, opIndex);
    value += z * weight;
    bits.push(z);
    if (z === 1) onesCount += 1;
    if (z !== aBits[index]) flipCount += 1;
    weight = Math.floor(weight / 2);
    index += 1;
  }

  return { bits, value, onesCount, flipCount };
}

/** 한 번의 재생이 어떻게 끝났는가. 갈림과 취소를 한 값에 겹치지 않는다 (C8). */
type PassOutcome =
  | { kind: 'done' }
  | { kind: 'switch'; opIndex: number }
  | { kind: 'cancelled' };

/** segmented-slider 가 실어 보낸 연산 번호를 꺼낸다 (C9 — 가드 뒤에 쓴다). */
function readOpIndex(payload: unknown, count: number): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { value?: unknown; segmentIndex?: unknown };
  const raw = typeof p.value === 'number' ? p.value : p.segmentIndex;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw >= count) return null;
  return raw;
}

export async function bitwiseOpsAlgorithm(
  rawCtx: FacetContext<BitwiseOpsData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<BitwiseOpsData>;
  const data = ctx.data;
  const width = data.width;
  const opCount = data.ops.length;
  const stepMs = data.stepMs;

  /**
   * 지금 계기에 떠 있는 값. `ctx.metric` 은 델타를 더하는 것이라, 연산을 갈아
   * 끼울 때 0 으로 되돌리려면 그만큼 빼 주어야 한다. 되돌리기(reset)와 달리
   * 연산 교체는 mechanism 을 타지 않아 `onMetricsReset` 이 오지 않는다.
   */
  const shown: Record<string, number> = { 'ones-count': 0, 'flip-count': 0 };
  const bump = (name: string, delta: number): void => {
    shown[name] = (shown[name] ?? 0) + delta;
    ctx.metric(name, delta);
  };
  const clear = (name: string): void => bump(name, -(shown[name] ?? 0));

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const gate = (): Promise<boolean> => ctx.sleep(stepMs);

  /** 재생 도중 손잡이가 움직였는지 본다. 기다리지 않고 큐만 들여다본다. */
  const peekSwitch = (): number | null => {
    const queued: ReactiveInputEvent | null = ctx.pollInput();
    if (queued === null || queued.type !== 'op') return null;
    return readOpIndex(queued.payload, opCount);
  };

  async function runPass(opIndex: number): Promise<PassOutcome> {
    const outcome = computeBitwiseOpsResult(data, opIndex);
    const aBits = bitsOf(data.a, width);
    const bBits = bitsOf(data.b, width);
    const binary = opIndex === OP_AND || opIndex === OP_OR || opIndex === OP_XOR;
    const shift = opIndex === OP_SHL ? 'left' : opIndex === OP_SHR ? 'right' : null;

    clear('ones-count');
    clear('flip-count');

    await phase('setup');
    // 장면은 한꺼번에 선다 — 여기에 문을 두면 빈 화면이 먼저 보인다.
    await ctx.emit({
      type: 'state-changed',
      payload: { opIndex, width, a: data.a, b: data.b, aBits, bBits, binary, shift },
    });

    const top = topWeight(width);
    let weight = top;
    let runningValue = 0;

    for (let index = 0; index < width; index += 1) {
      if (ctx.cancelled) return { kind: 'cancelled' };

      const pending = peekSwitch();
      if (pending !== null) return { kind: 'switch', opIndex: pending };

      const srcWeight = sourceWeightOf(weight, opIndex);
      // 읽어 오는 자리의 번호. 여덟 자리 밖이면 읽을 이웃이 없다는 뜻이라 null.
      const srcIndex =
        srcWeight < 1 || srcWeight > top ? null : index + (opIndex === OP_SHL ? 1 : opIndex === OP_SHR ? -1 : 0);
      const x = digitAt(data.a, srcWeight);
      const y = digitAt(data.b, weight);

      await phase('digit');
      await ctx.emit({
        type: 'highlight',
        target: `bit:${index}`,
        payload: { index, weight, srcIndex, aBit: x, bBit: y, binary },
      });
      if (!(await gate())) return { kind: 'cancelled' };

      const z = applyRule(x, y, opIndex);
      runningValue += z * weight;

      await phase('rule');
      await phase('place');
      await ctx.emit({
        type: 'mark',
        target: `bit:${index}`,
        payload: { index, outBit: z, weight, runningValue },
      });
      if (z === 1) bump('ones-count', 1);
      if (z !== aBits[index]) bump('flip-count', 1);
      if (!(await gate())) return { kind: 'cancelled' };

      weight = Math.floor(weight / 2);
    }

    if (shift !== null) {
      // 여덟 자리 밖으로 밀려난 비트. 왼쪽으로 가면 맨 왼쪽이, 오른쪽으로 가면
      // 맨 오른쪽이 떨어진다.
      const droppedIndex = shift === 'left' ? 0 : width - 1;
      await ctx.emit({
        type: 'bit-dropped',
        payload: { index: droppedIndex, bit: aBits[droppedIndex] ?? 0, side: shift },
      });
      if (!(await gate())) return { kind: 'cancelled' };
    }

    await phase('done');
    await ctx.emit({
      type: 'done',
      payload: {
        value: outcome.value,
        onesCount: outcome.onesCount,
        flipCount: outcome.flipCount,
      },
    });
    return { kind: 'done' };
  }

  try {
    let opIndex = 0;
    for (;;) {
      if (ctx.cancelled) return;

      const outcome = await runPass(opIndex);
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'switch') {
        opIndex = outcome.opIndex;
        continue;
      }

      // 재생이 끝났다. 손잡이가 움직일 때까지 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        // 받은 것의 종류를 본다 — 위젯 입력이 붙으면 그것까지 걸음으로 세게 된다.
        if (input.type !== 'op') continue;
        const next = readOpIndex(input.payload, opCount);
        if (next === null) continue;
        opIndex = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6 · C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
