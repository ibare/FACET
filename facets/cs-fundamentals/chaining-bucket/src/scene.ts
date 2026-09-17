/**
 * chainingBucket 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 물음이 "같은 자리에 둘 이상이 오면 어떻게 되는가" 이므로, 화면이 말해야 하는
 * 것은 하나다 — **어느 칸에 무엇이 몇 개 달렸나.** 그것을 장면이 말하면 사슬의
 * 마디도, 마디를 잇는 줄도, 줄의 길이도 전부 그 구조에서 셈해진다. 마디를 하나씩
 * 덧붙이던 `makeNode` + `growLink` 호출 줄기가 사라진 자리다.
 *
 *   chains[b][d]   자리 b 의 사슬 d 번째 칸에 걸린 키. 이 조각의 본체다.
 *   probe          찾기의 형편 — 어느 자리로 갔고 사슬을 어디까지 훑었나.
 *
 * 옮기기 전 이 둘은 stage 안에만 있었다. `chains` 는 DOM 손잡이 배열(`ChainNode[][]`)
 * 이었고, 마디가 어떤 형편인지(`NodeState`)는 **아무 데도 적히지 않은 채** 사각형의
 * `fill` · `stroke` 칠에만 있었다. `lastCompared` 라는 `let` 하나가 "앞서 견준 칸을
 * 되돌린다" 는 명령을 쥐고 있었고, 그것이 되짚기가 어긋나던 자리다.
 *
 * 이제 그 형편이 `probe` 에서 **파생된다** — 훑은 깊이보다 앞이면 지나온 칸이고,
 * 같으면 지금 견주는 칸(맞았으면 찾은 칸)이며, 뒤면 아직 손대지 않은 칸이다.
 * 되돌리는 명령이 필요 없어진다.
 *
 * ── 머무는 것과 지나가는 것
 *
 * 사슬도, 질의 표가 켠 칸도, 마디의 형편도 전부 **남는다** — 정적으로 그릴 때
 * 들어간다. 지나가는 것은 `step` 하나뿐이고, 그리는 쪽은 그것을 보고 무엇을
 * 흐르게 할지 고른다.
 *
 * **부딪힘은 지나가는 강조다.** 같은 자리에 또 들어온 것을 화면이 남기는 방법은
 * 따로 있는 표식이 아니라 **사슬이 길다는 사실 자체**다 — `chains[b].length` 가
 * 그것을 말한다. 그러니 부딪힘 표식을 장면에 따로 두지 않는다. 옆 칸으로 돌아
 * 내려가 사슬 끝에 걸리는 몸짓만 그 걸음에서 흐른다.
 *
 * 좌표는 담지 않는다. 자리 수와 사슬 깊이라는 구조만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/** 사슬에 걸린 키 하나. 자리는 없다 — 이름과 해시라는 구조만 담는다. */
export type ChainingHung = {
  readonly key: string;
  /** Java `String.hashCode` 실측값. 마디 안에 작게 새긴다. */
  readonly hash: number;
};

/**
 * 찾기의 형편. 질의 표가 어느 자리에 가 있고 그 사슬을 어디까지 훑었나.
 *
 * 마디 하나하나의 칠을 적어 두지 않는다 — 여기서 파생된다. 사슬은 앞에서부터
 * 차례로 훑으므로 `at` 하나면 지나온 칸과 지금 칸이 갈린다.
 */
export type ChainingProbe = {
  /** 찾는 키. 질의 표에 적힌다. */
  readonly key: string;
  /** 곧장 날아간 자리. 이 칸만 켜진다. */
  readonly bucket: number;
  /** 지금 견주고 있는 사슬 깊이. 아직 자리에 막 왔으면 `null`. */
  readonly at: number | null;
  /** 그 칸이 찾던 것이었나. 맞은 자리는 `at` 이다. */
  readonly matched: boolean;
};

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 걸음마다 필요한 계기값을 스스로 싣는다 — 출발 그림을 `prev` 에서 꺼내면
 * "`prev` 는 고르는 데만" 을 어기기 때문이다 (S-scene).
 */
