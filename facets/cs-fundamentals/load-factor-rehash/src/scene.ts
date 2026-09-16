/**
 * loadFactorRehash 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 판 하나와 그 위의 칩 여섯이 있고, 걸음마다 달라지는 것은 셋뿐이다 — 판의 칸
 * 수가 늘거나, 칩 하나가 새로 앉거나, 칩 하나가 다른 칸으로 다시 앉는다. 그래서
 * 걸음이 고치는 것은 둘이다.
 *
 *   buckets   지금 판의 칸 수. 좁은 판이면 `cols`, 넓힌 뒤면 `grownBuckets`.
 *   chips     칩마다 "어느 칸에 앉았나 · 어떻게 칠해지나". 아직 판 밖이면 slot 이 null.
 *
 * 나머지 넷은 **바탕**이라 아무도 고치지 않는다 — `cols` · `grownBuckets` ·
 * `threshold` · `keys` · `incoming`. 되감기가 여기로 돌아간다.
 *
 * ── 적재율은 담지 않는다. 담긴 수와 칸 수가 이미 말한다
 *
 * 화면에 뜨는 것은 `6 / 16 = 0.375` 와 그만큼 찬 막대다. 그 셋은 모두 "앉은 칩이
 * 몇이고 판이 몇 칸인가" 에서 나오므로 장면은 그 둘만 쥔다 — 비율을 따로 담으면
 * 칩과 어긋날 수 있고, 어긋나면 화면 안에서 두 수가 다투게 된다. 세는 자리는
 * `loadedCount` 하나뿐이고 캡션의 인자도 거기서 나온다.
 *
 * ── 옛 판은 `prev` 가 아니라 표식의 계기값에서 복원한다
 *
 * 판이 넓어지는 걸음은 새 줄이 **펼쳐지는** 운동이라 옛 판의 크기가 있어야 그린다.
 * 앞 장면을 그리기 재료로 쓰면 "`prev` 는 고르는 데만" 을 어기므로, `mark` 가
 * 이번에 무엇이 달라졌는지와 그 계기값을 함께 싣는다 — `{ kind: 'grown', from }`
 * 의 `from` 이 넓히기 전 칸 수이고, `{ kind: 'rehashed', from, to }` 의 `from` 이
 * 칩이 들리기 시작하는 칸이다 (S-scene).
 *
 * 좌표는 담지 않는다. 열은 언제나 `cols` 이고 줄은 `slot / cols` 이므로 자리는
 * 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고, 문자는 그리는 쪽이
 * `params.t` 로 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 한다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 칩 하나의 칠.
 *
 * `moved` · `kept` 는 다시 셈한 뒤 **남는** 칠이다. 반짝이고 마는 것이 아니라
 * "이 키는 자리가 바뀌었다 / 그대로였다" 는 결론 자체라 정적 그리기에도 든다
 * (S-scene). 들렸다 앉는 동안의 `checking` 은 지나가는 것이라 장면에 없다.
 */
export type RehashChipState = 'idle' | 'incoming' | 'moved' | 'kept';

/** 바탕 명부의 키 하나. 좁은 판에서의 자리만 담는다 — 되감기가 여기로 돌아간다. */
export type RehashKeyScene = {
  key: string;
  /** 좁은 판에서의 자리. */
  slot: number;
};

/** 칸 위의 칩 하나. 걸음이 고치는 것은 이 둘뿐이다. */
export type RehashChipScene = {
  key: string;
  /** 지금 앉은 칸. 아직 판 밖에서 기다리면 null. */
  slot: number | null;
  state: RehashChipState;
};

/** 계산식 줄이 말할 것. `masked % buckets = slot` 이라는 수식의 인자다. */
export type RehashFormula = {
  key: string;
  masked: number;
  buckets: number;
};

