/**
 * SharePrefixPath 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 주장이 어디에 있었나
 *
 * 이 조각이 말하는 것은 **이미 난 길을 나눠 쓴다** 는 것이다. 그런데 옮기기 전
 * "나눠 썼다" 는 사실은 화면에 **380ms 만 머물렀다.** `ride()` 가 마디를 물들이고
 * 가지를 반짝인 뒤 `setNodeFill(entry, false)` · `setTimeout(... colors.border)` 으로
 * 둘 다 **되돌렸다.** 다 끝난 화면에는 새로 난 자리와 나눠 쓴 자리의 구별이 남지
 * 않는다 — 되짚으면 조각의 주장 자체가 사라지는 자리다 (프로토콜 4절 "되돌림이
 * 있으면 정보가 지워진다").
 *
 * 이제 마디마다 `rides` 가 말한다. **남는 표식이라 정적으로 그릴 때도 들어간다.**
 *
 * ── 숨어 있던 상태
 *
 * projector 에는 `let` 이 하나도 없었고, stage 의 `let` 은 바탕(`words` · `geo`)
 * 뿐이었다. "지금까지 무엇이 그려졌나" 를 말하는 자리가 코드 어디에도 없었다.
 *
 * - **어느 자리가 났나** — `new Map<string, NodeEl>()` 한 줄(`nodeEls`)이 유일한
 *   기록이었다. `type` 선언조차 없어 grep 에 안 걸린다. 이제 `nodes` 가 말한다.
 *   **뿌리를 포함해 담으므로 길이가 곧 자리 수다** — 총 자리 수를 payload 에서
 *   받아 쓰면 언젠가 장면의 트라이와 갈린다.
 * - **어느 가지가 났나** — `edgeEls`. 이제 마디의 `parentId` 에서 파생된다. 가지를
 *   따로 세지 않는다.
 * - **낱말 칩의 형편** — `type ChipState = 'pending' | 'active' | 'done'` 이 선언만
 *   있고 **값이 어디에도 저장되지 않았다.** `applyChipState` 가 `fill` 속성에만
 *   썼다. 이제 `active` 와 `finished` 가 말한다.
 * - **커서가 어디 있나** — `cursorG` 의 `transform` 과 `cursorDot` 의 `opacity`.
 *   이제 `cursorAt`.
 * - **어느 자리에서 낱말이 끝나나** — `markG` 에 덧붙인 텍스트와 마디 그룹에 덧붙인
 *   점. 셈하는 자리가 없어 되짚으면 사라졌다. 이제 `marks`. **남는다.**
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 한때 `prefix-word-end` 가 `rode` · `grown` 을, `prefix-summary` 가 `totalSeats` ·
 * `rawChars` · `saved` 를 실어 왔다. 넷 다 장면의 트라이에서 셈할 수 있으므로
 * (`tallyWord` · `tallySeats`) **algorithm 에서 아예 걷어냈다** — 실려 있으면 다음
 * 사람이 "있으니 쓰자" 고 집는 순간 출처가 둘이 되고, 두 자리에서 센 수는 언젠가
 * 갈린다. 걸음은 "어느 낱말의 셈인가" 만 말한다. 낱말 이름도 마찬가지로 싣지 않고
 * `wordIndex` 로 `words` 에서 찾는다.
 *
 * 좌표는 담지 않는다. 접두사·부모·깊이라는 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 뿌리 마디의 식별자. 접두사가 곧 식별자라 뿌리는 빈 접두사다. */
export const ROOT_ID = '';

/** 아직 아무 낱말도 내지 않은 자리 — 뿌리뿐이다. */
const BORN_BY_NONE = -1;

/**
 * 트라이의 자리 하나. 자리(좌표)는 담지 않는다 — 접두사와 부모가 구조를 정하고
 * 캔버스 폭이 좌표를 정한다 (S-piece).
 */
export type SharePrefixPathSceneNode = {
  /** 이 자리까지의 접두사. 그대로 식별자다. 뿌리는 `''`. */
  id: string;
  /** 부모 자리의 식별자. 뿌리는 `null`. 가지는 여기서 파생된다. */
  parentId: string | null;
  /** 이 자리가 맡은 글자. 뿌리는 빈 글자. */
  char: string;
  /** 뿌리로부터의 깊이. */
  depth: number;
  /** 이 자리를 처음 낸 낱말의 번호. 뿌리는 `-1`. */
  bornBy: number;
  /**
   * 이 자리를 뒤이어 **타고 지나간** 낱말 수. `0` 보다 크면 나눠 쓴 길이다.
   *
   * **이 조각의 결론이 여기 있다.** 남는 표식이라 정적 그리기에도 반드시 들어간다 —
   * 빠뜨리면 되짚었을 때 새로 난 길과 나눠 쓴 길의 구별이 사라진다.
   *
   * 이 자리로 들어오는 가지를 지난 낱말 수는 `rides + 1` 이다 (처음 낸 하나를
   * 더한다). 가지를 따로 세지 않는다.
   */
  rides: number;
};

