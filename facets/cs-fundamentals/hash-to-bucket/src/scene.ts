/**
 * HashToBucket 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 아래에는 자리 띠가 깔려 있고, 그 위에서 키 하나가 **두 번 접힌다**. 글자 칸으로
 * 나타났다가 → 하나의 정수 칩으로 모이고 → 부호 비트 조각을 떨구고 → 자리 띠를
 * 감아 돌다 제 칸에 눌려 들어가 이름표가 된다.
 *
 * 그러니 **머무는 것**은 셋뿐이다.
 *
 *   - 자리 개수 (`bucketCount`) — 저작 선언이 정하고 끝까지 그대로다.
 *   - 접히는 중인 키 (`fold`)   — 네 모습 중 하나로 화면 가운데에 서 있다.
 *   - 자리에 앉은 이름표 (`tags`) — 쌓이는 자취라 되짚어도 남아야 한다.
 *
 * **지나가는 것**은 방금 무슨 걸음을 밟았나 하나뿐이고 (`step`), 그리는 쪽은 그것을
 * 보고 무엇을 흐르게 할지 고른다. 자리 칸이 잠깐 빛나는 것은 걸음 안에서만 살다
 * 가므로 장면에 담지 않는다.
 *
 * ── 셈의 중간값을 화면의 문자열에 맡기지 않는다
 *
 * 옛 stage 는 해시값 · 나머지 · 자리 번호를 칩의 `textContent` 에만 얹어 두고 다음
 * 걸음에서 그 위에 덮어썼다. 그래서 되짚어 세운 직후에는 그 문자열이 아직 옛 화면의
 * 것이라 폭을 역산하는 셈이 틀어졌다. 여기서는 `hash` · `masked` · `slot` 이 전부
 * 장면의 수로 올라와 있고, 그리는 쪽은 문자열을 읽지 않는다.
 *
 * 좌표는 담지 않는다. 자리 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 칩의 폭, 띠의 피치, 이름표가 쌓이는 높이는 전부 그림의 몫이다.
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 접히는 중인 키 — 네 걸음 중 어디까지 왔고 무엇을 들고 있나.
 *
 * 지나온 값(`key` → `hash` → `masked`)을 함께 지니는 것은, 흐르게 그릴 때 출발
 * 그림을 셈으로 복원하기 위해서다 — 그리는 쪽이 `prev` 를 들춰 보지 않아도 된다.
 * 접힘 걸음은 글자 칸에서 출발하고, 부호 비트를 떨구는 걸음은 부호 비트가 아직
 * 붙은 칩에서 출발한다.
 */
export type FoldStage =
  | { kind: 'key'; key: string }
  | { kind: 'hash'; key: string; hash: number; signBit: number }
  | { kind: 'masked'; key: string; hash: number; signBit: number; masked: number };

/**
 * 자리에 앉은 이름표 하나. 좌표도 쌓인 높이도 담지 않는다 — 배열의 차례가 곧
 * 그 자리에 몇 번째로 앉았나이고, 그리는 쪽이 거기서 높이를 셈한다.
 */
