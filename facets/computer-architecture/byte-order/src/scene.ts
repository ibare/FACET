/**
 * byteOrder 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 맨 위에 값 한 줄이 사람이 적는 차례로 선다. 그 아래 주소 눈금을 사이에 두고
 * **두 배치가 나란히** 놓인다 — 빅엔디언 줄과 리틀엔디언 줄. 둘은 갈아 끼워지지
 * 않고 끝까지 함께 서 있어야 한다. 견줄 짝이 사라지면 이 조각이 할 말이 없다.
 * 맨 아래에 잘못 읽은 줄이 앉는다.
 *
 * 그래서 완주 화면에는 **두 배치와 세 읽기가 한꺼번에** 있다 — 같은 바이트가 두
 * 차례로 놓였고, 제 규칙으로 읽으면 같은 수가 돌아오고, 차례를 모르고 읽으면
 * 엉뚱한 수가 나온다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 하나도 없었고 (①③ 0 건), stage 에는
 * `getAttribute` 도 `Number(` 도 없었다 (④ 0 건). 타입 선언조차 하나도 없었다.
 * **화면이 통째로 상태**였던 자리다.
 *
 * - **`let littleSlots: number[]`** — 리틀엔디언 줄에 무엇이 앉았나를 stage 가
 *   따로 적어 둔 **DOM 의 거울**이다. 잘못 읽는 걸음이 그것을 **출발값**으로 삼아
 *   칸을 복제했다. `getAttribute` 를 쓰지 않으니 ④ 의 grep 을 통과하는데, 되짚어
 *   세운 직후에는 그 거울이 옛 화면의 것이라 엉뚱한 바이트가 떨어진다. 게다가
 *   `littleSlots.length > 0 ? … : byteCount` 라는 말없는 되돌림까지 달려 있었다.
 *   이제 `littleRow(scene)` 이 바탕에서 셈한다.
 * - **`layer` 의 자식이 진행을 쥐고 있었다** — 어느 줄이 놓였나가 `layer` 안에
 *   무엇이 들어 있나로만 말해졌고, 잘못 읽은 줄의 `big-endian` 표찰은 그 걸음이
 *   `layer.appendChild` 로 **지어 넣을 때에만** 존재했다. 이제 `bigLaid` ·
 *   `littleLaid` · `misread` 가 말한다.
 * - **`opacity: 0` 으로 지어 두고 나중에 켜는 것** — `0x` 머리와 읽은 수가 그랬다.
 *   "아직 안 읽었다" 가 속성 하나에 실려 있었다.
 * - **읽는 방향이 화면에 남지 않았다** — 훑는 테(`readHead`)를 걸음이 끝나며
 *   `remove()` 했다. 이 조각의 주장은 *어느 끝에서 읽기 시작하느냐*인데, 완주
 *   화면에는 그것이 한 글자도 없었다. 이제 `readOrderOf` 가 그 차례를 말하고
 *   그리는 쪽이 윗자리 칸에 표식을 **남긴다**.
 *
 * ── 화면에 뜨는 세 수는 전부 그려진 줄을 읽은 것이다
 *
 * 옛 발신은 `big` · `little` · `value` 세 수를 실어 왔고, 그림은 그림대로 바이트를
 * 늘어놓았다 — **같은 물음에 답이 둘**이었다. 이제 `valueOf(scene, reading)` 하나가
 * `rowOf` 로 줄을 꺼내고 `readOrderOf` 가 정한 차례로 이어 붙인다. 훑는 테가 지나는
 * 차례도, 표식이 서는 칸도, 뜨는 수도 그 함수 하나에서 나온다.
 *
 * **잘못 읽은 수를 딴 셈으로 내지 않는다.** 바이트 맞바꾸기 같은 닫힌 식으로 내면
 * 화면은 "이렇게 읽으면 틀린다" 고 말하면서 정작 그림과 무관한 수를 띄우게 된다.
 * 여기서는 *그려진 리틀엔디언 줄을 주소 차례대로 이어 붙이는* 것이 곧 그 수다 —
 * 잘못 읽는 사람이 실제로 하는 일 그대로다.
 *
 * 좌표는 담지 않는다. 바이트와 주소의 **차례**만 담고 자리는 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { splitBytes } from './algorithm.js';

/**
 * 어느 규칙으로 읽는가.
 *
 * `big` 은 빅엔디언 줄을 제 규칙으로, `little` 은 리틀엔디언 줄을 제 규칙으로,
 * `misread` 는 **리틀엔디언 줄을 빅엔디언 규칙으로** 읽는다. 셋째가 이 조각의
 * 결론이다.
 */