export type ChainingStep =
  /** 키 하나가 왼쪽 밖에서 들어와 자리 b 의 사슬 depth 번째 칸에 걸린다. */
  | { readonly kind: 'hang'; readonly bucket: number; readonly depth: number }
  /** 질의 표가 다른 자리를 건너뛰고 자리 b 로 날아온다. */
  | { readonly kind: 'jump'; readonly bucket: number }
  /**
   * 질의 표가 사슬을 한 칸 내려가 견준다.
   *
   * `from` 이 출발 그림의 계기값이다 — 내려오기 전에 어느 깊이에 있었나
   * (`null` 이면 아직 사슬 위, 들어오는 길 높이). 이것이 있어야 앞 장면을
   * 들추지 않고 출발 자리를 셈으로 복원한다 (S-scene).
   */
  | {
      readonly kind: 'compare';
      readonly bucket: number;
      readonly depth: number;
      readonly from: number | null;
    };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ChainingCaption =
  | { readonly kind: 'hangFirst'; readonly key: string; readonly bucket: number }
  | { readonly kind: 'hangCollide'; readonly key: string; readonly bucket: number }
  | { readonly kind: 'probeJump'; readonly key: string; readonly bucket: number }
  | { readonly kind: 'probeMiss'; readonly key: string }
  | { readonly kind: 'probeHit'; readonly key: string }
  | { readonly kind: 'done'; readonly bucket: number; readonly comparisons: number };

export type ChainingBucketScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 자리가 몇 개인가. 칸 폭과 사슬이 설 자리를 정한다. */
  readonly bucketCount: number;

  // ── 걸어온 자취. 전부 남는다 — 정적으로 그릴 때 들어간다.
  /** 자리별 사슬. 바깥 index 가 자리 번호, 안쪽 순서가 사슬 깊이. */
  readonly chains: readonly (readonly ChainingHung[])[];
  /** 찾기가 시작됐나, 어디까지 갔나. 아직이면 `null`. */
  readonly probe: ChainingProbe | null;

  readonly step: ChainingStep | null;
  readonly caption: ChainingCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 사슬은 걸음이 쌓는 것이므로 바탕이 아니다 — 여기 넣으면 되감은 화면이 이미 다
 * 걸린 채로 서고 그 위에 algorithm 이 처음부터 다시 걸게 된다 (프로토콜 4절).
 */
type ChainingBase = Pick<ChainingBucketScene, 'bucketCount'>;

const DEFAULT_BUCKETS = 8;

/** 아무것도 걸리지 않은 자리들. 자리마다 빈 사슬 하나씩. */
function emptyChains(bucketCount: number): readonly (readonly ChainingHung[])[] {
  return Array.from({ length: bucketCount }, () => [] as readonly ChainingHung[]);
}

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다.
 *
 * 호출부는 **객체 리터럴**로 넘긴다. 변수를 넘기면 TypeScript 의 초과 속성 검사가
 * 돌지 않아 장면 전체가 그대로 통과해, 좁힌 타입이 아무것도 막지 못한다 (프로토콜 4절).
 */
