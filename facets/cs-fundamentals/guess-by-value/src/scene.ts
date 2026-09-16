/**
 * guessByValue 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 의 `let` 은 열아홉이었는데 거의 다 DOM 손잡이였고, 정작 상태는 손잡이에
 * 딸린 **수치**와 **속성**에 흩어져 있었다.
 *
 * - **`type CellState = 'live' | 'dim' | 'probe' | 'hit'`** — 선언은 있는데 **저장되는
 *   곳이 없다.** `paintCell` 이 칠에만 쓰고 지나가, 칸의 형편이 `rect` 의 `fill` 에만
 *   남았다 (프로토콜 3-1 의 ⑤). 게다가 그 한 갈래가 **채움과 테두리를 함께** 정해
 *   "값의 형편" 과 "짚어 보았다" 두 뜻이 한 속성에 겹쳐 있었다. 그래서 다음 걸음이
 *   칸을 다시 칠할 때마다 **짚은 자국이 지워졌다** — 이 조각의 주장이 "덜 짚는다"
 *   인데 어느 칸을 짚었는지가 화면에 안 남았다 (프로토콜 4 절의 "주장이 애초에
 *   화면에 안 남아 있는 수").
 * - **`bracket` 의 `x`·`width` 속성** — 남은 구간. `discardHalf` 가
 *   `Number(bracket.getAttribute('x'))` 로 **화면을 도로 읽어** 출발값을 셈했다 (④).
 *   되감아 세운 직후에는 그 값이 아직 옛 화면의 것이다. 게다가 **버린 구간이
 *   어디였나는 아무 데도 남지 않았다** — 구간이 줄어들 뿐이라 몇 번 잘랐는지가
 *   눈금표의 점으로만 보였다.
 * - **`bracket`·`caret`·`chip`·`formula`·`dropTip` 의 `opacity`** — 그것이 떠 있나.
 *   `fadeTo` 가 `getAttribute('opacity')` 를 되읽어 출발값으로 썼다 (④).
 * - **`let caretX` · `let chipX`** — 커서와 겨눔 조각의 지금 좌표. 다음 운동의
 *   출발값이라 되감은 직후에는 엉뚱한 데서 출발한다 (②).
 * - **`let scaleLo` · `let scaleHi`** — **척도의 두 끝.** `scale-set` 한 번으로
 *   정해지고 그 뒤로는 `aimMeasure`·`aimLand` 가 이 둘로 화면 좌표를 셈했다.
 *   값으로 자리를 겨누는 조각에서 **척도가 곧 화면의 축**인데 그 축이 stage 안에만
 *   있었다.
 * - **`ruler`·`riserLo`·`riserHi` 의 `x2`·`y2`** — 자가 얼마나 솟고 펴졌나.
 * - **`drop` 의 `points`** — 비율이 어느 자리로 떨어졌나. `setScale` 이 `''` 로
 *   지워 겨눔이 되풀이되면 앞 자국이 사라졌다.
 * - **`formula.textContent`** — 수식. `aimLand` 가 `formula.textContent =
 *   '…' + ' = ' + index` 로 **자기 글자를 도로 읽어 덧붙였다** (④). 같은 걸음을
 *   두 번 그리면 `= 8 = 8` 이 된다.
 * - **`type Tally = { group, count, dots }`** — DOM 손잡이와 **셈이 한 객체**에
 *   묶였고, `markTally` 가 `while (tally.dots < count)` 로 **단조 증가**만 했다.
 *   되감으면 줄어들 길이 없어 `build()` 로 통째로 다시 짓는 수밖에 없었다.
 * - **`type Cell = { group, box, slot, value, cx }`** — 손잡이에 좌표가 섞였다.
 *
 * 여기서는 그 전부가 **셈 둘과 단계 둘**이다. 위 줄은 짚은 횟수(`midProbes`)와 잘라
 * 낸 횟수(`midCuts`), 아래 줄은 몇 번째 겨눔(`aimShot`)과 그 겨눔의 어디까지
 * 왔나(`aimStage`). 남은 구간도 버린 구간도 커서 자리도 자의 두 끝도 비율도 전부
 * 거기서 파생된다.
 *
 * ── 척도와 겨누는 자리는 한 함수만 지난다
 *
 * 겨누는 자리는 `lo + floor(fraction × (hi − lo))` 라는 **나눗셈**에서 나온다. 화면의
 * 조각이 서는 자리, 선이 떨어지는 자리, 수식에 적히는 수가 모두 그 값이라 두 곳에서
 * 셈하면 끝자리에서 갈린다 (프로토콜 4 절의 부동소수 함정). 그래서 `algorithm.ts` 가
 * `midSteps` · `aimShots` 를 내주고 장면이 그것을 부른다 — **바탕 + 순수 함수로 나오는
 * 값은 싣지 말고 같은 함수를 부르게 한다** 는 B 갈래다. 장면이 `algorithm.ts` 를
 * import 하는 방향은 원칙 1 이 허용한다 (장면이 projector 자리를 잇는다).
 *
 * 그 덕에 **모든 발신의 payload 가 비었다.** 짚은 횟수도, 남은 구간도, 어느 줄의
 * 일인지도 싣지 않는다 — 줄은 발신이 오는 차례가 말하고(위 줄이 `lane-settled` 로
 * 닫히기 전의 `probe` 가 위 줄의 것이다), 횟수는 장면이 센다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 자리 번호와 비율이라는 **구조**만 담고 칸 폭도 자의 길이도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로 만든다 (C10). 그래서
 * 캡션에 인자가 하나도 없다. 화면에 나란히 뜨는 수(짚은 횟수 · 자의 두 끝 값 ·
 * 떨어진 자리)는 아래 파생 함수를 지나야만 나온다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { aimShots, midSteps, type AimShot, type MidStep } from './algorithm.js';

/** 자리 번호 둘로 말하는 구간. 좌표가 아니다 (S-piece). */
export type GuessByValueSpan = {
  readonly lo: number;
  readonly hi: number;
};

