/**
 * negate-and-add-one — 2의 보수 만들기.
 *
 * 답하는 질문 하나: 뒤집고 하나 더하면 왜 음수가 되는가.
 *
 * 1차 데이터는 수 하나와 비트 폭 하나뿐이다 (`value` · `width`). 뒤집은 자리표도,
 * 1 을 더한 결과도, 검산의 합도 전부 여기서 셈한다 — 화면에 뜰 값을 선언에 적어
 * 두면 수나 폭을 바꿀 때 그것만 옛 값으로 남는다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 하나도 없다 — 여섯 다 화면이 바뀐다)
 *
 * 걸음은 **자리표**와 **판정**만 싣는다. 화면에 뜨는 수(부호 없이 읽은 값 · 2의
 * 보수로 읽은 값)는 싣지 않는다 — 자리표에서 나오는 값이라 장면이 `unsignedOf` ·
 * `signedOf` 를 불러 센다. 실어 보내면 같은 물음에 답이 둘이 되고, 다음 사람이
 * 집어 쓸 문이 열린 채로 남는다.
 *
 *   show-value  { bits: number[] }
 *       자리표를 세운다. `bits` 는 MSB → LSB 순.
 *
 *   flip-all    { bits: number[] }
 *       모든 자리가 반대가 된다. `bits` 는 뒤집은 뒤의 것이다.
 *
 *   add-one     { bits: number[]; carrySteps: number; carryOut: boolean }
 *       1 을 더한다. `carrySteps` 는 자리올림이 훑고 지나간 칸 수,
 *       `carryOut` 은 그것이 폭 밖으로 나갔는지 — 둘 다 이 덧셈이 내리는 판정이라
 *       자리표만 보아서는 나오지 않는다.
 *
 *   verify      { sum: number[]; carrySteps: number; carryOut: boolean }
 *       원래 수를 도로 더해 본다. `sum` 은 폭 안에 남는 자리들이고 `carrySteps` ·
 *       `carryOut` 은 위와 같은 뜻이다. 더한 원래 수는 싣지 않는다 — 장면이 이미
 *       `show-value` 로 쥐고 있다.
 *
 *   done        (payload 없음)
 *       합이 0 이라는 것이 곧 음수라는 뜻. 그 값은 장면이 자리표에서 읽는다.
 *
 *   rewind      (payload 없음)
 *       처음으로 되돌린다. `advance` 를 받아 다시 짚어 갈 때 맨 앞에 나간다.
 *
 * ── 메트릭 없음. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NegateAndAddOneData = {
  type: string;
  /** 음수로 만들 양수. */
  value: number;
  /** 자리표의 비트 폭. */
  width: number;
  /** 걸음 사이의 정지 시간(ms). 그림의 애니메이션이 끝난 뒤부터 센다. */
  stepMs: number;
};

/** 선언이 성치 않을 때 기댈 자리. `facet.ts` 의 `initialData` 와 같은 값이다. */
const FALLBACK_VALUE = 45;
const FALLBACK_WIDTH = 8;
const FALLBACK_STEP_MS = 750;

function intOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

/** 양수를 폭만큼의 자리표로 편다. MSB 가 앞이다. */
function toBits(value: number, width: number): number[] {
  const bits: number[] = [];
  for (let i = width - 1; i >= 0; i -= 1) bits.push(Math.floor(value / 2 ** i) % 2);
  return bits;
}

function flipBits(bits: number[]): number[] {
  return bits.map((b) => (b === 0 ? 1 : 0));
}

/**
 * 자리표를 부호 없이 읽는다.
 *
 * 읽는 약속은 조각의 알고리즘이 아니라 자리표를 해석하는 규칙이다 — 이 함수만 떼어
 * 내도 "뒤집고 하나 더한다" 는 그대로 남는다. 그래서 값을 실어 보내지 않고 함수를
 * 내준다. `scene.ts` 가 이것을 부른다 (원칙 1 의 허용 방향).
 */
export function unsignedOf(bits: number[]): number {
  return bits.reduce((acc, b) => acc * 2 + b, 0);
}

/** 맨 앞자리가 1 이면 그만큼을 빼고 읽는다 — 그것이 2의 보수다. 위와 같은 까닭으로 내준다. */
export function signedOf(bits: number[]): number {
  const u = unsignedOf(bits);
  return bits[0] === 1 ? u - 2 ** bits.length : u;
}

