/**
 * out-of-bounds 조각(piece) — 번호가 배열의 끝을 넘으면 무슨 일이 벌어지는가.
 *
 * 주소 셈은 인덱스가 배열 길이를 넘어도 멈추지 않는다. 그래서 커서는 배열의
 * 끝을 지나 바로 뒤에 놓인 남의 자리를 가리키고, 거기 있던 값을 그대로 읽는다.
 * 경계 검사가 있으면 그 셈이 자리에 닿기 전에 멈춘다.
 *
 * ── 식별자
 * target 을 쓰지 않는다. 칸은 인덱스 하나로 지목되며 모두 payload 에 담긴다
 * (배열 인덱스 0..length-1 은 배열 안, length 는 배열 바로 뒤의 남의 자리).
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 없음)
 *   address-computed { index, baseHex, stride, addressHex, textKey }
 *       주소 셈이 결과를 냈다. 수식 줄을 갱신한다.
 *   probe-move       { index, addressHex, crossed, textKey }
 *       커서가 그 주소의 칸으로 미끄러져 간다. crossed 면 배열의 끝을 넘은 것.
 *   slot-read        { index, value, outOfBounds, textKey }
 *       그 칸에 있던 값을 읽는다.
 *   guard-drop       { lo, hi, homeIndex, textKey }
 *       경계 검사가 배열의 끝에 내려선다. 커서는 homeIndex 로 되돌아간다.
 *   probe-blocked    { index, textKey }
 *       커서가 경계 검사 앞에서 부딪혀 멈춘다. 접근이 일어나지 않는다.
 *   rewind           {}
 *       advance 로 한 걸음씩 짚어 보다 처음으로 돌아간다.
 *   done             {}  (표준)
 *       할 말을 마쳤다.
 *
 * textKey 는 캡션 문안의 키다. 문안 자체는 facet.ts 의 messages 에 있고
 * projector 가 tr 로 해석한다 (C10).
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OutOfBoundsData = {
  type: 'out-of-bounds';
  /** 배열 이름. 화면의 인덱스 라벨(arr[0] …)에 쓰인다. */
  arrayName: string;
  /** 배열이 담고 있는 값. 길이가 곧 배열의 길이다. */
  values: number[];
  /** 배열의 기준 주소 (0번 원소의 주소). */
  baseAddress: number;
  /** 원소 하나가 차지하는 바이트 수. */
  stride: number;
  /** 배열 바로 뒤에 놓인 변수의 이름. */
  neighborName: string;
  /** 그 변수가 담고 있는 값. */
  neighborValue: number;
  /** 배열 안의 마지막 정상 인덱스. */
  safeIndex: number;
  /** 배열의 끝을 넘는 인덱스. */
  outIndex: number;
  /** 걸음 사이의 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 걸음 이름. 자동 재생과 advance 가 같은 몸을 쓰도록 번호로 묶는다. */
const STEP = {
  computeSafe: 0,
  probeSafe: 1,
  readSafe: 2,
  computeOut: 3,
  probeOut: 4,
  readOut: 5,
  guardDrop: 6,
  probeBlocked: 7,
} as const;

const STEP_COUNT = 8;

const DEFAULT_STEP_MS = 780;

/** 주소를 16진 표기로. 0x1000 + 4 = 0x1004. */
function toHex(address: number): string {
  return `0x${address.toString(16).toUpperCase()}`;
}

/** 인덱스가 가리키는 주소. 셈은 인덱스가 길이를 넘어도 그대로 이어진다. */
function addressOf(data: OutOfBoundsData, index: number): number {
  return data.baseAddress + index * data.stride;
}

/**
 * 걸음 하나를 발신한다.
 *
 * case 마다 emit 을 한 줄로 펴 두어 type 이 리터럴로 남는다 (C2). 자동 재생과
 * advance 가 이 함수를 함께 부르므로 두 경로의 걸음이 갈라지지 않는다.
 */