/** 한 줄의 형편. 아직 안 열렸나 / 돌고 있나 / 할 일을 마쳤나. */
export type GuessByValueLaneState = 'idle' | 'live' | 'settled';

/** 겨눔 하나가 어디까지 왔나. 자를 세우고 → 재고 → 떨어뜨리고 → 짚는다. */
export type GuessByValueAimStage = 'scale' | 'measure' | 'land' | 'probe';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 싣지 않는다 — 커서가 어디서 오는지도, 막대가 어느 구간에서 미끄러지는지도
 * 위의 두 셈에서 순수하게 나온다. 그래서 그리는 쪽이 `prev` 를 아예 안 본다 (S-scene).
 */
export type GuessByValueStep =
  /** 남은 구간 막대와 커서가 뜬다. */
  | 'range'
  /** 커서가 새 가운데로 뛰어가 그 칸을 짚는다. */
  | 'midProbe'
  /** 막대의 한쪽 경계가 미끄러지고 버린 구간이 자국으로 남는다. */
  | 'midCut'
  /** 위 줄의 막대와 커서가 걷힌다. */
  | 'midSettle'
  /** 두 끝 칸에서 자가 솟고 펴진다. */
  | 'scale'
  /** 찾는 값이 자 위를 미끄러져 제 비율 자리에 선다. */
  | 'measure'
  /** 그 비율에서 선이 떨어져 칸 하나를 가리킨다. */
  | 'land'
  /** 가리킨 칸이 부푼다. */
  | 'aimProbe'
  /** 아래 줄이 닫힌다 — 자와 떨어진 선을 그대로 남기므로 흐를 것이 없다. */
  | 'aimSettle'
  /** 눈금표 둘이 함께 부푼다 — 견줄 것은 그 두 수다. */
  | 'done';

/**
 * 캡션이 말할 것. **인자가 없다** — 수는 전부 장면에서 파생된다.
 *
 * 수를 여기 실으면 화면의 칸·눈금표와 갈릴 자리가 생긴다 (프로토콜 4 절 "화면에
 * 나란히 뜨는 수는 한 함수를 지나야 한다").
 */
export type GuessByValueCaption =
  | 'begin'
  | 'midProbe'
  | 'midDrop'
  | 'scaleSet'
  | 'aimMeasure'
  | 'aimLand'
  | 'aimProbe'
  | 'verdict';