export type BucketTag = { key: string; slot: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `land` 만 계기값을 싣는다 — 값이 자리에 앉고 나면 접히던 수(`masked`)가 장면에서
 * 사라지므로, 출발 그림을 셈으로 복원하려면 그 걸음이 들고 있어야 한다.
 */
export type FoldStep =
  | { kind: 'key' }
  | { kind: 'fold' }
  | { kind: 'mask' }
  | { kind: 'land'; key: string; masked: number; slot: number }
  | { kind: 'settle' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type FoldCaption =
  | { kind: 'key'; key: string }
  | { kind: 'fold'; hash: number }
  | { kind: 'mask'; hash: number; masked: number }
  | { kind: 'bucket'; masked: number; count: number; slot: number }
  | { kind: 'done'; count: number };

export type HashToBucketScene = {
  /** 자리(버킷) 개수. 나머지 연산의 제수이고 띠의 칸 수다. */
  bucketCount: number;
  /** 접히는 중인 키. 없으면 가운데가 비어 있다. */
  fold: FoldStage | null;
  /** 자리에 앉은 이름표들. 앉은 차례대로 — 되짚어도 남는 자취다. */
  tags: BucketTag[];
  step: FoldStep | null;
  caption: FoldCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `tags` 는 걸어온 자취이므로 여기 넣지 않는다. 넣으면 되감은 화면에 앞 주행의
 * 이름표가 앉은 채로 서고 그 위에 algorithm 이 새로 접어 넣는 것이 겹친다
 * (S-scene · 프로토콜 4 절).
 */
type FoldBase = Pick<HashToBucketScene, 'bucketCount'>;

/**
 * 아무것도 접히지 않은 처음 화면. 자리 띠만 깔려 있다.
 *
 * 호출부는 반드시 객체 리터럴을 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 `tags` 가 실린 장면도 그대로 통과한다.
 */
function atStart(base: FoldBase): HashToBucketScene {
  return { bucketCount: base.bucketCount, fold: null, tags: [], step: null, caption: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export const hashToBucketScene: ScenePlan<HashToBucketScene> = {
  /**
   * 첫 장면은 자리 개수만 안다.
   *
   * 자리 띠는 저작 선언이 정하므로 (`initialData.bucketCount`) 첫 그림부터 깔려
   * 있어야 한다 — 옛 stage 도 mount 때 그것을 읽어 세웠다. 넘겨받은 객체를 쥐지
   * 않고 **수 하나를 복사해** 온다. 참조를 쥐면 되짚을 때 이미 다 굴러간 자료로
   * 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): HashToBucketScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const count = num(d.bucketCount);
    return atStart({ bucketCount: Number.isInteger(count) && count > 0 ? count : 0 });
  },

  reduce(scene: HashToBucketScene, event: FacetRuntimeEvent): HashToBucketScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      case 'key-shown': {
        if (typeof p.key !== 'string') return scene;
        return {
          ...scene,
          fold: { kind: 'key', key: p.key },
          step: { kind: 'key' },
          caption: { kind: 'key', key: p.key },
        };
      }

      case 'hash-folded': {
        if (typeof p.hash !== 'number' || typeof p.signBit !== 'number') return scene;
        const key = str(p.key, scene.fold?.key ?? '');
        return {
          ...scene,
          fold: { kind: 'hash', key, hash: p.hash, signBit: p.signBit },
          step: { kind: 'fold' },
          caption: { kind: 'fold', hash: p.hash },
        };
      }

      case 'sign-dropped': {
        const fold = scene.fold;
        // 접히지 않은 키에서는 부호 비트를 떨굴 수 없다. 조용히 흘린다 (C2).
        if (fold === null) return scene;
        if (typeof p.hash !== 'number' || typeof p.masked !== 'number') return scene;
        const signBit = num(p.signBit, fold.kind === 'key' ? 0 : fold.signBit);
        return {
          ...scene,
          fold: { kind: 'masked', key: fold.key, hash: p.hash, signBit, masked: p.masked },
          step: { kind: 'mask' },
          caption: { kind: 'mask', hash: p.hash, masked: p.masked },
        };
      }

      case 'bucket-landed': {
        if (
          typeof p.key !== 'string' ||
          typeof p.masked !== 'number' ||
          typeof p.slot !== 'number'
        ) {
          return scene;
        }
        return {
          ...scene,
          // 접히던 수는 자리로 눌려 들어가며 이름표가 된다 — 가운데는 다시 빈다.
          fold: null,
          tags: [...scene.tags, { key: p.key, slot: p.slot }],
          step: { kind: 'land', key: p.key, masked: p.masked, slot: p.slot },
          // 자리 수는 선언이 정하고 끝까지 그대로다. payload 도 같은 값을 싣지만
          // 거기서 받으면 `initial` 의 소독을 우회하고 바탕이 걸음에 물든다.
          caption: { kind: 'bucket', masked: p.masked, count: scene.bucketCount, slot: p.slot },
        };
      }

      // 손으로 짚기 시작 — 자리 띠만 남기고 접힌 것도 앉은 것도 전부 거둔다.
      case 'rewind':
        return atStart({ bucketCount: scene.bucketCount });

      // 할 말을 마치고 결론만 말한다. 앉은 이름표는 그대로 두고 캡션만 바뀐다.
      case 'done': {
        const count = scene.bucketCount;
        return {
          ...scene,
          fold: null,
          step: { kind: 'settle' },
          caption: { kind: 'done', count },
        };
      }

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