/**
 * 두 자리표를 더한다.
 *
 * 두 걸음이 이 한 함수를 쓴다 — `+1` 도 검산도 같은 덧셈이고, 자리올림이 한 칸에서
 * 멎느냐 폭 전체를 타고 나가느냐만 다르다. 그 갈림이 이 조각의 볼거리라 계산을
 * 둘로 쪼개 두지 않는다.
 *
 * `carrySteps` 는 자리올림이 실제로 머문 칸 수다. 맨 오른쪽에서 시작해, 더할 것도
 * 받아 온 것도 없는 자리를 만나면 거기서 멎는다.
 */
function addBits(a: number[], b: number[]): { bits: number[]; carrySteps: number; carryOut: boolean } {
  const out = new Array<number>(a.length).fill(0);
  let carry = 0;
  let steps = 0;
  let live = true;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    const addend = b[i] === 1 ? 1 : 0;
    if (live && addend + carry > 0) steps += 1;
    else live = false;
    const sum = (a[i] === 1 ? 1 : 0) + addend + carry;
    out[i] = sum % 2;
    carry = sum > 1 ? 1 : 0;
  }
  return { bits: out, carrySteps: steps, carryOut: carry === 1 };
}

export async function negateAndAddOneAlgorithm(ctx: FacetContext<NegateAndAddOneData>): Promise<void> {
  const rc = ctx as ReactiveContext<NegateAndAddOneData>;

  const width = Math.max(2, Math.min(16, intOr(rc.data?.width, FALLBACK_WIDTH)));
  // 부호 자리를 침범하지 않는 양수만 다룬다 — 뒤집어 음수로 만들 수 있어야 한다.
  const value = Math.max(0, intOr(rc.data?.value, FALLBACK_VALUE)) % 2 ** (width - 1);
  const stepMs = Math.max(0, intOr(rc.data?.stepMs, FALLBACK_STEP_MS));

  const origin = toBits(value, width);
  const flipped = flipBits(origin);
  const added = addBits(flipped, toBits(1, width));
  const check = addBits(added.bits, origin);

  /**
   * 한 벌의 걸음을 처음부터 끝까지 굴린다.
   *
   * `manual` 이면 걸음 사이에서 `advance` 를 기다리고, 아니면 `stepMs` 만큼 쉰다.
   * 자동 재생과 손으로 짚어 가기가 같은 함수를 쓰므로 두 길의 걸음이 어긋날 수 없다.
   */
  async function run(manual: boolean): Promise<void> {
    let first = true;
    const gate = async (): Promise<boolean> => {
      // 첫 걸음 앞에는 기다릴 앞걸음이 없다. 문을 먼저 두면 빈 화면을 한참 보인
      // 뒤에야 그림이 선다 (S-piece). 되감은 직후의 첫 문도 마찬가지로 통과시켜,
      // 처음 누르는 `advance` 가 되감기만 하고 멎는 일이 없게 한다.
      if (first) {
        first = false;
        return !rc.cancelled;
      }
      if (!manual) return rc.sleep(stepMs);
      for (;;) {
        const input = await rc.waitForInput();
        // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 그것까지 걸음으로 세지 않도록.
        if (input.type === 'advance') return !rc.cancelled;
      }
    };

    if (!(await gate())) return;
    await rc.emit({ type: 'show-value', payload: { bits: origin } });

    if (!(await gate())) return;
    await rc.emit({ type: 'flip-all', payload: { bits: flipped } });

    if (!(await gate())) return;
    await rc.emit({
      type: 'add-one',
      payload: {
        bits: added.bits,
        carrySteps: added.carrySteps,
        carryOut: added.carryOut,
      },
    });

    if (!(await gate())) return;
    await rc.emit({
      type: 'verify',
      payload: {
        sum: check.bits,
        carrySteps: check.carrySteps,
        carryOut: check.carryOut,
      },
    });

    if (!(await gate())) return;
    await rc.emit({ type: 'done' });
  }

  await run(false);

  // 자동 재생이 끝났다. 이제부터는 누를 때마다 한 걸음씩 처음부터 다시 짚는다.
  for (;;) {
    if ((await rc.waitForInput()).type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    await run(true);
  }
}