export type ByteOrderReading = 'big' | 'little' | 'misread';

/** 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다. */
export type ByteOrderSceneStep =
  | { kind: 'show' }
  | { kind: 'lay-big' }
  | { kind: 'lay-little' }
  | { kind: 'read-own' }
  | { kind: 'misread' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type ByteOrderSceneCaption =
  | { kind: 'value' }
  | { kind: 'big' }
  | { kind: 'little' }
  | { kind: 'same' }
  | { kind: 'misread' };

export type ByteOrderScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 주소 칸의 수. 바이트 수이기도 하다. */
  byteCount: number;
  /**
   * 값이 갈린 바이트. 큰 자리가 앞 — 사람이 수를 적는 차례다.
   *
   * 선언의 `value` 를 쥐고 있지 않고 여기서 **값으로** 갈라 둔다. 두 배치도 세
   * 읽기도 전부 이 배열에서 나오므로 화면의 출처가 하나다.
   */
  bytes: number[];

  // ── 걸음이 고치는 것.
  /** 값 한 줄이 섰나. */
  shown: boolean;
  /** 빅엔디언 줄이 놓였나. */
  bigLaid: boolean;
  /** 리틀엔디언 줄이 놓였나. 놓인 뒤에도 빅엔디언 줄은 그대로 남는다. */
  littleLaid: boolean;
  /** 두 줄을 제 규칙으로 읽었나 — 윗자리 표식과 읽은 수가 두 줄에 함께 선다. */
  ownRead: boolean;
  /** 리틀엔디언 줄을 빅엔디언 규칙으로 읽었나 — 잘못 읽은 줄이 아래에 앉는다. */
  misread: boolean;

  step: ByteOrderSceneStep | null;
  caption: ByteOrderSceneCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`shown` … `caption`)은 들지 않는다 — 그대로 넘기면 되감아도
 * 걸어온 자취가 남는다. 호출부는 **객체 리터럴**로 넘겨야 초과 속성 검사가 돌아
 * 이 좁히기가 실제로 막는다.
 */
type ByteOrderBase = Pick<ByteOrderScene, 'byteCount' | 'bytes'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ByteOrderBase): ByteOrderScene {
  return {
    byteCount: base.byteCount,
    bytes: base.bytes,
    shown: false,
    bigLaid: false,
    littleLaid: false,
    ownRead: false,
    misread: false,
    step: null,
    caption: null,
  };
}

/** 선언이 바이트 수를 말하지 않을 때의 칸 수. */
const FALLBACK_BYTES = 4;
/** 선언이 값을 말하지 않을 때. 0 이면 바이트가 전부 00 이라 화면이 거짓을 말하지 않는다. */
const FALLBACK_VALUE = 0;

function count(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw)
    ? Math.max(1, Math.floor(raw))
    : FALLBACK_BYTES;
}

function amount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : FALLBACK_VALUE;
}

/**
 * 빅엔디언 줄 — 주소 차례로 앉은 바이트. 큰 자리가 주소 0 이라 적는 차례 그대로다.
 *
 * 첨자가 곧 주소다. 바탕을 그대로 내주지 않고 베껴 돌려준다 — 받은 쪽이 제자리에서
 * 뒤집으면 과거의 장면까지 함께 바뀐다.
 */
export function bigRow(scene: ByteOrderScene): number[] {
  return [...scene.bytes];
}

/**
 * 리틀엔디언 줄 — 같은 바이트가 정반대 차례로 앉는다. 작은 자리가 주소 0 이다.
 *
 * 새 배열을 돌려준다. 장면의 바탕을 제자리에서 뒤집으면 과거가 함께 바뀐다.
 */
export function littleRow(scene: ByteOrderScene): number[] {
  return [...scene.bytes].reverse();
}

/** 그 읽기가 훑는 줄. 잘못 읽기는 리틀엔디언 줄을 읽는다 — 줄은 그대로다. */
export function rowOf(scene: ByteOrderScene, reading: ByteOrderReading): number[] {
  return reading === 'big' ? bigRow(scene) : littleRow(scene);
}

/**
 * 그 읽기가 훑어 가는 **주소의 차례**. 첫 주소가 윗자리다.
 *
 * 빅엔디언은 낮은 주소가 큰 자리라 왼쪽부터, 리틀엔디언은 높은 주소가 큰 자리라
 * 오른쪽부터 훑는다. 잘못 읽기는 리틀엔디언 줄을 **빅엔디언 차례로** — 즉 주소
 * 차례대로 — 훑는다. 그것이 이 조각이 말하는 어긋남이다.
 *
 * 훑는 테가 지나는 길도, 윗자리 표식이 서는 칸도, 이어 붙이는 차례도 전부 여기서
 * 나온다. 같은 물음에 답이 둘이 되지 않게 한 자리에만 둔다.
 */
