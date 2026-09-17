/**
 * lostLink 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 가로줄 하나와 그 아래 떨어진 자리가 전부다. 걸음마다 달라지는 것은 셋이다 —
 * 누가 줄 안에 어느 차례로 서 있는가, 화살표가 어디를 겨누는가, 그리고 head 에서
 * 화살표를 따라 **닿을 수 있는가**.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 화면은 상태를 stage 의 지역 변수에 숨겨 두었다. projector 는 상태를
 * 쥐지 않았으므로 전부 stage 쪽이다.
 *
 * - `nodes` 의 `fallen` · `fresh` — 어느 이벤트도 말하지 않는 값이다. `fallen` 은
 *   `detached` 가 켜고 `rewind` 가 끄며, `fresh` 는 `node-staged` 가 켜고 `settled`
 *   가 끈다. 둘 다 명령의 부수 효과라 되짚으면 복원되지 않았다. 이제 `place` 의
 *   `fallen` 과 `staged` 가 그것을 말한다.
 * - `laneOrder` · `baseline` — 줄 안의 차례와 되돌아갈 자리. `splice`/`filter` 로
 *   제자리에서 갈렸다. 이제 `place.lane` 과 `base` 다.
 * - `links` 의 `prevTo` · `prog` · `active` — 화살표가 건너는 **중간**을 쥐고
 *   있었고, `reachableSet()` 이 그 중간값으로 닿음을 갈랐다. 즉 애니메이션의
 *   진행도가 화면의 뜻을 정했다. 이제 겨누는 곳만 `arrows` 에 남기고, 건너는
 *   중간은 `mark` 가 실어 보낸 계기값으로 그리는 쪽이 셈한다.
 * - `reachableSet()` 의 조회로 갈리던 암묵 분기 — 이 조각의 **주장 그 자체**다.
 *   "닿을 수 없게 된 마디" 가 칠에만 남으면 되짚었을 때 주장이 화면에서 사라진다.
 *   그래서 `reachable` 을 장면이 직접 쥐고, 정적으로 그릴 때도 그것으로 칠한다.
 *
 * 좌표는 담지 않는다. 줄의 몇 번째인가라는 **차례**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 노드 하나의 값. 자리는 없다 — 차례는 `LostLinkPlacement` 가 말한다. */
export type LostLinkNodeScene = {
  id: string;
  value: number;
};

/** 화살표 하나. 한 노드는 화살표를 하나만 내보내므로 `from` 이 곧 열쇠다. */
export type LostLinkArrow = {
  from: string;
  to: string;
};

/**
 * 누가 어디에 서 있나. 좌표가 아니라 차례와 소속이다.
 *
 * - `lane` — 줄 안의 차례. head 에서 이어지는 가로줄이다.
 * - `fallen` — 줄에서 떨어져 나간 것들. 떨어질 때 있던 줄 자리를 함께 적는다.
 *   자리를 적어 두어야 "그 자리에서 아래로 처졌다" 를 셈으로 복원한다.
 * - `staged` — 아직 줄에 들지 못하고 줄 위에 떠 있는 새 노드. `afterId` 는 어느
 *   노드 바로 뒤에 들어갈 것인가다.
 *
 * 이 셋 어디에도 이름이 없는 노드는 화면에 서지 않는다.
 */
export type LostLinkPlacement = {
  lane: string[];
  fallen: { id: string; laneIndex: number }[];
  staged: { id: string; afterId: string } | null;
};

/**
 * 이번 걸음에 달라진 것. 흐르게 할 것을 고르는 표식이자 **출발 그림의 계기값**이다.
 *
 * `placed` 는 노드가 옮겨 앉은 걸음이고 `was` 가 그 출발 배치다. 앞 장면을 그리기
 * 재료로 쓰면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 출발 배치를 장면에
 * 실어 보낸다. 되감기처럼 **출발 그림에만 있고 도착 그림에는 없는** 노드가 있는
 * 걸음은 이것 없이는 그릴 수 없다.
 *
 * `linked` 는 화살표가 달라진 걸음이다. `was` 는 건너기 전에 겨누던 노드 —
 * 없던 화살표가 자라 나온 경우엔 `null` 이다.
 *
 * 되짚기(`animate` 거짓)에서는 쳐다보지 않는다. 지나온 걸음을 되밟을 까닭이 없다.
 */
export type LostLinkMark =
  | { kind: 'placed'; how: 'staged' | 'detached' | 'settled' | 'rewound'; was: LostLinkPlacement }
  | { kind: 'linked'; how: 'added' | 'moved'; from: string; was: string | null };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type LostLinkCaption =
  | { kind: 'staged'; node: string; value: number }
  | { kind: 'stagedAgain'; node: string; value: number }
  | { kind: 'wrongMove'; from: string; to: string }
  | { kind: 'detached'; first: string; count: number }
  | { kind: 'rewind' }
  | { kind: 'rightAdd'; from: string; to: string }
  | { kind: 'rightMove'; from: string; to: string }
  | { kind: 'settled'; node: string }
  | { kind: 'done' };