/**
 * 이번 걸음에 달라진 것. 흐르게 할 것을 고르는 표식이자 출발 그림의 계기값이다.
 *
 * 되짚기(`animate` 거짓)에서는 쳐다보지 않는다 — 지나온 걸음을 되밟을 까닭이 없다.
 */
export type RehashMark =
  | { kind: 'seated'; key: string }
  | { kind: 'grown'; from: number }
  | { kind: 'rehashed'; key: string; from: number; to: number };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다.
 *
 * 인자는 payload 가 아니라 **지어진 장면에서** 센다. 캡션이 말하는 수와 막대가
 * 보이는 수가 다른 자리에서 나오면 한 화면 안에서 둘이 어긋날 수 있다.
 */
export type RehashCaption =
  | { kind: 'threshold'; count: number; buckets: number; threshold: number }
  | { kind: 'grow'; count: number }
  | { kind: 'recompute' }
  | { kind: 'result'; moved: number; stayed: number };

export type LoadFactorRehashScene = {
  /** 접어 그릴 때의 열 수 = 처음 판의 칸 수. 판이 넓어져도 열은 그대로다. */
  cols: number;
  /** 끝내 넓혀질 칸 수. 판이 차지할 높이를 정하므로 처음부터 안다. */
  grownBuckets: number;
  /** 이 비율에 닿으면 넓힌다. 눈금 자리와 막대 색이 여기서 갈린다. */
  threshold: number;
  /** 바탕 명부. 되감기가 여기서 처음 자리를 다시 셈한다. 아무도 고치지 않는다. */
  keys: RehashKeyScene[];
  /** 마지막에 들어와 임계를 건드리는 키. */
  incoming: string;
  /** 지금 판의 칸 수. 걸음이 고친다. */
  buckets: number;
  /** 칩마다의 형편. 걸음이 고친다. */
  chips: RehashChipScene[];
  formula: RehashFormula | null;
  mark: RehashMark | null;
  caption: RehashCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `buckets` 와 `chips` 는 여기 없다 — 걸음이 고치는 것을 바탕으로 넘기면 되감은
 * 화면이 이미 넓혀진 판에 이미 흩어진 칩을 세운다 (프로토콜 4 절).
 */
type RehashBase = Pick<
  LoadFactorRehashScene,
  'cols' | 'grownBuckets' | 'threshold' | 'keys' | 'incoming'
>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 명부를 새로 짓는다. 넘겨받은 배열을 그대로 쥐지 않는다 (S-scene). */
function keysOf(raw: unknown): RehashKeyScene[] {
  if (!Array.isArray(raw)) return [];
  const out: RehashKeyScene[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const key = str(r.key);
    if (key === '') continue;
    out.push({ key, slot: num(r.slotSmall) });
  }
  return out;
}

/**
 * 적재율의 분자 — 지금 판에 앉아 있는 칩 수.
 *
 * 막대도 읽음도 캡션도 전부 이 하나를 쓴다. 세는 자리가 둘이면 언젠가 갈린다.
 */
export function loadedCount(chips: readonly RehashChipScene[]): number {
  let n = 0;
  for (const c of chips) if (c.slot !== null) n += 1;
  return n;
}

/**
 * 처음 장면 — 다섯이 좁은 판에 앉아 있고 여섯째는 아직 판 밖이다.
 *
 * `initial` 과 `rewind` 가 같은 자리를 쓴다. 바탕만 받으므로 걸음이 고친 판 크기나
 * 칩 자리가 딸려 들어올 수 없다 — 다만 그 좁힘은 **호출부가 객체 리터럴을 넘길
 * 때만** 실효가 있다 (초과 속성 검사).
 */
function atStart(base: RehashBase): LoadFactorRehashScene {
  return {
    ...base,
    buckets: base.cols,
    chips: base.keys.map((k) => ({
      key: k.key,
      slot: k.key === base.incoming ? null : k.slot,
      state: k.key === base.incoming ? ('incoming' as const) : ('idle' as const),
    })),
    formula: null,
    mark: null,
    caption: null,
  };
}

/** 칩 하나만 고친 **새** 목록. 앞 장면의 칩은 건드리지 않는다 (S-scene). */
function withChip(
  chips: readonly RehashChipScene[],
  key: string,
  patch: Pick<RehashChipScene, 'slot' | 'state'>,
): RehashChipScene[] {
  return chips.map((c) => (c.key === key ? { key: c.key, ...patch } : c));
}

export const loadFactorRehashScene: ScenePlan<LoadFactorRehashScene> = {
  /**
   * 처음 장면 — 바탕은 선언이 정한다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 여기서 세운다. 러너가 넘기는 객체는
   * mechanism 과 view 가 함께 쓰는 한 벌이라 배열을 참조로 쥐면 되짚을 때 이미
   * 굴러간 자료로 바탕을 그리게 된다. 그래서 **복사해서** 담는다 (S-scene).
   */
  initial(initialData: unknown): LoadFactorRehashScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const cols = Math.max(1, num(d.buckets));
    return atStart({
      cols,
      grownBuckets: Math.max(cols, num(d.grownBuckets)),
      threshold: num(d.threshold),
      keys: keysOf(d.keys),
      incoming: str(d.incoming),
    });
  },

  reduce(scene: LoadFactorRehashScene, event: FacetRuntimeEvent): LoadFactorRehashScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 여섯째가 자기 칸에 앉는다. 적재율이 임계에 닿는 것은 이 한 칸 때문이다.
      case 'seat': {
        const key = str(p.key);
        const slot = num(p.slot);
        const chips = withChip(scene.chips, key, { slot, state: 'incoming' });
        return {
          ...scene,
          chips,
          formula: { key, masked: num(p.masked), buckets: scene.buckets },
          mark: { kind: 'seated', key },
          caption: {
            kind: 'threshold',
            count: loadedCount(chips),
            buckets: scene.buckets,
            threshold: scene.threshold,
          },
        };
      }

      // 판이 넓어진다. 담긴 수는 그대로인데 분모만 커지므로 적재율이 내려간다.
      case 'grow': {
        const buckets = Math.max(scene.buckets, num(p.buckets));
        return {
          ...scene,
          buckets,
          formula: null,
          // 펼쳐질 줄이 몇인지는 넓히기 **전** 칸 수가 있어야 안다.
          mark: { kind: 'grown', from: scene.buckets },
          caption: { kind: 'grow', count: loadedCount(scene.chips) },
        };
      }

      // 키 하나를 새 버킷 수로 다시 나눈다. from === to 면 우연히 그대로 남은 것이다.
      case 'rehash': {
        const key = str(p.key);
        const from = num(p.from);
        const to = num(p.to);
        return {
          ...scene,
          chips: withChip(scene.chips, key, { slot: to, state: from === to ? 'kept' : 'moved' }),
          formula: { key, masked: num(p.masked), buckets: scene.buckets },
          mark: { kind: 'rehashed', key, from, to },
          caption: { kind: 'recompute' },
        };
      }

      // 마지막 걸음은 말만 한다 — 흐르게 할 것이 없다.
      case 'done': {
        let moved = 0;
        let stayed = 0;
        for (const c of scene.chips) {
          if (c.state === 'moved') moved += 1;
          else if (c.state === 'kept') stayed += 1;
        }
        return {
          ...scene,
          formula: null,
          mark: null,
          caption: { kind: 'result', moved, stayed },
        };
      }

      // 손으로 짚기 시작 — 바탕만 남기고 처음 자리로 돌아간다.
      case 'rewind':
        return atStart({
          cols: scene.cols,
          grownBuckets: scene.grownBuckets,
          threshold: scene.threshold,
          keys: scene.keys,
          incoming: scene.incoming,
        });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖의 것은 흘린다 (C2).
        return scene;
    }
  },
};
