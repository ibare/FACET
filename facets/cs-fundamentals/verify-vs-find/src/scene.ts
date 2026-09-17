/**
 * verifyVsFind 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에 수 여섯과 목표가 서고, 그 아래 두 줄이 같은 크기의 칸으로 후보를 그린다 —
 * 확인 줄에 한 칸, 찾기 줄에 예순네 칸. 들여다본 자리는 테두리와 점이 진해져
 * 자취로 남고, 줄마다 **자(尺)** 가 그 자취를 감싸며 자란다. 자 옆의 수가 그 줄이
 * 들여다본 후보의 수다. 끝에 두 자가 나란히 서는데, 감싼 넓이의 차가 이 조각의
 * 결론이다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다. stage 의 `let` 과 **타입 선언**에 전부
 * 있었다.
 *
 * - **`type` 이 아니라 함수 인자의 인라인 유니온** — `paint(ref, 'idle' | 'seen'
 *   | 'answer')`. 어느 칸을 들여다보았는지, 어느 칸이 답인지가 **rect 의 `fill` ·
 *   `stroke` 와 점의 `fill` 에만** 있었다. 어떤 `let` grep 에도 안 걸린다.
 *   이제 `swept` 와 `found` 가 그것을 말한다.
 * - **`TileRef = { rect, dots }` · `const tiles: TileRef[]`** — DOM 손잡이 예순넷이
 *   `const` 로 묶여 판의 형편을 통째로 쥐고 있었다.
 * - **`let torchBox: Box`** — 횃불이 **지금 화면에서 어디 있나** 를 따로 적어 둔
 *   거울이고, 다음 걸음의 운동이 그것을 **출발값**으로 삼았다. `getAttribute` 를
 *   쓰지 않아 ④ 의 grep 을 통과한다. 되짚어 세운 직후에는 옛 화면의 것이라 자가
 *   엉뚱한 데서 자라기 시작한다. 이제 `step.from` 이 계기값을 싣는다.
 * - **`let shelfUsed`** — 선반에 답이 몇 개 앉았나. `found.length` 가 그것이다.
 * - **`let shelfPlateW`** — `setup` 이 실어 온 **답의 수**로 한 번 정해져 걸음을
 *   건너 살아 있었다. 답의 수는 전수를 다 훑기 전에는 알 수 없는 것인데 첫
 *   걸음이 그것을 알고 있었던 셈이다. 이제 선반에 앉은 답의 수에서 그때그때 낸다.
 * - **`'1'` 이라는 글자 리터럴** — 확인 줄이 들여다본 후보의 수가 stage 에 상수로
 *   박혀 있었고, 찾기 쪽 수는 `done` payload 의 `findSeen` 에서 왔다. **이 조각의
 *   자랑인 두 수가 화면의 자취와 다른 출처**였다. 이제 둘 다 `verifySeen` ·
 *   `findSeen` 이 장면의 자취에서 센다.
 *
 * 좌표는 담지 않는다. 후보의 **번호**와 자취의 **길이**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * `sweep` 의 `from` 이 운동의 **출발 그림**이다 — 자가 어디까지 자라 있었는지를
 * 알아야 거기서부터 늘릴 수 있다. 그것을 `prev` 에서 꺼내면 "`prev` 는 고르는
 * 데만" 을 어긴다 (S-scene).
 */
export type VerifyVsFindSceneStep =
  | { kind: 'pose' }
  | { kind: 'verify' }
  | { kind: 'sweep'; from: number; to: number; found: number[] }
  | { kind: 'settle' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). 수는 장면이 센다. */
export type VerifyVsFindSceneCaption =
  | { kind: 'setup' }
  | { kind: 'verify' }
  | { kind: 'sweep' }
  | { kind: 'hit' }
  | { kind: 'done' };

