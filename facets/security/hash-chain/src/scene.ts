/**
 * hashChain 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고, 조회로 갈리는 분기도 화면을 되읽는
 * 자리도 없었다. stage 의 `let` 은 셋뿐이었다. **곧 화면이 통째로 상태였다는 뜻이다.**
 *
 * - `let nodes: BlockNodes[]` — **DOM 손잡이와 뜻이 한 객체**였다 (함정 24).
 *   `BlockNodes` 라는 타입이 선언되어 있었지만 담긴 것은 손잡이 다섯뿐이고, 알맹이는
 *   전부 그 요소의 속성에 있었다.
 *   - `group` 의 `style.opacity` 가 "사슬이 이어졌나",
 *   - `data` 의 `textContent` 와 `fill` 이 "이 칸에 손을 댔나",
 *   - `hash`·`prev` 의 `textContent` 와 `fill` 이 "이 값이 갈렸나",
 *   - `box` 의 `stroke` 가 `none`/강조색/위험색 셋으로 "어떤 표식이 붙었나" 였다.
 *   지금은 `linked` · `edited` · `broken` · `cascaded` 넷이 말하고, 갈린 값은
 *   `blockViews` 가 두 사슬을 견주어 셈한다.
 * - `let links: SVGPathElement[]` — 이음매의 `style.opacity` 가 다시 한 번 "이어졌나"
 *   를 쥐고, `stroke` 가 "어긋났나" 를 쥐었다. 같은 물음에 답이 둘이던 자리다.
 * - `let snapshot: InitPayload | null` — stage 가 쥐고 있던 **바탕 자료의 사본**.
 *   `tamper`·`breakLink`·`cascade` 가 전부 여기서 값을 꺼내 글자를 갈아 끼웠다.
 *   지금은 장면이 바탕을 쥐고 그리는 쪽은 읽기만 한다.
 *
 * ── 이 조각의 주장은 *견줌*이라 두 값이 함께 서야 한다 (함정 7)
 *
 * "한 칸을 고치면 그 뒤가 전부 어긋난다" 는 **고치기 전의 값과 갈린 값을 나란히
 * 놓아야** 서는 말이다. 그런데 옛 화면은 값 한 자리를 돌려 쓰며 갈린 값으로 성한
 * 값을 덮었다.
 *
 * - `tamper()` 가 `data.textContent` 를, `breakLink()`·`cascade()` 가
 *   `hash.textContent`·`prev.textContent` 를 **갈아 끼웠다.** 무엇이 무엇으로
 *   바뀌었는지가 화면에서 사라졌다.
 * - 더 나쁜 것은 `cascade` 였다. 뒤따르는 칸의 `prev` 를 다시 셈한 값으로 갈아
 *   끼우므로 **사슬이 저희끼리는 다시 맞는다.** 완주 화면에 남는 것은 "전부
 *   붉다" 뿐이고, 무엇과 어긋났는지는 어디에도 없었다.
 *
 * 지금은 갈린 자리마다 **값이 둘** 선다 — 고치기 전의 값이 줄을 그은 채 제자리를
 * 지키고, 갈린 값이 그 아래 앉는다. 그래서 완주 화면 하나가 "한 칸을 고쳤더니 그
 * 뒤 세 칸의 값이 전부 달라졌다" 를 통째로 말한다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 어느 칸을 고쳤나 | **장면이 센다** (`editedAt` — 두 사슬에서 내용이 처음 갈리는 자리) |
 * | 어느 값이 갈렸나 · 어느 이음매가 어긋났나 · 몇 칸이 번졌나 | **장면이 센다** (`blockViews` · `linkBroken`) |
 * | 어느 국면까지 왔나 | **장면이 쥔다** (발신의 어휘 그대로) |
 * | 해시 함수 이름 · 성한 사슬 · 다시 셈한 사슬 | **`init` 이 값을 베껴 싣는다** |
 *
 * 해시를 잇는 셈 자체는 내주지 않는다. 그것이 이 조각의 알고리즘이고, 화면에 뜨는
 * 값은 저작 선언이 담은 실측 SHA-256 이다 (S-piece 의 "화면에 쓰는 값은 실측한다").
 * 장면이 하는 것은 **두 사슬을 견주어 어디가 갈렸는지 가려내는 일**뿐이다.
 *
 * ── 바탕을 참조로 쥐지 않는다
 *
 * `initial` 은 **빈 장면**을 돌려주고 `init` 이벤트가 값을 베껴 채운다. 러너가 주는
 * `initialData` 는 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때
 * 이미 굴러간 자료로 바탕을 그린다 (S-scene MUST).
 *
 * 좌표는 담지 않는다. 칸의 차례가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 사슬 한 칸. 값이지 화면이 아니다. */