export type GuessByValueScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 오름차순으로 퍼진 값들. 칸 수와 칸에 적히는 수가 여기서 나온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** (S-scene 의 Exception).
   */
  readonly values: readonly number[];
  /** 찾는 값. 겨눔 조각에 적히고 캡션에도 나온다. */
  readonly target: number;
  /** 가운데를 짚는 쪽이 밟을 자리 전부. `midSteps` 하나만 지난 값이다. */
  readonly midPlan: readonly MidStep[];
  /** 값으로 겨누는 쪽이 밟을 겨눔 전부. `aimShots` 하나만 지난 값이다. */
  readonly aimPlan: readonly AimShot[];

  // ── 위 줄 (늘 가운데를 짚는 쪽).
  readonly midLane: GuessByValueLaneState;
  /** 지금까지 짚은 횟수. **눈금표의 수가 이것 하나에서 나온다.** */
  readonly midProbes: number;
  /** 지금까지 잘라 낸 횟수. 남은 구간과 버린 구간이 여기서 파생된다. */
  readonly midCuts: number;

  // ── 아래 줄 (값으로 겨누는 쪽).
  readonly aimLane: GuessByValueLaneState;
  /** 지금 몇 번째 겨눔인가 (0부터). 아직 안 겨눴으면 `null`. */
  readonly aimShot: number | null;
  /** 그 겨눔이 어디까지 왔나. */
  readonly aimStage: GuessByValueAimStage | null;

  /** 다 끝났다 — 눈금표 둘을 견준다. */
  readonly finished: boolean;
  readonly step: GuessByValueStep | null;
  readonly caption: GuessByValueCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * 셈과 단계를 여기 넣지 않는다. 전부 걸어오며 쌓은 자취라, 바탕으로 묶어 되감기에
 * 넘기면 되감은 화면이 이미 다 짚은 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 밟는다. 타입으로 좁혀 두어 구조적으로 못 넘어가게 한다.
 */
type GuessByValueBase = Pick<GuessByValueScene, 'values' | 'target' | 'midPlan' | 'aimPlan'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function numbersOf(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
}

function numberOf(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: GuessByValueBase): GuessByValueScene {
  return {
    values: base.values,
    target: base.target,
    midPlan: base.midPlan,
    aimPlan: base.aimPlan,
    midLane: 'idle',
    midProbes: 0,
    midCuts: 0,
    aimLane: 'idle',
    aimShot: null,
    aimStage: null,
    finished: false,
    step: null,
    caption: null,
  };
}

// ── 파생. 화면에 나란히 뜨는 수는 전부 이 아래를 지난다.

/**
 * 위 줄에 남아 있는 구간.
 *
 * 줄이 닫힌 뒤에도 그대로 셈한다 — **잘라 낸 자리는 다 끝난 화면에도 남아야** 이
 * 조각이 "가운데만 짚으면 이만큼 잘라 가며 짚는다" 를 말할 수 있다.
 */
export function midRangeOf(scene: GuessByValueScene): GuessByValueSpan {
  const plan = scene.midPlan;
  if (plan.length === 0) return { lo: 0, hi: Math.max(0, scene.values.length - 1) };
  const step = plan[Math.min(scene.midCuts, plan.length - 1)];
  return { lo: step.lo, hi: step.hi };
}

/**
 * 지금까지 떨어져 나간 구간들.
 *
 * 옛 stage 에는 이것이 아무 데도 없었다 — 막대가 줄어들 뿐이라 몇 번 어디를 잘랐는지가
 * 화면에서 사라졌다. **누적이 곧 주장**이라 장면이 말하게 한다 (프로토콜 4 절).
 */
export function discardedSpansOf(scene: GuessByValueScene): GuessByValueSpan[] {
  const out: GuessByValueSpan[] = [];
  const cuts = Math.min(scene.midCuts, scene.midPlan.length);
  for (let j = 0; j < cuts; j += 1) {
    const step = scene.midPlan[j];
    if (step.drop === 'left') out.push({ lo: step.lo, hi: step.mid });
    else if (step.drop === 'right') out.push({ lo: step.mid, hi: step.hi });
  }
  return out;
}

/** `probes` 번 짚었을 때 커서가 서 있는 칸. 짚기 전에는 남은 구간의 왼 끝이다. */
function caretSlotAfter(scene: GuessByValueScene, probes: number): number {
  if (probes <= 0) {
    const first = scene.midPlan[0];
    return first === undefined ? 0 : first.lo;
  }
  const step = scene.midPlan[Math.min(probes, scene.midPlan.length) - 1];
  return step === undefined ? 0 : step.mid;
}