export type LostLinkScene = {
  /** 처음 사슬. 되감기가 여기로 돌아가고 어느 걸음도 고치지 않는다. */
  base: LostLinkNodeScene[];
  /**
   * 값 명부. 한 번이라도 화면에 나온 노드가 전부 남는다.
   *
   * 여기 있다고 그려지는 것이 아니다 — 화면에 서는 것은 `place` 가 정하고, 이것은
   * 그때 값을 찾는 자리일 뿐이다. 되감기며 화면 밖으로 물러나는 노드도 물러나는
   * 동안은 그려야 하므로 명부에서 지우지 않는다.
   */
  nodes: LostLinkNodeScene[];
  /** 사슬로 들어가는 유일한 입구가 겨누는 노드. */
  head: string;
  place: LostLinkPlacement;
  arrows: LostLinkArrow[];
  /**
   * head 에서 화살표를 따라 **실제로 닿는** 노드들.
   *
   * `arrows` 로부터 셈해지지만 장면이 직접 쥔다. 닿을 수 있나 없나가 이 조각이
   * 말하려는 전부라, 되짚어 세운 화면에도 반드시 들어가야 한다.
   */
  reachable: string[];
  mark: LostLinkMark | null;
  caption: LostLinkCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.length > 0) out.push(item);
  }
  return out;
}

/** 초기 자료의 노드 목록을 **값으로 복사**한다. 참조를 쥐지 않는다 (S-scene). */
function nodeList(v: unknown): LostLinkNodeScene[] {
  if (!Array.isArray(v)) return [];
  const out: LostLinkNodeScene[] = [];
  for (const item of v) {
    const n = (item ?? {}) as { id?: unknown; value?: unknown };
    const id = str(n.id);
    if (id.length === 0 || typeof n.value !== 'number' || !Number.isFinite(n.value)) continue;
    out.push({ id, value: n.value });
  }
  return out;
}

/**
 * 화살표가 겨누는 곳. `from` 에서 `to` 로 가는 하나뿐인 길이다.
 *
 * `override` 는 건너는 **중인** 화살표가 아직 겨누고 있는 곳이다. 그리는 쪽이
 * 프레임마다 이것을 얹어 "다 건너간 뒤에야 뒤가 끊긴다" 를 셈한다.
 */
export function linkTargets(
  arrows: LostLinkArrow[],
  override?: { from: string; to: string },
): Map<string, string> {
  const targets = new Map<string, string>();
  for (const a of arrows) targets.set(a.from, a.to);
  if (override) targets.set(override.from, override.to);
  return targets;
}

/** head 에서 화살표를 따라 닿는 노드들. 고리를 만나면 멈춘다. */
export function reachableFrom(head: string, targets: Map<string, string>): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  let cur: string | undefined = head.length > 0 ? head : undefined;
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    cur = targets.get(cur);
  }
  return order;
}

/** 화살표 목록에서 닿음을 다시 셈해 봉한다. 모든 갈래가 이것을 거쳐 나간다. */
function seal(scene: LostLinkScene): LostLinkScene {
  return { ...scene, reachable: reachableFrom(scene.head, linkTargets(scene.arrows)) };
}

/** `from` 이 겨누는 곳만 바꾼 **새** 화살표 목록. 앞 장면의 것을 고치지 않는다. */
function setArrow(arrows: LostLinkArrow[], from: string, to: string): LostLinkArrow[] {
  const next = arrows.map((a) => (a.from === from ? { from, to } : a));
  if (!next.some((a) => a.from === from)) next.push({ from, to });
  return next;
}

/** 처음 사슬의 화살표. 이웃끼리 한 줄로 이어진다. */
function baseArrows(base: LostLinkNodeScene[]): LostLinkArrow[] {
  const out: LostLinkArrow[] = [];
  for (let i = 0; i + 1 < base.length; i += 1) out.push({ from: base[i].id, to: base[i + 1].id });
  return out;
}

/**
 * 처음 자리로 돌아간 장면. `initial` 과 되감기가 같은 자리를 쓴다.
 *
 * 값 명부(`roster`)는 그대로 둔다 — 되감기며 화면 밖으로 물러나는 노드도 물러나는
 * 동안은 그려야 하고, 그리려면 값이 있어야 한다.
 */
function atStart(base: LostLinkNodeScene[], roster: LostLinkNodeScene[]): LostLinkScene {
  const lane = base.map((n) => n.id);
  return seal({
    base,
    nodes: roster,
    head: lane[0] ?? '',
    place: { lane, fallen: [], staged: null },
    arrows: baseArrows(base),
    reachable: [],
    mark: null,
    caption: null,
  });
}

