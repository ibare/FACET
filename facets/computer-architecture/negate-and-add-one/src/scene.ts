/**
 * negateAndAddOne 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 옛 화면은 자리표 **하나**를 제자리에서 고치고 있었다
 *
 * 숨은 상태는 stage 에 네 자리로 흩어져 있었고 그중 셋은 `let` grep 에 안 걸린다.
 *
 * - `let bits: number[]` — 지금 자리표. `flipAll` 이 `bits = next` 로 통째로 갈아
 *   끼우고 `flipOne` 이 `bits[i] = bit` 로 제자리에서 고쳤다. **원본은 여기서
 *   지워진다** — 뒤집는 순간 `00101101` 이 화면 어디에도 없어진다.
 * - `let memory: Tile[]` — 기억 줄. `flipAll` 이 원본을 여기에 베껴 두었다가
 *   `verify` 가 같은 칸의 글자를 **합으로 덮어썼고**(`paintSmall(tile, sum[i])`),
 *   `conclude` 가 그 줄을 납작하게 눌러 지웠다. 그러니 다 끝난 화면에는 원본도
 *   합도 없다 — **이 조각의 결론(원래 수와 더해서 0 이 된다)이 안 남아 있었다.**
 * - `memoryLayer` 의 `transform` — 좌표가 아니라 **단계**를 말한다. `translate(0 0)`
 *   이면 기억 줄이고 `translate(0 fall)` 이면 합 줄이다. 그 뜻을 적은 자리가 없다.
 * - `setReading(kind: 'unsigned' | 'signed', …)` — **함수 인자의 인라인 유니온.**
 *   지금 어느 약속으로 읽고 있나가 `reading.textContent` 에만 있었다.
 * - `verify` 첫 줄의 `if (memory.length !== cellCount) return` — 앞 걸음이 기억 줄을
 *   세워 두었나를 DOM 길이로 묻는 **암묵 분기**다. 걸음 순서가 곧 상태였다.
 *
 * ── 그래서 자리표를 **줄로 쌓는다**
 *
 * 여기서는 걸음마다 줄이 하나씩 늘 뿐 앞 줄을 고치지 않는다. 원본 · 뒤집음 ·
 * 하나 더함 · 검산의 합이 네 줄로 나란히 서고 끝까지 남는다. 조각 이름의 후반
 * (`and-add-one`)도, 결론의 근거(합이 0 이다)도 완주 화면에 그대로 있다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 비트의 값**(1 인가 0 인가). **테두리는 자리올림이 훑고 지나간 표식**이다.
 * 둘이 다른 것을 말하므로 한 칸이 "0 인데 자리올림이 지나갔다"(1 에서 넘어간 자리)를
 * 함께 말할 수 있다 — 2의 보수에서 뜻이 실린 자리가 정확히 거기다. 한 축에 값을
 * 셋 이상 싣지 않는다 (S-scene).
 *
 * ── 수는 자리표에서만 나온다
 *
 * 걸음은 자리표와 **판정**(자리올림이 몇 칸을 훑었나 · 폭 밖으로 나갔나)만 싣는다.
 * 부호 없이 읽은 값도 2의 보수로 읽은 값도 `algorithm.ts` 가 내준 순수 함수를
 * 장면이 불러 셈한다 — 읽는 약속은 조각의 알고리즘이 아니라 자리표를 읽는 규칙이고,
 * 떼어 내도 "뒤집고 하나 더한다" 는 남는다. 검산의 `addend` 도 싣지 않는다. 원본은
 * 장면이 이미 `origin` 줄로 쥐고 있어 두 출처가 될 자리가 없다.
 *
 * 좌표는 담지 않는다. 칸 수가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지는 쌓인 줄이 말하고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { signedOf, unsignedOf } from './algorithm.js';

/** 자리표 한 줄이 무엇인가. 쌓이는 차례가 곧 이 순서다. */
export type NegateRowKind = 'origin' | 'flipped' | 'result' | 'sum';

