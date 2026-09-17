/**
 * 고르지 않은 눈금 — float32 에서 어떤 수와 바로 다음 수 사이가 얼마나 벌어지는가.
 *
 * 선언이 주는 것은 볼 지점(1 · 2 · 16 · 1024 · 65536)뿐이다. 사이 거리는 여기서
 * **실제로 잰다** — 비트열을 1 올린 수에서 원래 수를 뺀다 (`nextFloat32`). 배수도
 * 한 구간에 드는 값의 개수도 그 잰 거리에서 나온다. 지어낸 수는 하나도 싣지 않는다.
 *
 * ── 재는 자는 내주고, 발신은 빈손으로 보낸다
 *
 * 화면에는 사이 거리 · 배수 · 빗살 개수 · 구간의 값 개수가 그림과 나란히 뜬다. 그
 * 수를 걸음에 실어 보내면 그림과 수의 출처가 둘이 되어 언젠가 갈린다. 그래서 재는
 * 함수를 `export` 하고 **장면이 같은 함수를 부른다** (프로토콜 4 절의 B 갈래).
 * 지점 하나가 정해지면 나머지가 전부 결정되므로 발신은 *어느 지점 차례인가*만
 * 말하면 된다 — **다섯 발신 모두 payload 가 없다.**
 *
 * 내주어도 조각이 피하려는 셈을 장면이 대신 하게 되지 않는다. `gapAt` 은 셈이
 * 아니라 **자**이고, 떼어 내도 "수가 클수록 이웃이 멀다" 는 주장은 그대로 남는다.
 *
 * ── 이벤트 (전부 시각 변화가 있으므로 silent 를 붙이지 않는다)
 *
 *   anchor  페이로드 없음. 첫 지점. 이 사이 거리를 한 눈금으로 삼는다.
 *   widen   페이로드 없음. 다음 지점. 몇 번째인지는 발신이 온 차례가 말한다.
 *   count   페이로드 없음. 마지막 지점에서 그 두 배까지의 구간을 말한다.
 *   rewind  페이로드 없음. 처음으로 되감는다.
 *   done    페이로드 없음. 닫는 말만 바뀐다.
 *
 * 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type UnevenFloatGapsData = {
  type: string;
  /** 볼 지점. 전부 2 의 거듭제곱이다. */
  samples: number[];
  /** 걸음이 끝난 뒤의 정지 시간. 읽을 틈을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 볼 지점 목록을 좁힌다. **좁히는 규칙은 한 벌이다** — 장면도 이 함수를 지난다
 * (S-piece). 새 배열을 내므로 선언의 배열을 참조로 쥐지 않는다 (S-scene).
 */
export function sampleLadder(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    : [];
}

/**
 * 비트열을 1 올린 수 — float32 에서 바로 다음에 오는 수다.
 *
 * 지수에서 셈해도 같은 값이 나오지만(거리 = 2^(지수-23)), 재서 얻은 것과 셈해서
 * 얻은 것은 다른 물건이다. 화면에 뜨는 수는 잰 쪽이어야 한다.
 */
const probe = new Float32Array(1);
const probeBits = new Uint32Array(probe.buffer);

export function nextFloat32(x: number): number {
  probe[0] = x;
  probeBits[0] += 1;
  return probe[0];
}

/** 이 자리의 사이 거리. 잰 값이다. */
export function gapAt(x: number): number {
  return nextFloat32(x) - x;
}

/** 사이 거리를 2 의 거듭제곱으로 적을 때의 지수. 표기가 이것을 쓴다. */
export function gapExponentAt(x: number): number {
  return Math.round(Math.log2(gapAt(x)));
}

/**
 * `x` 에서 `2x` 까지의 구간에 드는 값의 개수.
 *
 * 선언의 가수 비트 수로 `2 ** 23` 을 적어 두면 그림과 다른 출처가 된다. 구간의 폭
 * (`2x - x` 는 곧 `x`)을 **그 자리의 사이 거리**로 나눈다 — 화면의 빗살과 같은 자다.
 */
export function valuesPerSpan(x: number): number {
  return x / gapAt(x);
}

export async function unevenFloatGapsAlgorithm(
  ctx: FacetContext<UnevenFloatGapsData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<UnevenFloatGapsData>;
  const samples = sampleLadder(rc.data.samples);
  if (samples.length === 0) return;

  const stepMs = rc.data.stepMs;
  // 지점마다 한 걸음, 개수를 말하는 걸음 하나, 닫는 걸음 하나.
  const stepCount = samples.length + 2;

  async function stepAt(i: number): Promise<void> {
    if (i === samples.length) {
      await ctx.emit({ type: 'count' });
      return;
    }
    if (i > samples.length) {
      await ctx.emit({ type: 'done' });
      return;
    }
    // 첫 지점은 눈금의 기준이 되고, 그 뒤는 앞 눈금과 견주어진다. 어느 지점인지는
    // 발신이 온 차례가 말하므로 싣지 않는다 (프로토콜 4 절).
    //
    // payload 를 걷어내고 나면 두 갈래의 본문이 같아져 삼항으로 합치고 싶어지는데,
    // 그러면 `type` 이 리터럴이 아니게 되어 C2 MUST NOT 을 어긴다. 어휘를 grep 으로
    // 찾을 수 없게 되는 것이 그 규칙의 까닭이다. 두 줄로 편다.
    if (i === 0) {
      await ctx.emit({ type: 'anchor' });
      return;
    }
    await ctx.emit({ type: 'widen' });
  }

  /**
   * 걸음을 처음부터 끝까지 굴린다.
   *
   * 문(gate)은 걸음 **사이**에만 둔다 — 첫 걸음 앞에 두면 stepMs 만큼 빈 화면이
   * 먼저 보이고, 조각이 여럿 박힌 글에서는 그 빈 화면이 여럿 겹친다 (S-piece).
   */
  async function play(gate: () => Promise<boolean>): Promise<boolean> {
    for (let i = 0; i < stepCount; i += 1) {
      if (ctx.cancelled) return false;
      await stepAt(i);
      if (ctx.cancelled) return false;
      if (i < stepCount - 1 && !(await gate())) return false;
    }
    return true;
  }

  /** advance 만 걸음으로 센다. 위젯 입력이 붙어도 걸음이 어긋나지 않게 (S-piece). */
  async function waitForAdvance(): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rc.waitForInput();
      } catch {
        return false; // 취소되면 reject 된다
      }
      if (input.type === 'advance') return true;
    }
  }

  // 처음 한 바퀴는 스스로 굴러가고, 그 뒤로는 누를 때마다 한 걸음씩이다.
  // 끝에서 한 번 더 누르면 되감아 첫 걸음까지 간다.
  let gate: () => Promise<boolean> = () => rc.sleep(stepMs);
  for (;;) {
    if (!(await play(gate))) return;
    if (!(await waitForAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    gate = waitForAdvance;
  }
}