async function emitStep(ctx: ReactiveContext<OutOfBoundsData>, step: number): Promise<void> {
  const data = ctx.data;
  const baseHex = toHex(data.baseAddress);

  switch (step) {
    case STEP.computeSafe:
      await ctx.emit({
        type: 'address-computed',
        payload: {
          index: data.safeIndex,
          baseHex,
          stride: data.stride,
          addressHex: toHex(addressOf(data, data.safeIndex)),
          textKey: 'caption.compute',
        },
      });
      return;

    case STEP.probeSafe:
      await ctx.emit({
        type: 'probe-move',
        payload: {
          index: data.safeIndex,
          addressHex: toHex(addressOf(data, data.safeIndex)),
          crossed: false,
          textKey: 'caption.inside',
        },
      });
      return;

    case STEP.readSafe:
      await ctx.emit({
        type: 'slot-read',
        payload: {
          index: data.safeIndex,
          value: data.values[data.safeIndex] ?? 0,
          outOfBounds: false,
          textKey: 'caption.readInside',
        },
      });
      return;

    case STEP.computeOut:
      await ctx.emit({
        type: 'address-computed',
        payload: {
          index: data.outIndex,
          baseHex,
          stride: data.stride,
          addressHex: toHex(addressOf(data, data.outIndex)),
          textKey: 'caption.keepsCounting',
        },
      });
      return;

    case STEP.probeOut:
      await ctx.emit({
        type: 'probe-move',
        payload: {
          index: data.outIndex,
          addressHex: toHex(addressOf(data, data.outIndex)),
          crossed: true,
          textKey: 'caption.crossed',
        },
      });
      return;

    case STEP.readOut:
      await ctx.emit({
        type: 'slot-read',
        payload: {
          index: data.outIndex,
          value: data.neighborValue,
          outOfBounds: true,
          textKey: 'caption.readsNeighbor',
        },
      });
      return;

    case STEP.guardDrop:
      await ctx.emit({
        type: 'guard-drop',
        payload: {
          lo: 0,
          hi: data.values.length,
          // 커서는 기준 주소로 물러난다. 셈은 언제나 거기서 다시 시작하고,
          // 그래야 다음 걸음에서 벽에 부딪히기까지의 거리가 보인다.
          homeIndex: 0,
          textKey: 'caption.guard',
        },
      });
      return;

    case STEP.probeBlocked:
      await ctx.emit({
        type: 'probe-blocked',
        payload: { index: data.outIndex, textKey: 'caption.blocked' },
      });
      return;

    default:
      return;
  }
}

/**
 * 조각 본문.
 *
 * 여덟 걸음을 스스로 재생하고 멈춘다. 자동 재생만 보고 지나가도 화면은 할 말을
 * 마치며, 그 뒤 advance 를 누르면 처음부터 한 걸음씩 다시 짚어 볼 수 있다.
 */
export const outOfBounds = async (ctx: FacetContext<OutOfBoundsData>): Promise<void> => {
  const rc = ctx as ReactiveContext<OutOfBoundsData>;
  const stepMs = typeof rc.data.stepMs === 'number' ? rc.data.stepMs : DEFAULT_STEP_MS;
  const pause = async (): Promise<boolean> => (rc.cancelled ? false : rc.sleep(stepMs));

  // ── 자동 재생. 성한 접근을 먼저 보이고, 같은 셈을 한 칸 더 밀고, 장치를 넣는다.
  await emitStep(rc, STEP.computeSafe);
  if (!(await pause())) return;
  await emitStep(rc, STEP.probeSafe);
  if (!(await pause())) return;
  await emitStep(rc, STEP.readSafe);
  if (!(await pause())) return;
  await emitStep(rc, STEP.computeOut);
  if (!(await pause())) return;
  await emitStep(rc, STEP.probeOut);
  if (!(await pause())) return;
  await emitStep(rc, STEP.readOut);
  if (!(await pause())) return;
  await emitStep(rc, STEP.guardDrop);
  if (!(await pause())) return;
  await emitStep(rc, STEP.probeBlocked);
  if (!(await pause())) return;
  await rc.emit({ type: 'done' });

  // ── 곱씹으며 읽고 싶은 사람을 위한 한 걸음씩. 끝에 닿으면 처음으로 되감는다.
  let cursor = STEP_COUNT;
  while (!rc.cancelled) {
    const input = await rc.waitForInput().catch(() => null);
    if (input === null) return;
    if (input.type !== 'advance') continue;

    if (cursor >= STEP_COUNT) {
      // 되감기만 발신하고 멈추면 눌러도 아무 일이 없는 것으로 읽힌다. 되감은
      // 김에 첫 걸음까지 이어 보인다 (S-piece).
      await rc.emit({ type: 'rewind' });
      await emitStep(rc, STEP.computeSafe);
      cursor = STEP.computeSafe + 1;
      continue;
    }

    await emitStep(rc, cursor);
    cursor += 1;
    if (cursor >= STEP_COUNT) await rc.emit({ type: 'done' });
  }
};
