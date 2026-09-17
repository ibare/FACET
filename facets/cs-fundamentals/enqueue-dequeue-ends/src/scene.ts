/**
 * EnqueueDequeueEnds 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 줄의 두 끝이 어디서 나오나
 *
 * 이 조각의 주장은 "드나드는 문이 서로 반대편이면 먼저 들어온 것이 먼저 나온다" 이고,
 * 그 말이 서려면 **앞과 뒤가 무엇인지**가 분명해야 한다. 앞서 그것은 화면에만 있었다 —
 * projector 가 정거장 번호 배열(`stations`) 을 쥐고 번호를 하나씩 깎았고, 무엇이 아직
 * 줄 안이고 무엇이 이미 빠져나갔는지는 그 번호가 얼마인지로만 갈렸다. 어느 걸음이든
 * 처음부터 다시 밟아야 알 수 있는 값이다.
 *
 * 여기서는 줄에 선 것들을 장면이 **차례로** 말한다.
 *
 *   waiting  아직 뒤쪽 문 앞에 선 것들 — 넣을 차례 그대로
 *   lane     줄 안에 선 것들 — 0 번이 앞(다음에 나갈 것), 끝이 뒤(방금 들어온 것)
 *   gone     앞쪽 문을 넘은 것들 — 나온 차례 그대로
 *
 * 두 끝이 그 구조에서 저절로 나온다. `lane[0]` 이 앞이고 `lane[lane.length-1]` 이
 * 뒤다. 들어오는 것은 늘 뒤에 붙고 나가는 것은 늘 앞에서 떨어진다 — 그 둘만 지키면
 * 차례가 지켜진다는 것이 이 조각이 보이려는 전부다.
 *
 * 정거장 번호는 담지 않는다. 그것은 좌표라 캔버스가 바뀌면 뜻이 달라진다 (S-piece).
 * 셋의 길이만 있으면 어느 값이 몇 번째 자리에 서는지 그리는 쪽이 셈한다.
 *
 * 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 `params.t`
 * 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 줄을 타는 값 하나.
 *
 * `order` 는 몇 번째로 들어왔는지(0-based)이자 처음에 어느 대기 자리에 서 있었는지다.
 * 값이 떠난 대기 자리에 남는 자국이 그 번호로 그려지므로, 나온 차례와 들어간 차례를
 * 화면이 나란히 읽을 수 있다.
 */
export type QueueRider = { value: number; order: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type QueueCaption =
  | { kind: 'doors' }
  | { kind: 'in'; value: number }
  | { kind: 'out'; value: number }
  | { kind: 'sameOrder'; inOrder: number[]; outOrder: number[] };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 출발 그림은 여기 담지 않는다 — 들어오는 값은 자기 대기 자리에서 오고 나가는 걸음은
 * 줄에 선 모두가 한 칸씩 오므로, 둘 다 장면의 세 줄에서 셈으로 복원된다. 그래서
 * `render` 가 `prev` 를 들출 일이 없다 (S-scene "prev 는 고르는 데만").
 */
export type QueueStep =
  | { kind: 'doors' }
  /** `order` 번째 값이 뒤쪽 문으로 들어와 줄 끝에 붙는다. */
  | { kind: 'admit'; order: number }
  /** 앞쪽 문으로 하나가 빠지고 남은 것 전부가 한 칸 앞으로 나아간다. */
  | { kind: 'release' };

export type EnqueueDequeueEndsScene = {
  /**
   * 넣을 값들 — 넣는 차례 그대로. `rewind` 가 여기서 처음 장면을 다시 셈한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  seed: readonly number[];
  /** 아직 뒤쪽 문 앞에 선 것들. 넣을 차례 그대로다. */
  waiting: readonly QueueRider[];
  /** 줄 안에 선 것들. 0 번이 앞(다음에 나갈 것), 끝이 뒤(방금 들어온 것). */
  lane: readonly QueueRider[];
  /** 앞쪽 문을 넘은 것들. 나온 차례 그대로다. */
  gone: readonly QueueRider[];
  /**
   * 들어간 차례와 나온 차례가 같다고 못박았나.
   *
   * 반짝였다 돌아오는 강조가 아니라 **남는** 강조라 정적 그리기에도 들어간다 —
   * 빠뜨리면 마지막 걸음으로 되짚었을 때 결론이 사라진다 (S-scene PREFER).
   */
  matched: boolean;
  caption: QueueCaption | null;
  step: QueueStep | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

/**
 * 아무도 아직 문을 지나지 않은 처음 장면.
 *
 * 걸음이 고치는 것(`waiting` · `lane` · `gone` · `matched`)을 바탕과 함께 넘기지
 * 않는다. 바탕은 `seed` 뿐이고 나머지는 여기서 다시 셈한다 — 넘기면 되감은 화면이
 * 이미 걸어간 자리를 그대로 들고 서게 된다.
 */
function atStart(seed: readonly number[]): EnqueueDequeueEndsScene {
  return {
    seed,
    waiting: seed.map((value, order) => ({ value, order })),
    lane: [],
    gone: [],
    matched: false,
    caption: null,
    step: null,
  };
}

export const enqueueDequeueEndsScene: ScenePlan<EnqueueDequeueEndsScene> = {
  /**
   * 첫 장면은 대기 줄에 늘어선 값들이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `nums` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): EnqueueDequeueEndsScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    return atStart(nums(raw.values));
  },

  reduce(
    scene: EnqueueDequeueEndsScene,
    event: FacetRuntimeEvent,
  ): EnqueueDequeueEndsScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 두 문을 한 번 짚는다. 줄은 그대로고 전제만 세우는 걸음이다.
      case 'lane-ready':
        return { ...scene, caption: { kind: 'doors' }, step: { kind: 'doors' } };

      // 뒤쪽 문으로 하나가 들어와 줄 **끝**에 붙는다. 대기 줄에서는 그만큼 빠진다.
      case 'enqueue': {
        const order = typeof p.order === 'number' ? p.order : -1;
        const entering = scene.waiting.find((rider) => rider.order === order);
        if (!entering) return scene;
        return {
          ...scene,
          waiting: scene.waiting.filter((rider) => rider.order !== order),
          lane: [...scene.lane, entering],
          caption: { kind: 'in', value: entering.value },
          step: { kind: 'admit', order },
        };
      }

      // 앞쪽 문으로 줄의 **맨 앞**이 빠진다. 뒤에 선 것들은 서로를 앞지르지 못하므로
      // 차례가 그대로 한 칸씩 앞으로 밀린다.
      case 'dequeue': {
        const [front, ...rest] = scene.lane;
        if (!front) return scene;
        return {
          ...scene,
          lane: rest,
          gone: [...scene.gone, front],
          caption: { kind: 'out', value: front.value },
          step: { kind: 'release' },
        };
      }

      // 두 차례를 나란히 놓고 같다고 못박는다. 흐르게 할 것은 없다.
      case 'done':
        return {
          ...scene,
          matched: true,
          caption: {
            kind: 'sameOrder',
            inOrder: nums(p.inOrder),
            outOrder: nums(p.outOrder),
          },
          step: null,
        };

      case 'rewind':
        return atStart(scene.seed);

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