/**
 * 자리표 한 줄.
 *
 * `carrySteps` 는 자리올림이 **오른쪽 끝에서부터** 훑고 지나간 칸 수, `carryOut` 은
 * 그것이 폭 밖으로 나갔는지다. 덧셈이 아닌 줄은 둘 다 비어 있다.
 */
export type NegateRow = {
  readonly kind: NegateRowKind;
  readonly bits: readonly number[];
  readonly carrySteps: number;
  readonly carryOut: boolean;
};

export type NegateAndAddOneScene = {
  /** 자리표의 비트 폭. 바탕이라 걸음이 고치지 않는다. */
  readonly width: number;
  /** 지금까지 선 줄들. 앞 줄은 고쳐지지 않는다. */
  readonly rows: readonly NegateRow[];
  /** 2의 보수로 읽는 약속이 드러났나. 마지막 걸음이 세운다. */
  readonly concluded: boolean;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `rows` 와 `concluded` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 네 줄이 다 선 채로 서고 그 위에 algorithm 이 처음부터 다시 쌓는다 (S-scene).
 */
type NegateBase = Pick<NegateAndAddOneScene, 'width'>;

/**
 * 되돌린 뒤의 장면 — 빈 자리표 하나만 놓인다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 줄이 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: NegateBase): NegateAndAddOneScene {
  return { width: base.width, rows: [], concluded: false };
}

// ── 장면에서 파생하는 것들 ──────────────────────────────────────────────────

/** 그 줄. 아직 서지 않았으면 `undefined`. */
export function rowOf(scene: NegateAndAddOneScene, kind: NegateRowKind): NegateRow | undefined {
  return scene.rows.find((r) => r.kind === kind);
}

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓴다.
 *
 * 걸음마다 줄이 하나씩 느는 조각이라 "몇 번째 걸음인가" 를 따로 실을 까닭이 없다 —
 * 맨 뒤의 줄이 곧 방금 한 일이다.
 */
export type NegateStep = 'lay' | 'flip' | 'carry' | 'check' | 'tally';

export function stepOf(scene: NegateAndAddOneScene): NegateStep | null {
  if (scene.concluded) return 'tally';
  const last = scene.rows[scene.rows.length - 1];
  if (last === undefined) return null;
  switch (last.kind) {
    case 'origin':
      return 'lay';
    case 'flipped':
      return 'flip';
    case 'result':
      return 'carry';
    case 'sum':
      return 'check';
  }
}

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type NegateCaption =
  | { kind: 'start'; value: number; width: number }
  | { kind: 'flip' }
  | { kind: 'addOne' }
  | { kind: 'verify' }
  | { kind: 'conclude'; signed: number };

export function captionOf(scene: NegateAndAddOneScene): NegateCaption | null {
  if (scene.concluded) return { kind: 'conclude', signed: signedReading(scene) ?? 0 };
  const last = scene.rows[scene.rows.length - 1];
  if (last === undefined) return null;
  switch (last.kind) {
    case 'origin':
      // 화면에 뜨는 수는 그린 자리표에서 센다. 걸음이 실어 오지 않는다.
      return { kind: 'start', value: unsignedOf([...last.bits]), width: last.bits.length };
    case 'flipped':
      return { kind: 'flip' };
    case 'result':
      return { kind: 'addOne' };
    case 'sum':
      return { kind: 'verify' };
  }
}

/** 결과 줄을 부호 없이 읽은 값. 아직 그 줄이 없으면 `null`. */
export function unsignedReading(scene: NegateAndAddOneScene): number | null {
  const result = rowOf(scene, 'result');
  return result === undefined ? null : unsignedOf([...result.bits]);
}

/** 같은 자리표를 2의 보수로 읽은 값. 결론을 말하기 전에는 `null`. */
export function signedReading(scene: NegateAndAddOneScene): number | null {
  const result = rowOf(scene, 'result');
  if (result === undefined || !scene.concluded) return null;
  return signedOf([...result.bits]);
}

// ── unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function numOf(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * 자리표를 좁혀 **폭에 맞춘다.**
 *
 * 줄마다 칸 수가 다르면 열이 어긋나 덧셈으로 읽히지 않는다. 자르는 잣대를 여기
 * 하나만 둔다 — 그리는 쪽도 세는 쪽도 이 결과를 쓴다.
 */
function bitsOf(v: unknown, width: number): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const raw: number[] = [];
  for (const b of v) {
    if (typeof b !== 'number') return null;
    raw.push(b === 1 ? 1 : 0);
  }
  const out = raw.slice(Math.max(0, raw.length - width));
  while (out.length < width) out.unshift(0);
  return out;
}