/** 커서가 지금 선 칸. */
export function caretSlotOf(scene: GuessByValueScene): number {
  return caretSlotAfter(scene, scene.midProbes);
}

/**
 * 커서가 이 걸음에 떠나온 칸.
 *
 * 운동의 출발 그림을 `prev` 에서 꺼내면 S-scene 위반이라, 셈 하나를 되돌려 얻는다.
 */
export function caretSlotBefore(scene: GuessByValueScene): number {
  return caretSlotAfter(scene, scene.midProbes - 1);
}

/** 위 줄이 지금까지 짚어 본 칸들. 테두리로 남아 "몇 군데를 짚었나" 를 말한다. */
export function midProbedSlotsOf(scene: GuessByValueScene): number[] {
  return scene.midPlan.slice(0, scene.midProbes).map((step) => step.mid);
}

/** 위 줄이 방금 밟은 자리. 아직 안 짚었으면 `null`. */
export function lastMidStepOf(scene: GuessByValueScene): MidStep | null {
  return scene.midPlan[scene.midProbes - 1] ?? null;
}

/** 위 줄이 찾아낸 칸. 아직 못 찾았으면 `null`. */
export function midFoundSlotOf(scene: GuessByValueScene): number | null {
  const step = lastMidStepOf(scene);
  return step !== null && step.drop === null ? step.mid : null;
}

/** 이 걸음에 잘라 내기 직전의 남은 구간. 운동의 출발 그림이 여기서 나온다. */
export function midRangeBeforeCut(scene: GuessByValueScene): GuessByValueSpan {
  const step = scene.midPlan[Math.max(0, scene.midCuts - 1)];
  return step === undefined
    ? midRangeOf(scene)
    : { lo: step.lo, hi: step.hi };
}

/** 이 걸음에 잘라 낸 쪽. 자를 일이 없었으면 `null`. */
export function lastDropOf(scene: GuessByValueScene): 'left' | 'right' | null {
  const step = scene.midPlan[scene.midCuts - 1];
  return step === undefined ? null : step.drop;
}

/** 지금 겨눔. 아직 안 겨눴으면 `null`. */
export function currentShotOf(scene: GuessByValueScene): AimShot | null {
  if (scene.aimShot === null) return null;
  return scene.aimPlan[scene.aimShot] ?? null;
}

/** 아래 줄이 지금까지 짚은 횟수. **눈금표와 캡션이 같이 쓰는 수다.** */
export function aimProbeCountOf(scene: GuessByValueScene): number {
  if (scene.aimShot === null) return 0;
  return scene.aimShot + (scene.aimStage === 'probe' ? 1 : 0);
}

/**
 * 선이 이미 떨어진 겨눔들.
 *
 * 떨어진 자국은 지우지 않는다 — 자를 좁혀 다시 겨눈 조각에서는 그 자국이 곧
 * "몇 군데를 짚었나" 이기 때문이다.
 */
export function landedShotsOf(scene: GuessByValueScene): AimShot[] {
  if (scene.aimShot === null) return [];
  const landed =
    scene.aimShot + (scene.aimStage === 'land' || scene.aimStage === 'probe' ? 1 : 0);
  return scene.aimPlan.slice(0, landed);
}

/** 아래 줄이 지금까지 짚어 본 칸들. */
export function aimProbedSlotsOf(scene: GuessByValueScene): number[] {
  return scene.aimPlan.slice(0, aimProbeCountOf(scene)).map((shot) => shot.index);
}

/** 아래 줄이 찾아낸 칸. */
export function aimFoundSlotOf(scene: GuessByValueScene): number | null {
  const shot = scene.aimPlan[aimProbeCountOf(scene) - 1];
  return shot !== undefined && shot.hit ? shot.index : null;
}

/** 자가 걸친 두 자리. 자를 아직 안 세웠으면 `null`. */
export function scaleSpanOf(scene: GuessByValueScene): GuessByValueSpan | null {
  const shot = currentShotOf(scene);
  return shot === null ? null : { lo: shot.lo, hi: shot.hi };
}

/**
 * 자의 두 끝에 놓인 값.
 *
 * 수식에도 캡션에도 이 두 수가 나란히 뜬다 — 그래서 한 함수만 지난다.
 */
