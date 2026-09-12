/**
 * 고르지 않은 눈금 — float32 에서 어떤 수와 바로 다음 수 사이가 얼마나 벌어지는가.
 *
 * 선언이 주는 것은 볼 지점(1 · 2 · 16 · 1024 · 65536)과 가수 비트 수(23) 뿐이다.
 * 사이 거리는 여기서 **실제로 잰다** — 비트열을 1 올린 수에서 원래 수를 뺀다
 * (`nextFloat32`). 2 의 거듭제곱과 한 구간에 드는 값의 개수도 그 자리에서 셈한다.
 * 지어낸 수는 하나도 싣지 않는다.
 *
 * ── 이벤트 (전부 시각 변화가 있으므로 silent 를 붙이지 않는다)
 *
 *   anchor  { value, next, gap, gapExp }
 *           첫 지점. 이 사이 거리를 한 눈금으로 삼는다.
 *   widen   { value, next, gap, gapExp, k, cumulative }
 *           다음 지점. k 는 앞 지점의 사이 거리의 몇 배인가,
 *           cumulative 는 첫 지점의 사이 거리의 몇 배인가.
 *   count   { count, from, to }
 *           한 수에서 그 두 배까지의 구간에 드는 값의 개수. from ~ to 가 그 구간.
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
  /** float32 의 가수 비트 수. 한 구간에 드는 값의 개수가 여기서 나온다. */
  mantissaBits: number;
  /** 걸음이 끝난 뒤의 정지 시간. 읽을 틈을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 비트열을 1 올린 수 — float32 에서 바로 다음에 오는 수다.
 *
 * 지수에서 셈해도 같은 값이 나오지만(거리 = 2^(지수-23)), 재서 얻은 것과 셈해서
 * 얻은 것은 다른 물건이다. 화면에 뜨는 수는 잰 쪽이어야 한다.
 */
const probe = new Float32Array(1);
const probeBits = new Uint32Array(probe.buffer);

function nextFloat32(x: number): number {
  probe[0] = x;
  probeBits[0] += 1;
  return probe[0];
}

function gapAt(x: number): number {
  return nextFloat32(x) - x;
}

export async function unevenFloatGapsAlgorithm(
  ctx: FacetContext<UnevenFloatGapsData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<UnevenFloatGapsData>;
  const samples = rc.data.samples;
  if (samples.length === 0) return;

  const stepMs = rc.data.stepMs;
  const count = 2 ** rc.data.mantissaBits;
  // 지점마다 한 걸음, 개수를 말하는 걸음 하나, 닫는 걸음 하나.
  const stepCount = samples.length + 2;

  async function stepAt(i: number): Promise<void> {
    if (i === samples.length) {
      const last = samples[samples.length - 1];
      await ctx.emit({ type: 'count', payload: { count, from: last, to: last * 2 } });
      return;
    }
    if (i > samples.length) {
      await ctx.emit({ type: 'done' });
      return;
    }

    const value = samples[i];
    const next = nextFloat32(value);
    const gap = next - value;
    const gapExp = Math.round(Math.log2(gap));

    if (i === 0) {
      await ctx.emit({ type: 'anchor', payload: { value, next, gap, gapExp } });
      return;
    }
    await ctx.emit({
      type: 'widen',
      payload: {
        value,
        next,
        gap,
        gapExp,
        k: gap / gapAt(samples[i - 1]),
        cumulative: gap / gapAt(samples[0]),
      },
    });
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