/**
 * 걸음이 실어 보낸 문안 키를 캡션으로 옮긴다.
 *
 * algorithm 은 키만 보내고 문자는 그리는 쪽이 만든다 (C10). 여기서는 키를 타입이
 * 갈라지는 갈래로 바꿔 두어, 그리는 쪽이 인자를 빠뜨리면 tsc 가 잡게 한다.
 */
function captionOf(key: string, p: Record<string, unknown>): LostLinkCaption | null {
  switch (key) {
    case 'caption.staged':
      return { kind: 'staged', node: str(p.id), value: num(p.value) };
    case 'caption.stagedAgain':
      return { kind: 'stagedAgain', node: str(p.id), value: num(p.value) };
    case 'caption.wrongMove':
      return { kind: 'wrongMove', from: str(p.from), to: str(p.to) };
    case 'caption.rightAdd':
      return { kind: 'rightAdd', from: str(p.from), to: str(p.to) };
    case 'caption.rightMove':
      return { kind: 'rightMove', from: str(p.from), to: str(p.to) };
    case 'caption.detached': {
      const ids = idList(p.ids);
      return { kind: 'detached', first: ids[0] ?? '', count: ids.length };
    }
    case 'caption.settled':
      return { kind: 'settled', node: str(p.id) };
    case 'caption.rewind':
      return { kind: 'rewind' };
    case 'caption.done':
      return { kind: 'done' };
    default:
      return null;
  }
}

export const lostLinkScene: ScenePlan<LostLinkScene> = {
  /**
   * 첫 장면은 처음 사슬만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): LostLinkScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const base = nodeList(d.nodes);
    return atStart(base, [...base]);
  },

  reduce(scene: LostLinkScene, event: FacetRuntimeEvent): LostLinkScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const caption = captionOf(str(p.textKey), p);

    switch (event.type) {
      // 새 노드가 준비된다. 줄 위에 떠 있을 뿐 아직 아무도 가리키지 않는다.
      case 'node-staged': {
        const id = str(p.id);
        const after = str(p.after);
        if (id.length === 0 || after.length === 0) return scene;
        const known = scene.nodes.some((n) => n.id === id);
        return seal({
          ...scene,
          nodes: known ? scene.nodes : [...scene.nodes, { id, value: num(p.value) }],
          place: { ...scene.place, staged: { id, afterId: after } },
          mark: { kind: 'placed', how: 'staged', was: scene.place },
          caption,
        });
      }

      // 없던 화살표가 제 몸에서 자라 나와 목표에 닿는다. 아무에게서도 빼앗지 않는다.
      case 'link-added': {
        const from = str(p.from);
        const to = str(p.to);
        if (from.length === 0 || to.length === 0) return scene;
        return seal({
          ...scene,
          arrows: setArrow(scene.arrows, from, to),
          mark: { kind: 'linked', how: 'added', from, was: null },
          caption,
        });
      }

      // 있던 화살표의 끝이 다른 노드로 건너간다. 원래 겨누던 쪽은 겨눔을 잃는다.
      case 'link-moved': {
        const from = str(p.from);
        const to = str(p.to);
        if (from.length === 0 || to.length === 0) return scene;
        const was = scene.arrows.find((a) => a.from === from)?.to ?? null;
        return seal({
          ...scene,
          arrows: setArrow(scene.arrows, from, to),
          mark: { kind: 'linked', how: 'moved', from, was },
          caption,
        });
      }

      // 붙들어 주는 화살표를 잃은 무리가 줄에서 떨어져 나간다. 메모리에는 남는다.
      case 'detached': {
        const ids = idList(p.ids).filter((id) => scene.place.lane.includes(id));
        if (ids.length === 0) return scene;
        const dropped = ids.map((id) => ({ id, laneIndex: scene.place.lane.indexOf(id) }));
        return seal({
          ...scene,
          place: {
            ...scene.place,
            lane: scene.place.lane.filter((id) => !ids.includes(id)),
            fallen: [...scene.place.fallen, ...dropped],
          },
          mark: { kind: 'placed', how: 'detached', was: scene.place },
          caption,
        });
      }

      // 새 노드가 줄 안으로 내려앉고 뒤쪽이 자리를 내어 준다.
      case 'settled': {
        const id = str(p.id);
        const after = str(p.after);
        if (id.length === 0) return scene;
        const lane = [...scene.place.lane];
        if (!lane.includes(id)) lane.splice(lane.indexOf(after) + 1, 0, id);
        return seal({
          ...scene,
          place: { ...scene.place, lane, staged: null },
          mark: { kind: 'placed', how: 'settled', was: scene.place },
          caption,
        });
      }

      // 처음 자리로. 떨어진 무리는 줄로 올라오고 끼워 넣던 노드는 화면 밖으로 물러난다.
      case 'rewind':
        return {
          ...atStart(scene.base, scene.nodes),
          mark: { kind: 'placed', how: 'rewound', was: scene.place },
          caption,
        };

      // 할 말을 마쳤다. 화면은 그대로 두고 캡션만 갈린다.
      case 'done':
        return { ...scene, mark: null, caption };

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