export function readOrderOf(scene: ByteOrderScene, reading: ByteOrderReading): number[] {
  const order: number[] = [];
  for (let i = 0; i < scene.byteCount; i += 1) order.push(i);
  return reading === 'little' ? order.reverse() : order;
}

/**
 * 그 읽기가 윗자리로 보는 칸의 주소. 머무는 표식이 여기 선다.
 *
 * 리틀엔디언 줄에는 표식이 둘 선다 — 제 규칙의 윗자리(맨 오른쪽)와 잘못 읽기가
 * 윗자리로 본 칸(맨 왼쪽). 같은 줄의 양 끝에 둘이 서는 것이 결론 그 자체다.
 */
export function msbAddrOf(scene: ByteOrderScene, reading: ByteOrderReading): number {
  return readOrderOf(scene, reading)[0] ?? 0;
}

/**
 * 그 읽기가 내놓는 수 — **그려진 줄을 그 차례대로 이어 붙인 것**이다.
 *
 * 세 수가 한 함수에서 나온다. `big` 과 `little` 이 같은 수가 되는 것은 여기 적어
 * 둔 사실이 아니라 셈의 결과다 — 같은 바이트를 반대로 늘어놓고 반대로 읽으니
 * 되돌아온다. `misread` 만 차례가 어긋나 다른 수가 된다.
 */
export function valueOf(scene: ByteOrderScene, reading: ByteOrderReading): number {
  const row = rowOf(scene, reading);
  let acc = 0;
  for (const addr of readOrderOf(scene, reading)) acc = acc * 256 + (row[addr] ?? 0);
  return acc;
}

/**
 * 주소 `addr` 에 앉은 바이트가 값 줄에서 몇 번째 자리였나.
 *
 * 바이트마다 제 색을 끝까지 지니게 하는 데 쓴다. 색을 눈으로 좇으면 어느 바이트가
 * 어느 주소로 갔는지가 보이고, 그 색들이 두 줄에서 엇갈리는 것이 "뒤집힌다" 다.
 */
export function originAt(scene: ByteOrderScene, reading: ByteOrderReading, addr: number): number {
  return reading === 'big' ? addr : scene.byteCount - 1 - addr;
}

export const byteOrderScene: ScenePlan<ByteOrderScene> = {
  /**
   * 첫 장면은 빈 판이다 — 주소 눈금과 아직 아무것도 앉지 않은 칸 둘 줄.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** (S-scene). 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그린다. 여기서 쥐는 것은 수 둘이고, 바이트는 그 둘에서 값으로 갈라 둔다.
   *
   * 가르는 일은 algorithm 이 내주는 `splitBytes` 가 한다 — 그 규칙이 두 벌이 되지
   * 않게 한 자리에만 둔다. 장면이 algorithm 을 부르는 것은 허용 방향이다 (원칙 1 —
   * 장면이 projector 자리를 잇는다).
   */
  initial(initialData: unknown): ByteOrderScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const byteCount = count(d.byteCount);
    return atStart({ byteCount, bytes: splitBytes(amount(d.value), byteCount) });
  },

  reduce(scene: ByteOrderScene, event: FacetRuntimeEvent): ByteOrderScene {
    switch (event.type) {
      // 값이 바이트로 갈려 한 줄로 선다. 무엇이 어떻게 갈리는지는 바탕이 이미
      // 말하므로 걸음은 "이제 보인다" 만 말한다.
      case 'value-shown':
        return { ...scene, shown: true, step: { kind: 'show' }, caption: { kind: 'value' } };

      case 'laid-big':
        return { ...scene, bigLaid: true, step: { kind: 'lay-big' }, caption: { kind: 'big' } };

      // 빅엔디언 줄을 갈아 끼우지 않는다. 두 배치가 나란히 서야 견줄 짝이 남는다.
      case 'laid-little':
        return {
          ...scene,
          littleLaid: true,
          step: { kind: 'lay-little' },
          caption: { kind: 'little' },
        };

      case 'read-both':
        return { ...scene, ownRead: true, step: { kind: 'read-own' }, caption: { kind: 'same' } };

      case 'misread':
        return { ...scene, misread: true, step: { kind: 'misread' }, caption: { kind: 'misread' } };

      case 'rewind':
        return atStart({ byteCount: scene.byteCount, bytes: scene.bytes });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
