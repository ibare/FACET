/**
 * pigeonholeCollision 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * `let` 은 여섯 곳뿐이었고 조회로 갈리는 분기도 DOM 되읽기도 grep 으로는 0 건이었다.
 * 곧 **화면이 통째로 상태**였다는 뜻이고, 실제로 알맹이는 전부 타입 선언 둘에 얹혀
 * 있었다.
 *
 * - **`type Chip = { group, box, label, x }`** — DOM 손잡이와 좌표가 한 객체인데,
 *   이 칩이 *드러났나*는 `group` 의 `opacity` 에, *자리에 들어갔나*는 `box` 의
 *   `fill` 에, *이것이 자리보다 하나 많은 그 입력인가*도 같은 `fill` 에 있었다.
 *   **한 축에 두 뜻이 실려** 넘치는 칩은 자리에 앉은 뒤에도 "들어갔다" 를 얻지
 *   못했다 (프로토콜 4 절 · 함정 29).
 * - **`type Slot = { box, label, occupant, x }`** — *찼나*는 `box` 의 `fill`,
 *   *둘이 앉았나*는 `box` 의 `stroke`, *누가 앉았나*는 `occupant` 의 글자였다.
 *   이쪽은 채움과 테두리가 이미 갈려 있었다.
 * - **`let snapshot: InitPayload | null`** — 바탕 자료의 사본을 stage 가 쥐고 있던
 *   자리. 이제 장면이 `init` 에서 **값을 베껴** 담는다 (S-scene).
 * - **projector 의 `let occupantInput`** — `fillers.find((f) => f.slot === overflow.slot)`
 *   으로 셈해 쥐던 값. 구조에서 나오는 것이라 장면이 센다 (`occupantName`).
 * - **`slot.occupant.textContent = \`${slot.occupant.textContent} ${input}\`\`** —
 *   화면이 제 글자를 도로 읽어 덧붙였다. 같은 걸음을 두 번 그리면 `aa ag ag` 가
 *   된다. 지금은 자리마다 **앉은 이름의 열**(`occupantsOf`)이라 그 물음이 없다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 옛 `init` 은 `slotCount` 를 따로 실어 왔는데 그 수는 `fillers` 의 길이다.
 * algorithm 주석이 스스로 "길이가 slotCount 와 같아야 자리가 꽉 찬다" 고 적어
 * 두었으니 **불변식이 주석에만 있고 코드가 지키지 않던 자리**다. 둘이 어긋나면
 * 자리가 덜 찬 화면 위에 "모두 찼다" 는 캡션이 뜬다. 장면이 `fillers` 의 길이로
 * 세므로 이제 갈릴 자리가 없다.
 *
 * 남긴 것은 **자리 번호**다. `fillers[i].slot` 과 `overflow.slot` 은 SHA-256 의
 * 마지막 니블이라 구조에서는 셀 수 없는 실측값이고, 그 해시를 장면이 다시 푸는
 * 것은 조각이 피하려는 셈을 장면이 하는 꼴이 된다 (프로토콜 4 절 B 갈래의 경계).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 자리 수와 어느 입력이 어느 자리로 떨어지는가라는 **구조**만
 * 담고 화면 자리는 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 * 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 입력 하나 — 이름과 그 이름이 떨어지는 자리 번호.
 *
 * 자리 번호는 SHA-256 의 마지막 니블이라 실측값이다. 좌표가 아니라 구조다.
 */