function atStart(base: ChainingBase): ChainingBucketScene {
  return {
    bucketCount: base.bucketCount,
    chains: emptyChains(base.bucketCount),
    probe: null,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** 표준 식별자 `index:<b>` 를 푼다. 정규식을 인라인으로 쓰지 않는다 (원칙 4). */
function firstBucket(target: FacetRuntimeEvent['target']): number | null {
  const indices = toIndexArray(target);
  return indices.length === 0 ? null : indices[0];
}

/** 사슬 하나에 마디를 얹은 **새** 자리 목록. 앞 장면의 배열은 건드리지 않는다. */
function withHung(
  chains: readonly (readonly ChainingHung[])[],
  bucket: number,
  hung: ChainingHung,
): readonly (readonly ChainingHung[])[] {
  return chains.map((chain, b) => (b === bucket ? [...chain, hung] : chain));
}

export const chainingBucketScene: ScenePlan<ChainingBucketScene> = {
  /**
   * 첫 장면은 자리만 세우고 비어 있다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 자리 수를
   * 읽는다. 읽는 것이 수 하나뿐이라 참조를 쥘 여지가 없다 — 배열이나 객체를
   * 그대로 담으면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): ChainingBucketScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const raw = num(d.bucketCount, DEFAULT_BUCKETS);
    const bucketCount = raw > 0 ? Math.floor(raw) : DEFAULT_BUCKETS;
    return atStart({ bucketCount });
  },

  reduce(scene: ChainingBucketScene, event: FacetRuntimeEvent): ChainingBucketScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 키 하나가 들어와 자기 자리의 사슬 끝에 걸린다. 먼저 온 것은 움직이지 않는다.
      case 'key-hung': {
        const bucket = firstBucket(event.target);
        const key = str(p.key);
        if (bucket === null || key === '' || bucket < 0 || bucket >= scene.bucketCount) {
          return scene;
        }
        // 걸리는 자리는 **사슬이 정한다.** payload 에도 depth 가 실려 오지만 셈을
        // 둘로 두면 어긋날 때 화면이 조용히 거짓이 된다 — 정본을 하나로 둔다.
        const depth = scene.chains[bucket].length;
        return {
          ...scene,
          chains: withHung(scene.chains, bucket, { key, hash: num(p.hash, 0) }),
          step: { kind: 'hang', bucket, depth },
          caption:
            depth === 0
              ? { kind: 'hangFirst', key, bucket }
              : { kind: 'hangCollide', key, bucket },
        };
      }

      // 찾는 키가 다른 자리를 훑지 않고 제 자리로 곧장 간다.
      case 'probe-jump': {
        const bucket = firstBucket(event.target);
        const key = str(p.key);
        if (bucket === null || key === '' || bucket < 0 || bucket >= scene.bucketCount) {
          return scene;
        }
        return {
          ...scene,
          probe: { key, bucket, at: null, matched: false },
          step: { kind: 'jump', bucket },
          caption: { kind: 'probeJump', key, bucket },
        };
      }

      // 그 사슬만 한 칸씩 내려가며 견준다.
      case 'probe-compare': {
        const bucket = firstBucket(event.target);
        const key = str(p.key);
        const probe = scene.probe;
        if (bucket === null || key === '' || probe === null || probe.bucket !== bucket) {
          return scene;
        }
        const depth = num(p.depth, -1);
        if (depth < 0 || depth >= scene.chains[bucket].length) return scene;
        const matched = p.match === true;
        return {
          ...scene,
          probe: { key: probe.key, bucket, at: depth, matched },
          step: { kind: 'compare', bucket, depth, from: probe.at },
          caption: matched ? { kind: 'probeHit', key } : { kind: 'probeMiss', key },
        };
      }

      // 다 말했다. 마지막 한 마디만 얹는다 — 흐르게 할 것이 없다.
      case 'done': {
        // 견준 횟수도 간 자리도 payload 에서 받지 않는다. 훑어 온 자취(`probe`)가
        // 이미 그것을 말하고 있고, 셈을 둘로 두면 어긋날 때 화면이 조용히 거짓이
        // 된다 — 칠해진 칸은 둘인데 캡션은 셋이라고 말하는 식이다. `key-hung` 의
        // `depth` 를 사슬 길이 하나로 둔 것과 같은 잣대다.
        const probe = scene.probe;
        if (probe === null) return scene;
        return {
          ...scene,
          step: null,
          caption: {
            kind: 'done',
            bucket: probe.bucket,
            // `at` 이 null 이면 자리로 가기만 하고 사슬은 짚지 않은 것이다.
            comparisons: probe.at === null ? 0 : probe.at + 1,
          },
        };
      }

      // 손으로 짚기 시작 — 자리 수만 두고 처음으로 돌아간다.
      case 'rewind':
        return atStart({ bucketCount: scene.bucketCount });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖의 것은 흘린다 (C2).
        return scene;
    }
  },
};