export type SceneBlock = {
  /** 이 칸이 담은 내용. */
  data: string;
  /** 이 칸이 품은 앞 칸의 해시. 첫 칸은 0 으로 채운다. */
  prev: string;
  /** sha256(prev + data) 실측값. */
  hash: string;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 무엇이 어디서 어디로 가는지가 전부 바탕과 자취에서
 * 나오므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type HashChainStep =
  /** 칸들이 앞 칸의 해시를 품은 채 이어진다. */
  | { kind: 'link' }
  /** 가운데 한 칸의 내용이 갈린다. 이 조각의 원인이다. */
  | { kind: 'edit' }
  /** 그 칸의 해시가 갈리고, 그것을 품고 있던 다음 칸과 어긋난다. */
  | { kind: 'break' }
  /** 어긋남이 끝까지 번진다. */
  | { kind: 'spread' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type HashChainCaption =
  | { kind: 'linked' }
  | { kind: 'tampered' }
  | { kind: 'broken' }
  | { kind: 'cascaded' };

export type HashChainScene = {
  // ── 바탕. `init` 이 값을 베껴 한 번 정하고 걸음이 고치지 않는다.
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 손대기 전의 성한 사슬. */
  blocks: readonly SceneBlock[];
  /** 한 칸을 고치고 그 뒤를 전부 다시 셈한 사슬. `blocks` 와 길이가 같다. */
  tampered: readonly SceneBlock[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 사슬이 이어져 섰나. 칸과 이음매가 보이는 것이 이것이다. */
  linked: boolean;
  /** 한 칸의 내용에 손을 댔나. */
  edited: boolean;
  /** 손댄 칸의 해시가 갈려 다음 칸과 어긋났나. */
  broken: boolean;
  /** 어긋남이 뒤끝까지 번졌나. */
  cascaded: boolean;

  step: HashChainStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `linked` 부터 `cascaded` 까지는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 갈린 값을 단 채로 선다 (함정 14).
 */
type Base = Pick<HashChainScene, 'algorithmLabel' | 'blocks' | 'tampered'>;

/**
 * 되돌린 뒤의 장면 — 캔버스가 비어 있다. 첫 걸음이 사슬을 세운다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (함정 15).
 */
function atStart(base: Base): HashChainScene {
  return {
    algorithmLabel: base.algorithmLabel,
    blocks: base.blocks,
    tampered: base.tampered,
    linked: false,
    edited: false,
    broken: false,
    cascaded: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function fields(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

/** 사슬을 **값으로 베낀다.** 넘겨받은 배열을 그대로 쥐지 않는다 (S-scene). */
function readBlocks(raw: unknown): SceneBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneBlock[] = [];
  for (const item of raw) {
    const b = fields(item);
    if (b === null) continue;
    out.push({ data: str(b.data), prev: str(b.prev), hash: str(b.hash) });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 값도 붉은 칠도 전부 여기를 지난다. 그림과 결론이 한 자료를 쓰므로
// 갈릴 자리가 없다 (함정 34).

/**
 * 손댄 칸의 자리. 두 사슬에서 **내용이 처음 갈리는 자리**다. 없으면 -1.
 *
 * 걸음이 이 수를 싣지 않는다. 어느 칸을 고쳤는지는 성한 사슬과 다시 셈한 사슬을
 * 견주면 곧바로 나오고, 실어 두면 같은 물음에 답이 둘이 된다 (프로토콜 4 절).
 * 뒤따르는 칸들은 `prev`·`hash` 만 갈리고 내용은 그대로라 이 자리는 하나뿐이다.
 */
export function editedAt(scene: HashChainScene): number {
  const n = Math.min(scene.blocks.length, scene.tampered.length);
  for (let i = 0; i < n; i++) {
    if (scene.blocks[i].data !== scene.tampered[i].data) return i;
  }
  return -1;
}

/** 한 자리에 적히는 값. `was` 가 있으면 고치기 전의 값이 함께 선다. */
export type FieldView = {
  /** 지금 이 자리에 적힌 값. */
  now: string;
  /** 고치기 전의 값. 갈리지 않았으면 null. */
  was: string | null;
};

/**
 * 칸에 붙는 표식.
 *
 * 값의 형편(채움)과 갈라 둔 별개의 축이다 (함정 29). `edited` 는 손을 댄 칸,
 * `touched` 는 그 여파가 닿은 칸이다.
 */
export type BlockMark = 'none' | 'edited' | 'touched';

/** 칸 하나가 지금 말하는 것 전부. 좌표는 없다 — 그리는 쪽이 셈한다. */
export type BlockView = {
  index: number;
  mark: BlockMark;
  prev: FieldView;
  data: FieldView;
  hash: FieldView;
};

function fieldOf(before: string, after: string | undefined, changed: boolean): FieldView {
  if (!changed || after === undefined || after === before) return { now: before, was: null };
  return { now: after, was: before };
}

function markOf(scene: HashChainScene, at: number, i: number): BlockMark {
  if (at < 0) return 'none';
  if (scene.edited && i === at) return 'edited';
  if (scene.cascaded && i > at) return 'touched';
  // 해시가 갈린 직후에는 **옛 값을 쥐고 있는 다음 칸**이 어긋남이 닿은 자리다.
  if (scene.broken && i === at + 1) return 'touched';
  return 'none';
}

/**
 * 지금 각 칸에 서는 값들.
 *
 * 국면마다 무엇이 갈렸는지가 다르다 — 내용은 `edited` 에서, 손댄 칸의 해시는
 * `broken` 에서, 뒤따르는 칸의 `prev`·`hash` 는 `cascaded` 에서 갈린다.
 */
export function blockViews(scene: HashChainScene): BlockView[] {
  const at = editedAt(scene);
  return scene.blocks.map((b, i) => {
    const after = scene.tampered[i];
    const dataChanged = at >= 0 && scene.edited && i === at;
    const hashChanged = at >= 0 && (i === at ? scene.broken : scene.cascaded && i > at);
    const prevChanged = at >= 0 && scene.cascaded && i > at;
    return {
      index: i,
      mark: markOf(scene, at, i),
      prev: fieldOf(b.prev, after?.prev, prevChanged),
      data: fieldOf(b.data, after?.data, dataChanged),
      hash: fieldOf(b.hash, after?.hash, hashChanged),
    };
  });
}

/**
 * 칸 `i` 와 칸 `i+1` 을 잇는 이음매가 어긋났나.
 *
 * 앞 칸의 해시가 갈리는 순간 그 이음매가 어긋난다 — 다음 칸이 품은 값은 아직 옛
 * 것이기 때문이다. 어긋남의 범위는 고친 자리가 정한다.
 */
export function linkBroken(scene: HashChainScene, i: number): boolean {
  const at = editedAt(scene);
  if (at < 0) return false;
  if (i === at) return scene.broken;
  if (i > at) return scene.cascaded;
  return false;
}

/**
 * 지금 캡션이 말할 것. 자취가 정한다.
 *
 * 걸음(`step`)이 아니라 자취를 보므로 되짚어 세운 화면에도 그 걸음의 말이 남는다 —
 * 정적 그리기는 `step` 을 읽지 않는다 (공통 지시문 8 절).
 */
export function captionOf(scene: HashChainScene): HashChainCaption | null {
  if (scene.cascaded) return { kind: 'cascaded' };
  if (scene.broken) return { kind: 'broken' };
  if (scene.edited) return { kind: 'tampered' };
  if (scene.linked) return { kind: 'linked' };
  return null;
}

export const hashChainScene: ScenePlan<HashChainScene> = {
  /**
   * 첫 장면은 **비어 있다.** 바탕은 `init` 이벤트가 값을 베껴 채운다.
   *
   * `initialData` 를 여기서 읽지 않는 까닭은 그것이 mechanism 과 view 가 함께 쓰는
   * 한 객체이기 때문이다 — 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene MUST).
   */
  initial(): HashChainScene {
    return atStart({ algorithmLabel: '', blocks: [], tampered: [] });
  },

  reduce(scene: HashChainScene, event: FacetRuntimeEvent): HashChainScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 바탕이 들어선다. 실측 해시라 걸음이 셈할 수 있는 것이 없다 — 여기서
       * **값을 베껴** 쥔다.
       */
      case 'init': {
        if (p === null) return scene;
        return atStart({
          algorithmLabel: str(p.algorithmLabel),
          blocks: readBlocks(p.blocks),
          tampered: readBlocks(p.tamperedBlocks),
        });
      }

      /* 칸들이 앞 칸의 해시를 품은 채 이어진다. 어떤 값인지는 바탕이 말한다. */
      case 'reveal-chain':
        return { ...scene, linked: true, step: { kind: 'link' } };

      /* 가운데 한 칸의 내용이 갈린다. 어느 칸인지는 두 사슬을 견주면 나온다. */
      case 'tamper':
        return { ...scene, edited: true, step: { kind: 'edit' } };

      /* 그 칸의 해시가 갈린다. 다음 칸은 아직 옛 값을 쥐고 있어 이음매가 어긋난다. */
      case 'break-link':
        return { ...scene, broken: true, step: { kind: 'break' } };

      /* 어긋남이 끝까지 번진다 — 뒤따르는 칸의 prev 와 hash 가 모두 갈린다. */
      case 'cascade':
        return { ...scene, cascaded: true, step: { kind: 'spread' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다 (함정 14·15). */
      case 'rewind':
        return atStart({
          algorithmLabel: scene.algorithmLabel,
          blocks: scene.blocks,
          tampered: scene.tampered,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