/** 덧셈이 아닌 줄. 자리올림이 없다. */
function plainRow(kind: NegateRowKind, bits: number[]): NegateRow {
  return { kind, bits, carrySteps: 0, carryOut: false };
}

/** 자리올림의 판정을 실은 줄. 걸음이 내리는 판정이라 payload 에서 받는다. */
function carriedRow(kind: NegateRowKind, bits: number[], p: Record<string, unknown> | null): NegateRow {
  return {
    kind,
    bits,
    carrySteps: Math.max(0, Math.min(bits.length, Math.trunc(numOf(p?.carrySteps, 0)))),
    carryOut: p?.carryOut === true,
  };
}

/** 같은 줄이 두 번 서지 않게 한다. 앞 줄은 고치지 않는다 (S-scene). */
function withRow(scene: NegateAndAddOneScene, row: NegateRow): NegateAndAddOneScene {
  if (rowOf(scene, row.kind) !== undefined) return scene;
  return { ...scene, rows: [...scene.rows, row] };
}

export const negateAndAddOneScene: ScenePlan<NegateAndAddOneScene> = {
  /**
   * 첫 장면은 빈 자리표 하나뿐이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 폭을 읽는다.
   * 수(`value`)는 읽지 않는다 — 자리표는 걸음이 실어 오고, 여기서 또 셈하면 같은
   * 물음에 답이 둘이 된다. 폭은 수 하나라 넘겨받은 객체를 참조로 쥘 일이 없다
   * (S-scene).
   */
  initial(initialData: unknown): NegateAndAddOneScene {
    const raw = fields(initialData)?.width;
    const ok = typeof raw === 'number' && Number.isFinite(raw);
    return atStart({ width: ok ? Math.max(2, Math.min(16, Math.trunc(raw))) : 8 });
  },

  reduce(scene: NegateAndAddOneScene, event: FacetRuntimeEvent): NegateAndAddOneScene {
    const p = fields(event.payload);

    switch (event.type) {
      // 원본 자리표가 앉는다.
      case 'show-value': {
        const bits = bitsOf(p?.bits, scene.width);
        return bits === null ? scene : withRow(scene, plainRow('origin', bits));
      }

      // 모든 자리가 반대가 된 줄이 그 아래에 선다. 원본은 지워지지 않는다.
      case 'flip-all': {
        const bits = bitsOf(p?.bits, scene.width);
        return bits === null ? scene : withRow(scene, plainRow('flipped', bits));
      }

      // 1 을 더한 줄. 자리올림이 한 칸에서 멎는 것이 여기서 보인다.
      case 'add-one': {
        const bits = bitsOf(p?.bits, scene.width);
        return bits === null ? scene : withRow(scene, carriedRow('result', bits, p));
      }

      // 원본을 도로 더한 합. 자리올림이 폭 전체를 타고 나간다.
      case 'verify': {
        const bits = bitsOf(p?.sum, scene.width);
        return bits === null ? scene : withRow(scene, carriedRow('sum', bits, p));
      }

      // 합이 0 이라는 것이 곧 음수라는 뜻. 읽는 약속이 하나 더 드러난다.
      case 'done':
        return { ...scene, concluded: true };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ width: scene.width });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
