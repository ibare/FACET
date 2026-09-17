/**
 * baggingSample 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 하나(`setup`)였고 조회 분기도 DOM 되읽기도 0 건이었다.
 * **상태는 전부 stage 에 있었고, 절반은 변수가 아니라 화면 자신이었다.**
 *
 * - `let pool` · `sets` — 선언 자료를 stage 가 따로 쥐고 있었다. projector 의
 *   `let setup` 도 같은 것을 또 쥐었다 — 캡션의 `{k}`(이 벌에서 몇 번 뽑나)가
 *   거기서 나오고 algorithm 은 자기 `sets` 를 보았으니 **같은 물음에 답이 둘**이었다.
 * - `let cols` · `cellW` · `tileW` · `rowPitch` — **격자의 척도.** `tileX` · `rowTop`
 *   이 이 넷으로 자리를 셈하므로 **화면의 모든 좌표가 거기서 나왔다.** 걸음이 실어
 *   온 것은 아니었으나 `build` 가 한 번 셈해 제 변수에 적어 두어, 척도를 정하는
 *   자리와 쓰는 자리가 갈라져 있었다. 지금은 `geomOf` 가 바탕 자료에서 매번 낸다.
 * - `let setInks` — 색판. `categorical(Math.max(1, sets.length), 'vivid')` 는 다행히
 *   **바탕의 벌 수**를 세고 있었다(`build` 가 선언 전체를 받는다). 걸음마다 자라는
 *   셈을 씨앗으로 썼다면 벌이 하나 드러날 때마다 이미 칠한 색이 갈렸을 자리다.
 *   여기서도 바탕에서 한 번에 센다.
 * - **`tallyGroups[i]` 의 자식** — **이 벌에서 그 번호가 몇 번 뽑혔나.** `setTally`
 *   가 `<g>` 를 비우고 점을 `count` 개 넣거나 `×{count}` 글자 하나를 넣었다. 즉
 *   셈이 **`<g>` 의 자식 수**(또는 그 글자)에만 있었고 `let`·`Map`·`getAttribute`
 *   어느 grep 에도 안 걸린다. 지금은 `countsIn` 이 센다.
 * - **`slotRects[s][k]` 의 `stroke-dasharray`** — 그 칸이 아직 비었나 찼나.
 *   `clearSlots` 가 `'3 3'`, `fillSlot` 이 `'none'` 으로 두었다. **이 벌이 몇 칸까지
 *   찼나가 점선의 유무에만** 있었다. 지금은 `drawsIn` 이다.
 * - **`slotTexts[s][k]` 의 글자** — 그 칸에 앉은 값. 바탕의 `sets[s][k]` 와 **두
 *   벌**이었다 (걸음이 실어 온 `value` 를 받아 적었다).
 * - **`trayGroups[s]` 의 자식 유무** — 그 벌의 남은 것이 드러났나, 몇인가.
 *   지금은 `revealed` 하나와 `leftOutIn` 이다.
 * - **`ratioTexts[s]` 의 글자** — 그 벌이 남긴 비율. algorithm 이 셈해 실어 온
 *   문자열이 그대로 정본이라 **오른쪽 자리에 내려앉은 타일 수와 다른 출처**였다.
 *   지금은 `ratioIn` 이 타일과 같은 자료에서 낸다.
 * - **`ratioTexts` 의 `font-weight`** — 논증이 끝났나. `finish()` 가 600 으로
 *   칠하는 것이 유일한 보관처였다. 지금은 `done` 이 말한다.
 * - **`tileGroups[i]` 의 `transform` 과 그 부모** — 그 타일이 주머니에 있나 날고
 *   있나. 좌표가 아니라 **어느 국면인가**가 `translate` 와 **부모 참조**
 *   (`poolLayer` 냐 `flight` 냐)에 실려 있었다.
 * - **⑤ `type PoolState = 'idle' | 'flying' | 'drawn' | 'leftOut'`** — **선언만 있고
 *   값이 어디에도 저장되지 않는 타입**의 정본이다. `setPoolState` 의 인자로만
 *   흐르고 형편은 `rect` 의 `fill`·`stroke` 에만 남았다. 게다가 **채움 하나에 넷을
 *   실어** "이 벌에서 나왔나"(형편)와 "한 번도 안 나왔다"(이 조각의 결론)가 같은
 *   축에서 서로를 지웠다. 지금은 `draws` · `revealed` 둘에서 파생되고, 그리는
 *   쪽에서 채움(형편)과 테두리(표식)로 갈라 선다.
 *
 * 그 전부가 **`draws` · `revealed` · `done`** 셋으로 줄었다. 어느 벌 몇 번째
 * 뽑기인지, 무슨 값이 나왔는지, 몇 번 나왔는지, 무엇이 남았는지, 남은 비율이
 * 얼마인지가 모두 그 셋과 바탕에서 나온다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 옛 발신은 `set` · `slot` · `value` · `count` · `first` · `values` · `ratio` ·
 * `ratios` · `theoretical` 을 전부 실어 왔다. 그 전부가 **바탕 자료와 발신이 온
 * 차례에서 곧바로 나오는 수**다.
 *
 * - **몇 번째 걸음인가는 장면이 센다.** `draw` 는 올 때마다 하나씩 쌓이므로
 *   `draws` 가 곧 통째 뽑기 번호이고, 그것을 벌의 길이로 나누면 `set`·`slot` 이
 *   나온다 (`positionAt`). `first` 는 `slot === 0` 이다.
 * - **뽑힌 값**은 `sets[set][slot]` 이다. 주머니의 어느 자리인지도 `pool` 이 말한다.
 * - **누적 횟수**는 이 벌에서 여기까지 뽑은 것을 세면 나온다 (`countsIn`).
 * - **남은 것**은 그 벌에서 한 번도 안 나온 자리다 (`leftOutIn`). **이 조각의
 *   결론**이라 그림과 같은 자료를 써야 한다 — 옛 발신은 algorithm 이 따로 센 것을
 *   target 과 payload 로 실어 왔다.
 * - **남은 비율**은 그 목록의 크기를 주머니 크기로 나눈 값이다 (`ratioIn`).
 * - **공식이 말하는 값**은 `algorithm.ts` 가 내준 `neverDrawnProbability` 를 그대로
 *   부른다 (프로토콜 4 절의 B 갈래). 뽑은 순서에서 나오는 값이 아니라 주머니 크기와
 *   뽑는 횟수만으로 정해지는 순수 함수이고, 떼어 내도 "되돌리기 때문에 남는 것이
 *   생긴다" 는 주장이 그대로 남는다.
 *
 * **싣는 것은 하나도 없다.** 남은 발신 넷이 전부 payload 없이 온다 — 뽑는 차례는
 * 선언이 이미 적어 두었으므로 걸음이 내리는 판정이 없다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 주머니의 번호와 벌마다 뽑은 순서라는 **구조**만 담고 격자의
 * 칸 폭도 줄 간격도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 * 문안도 담지 않는다 — `captionFor` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { neverDrawnProbability } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다. 왕복이 어디서 어디로 가는지는 `draws` 가, 남은 것이
 * 어느 주머니 자리에서 내려오는지는 `leftOutIn` 이 이미 말하므로 출발 그림도 셈으로
 * 나온다 — `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type BaggingStep =
  /** 하나가 떠올라 벌의 칸에 복제본을 남기고 제자리로 되돌아온다. */
  | { kind: 'draw' }
  /** 한 번도 안 나온 것이 드러나고 그 복제본이 오른쪽 자리로 내려앉는다. */
  | { kind: 'leftOut' }
  /** 벌마다의 남은 비율을 차례로 짚어 견준다. */
  | { kind: 'done' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type BaggingCaption =
  /** 새 벌을 시작한다. `set` 은 화면에 뜨는 벌 번호(1 부터), `k` 는 뽑을 횟수. */
  | { kind: 'setBegin'; set: number; k: number }
  /** 처음 나온 번호를 벌에 베끼고 도로 넣었다. */
  | { kind: 'draw'; value: number }
  /** 도로 넣었기 때문에 또 나왔다. */
  | { kind: 'drawAgain'; value: number }
  /** 한 번도 안 나온 번호들이 남았다. */
  | { kind: 'leftOut'; values: readonly number[] }
  /** 벌마다 남는 것이 다르다. `theory` 는 공식이 말하는 확률(0~1). */
  | { kind: 'done'; theory: number };

export type BaggingSampleScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 주머니에 든 번호. 뽑아도 줄지 않는다 — 뽑은 것을 도로 넣기 때문이다. */
  pool: readonly number[];
  /** 벌마다 뽑은 순서. 값은 모두 `pool` 의 원소다. */
  sets: readonly (readonly number[])[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 지금까지 뽑은 총 횟수 — 벌을 가로질러 누적한다.
   *
   * 이 하나가 진행을 통째로 말한다. 어느 벌 몇 번째 자리인지, 무슨 값이 나왔는지,
   * 그 번호가 이 벌에서 몇 번 나왔는지가 전부 여기서 파생된다.
   */
  draws: number;
  /** 남은 것이 드러난 벌의 수. 벌 `s` 는 `s < revealed` 일 때 드러났다. */
  revealed: number;
  /** 논증이 끝났나. */
  done: boolean;

  step: BaggingStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `draws` · `revealed` · `done` 은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 다 뽑고 남은 것까지 드러난 채로 선다 (S-scene 함정 14).
 */
type Base = Pick<BaggingSampleScene, 'pool' | 'sets'>;

/**
 * 아직 한 번도 뽑지 않은 처음 화면 — 주머니만 차 있고 벌은 전부 빈 칸이다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): BaggingSampleScene {
  return {
    pool: base.pool,
    sets: base.sets,
    draws: 0,
    revealed: 0,
    done: false,
    step: null,
  };
}

// ── unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9) ──

/**
 * 선언의 번호 목록을 좁힌다.
 *
 * **새 배열을 낸다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한 객체라
 * 참조로 쥐면 되짚을 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * 벌마다 뽑은 순서.
 *
 * 빈 줄도 지우지 않는다 — algorithm 은 선언에 적힌 벌마다 `left-out` 을 하나씩
 * 내보내므로, 여기서 줄을 지우면 `revealed` 가 그 발신과 한 칸씩 어긋난다.
 */
function readSets(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const out: number[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    out.push(readNumbers(row));
  }
  return out;
}

// ── 파생. 화면이 쓰는 수는 전부 여기를 지난다 ───────────────────────────────

/** 벌 `s` 의 첫 뽑기가 통째로 몇 번째인가. 앞 벌들의 길이 합이다. */
function offsetOf(scene: BaggingSampleScene, s: number): number {
  let base = 0;
  for (let i = 0; i < s && i < scene.sets.length; i += 1) base += scene.sets[i].length;
  return base;
}

/** 끝까지 뽑으면 몇 번인가. */
export function totalDraws(scene: BaggingSampleScene): number {
  return offsetOf(scene, scene.sets.length);
}

/** 통째 번호 `i` 의 뽑기가 어느 벌 몇 번째 자리인가. 범위 밖이면 null. */
export function positionAt(
  scene: BaggingSampleScene,
  i: number,
): { set: number; slot: number } | null {
  if (i < 0) return null;
  let base = 0;
  for (let s = 0; s < scene.sets.length; s += 1) {
    const len = scene.sets[s].length;
    if (i < base + len) return { set: s, slot: i - base };
    base += len;
  }
  return null;
}

/**
 * 지금 주머니가 보이고 있는 벌. 아직 한 번도 안 뽑았으면 null.
 *
 * 주머니는 한 줄뿐이라 한 번에 한 벌의 형편만 보인다 — 방금 뽑은 것이 든 벌이다.
 */
export function currentSet(scene: BaggingSampleScene): number | null {
  return positionAt(scene, scene.draws - 1)?.set ?? null;
}

/** 벌 `s` 에서 지금까지 몇 번 뽑았나. */
export function drawsIn(scene: BaggingSampleScene, s: number): number {
  const len = scene.sets[s]?.length ?? 0;
  const done = scene.draws - offsetOf(scene, s);
  return done < 0 ? 0 : done > len ? len : done;
}

/**
 * 벌 `s` 에서 주머니 자리마다 몇 번 뽑혔나 — 지금까지 뽑은 것만 센다.
 *
 * 옛 화면은 이 수를 걸음이 실어 온 `count` 로 받아 눈금 `<g>` 의 자식 수에 적었다.
 */
export function countsIn(scene: BaggingSampleScene, s: number): number[] {
  const counts = new Array<number>(scene.pool.length).fill(0);
  const row = scene.sets[s] ?? [];
  const n = drawsIn(scene, s);
  for (let k = 0; k < n; k += 1) {
    const at = scene.pool.indexOf(row[k]);
    if (at >= 0) counts[at] += 1;
  }
  return counts;
}

/**
 * 벌 `s` 의 칸마다 그 값이 이 벌에서 **두 번 이상** 나왔나.
 *
 * **머무는 표식**이다. "도로 넣기 때문에 같은 것이 또 나온다" 가 이 조각의 주장
 * 절반인데, 옛 화면은 그것을 주머니 아래 눈금에만 적어 두고 다음 벌이 시작될 때
 * 통째로 지웠다 — 완주 화면에는 마지막 벌의 눈금만 남았다. 벌의 칸에 표식으로
 * 두면 세 벌 모두가 완주 화면에 제 자취를 지닌다 (S-scene 함정 7).
 */
export function repeatedIn(scene: BaggingSampleScene, s: number): boolean[] {
  const counts = countsIn(scene, s);
  const row = scene.sets[s] ?? [];
  const n = drawsIn(scene, s);
  const out = new Array<boolean>(row.length).fill(false);
  for (let k = 0; k < n; k += 1) {
    const at = scene.pool.indexOf(row[k]);
    out[k] = at >= 0 && (counts[at] ?? 0) > 1;
  }
  return out;
}

/**
 * 벌 `s` 에서 한 번도 안 나온 주머니 자리. 아직 드러나지 않았으면 빈 목록.
 *
 * **이 조각의 결론**이다. 드러난 벌은 이미 다 뽑았으므로 `countsIn` 이 그 벌의
 * 최종 셈이고, 0 인 자리가 곧 남은 것이다 — 그림의 눈금과 같은 자료다.
 */
export function leftOutIn(scene: BaggingSampleScene, s: number): number[] {
  if (s < 0 || s >= scene.revealed) return [];
  const counts = countsIn(scene, s);
  const out: number[] = [];
  for (let i = 0; i < scene.pool.length; i += 1) if ((counts[i] ?? 0) === 0) out.push(i);
  return out;
}

/** 벌 `s` 가 남긴 번호들. 주머니 자리 순서대로. */
export function leftValuesIn(scene: BaggingSampleScene, s: number): number[] {
  return leftOutIn(scene, s).map((i) => scene.pool[i]);
}

/** 벌 `s` 가 주머니에서 남긴 것의 비율 (0~1). 드러나지 않았으면 0. */
export function ratioIn(scene: BaggingSampleScene, s: number): number {
  if (scene.pool.length === 0 || s >= scene.revealed) return 0;
  return leftOutIn(scene, s).length / scene.pool.length;
}

/**
 * 하나가 끝까지 한 번도 안 뽑힐 확률 — 공식이 말하는 값.
 *
 * 뽑은 순서에서 나오는 값이 아니므로 `algorithm.ts` 가 내준 순수 함수를 그대로
 * 부른다 (프로토콜 4 절 B 갈래). 뽑는 횟수는 첫 벌의 길이다 — 화면의 견줌이
 * 한 벌의 크기를 두고 하는 말이다.
 */
export function theoreticalOf(scene: BaggingSampleScene): number {
  return neverDrawnProbability(scene.pool.length, scene.sets[0]?.length ?? 0);
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 하고, 장면에 캡션 필드를 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: BaggingSampleScene): BaggingCaption | null {
  if (scene.done) return { kind: 'done', theory: theoreticalOf(scene) };

  // 남은 것이 드러난 직후인가 — 그 벌의 뽑기가 끝난 자리에 그대로 서 있으면 그렇다.
  if (scene.revealed > 0 && scene.draws === offsetOf(scene, scene.revealed)) {
    return { kind: 'leftOut', values: leftValuesIn(scene, scene.revealed - 1) };
  }

  const pos = positionAt(scene, scene.draws - 1);
  if (pos === null) return null;
  const row = scene.sets[pos.set];
  const value = row[pos.slot];
  // 벌의 첫 뽑기는 화면이 벌을 갈아 끼우는 자리라 그 벌을 소개한다.
  if (pos.slot === 0) return { kind: 'setBegin', set: pos.set + 1, k: row.length };
  const count = countsIn(scene, pos.set)[scene.pool.indexOf(value)] ?? 0;
  return count > 1 ? { kind: 'drawAgain', value } : { kind: 'draw', value };
}

export const baggingSampleScene: ScenePlan<BaggingSampleScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다 — 주머니가 차 있고 벌은 전부 빈 칸이다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. `readNumbers`
   * 와 `readSets` 가 **새 배열**을 내므로 러너가 준 객체를 참조로 쥐지 않는다
   * (S-scene).
   */
  initial(initialData: unknown): BaggingSampleScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ pool: readNumbers(d.pool), sets: readSets(d.sets) });
  },

  reduce(scene: BaggingSampleScene, event: FacetRuntimeEvent): BaggingSampleScene {
    switch (event.type) {
      /*
       * 한 번 뽑아 담고 도로 넣는다.
       *
       * 어느 벌 몇 번째인지도, 무슨 값인지도, 몇 번째로 나온 것인지도 실어 오지
       * 않는다 — **이 발신의 차례가 곧 뽑기 번호**이고 나머지는 선언이 말한다.
       * 뽑을 것이 더 없는 채로 오면 쌓을 데가 없으므로 조용히 흘린다 (C2).
       */
      case 'draw':
        if (scene.draws >= totalDraws(scene)) return scene;
        return { ...scene, draws: scene.draws + 1, step: { kind: 'draw' } };

      /*
       * 한 벌을 다 뽑고 나서 한 번도 안 나온 것이 드러난다. 누가 남았는지도 남은
       * 비율도 실어 오지 않는다 — 그 벌에서 한 번도 안 나온 자리가 그들이다.
       */
      case 'left-out':
        if (scene.revealed >= scene.sets.length) return scene;
        return { ...scene, revealed: scene.revealed + 1, step: { kind: 'leftOut' } };

      /*
       * 벌마다 남는 것이 다르다. 비율도 공식값도 실어 오지 않는다 — 앞의 것은
       * 오른쪽 자리에 내려앉은 타일에서, 뒤의 것은 `neverDrawnProbability` 에서
       * 나온다 (프로토콜 4 절 10 · 34).
       */
      case 'done':
        if (scene.revealed === 0) return scene;
        return { ...scene, done: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ pool: scene.pool, sets: scene.sets });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