/** 낱말이 끝나는 자리 하나. **남는 표식**이다. */
export type SharePrefixPathMark = { nodeId: string; wordIndex: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 출발 그림은 싣지 않는다 — 타는 것도 돋는 것도 부모 자리에서 출발하고, 부모는
 * 장면의 `parentId` 로 찾아진다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type SharePrefixPathStep =
  | { kind: 'begin' }
  | { kind: 'ride'; nodeId: string }
  | { kind: 'grow'; nodeId: string }
  | { kind: 'mark' }
  | { kind: 'wordEnd' }
  | { kind: 'summary' };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지다.
 *
 * 수는 싣지 않는다 — 낱말 이름도 탄 자리 수도 아낀 자리 수도 장면에서 셈한다.
 */
export type SharePrefixPathCaption =
  | { kind: 'begin'; wordIndex: number }
  | { kind: 'wordEnd'; wordIndex: number }
  | { kind: 'summary' };

export type SharePrefixPathScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 넣을 낱말들. 칩 줄과 최종 트라이 모양(=좌표)을 이것 하나가 정한다. */
  words: string[];

  // ── 걸어온 자취.
  /**
   * 지금까지 난 자리들. **뿌리를 포함한다** — 그래서 길이가 곧 "든 자리 수" 다.
   *
   * 명부이지 그리는 차례가 아니다. 가지도 여기서 파생된다.
   */
  nodes: SharePrefixPathSceneNode[];
  /** 낱말이 끝나는 자리들. **남는다.** */
  marks: SharePrefixPathMark[];
  /** 커서가 선 자리의 식별자. 아직 서지 않았으면 `null`. 뿌리는 `''` 이다. */
  cursorAt: string | null;
  /** 지금 넣고 있는 낱말의 번호. 다 넣으면 `null` 로 돌아간다. */
  active: number | null;
  /** 다 넣은 낱말 수. `active` 와 같은 값을 동시에 쥐지 않는다. */
  finished: number;

  step: SharePrefixPathStep | null;
  caption: SharePrefixPathCaption | null;
  /** 할 말을 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  done: boolean;
};

/**
 * 걸음이 고치지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 걸음이 고치는 `nodes` · `marks` 는 여기 들지 않는다 — 들면 되감은 화면이 이미 다
 * 자란 트라이를 단 채로 서고, 그 위에 algorithm 이 처음부터 다시 낸 자리가 겹친다
 * (프로토콜 4절).
 */
type SharePrefixPathBase = Pick<SharePrefixPathScene, 'words'>;

/** 뿌리만 있는 트라이. 되감을 때마다 새로 짓는다 — 과거 장면과 나눠 쥐지 않는다. */
function rootOnly(): SharePrefixPathSceneNode[] {
  return [{ id: ROOT_ID, parentId: null, char: '', depth: 0, bornBy: BORN_BY_NONE, rides: 0 }];
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: SharePrefixPathBase): SharePrefixPathScene {
  return {
    words: base.words,
    nodes: rootOnly(),
    marks: [],
    cursorAt: null,
    active: null,
    finished: 0,
    step: null,
    caption: null,
    done: false,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function idx(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

// ── 장면에서 세는 것들 ───────────────────────────────────────────────────
//
// 걸음의 payload 가 실어 온 수를 쓰지 않는다. 화면에 함께 뜨는 수가 두 군데에서
// 셈해지면 언젠가 갈린다 (프로토콜 4절).

/** `word` 의 접두사 길. 뿌리는 빼고 글자마다 한 자리씩. */
function pathOf(word: string): string[] {
  const path: string[] = [];
  for (let i = 0; i < word.length; i += 1) path.push(word.slice(0, i + 1));
  return path;
}

/**
 * 낱말 하나가 **탄 자리**와 **새로 낸 자리**를 장면의 트라이에서 센다.
 *
 * 자리마다 `bornBy` 가 누가 처음 냈는지 말하므로, 그 낱말의 길을 밟으며 제 번호인
 * 자리를 세면 새로 낸 수이고 나머지가 탄 수다.
 */
export function tallyWord(
  scene: SharePrefixPathScene,
  wordIndex: number,
): { rode: number; grown: number } {
  const word = scene.words[wordIndex] ?? '';
  const byId = new Map(scene.nodes.map((n) => [n.id, n] as const));
  let rode = 0;
  let grown = 0;
  for (const id of pathOf(word)) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.bornBy === wordIndex) grown += 1;
    else rode += 1;
  }
  return { rode, grown };
}

/**
 * 총결산. 뿌리를 포함한 자리 수와, 낱말을 따로 담았다면 들었을 글자 수.
 *
 * 자리 수는 `nodes.length` 그대로다 — 뿌리를 `nodes` 에 담아 둔 까닭이 이것이다.
 */
export function tallySeats(scene: SharePrefixPathScene): {
  wordCount: number;
  totalSeats: number;
  rawChars: number;
  saved: number;
} {
  const wordCount = scene.words.length;
  const totalSeats = scene.nodes.length;
  const rawChars = scene.words.reduce((sum, w) => sum + w.length, 0);
  return { wordCount, totalSeats, rawChars, saved: rawChars - totalSeats };
}

export const sharePrefixPathScene: ScenePlan<SharePrefixPathScene> = {
  /**
   * 첫 장면은 뿌리 하나만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 낱말 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께
   * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene).
   */
  initial(initialData: unknown): SharePrefixPathScene {
    const d = (initialData ?? {}) as { words?: unknown };
    const words: string[] = [];
    if (Array.isArray(d.words)) {
      for (const raw of d.words) {
        const w = str(raw);
        if (w !== null) words.push(w);
      }
    }
    return atStart({ words });
  },

  reduce(scene: SharePrefixPathScene, event: FacetRuntimeEvent): SharePrefixPathScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 새 낱말을 넣기 시작한다. 커서가 뿌리로 돌아가고 그 칩이 켜진다.
      case 'prefix-word-begin': {
        const wordIndex = idx(p.wordIndex);
        if (wordIndex === null) return scene;
        return {
          ...scene,
          cursorAt: ROOT_ID,
          active: wordIndex,
          step: { kind: 'begin' },
          caption: { kind: 'begin', wordIndex },
        };
      }

      // 이미 난 자리를 그대로 탄다 — 새 자리를 내지 않는다. **이 조각의 결론**이라
      // 지나가는 반짝임이 아니라 그 자리에 남는 `rides` 로 적는다.
      case 'prefix-ride': {
        const nodeId = str(p.nodeId);
        const wordIndex = idx(p.wordIndex);
        if (nodeId === null || wordIndex === null) return scene;
        if (!scene.nodes.some((n) => n.id === nodeId)) return scene;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          nodes: scene.nodes.map((n) => (n.id === nodeId ? { ...n, rides: n.rides + 1 } : n)),
          cursorAt: nodeId,
          step: { kind: 'ride', nodeId },
        };
      }

      // 글자가 갈라져 새 자리가 돋는다.
      case 'prefix-grow': {
        const nodeId = str(p.nodeId);
        const parentId = str(p.parentId);
        const char = str(p.char);
        const wordIndex = idx(p.wordIndex);
        if (nodeId === null || parentId === null || char === null || wordIndex === null) return scene;
        if (scene.nodes.some((n) => n.id === nodeId)) return scene;
        const parent = scene.nodes.find((n) => n.id === parentId);
        if (!parent) return scene;
        return {
          ...scene,
          nodes: [
            ...scene.nodes,
            {
              id: nodeId,
              parentId,
              char,
              // 깊이는 부모에서 셈한다. 걸음이 싣지 않는 까닭이 이것이다.
              depth: parent.depth + 1,
              bornBy: wordIndex,
              rides: 0,
            },
          ],
          cursorAt: nodeId,
          step: { kind: 'grow', nodeId },
        };
      }

      // 이 자리에서 낱말이 끝난다는 표시. 남는다.
      case 'prefix-mark': {
        const nodeId = str(p.nodeId);
        const wordIndex = idx(p.wordIndex);
        if (nodeId === null || wordIndex === null) return scene;
        if (scene.marks.some((m) => m.nodeId === nodeId)) return { ...scene, step: { kind: 'mark' } };
        return {
          ...scene,
          marks: [...scene.marks, { nodeId, wordIndex }],
          step: { kind: 'mark' },
        };
      }

      // 한 낱말을 다 넣었다. 탄 자리 수와 새 자리 수는 장면에서 센다.
      case 'prefix-word-end': {
        const wordIndex = idx(p.wordIndex);
        if (wordIndex === null) return scene;
        return {
          ...scene,
          active: null,
          finished: Math.max(scene.finished, wordIndex + 1),
          step: { kind: 'wordEnd' },
          caption: { kind: 'wordEnd', wordIndex },
        };
      }

      // 총결산. 자리 수도 아낀 수도 장면의 트라이에서 센다.
      case 'prefix-summary':
        return { ...scene, step: { kind: 'summary' }, caption: { kind: 'summary' }, done: true };

      case 'rewind':
        // 바탕만 넘긴다. 변수째 넘기면 초과 속성 검사가 돌지 않아 자취가 딸려 간다.
        return atStart({ words: scene.words });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