export type PigeonholeSeat = {
  readonly input: string;
  readonly slot: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 칩이 어디서 출발해 어느 자리로 내려가는지도,
 * 빈 자리가 어떤 칠에서 물드는지도 전부 바탕과 상수에서 셈하므로 `prev` 를 들출
 * 일이 없다 (S-scene).
 */
export type PigeonholeStep =
  /** 빈 자리 N 칸과 대기열이 함께 떠오른다. */
  | { readonly kind: 'slots' }
  /** 입력들이 하나씩 자리로 내려가 자리를 다 채운다. */
  | { readonly kind: 'fill' }
  /** 자리보다 하나 많은 그 입력이 대기열 끝에 내려앉는다. */
  | { readonly kind: 'extra' }
  /** 갈 곳이 없어 이미 찬 자리에 겹쳐 앉는다. */
  | { readonly kind: 'collide' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type PigeonholeCaption =
  | { readonly kind: 'filled'; readonly count: number }
  | { readonly kind: 'oneMore'; readonly count: number; readonly n: number }
  | { readonly kind: 'collide'; readonly overflow: string; readonly occupant: string };

/**
 * 대기열의 칩 하나 — 화면이 아니라 형편이다.
 *
 * 채움과 표식을 **각자 제 축에 둔다.** `seated` 는 값의 형편(자리에 들어갔나)이라
 * 채움이 말하고, `extra` 는 표식(자리보다 하나 많은 그것인가)이라 테두리가 말한다.
 * 옛 화면은 둘을 한 `fill` 에 실어 넘치는 칩이 자리에 앉은 뒤에도 다른 칩들과
 * 같은 칠을 얻지 못했다.
 */
export type PigeonholeChip = {
  readonly input: string;
  readonly slot: number;
  /** 자리보다 하나 많은 그 입력인가. */
  readonly extra: boolean;
  /** 이미 드러났나. 아직이면 **숨기지 말고 짓지 않는다**. */
  readonly shown: boolean;
  /** 자리에 들어갔나. */
  readonly seated: boolean;
};

export type PigeonholeScene = {
  // ── 바탕. `init` 이 값을 베껴 채우고 걸음이 고치지 않는다.
  /** 자리를 하나씩 채우는 입력들. **길이가 곧 자리 수다.** */
  readonly fillers: readonly PigeonholeSeat[];
  /** 자리가 다 찬 뒤 들어오는 입력. 아직 바탕을 못 받았으면 `null`. */
  readonly overflow: PigeonholeSeat | null;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 빈 자리와 대기열을 세웠나. */
  readonly slotsShown: boolean;
  /** 입력들이 자리를 다 채웠나. */
  readonly filled: boolean;
  /** 하나 많은 그 입력이 대기열에 섰나. */
  readonly extraShown: boolean;
  /** 그 입력이 남의 자리에 겹쳐 앉았나. */
  readonly collided: boolean;

  readonly step: PigeonholeStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `slotsShown` 부터 `collided` 까지는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 찬 자리를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 채우는 것이 겹친다 (프로토콜 4 절).
 */
type PigeonholeBase = Pick<PigeonholeScene, 'fillers' | 'overflow'>;

/**
 * 바탕만 남기고 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (프로토콜 4 절).
 */
function atStart(base: PigeonholeBase): PigeonholeScene {
  return {
    fillers: base.fillers,
    overflow: base.overflow,
    slotsShown: false,
    filled: false,
    extraShown: false,
    collided: false,
    step: null,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 입력 하나를 **값으로** 베낀다. 러너가 주는 객체를 참조로 쥐지 않는다 (S-scene). */
function readSeat(raw: unknown): PigeonholeSeat | null {
  const f = fields(raw);
  if (f === null) return null;
  const input = str(f.input);
  const slot = num(f.slot);
  if (input === '' || slot === null || slot < 0) return null;
  return { input, slot: Math.round(slot) };
}

function readSeats(raw: unknown): PigeonholeSeat[] {
  if (!Array.isArray(raw)) return [];
  const out: PigeonholeSeat[] = [];
  for (const item of raw) {
    const seat = readSeat(item);
    if (seat !== null) out.push(seat);
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수와 이름은 전부 여기를 지난다. 자리의 칠도 칩의 칠도 캡션의 이름도
// 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * 자리가 몇 칸인가.
 *
 * **입력 목록의 길이가 곧 자리 수다.** 자리를 하나씩 채우도록 고른 목록이므로
 * 그 둘이 같다는 것은 정의이지 우연이 아니다. 따로 실어 오면 어긋날 때 화면이
 * 조용히 거짓이 된다.
 */
export function slotCount(scene: PigeonholeScene): number {
  return scene.fillers.length;
}

/**
 * 자리마다 앉은 입력의 이름들, 앉은 차례대로.
 *
 * **한 자리에 둘이 앉는 것이 이 조각의 전부**이므로 자리마다 열을 둔다. 옛 화면은
 * 글자 하나에 그것을 담고 제 글자를 도로 읽어 덧붙였다.
 */
export function occupantsOf(scene: PigeonholeScene): readonly (readonly string[])[] {
  const seats: string[][] = Array.from({ length: slotCount(scene) }, () => []);
  if (scene.filled) {
    for (const f of scene.fillers) {
      const seat = seats[f.slot];
      if (seat !== undefined) seat.push(f.input);
    }
  }
  const over = scene.overflow;
  if (scene.collided && over !== null) {
    const seat = seats[over.slot];
    if (seat !== undefined) seat.push(over.input);
  }
  return seats;
}

/**
 * 넘치는 입력이 앉을 자리에 **이미 앉아 있던** 이름.
 *
 * projector 가 `let` 으로 쥐던 값이다. 구조에서 나오므로 장면이 센다.
 */
export function occupantName(scene: PigeonholeScene): string {
  const over = scene.overflow;
  if (over === null) return '';
  return scene.fillers.find((f) => f.slot === over.slot)?.input ?? '';
}

/**
 * 대기열에 세울 칩들. 넘치는 것이 마지막에 온다.
 *
 * 아직 안 드러난 칩도 목록에는 들어간다 — 자리를 전체 수로 셈해야 넘치는 칩이
 * 나중에 나타나도 앞의 칩들이 밀리지 않는다. 짓지 말지는 `shown` 이 말한다.
 */
export function chipsOf(scene: PigeonholeScene): readonly PigeonholeChip[] {
  const out: PigeonholeChip[] = scene.fillers.map((f) => ({
    input: f.input,
    slot: f.slot,
    extra: false,
    shown: scene.slotsShown,
    seated: scene.filled,
  }));
  const over = scene.overflow;
  if (over !== null) {
    out.push({
      input: over.input,
      slot: over.slot,
      extra: true,
      shown: scene.extraShown,
      seated: scene.collided,
    });
  }
  return out;
}

/**
 * 지금 화면이 할 말. 자취에서 파생된다.
 *
 * 장면에 캡션 필드를 따로 두지 않는다 — 자취가 이미 그것을 말하므로 필드를 두면
 * 같은 물음에 답이 둘이 된다.
 */
export function captionOf(scene: PigeonholeScene): PigeonholeCaption | null {
  const over = scene.overflow;
  if (scene.collided && over !== null) {
    return { kind: 'collide', overflow: over.input, occupant: occupantName(scene) };
  }
  const count = slotCount(scene);
  if (scene.extraShown) return { kind: 'oneMore', count, n: count + 1 };
  if (scene.filled) return { kind: 'filled', count };
  return null;
}

export const pigeonholeCollisionScene: ScenePlan<PigeonholeScene> = {
  /**
   * 첫 장면은 비어 있다. 바탕은 `init` 발신이 **값을 베껴** 채운다.
   *
   * 러너가 주는 `initialData` 는 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를
   * 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(): PigeonholeScene {
    return atStart({ fillers: [], overflow: null });
  },

  reduce(scene: PigeonholeScene, event: FacetRuntimeEvent): PigeonholeScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 바탕이 들어온다. 자리 수는 싣지 않는다 — 입력 목록의 길이가 그것이다.
       *
       * 이 발신은 화면에 아무것도 세우지 않으므로 `silent` 로 온다. 앞 걸음(첫
       * 장면)의 장면을 갈아 끼우고 눈금을 늘리지 않는다.
       */
      case 'init': {
        const fillers = readSeats(p?.fillers);
        const overflow = readSeat(p?.overflow);
        if (fillers.length === 0 || overflow === null) return scene;
        return atStart({ fillers, overflow });
      }

      /* 빈 자리가 선다. 몇 칸인가는 바탕이 말한다. */
      case 'reveal-slots':
        return { ...scene, slotsShown: true, step: { kind: 'slots' } };

      /* 입력들이 자리를 하나씩 채운다. 누가 어디로 가는지는 바탕의 자리 번호다. */
      case 'fill-slots':
        return { ...scene, filled: true, step: { kind: 'fill' } };

      /* 자리보다 하나 많은 그 입력이 대기열에 선다. */
      case 'reveal-overflow':
        return { ...scene, extraShown: true, step: { kind: 'extra' } };

      /* 갈 곳이 없다 — 이미 누가 앉은 자리에 겹쳐 앉는다. 이 조각의 결정타다. */
      case 'place-overflow':
        return { ...scene, collided: true, step: { kind: 'collide' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다. 객체 리터럴로 넘긴다. */
      case 'rewind':
        return atStart({ fillers: scene.fillers, overflow: scene.overflow });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