export type VerifyVsFindScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 고를 수 있는 수. 선언에서 값으로 베껴 온다. */
  values: number[];
  /** 부분집합의 합이 이것과 같으면 답이다. */
  target: number;

  // ── 걸음이 고치는 것.
  /** 수와 목표가 화면에 섰나. */
  posed: boolean;
  /** 건네받은 후보의 번호(비트마스크). 아직 안 건네받았으면 null. */
  given: number | null;
  /** 찾기 쪽이 지금까지 들여다본 후보의 수. 번호 0 부터 이만큼이 자취다. */
  swept: number;
  /** 답으로 드러난 후보의 번호. 드러난 차례대로. */
  found: number[];
  /** 다 훑었다고 매듭지었나. 횃불이 꺼지고 두 자만 남는다. */
  settled: boolean;
  step: VerifyVsFindSceneStep | null;
  caption: VerifyVsFindSceneCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`posed` · `given` · `swept` · `found` · `settled` · `step` ·
 * `caption`)은 들지 않는다 — 그대로 넘기면 되감아도 걸어온 자취가 남는다.
 * 호출부는 **객체 리터럴**로 넘겨야 초과 속성 검사가 돌아 이 좁히기가 실제로
 * 막는다.
 */
type VerifyVsFindBase = Pick<VerifyVsFindScene, 'values' | 'target'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면 · `setup` · 되감기가 함께 쓴다. */
function atStart(base: VerifyVsFindBase): VerifyVsFindScene {
  return {
    values: base.values,
    target: base.target,
    posed: false,
    given: null,
    swept: 0,
    found: [],
    settled: false,
    step: null,
    caption: null,
  };
}

/** 후보의 수 = 2^n. 구조에서 나오므로 발신에 실어 오지 않는다. */
export function candidateCount(scene: VerifyVsFindScene): number {
  return scene.values.length > 0 ? 2 ** scene.values.length : 0;
}

/** 확인 줄이 들여다본 후보의 수. 그 줄에 선 칸을 센 것이다. */
export function verifySeen(scene: VerifyVsFindScene): number {
  return scene.given === null ? 0 : 1;
}

/** 찾기 줄이 들여다본 후보의 수. 판에 남은 자취를 센 것이다. */
export function findSeen(scene: VerifyVsFindScene): number {
  return scene.swept;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function ints(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) out.push(Math.trunc(item));
  }
  return out;
}

export const verifyVsFindScene: ScenePlan<VerifyVsFindScene> = {
  /**
   * 첫 장면은 빈 판이다. 수도 목표도 아직 서지 않았다.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene). 수 목록을 값으로 베껴 둔다.
   */
  initial(initialData: unknown): VerifyVsFindScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(d.values) ? d.values : [];
    const values: number[] = [];
    for (const v of raw) {
      if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
    }
    return atStart({ values, target: int(d.target, 0) });
  },

  reduce(scene: VerifyVsFindScene, event: FacetRuntimeEvent): VerifyVsFindScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 수가 미끄러져 들어오고 목표가 내려앉는다. 자취는 여기서 비운다 — 되감은
      // 뒤 다시 도는 길이 이 걸음을 지나므로, 여기가 비우지 않으면 자취가 겹친다.
      case 'setup':
        return {
          ...atStart({ values: scene.values, target: scene.target }),
          posed: true,
          step: { kind: 'pose' },
          caption: { kind: 'setup' },
        };

      // 건네받은 후보 하나. 고른 수도 합도 번호에서 펼쳐진다.
      case 'verify-candidate':
        return {
          ...scene,
          given: int(p.mask, 0),
          step: { kind: 'verify' },
          caption: { kind: 'verify' },
        };

      // 묶음 하나를 훑는다. 어디서부터인지는 지금까지의 자취가 말한다.
      case 'sweep-block': {
        const from = scene.swept;
        const to = Math.max(from, int(p.to, from));
        const found = ints(p.found);
        return {
          ...scene,
          swept: to,
          found: [...scene.found, ...found],
          step: { kind: 'sweep', from, to, found },
          caption: found.length > 0 ? { kind: 'hit' } : { kind: 'sweep' },
        };
      }

      // 다 보고 나서야 다 봤다고 말할 수 있다. 두 자가 나란히 선다.
      case 'done':
        return { ...scene, settled: true, step: { kind: 'settle' }, caption: { kind: 'done' } };

      case 'rewind':
        return atStart({ values: scene.values, target: scene.target });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