export function scaleValuesOf(scene: GuessByValueScene): { lo: number; hi: number } | null {
  const span = scaleSpanOf(scene);
  if (span === null) return null;
  const lo = scene.values[span.lo];
  const hi = scene.values[span.hi];
  if (typeof lo !== 'number' || typeof hi !== 'number') return null;
  return { lo, hi };
}

/**
 * 겨눔 조각이 자 위 어디에 서 있나. 0..1. 안 떠 있으면 `null`.
 *
 * 자를 막 세운 참에는 왼 끝(0)에서 기다리고, 재고 난 뒤로는 제 비율 자리에 선다.
 */
export function chipFractionOf(scene: GuessByValueScene): number | null {
  const shot = currentShotOf(scene);
  if (shot === null || scene.aimStage === null) return null;
  return scene.aimStage === 'scale' ? 0 : shot.fraction;
}

export const guessByValueScene: ScenePlan<GuessByValueScene> = {
  /**
   * 첫 장면은 아직 아무것도 짚지 않은 두 줄이다.
   *
   * 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로 쥐지
   * 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): GuessByValueScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const values = numbersOf(raw.values);
    const target = numberOf(raw.target);
    return atStart({
      values,
      target,
      midPlan: midSteps(values, target),
      aimPlan: aimShots(values, target),
    });
  },

  reduce(scene: GuessByValueScene, event: FacetRuntimeEvent): GuessByValueScene {
    switch (event.type) {
      // 위 줄이 열린다. 남은 구간은 계획의 첫 자리가 이미 말하므로 싣지 않는다.
      case 'range-set':
        return { ...scene, midLane: 'live', step: 'range', caption: 'begin' };

      // 한 자리를 짚었다. **어느 줄인지는 발신이 오는 차례가 말한다** — 위 줄이
      // 닫히기 전의 짚기가 위 줄의 것이다 (프로토콜 4 절 "차례는 발신이 오는
      // 순서가 이미 말한다"). 짚은 자리도 계획이 쥐고 있어 target 을 되읽지 않는다.
      case 'probe':
        return scene.midLane === 'settled'
          ? { ...scene, aimStage: 'probe', step: 'aimProbe', caption: 'aimProbe' }
          : { ...scene, midProbes: scene.midProbes + 1, step: 'midProbe', caption: 'midProbe' };

      // 절반이 빠진다. 남은 구간도 버린 구간도 셈 하나에서 파생된다.
      case 'discard-half':
        return { ...scene, midCuts: scene.midCuts + 1, step: 'midCut', caption: 'midDrop' };

      // 줄이 닫힌다. 캡션은 건드리지 않는다 — 바로 앞 걸음이 한 말이 그 줄의 결론이다.
      case 'lane-settled':
        return scene.midLane === 'settled'
          ? { ...scene, aimLane: 'settled', step: 'aimSettle' }
          : { ...scene, midLane: 'settled', step: 'midSettle' };

      // 아래 줄이 남은 구간의 양 끝 값을 자로 삼는다. 몇 번째 겨눔인가는 이 발신이
      // 오는 차례가 말하고, 그 겨눔의 두 끝·비율·자리는 계획이 쥐고 있다.
      case 'scale-set': {
        const shot = scene.aimShot === null ? 0 : scene.aimShot + 1;
        if (shot >= scene.aimPlan.length) return scene;
        return {
          ...scene,
          aimLane: 'live',
          aimShot: shot,
          aimStage: 'scale',
          step: 'scale',
          caption: 'scaleSet',
        };
      }

      case 'aim-measure':
        if (scene.aimShot === null) return scene;
        return { ...scene, aimStage: 'measure', step: 'measure', caption: 'aimMeasure' };

      case 'aim-land':
        if (scene.aimShot === null) return scene;
        return { ...scene, aimStage: 'land', step: 'land', caption: 'aimLand' };

      case 'done':
        return { ...scene, finished: true, step: 'done', caption: 'verdict' };

      case 'rewind':
        // 바탕만 넘긴다. 객체 리터럴로 넘겨야 초과 속성 검사가 돌아 자취가 섞여
        // 들어가는 것을 타입이 막는다 (프로토콜 4 절).
        return atStart({
          values: scene.values,
          target: scene.target,
          midPlan: scene.midPlan,
          aimPlan: scene.aimPlan,
        });

      default:
        // 이 facet 의 algorithm 은 위 여덟만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
