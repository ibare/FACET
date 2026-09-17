/**
 * merkleTree 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 0, stage 의 `let` 은 여섯인데 다섯이 DOM 손잡이
 * (`rootNode` · `midNodes` · `leafNodes` · `leafNames` · `edges`) 이고 나머지 하나
 * (`snapshot`) 는 `init` payload 의 사본이었다. 조회로 갈리는 분기도 DOM 되읽기도
 * 없었다. **곧 화면이 통째로 상태였다는 뜻이다.**
 *
 * 화면이 쥐고 있던 것을 하나씩 옮기면 이렇게 된다.
 *
 * - 잎 해시와 이름의 `style.opacity` — "잎이 제 해시를 갖췄나". `leavesShown`.
 * - 중간·꼭대기 글자와 선의 `style.opacity` — "둘씩 접어 올렸나". `folded`.
 * - 바뀐 잎 이름의 `textContent` 와 `fill` — "파일 하나가 바뀌었나". `leafChanged`.
 * - 잎·중간·꼭대기 글자의 `textContent` 와 `fill`, 선의 `stroke` — "갈림이 꼭대기까지
 *   올라갔나". `pathMarked`.
 * - `risingGroup` 의 자식 — 올라가는 중인 복제본. 운동 중에만 사는 것이라 장면이
 *   담지 않는다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다 (함정 10 · 34)
 *
 * 이 조각의 주장은 "잎 하나가 바뀌면 꼭대기까지 한 줄만 갈리고 옆 가지는 그대로다"
 * 이다. 그런데 옛 화면은 그 결론을 **셈하지 않고 적어 두고** 있었다.
 *
 * - 어느 마디가 갈렸는지를 `changedLeaf` 로 받아 적고, 그 경로만 손으로 붉게
 *   칠했다. 옆 가지가 성한 것은 자료가 그래서가 아니라 **코드가 안 칠해서**였다.
 *   지금은 마디마다 `before` 와 `after` 를 견주어 **다를 때만** 갈린 것으로 본다
 *   (`leafHashOf` · `midValueOf` · `rootValueOf` 의 `was`). 옆 가지의 해시가 실제로
 *   같으니 아무 표식도 서지 않는다 — 안 칠한 것이 아니라 칠할 것이 없는 것이다.
 * - 그래서 `changedLeaf` 를 아예 걷어냈다. 어느 잎이 바뀌었는지는 두 벌을 견주면
 *   나오는 수라 싣지 않는다.
 *
 * ── 견줄 짝을 잃지 않는다 (함정 7)
 *
 * 옛 화면은 갈린 마디의 `textContent` 를 새 값으로 **갈아 끼웠다.** 같은 자리에 두
 * 답을 겹쳐 실어 뒤엣것이 앞엣것을 지운 것이라, 완주 화면에는 붉은 글자만 남고
 * "무엇에서 무엇으로 갈렸는지" 가 사라졌다. 지금은 갈린 마디가 값 **둘**을 갖는다
 * (`MerkleValue` 의 `was` 와 `now`). 성한 마디는 하나뿐이다 — 견줄 짝이 없어서가
 * 아니라 두 값이 같아서다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 잎의 개수 · 어느 잎이 바뀌었나 · 어느 마디가 갈렸나 · 몇 글자를 인쇄하나 | **장면이 센다** |
 * | 잎의 이름 · 해시 문자열 · 중간과 꼭대기의 값 | **`init` 이 값을 베껴 싣는다** |
 *
 * 해시를 짝지어 올려 붙이는 셈은 **이 조각의 알고리즘 그 자체**라 내주지 않는다.
 * 선언에 실린 값은 전부 실측 SHA-256 이고 장면은 그것을 견주기만 한다.
 *
 * 좌표는 담지 않는다. 잎의 개수와 부모-자식 관계가 자리를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 잎 하나 — 이름과 그 해시. 값이지 화면 자리가 아니다. */
export type MerkleSceneLeaf = {
  /** 화면에 인쇄할 이름. */
  label: string;
  /** sha256(label) 실측값. */
  hash: string;
};

/** 트리 한 벌. 잎들과 중간 둘, 꼭대기 하나. */
export type MerkleSceneTree = {
  leaves: readonly MerkleSceneLeaf[];
  /** sha256(왼쪽 아이들). */
  left: string;
  /** sha256(오른쪽 아이들). */
  right: string;
  /** sha256(left + right). */
  root: string;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 무엇이 어디서 어디로 올라가는지도, 어느 값이
 * 어느 값으로 갈렸는지도 전부 바탕 두 벌에서 셈하므로 `prev` 를 들출 일이 없다
 * (S-scene).
 */
export type MerkleStep =
  /** 잎마다 자기 해시가 붙는다. */
  | { kind: 'leaves' }
  /** 둘씩 묶여 위로 합쳐지고 꼭대기 값 하나가 남는다. */
  | { kind: 'fold' }
  /** 파일 하나가 바뀐다 — 아직 위쪽은 옛 값이다. */
  | { kind: 'change' }
  /** 갈림이 꼭대기까지 한 줄로 올라간다. */
  | { kind: 'path' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type MerkleCaption =
  | { kind: 'leaves' }
  | { kind: 'folded' }
  | { kind: 'changed' }
  | { kind: 'pathOnly' };

export type MerkleTreeScene = {
  // ── 바탕. `init` 이 값을 베껴 채우고 걸음이 고치지 않는다.
  /** 바뀌기 전의 트리. */
  before: MerkleSceneTree;
  /** 잎 하나가 바뀐 뒤의 트리. */
  after: MerkleSceneTree;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 잎마다 자기 해시를 갖췄나. */
  leavesShown: boolean;
  /** 둘씩 접어 올려 꼭대기까지 섰나. */
  folded: boolean;
  /** 파일 하나가 바뀌었나 — 이름만 갈린 상태. */
  leafChanged: boolean;
  /** 갈림이 꼭대기까지 올라갔나 — 경로의 해시가 새 값으로 선다. */
  pathMarked: boolean;

  step: MerkleStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `leavesShown` 부터 `pathMarked` 까지는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 갈린 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는
 * 것이 겹친다 (S-scene).
 */
type Base = Pick<MerkleTreeScene, 'before' | 'after'>;

/**
 * 되돌린 뒤의 장면 — 트리는 있으나 아직 아무것도 서 있지 않다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (프로토콜 4 절).
 */
function atStart(base: Base): MerkleTreeScene {
  return {
    before: base.before,
    after: base.after,
    leavesShown: false,
    folded: false,
    leafChanged: false,
    pathMarked: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 트리 한 벌을 값으로 베껴 온다.
 *
 * **새 배열에 새 객체를 담는다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
 * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readTree(raw: unknown): MerkleSceneTree {
  const tree = fields(raw);
  const rawLeaves = tree?.leaves;
  const leaves: MerkleSceneLeaf[] = [];
  if (Array.isArray(rawLeaves)) {
    for (const item of rawLeaves) {
      const leaf = fields(item);
      if (leaf === null) continue;
      leaves.push({ label: str(leaf.label), hash: str(leaf.hash) });
    }
  }
  return {
    leaves,
    left: str(tree?.left),
    right: str(tree?.right),
    root: str(tree?.root),
  };
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 값과 표식은 전부 여기를 지난다. 어느 마디가 갈렸는지도, 몇 글자를
// 인쇄할지도 같은 함수를 부르므로 갈릴 자리가 없다.

/**
 * 한 마디가 인쇄할 값.
 *
 * `was` 가 `null` 이 아니면 **그 마디가 갈렸다** 는 뜻이고, 그때만 화면에 값이
 * 둘 선다. 갈렸는지 아닌지는 두 벌을 견주어 나오지 어디서 받아 적는 것이 아니다.
 */
export type MerkleValue = {
  /** 지금 서 있는 값. */
  now: string;
  /** 갈리기 전의 값. 성한 마디면 `null`. */
  was: string | null;
};

/**
 * 두 벌에서 그 마디의 값을 정한다.
 *
 * `switched` 는 "그 갈림이 화면에 도달하는 걸음을 지났나" 다. 지나지 않았으면
 * 옛 값 하나뿐이고, 지났어도 두 값이 같으면 여전히 하나뿐이다.
 */
function valueOf(before: string, after: string, switched: boolean): MerkleValue {
  if (switched && after !== '' && after !== before) return { now: after, was: before };
  return { now: before, was: null };
}

/** 잎이 몇인가. 두 벌 중 많은 쪽을 따른다. */
export function leafCountOf(scene: MerkleTreeScene): number {
  return Math.max(scene.before.leaves.length, scene.after.leaves.length);
}

/**
 * 그 잎이 왼쪽 묶음(0)에 드는가 오른쪽(1)에 드는가.
 *
 * 구조가 정하는 것이라 장면이 센다 — 앞의 절반이 `left`, 나머지가 `right` 다.
 */
export function sideOfLeafIn(scene: MerkleTreeScene, index: number): number {
  return index < Math.ceil(leafCountOf(scene) / 2) ? 0 : 1;
}

/** 그 잎의 해시. 갈림이 올라간 뒤에야 새 값으로 선다. */
export function leafHashOf(scene: MerkleTreeScene, index: number): MerkleValue {
  return valueOf(
    scene.before.leaves[index]?.hash ?? '',
    scene.after.leaves[index]?.hash ?? '',
    scene.pathMarked,
  );
}

/** 그 잎의 이름. 파일이 바뀌는 걸음에서 갈린다 — 갈림의 원인이다. */
export function leafLabelOf(scene: MerkleTreeScene, index: number): MerkleValue {
  return valueOf(
    scene.before.leaves[index]?.label ?? '',
    scene.after.leaves[index]?.label ?? '',
    scene.leafChanged,
  );
}

/** 중간 마디의 값. `side` 0 이 왼쪽 묶음이다. */
export function midValueOf(scene: MerkleTreeScene, side: number): MerkleValue {
  return side === 0
    ? valueOf(scene.before.left, scene.after.left, scene.pathMarked)
    : valueOf(scene.before.right, scene.after.right, scene.pathMarked);
}

/** 꼭대기 값. 이것 하나만 견주면 아래 전체가 그대로인지 알 수 있다. */
export function rootValueOf(scene: MerkleTreeScene): MerkleValue {
  return valueOf(scene.before.root, scene.after.root, scene.pathMarked);
}

/** 해시는 앞자리만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD_MIN = 8;
/** 그래도 이보다 길게는 찍지 않는다 — 잎 자리가 좁다. */
const HEX_HEAD_MAX = 16;

/** 두 문자열이 처음 갈리는 자리. 끝까지 같으면 -1. */
function firstDiffAt(a: string, b: string): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : shared;
}

/**
 * 인쇄할 hex 앞자리 수.
 *
 * 갈린 짝을 나란히 세워 두고 앞자리가 우연히 같으면 **화면이 "갈렸다" 면서 같은
 * 글자 둘을 보이게 된다.** 그래서 갈리는 자리까지는 반드시 찍는다. 지금 자료는
 * 셋 다 첫 글자부터 갈려 `HEX_HEAD_MIN` 그대로지만, 자료가 바뀌어도 화면이 거짓을
 * 말하지 않는다.
 *
 * 걸음이 아니라 두 벌에서 나오므로 재생 내내 같은 값이다 — 도중에 글자 수가
 * 늘어나 보이는 일이 없다.
 */
export function printedHexLengthOf(scene: MerkleTreeScene): number {
  const pairs: [string, string][] = [
    [scene.before.left, scene.after.left],
    [scene.before.right, scene.after.right],
    [scene.before.root, scene.after.root],
  ];
  const count = leafCountOf(scene);
  for (let i = 0; i < count; i++) {
    pairs.push([scene.before.leaves[i]?.hash ?? '', scene.after.leaves[i]?.hash ?? '']);
  }

  let need = HEX_HEAD_MIN;
  for (const [a, b] of pairs) {
    const at = firstDiffAt(a, b);
    if (at >= 0) need = Math.max(need, at + 1);
  }
  return Math.min(HEX_HEAD_MAX, need);
}

/**
 * 지금 화면이 말할 것.
 *
 * 걸음이 아니라 **자취**에서 나온다 — 정적 그리기가 `step` 을 읽지 않아야 흘려
 * 세운 화면과 곧바로 세운 화면이 같아진다 (S-scene).
 */
export function captionOf(scene: MerkleTreeScene): MerkleCaption | null {
  if (scene.pathMarked) return { kind: 'pathOnly' };
  if (scene.leafChanged) return { kind: 'changed' };
  if (scene.folded) return { kind: 'folded' };
  if (scene.leavesShown) return { kind: 'leaves' };
  return null;
}

export const merkleTreeScene: ScenePlan<MerkleTreeScene> = {
  /**
   * 첫 장면은 비어 있다 — 트리 두 벌을 `init` 이 실어 온다.
   *
   * 넘겨받은 `initialData` 를 쳐다보지 않는다. 그것은 algorithm 이 제자리에서 고칠
   * 수 있는 객체라, 참조는 물론이고 한 번 읽어 두는 것도 되짚기의 바탕으로 삼기엔
   * 위태롭다 (S-scene).
   */
  initial(): MerkleTreeScene {
    const empty: MerkleSceneTree = { leaves: [], left: '', right: '', root: '' };
    return atStart({ before: empty, after: empty });
  },

  reduce(scene: MerkleTreeScene, event: FacetRuntimeEvent): MerkleTreeScene {
    switch (event.type) {
      /* 바탕이 들어선다. 값을 베껴 담는다 — 새 배열에 새 객체다. */
      case 'init': {
        const p = fields(event.payload);
        return atStart({ before: readTree(p?.before), after: readTree(p?.after) });
      }

      /* 잎마다 자기 해시가 붙는다. 몇 개인가는 바탕이 말한다. */
      case 'build-leaves':
        return { ...scene, leavesShown: true, step: { kind: 'leaves' } };

      /* 둘씩 묶여 위로 합쳐진다. 누가 누구의 부모인가는 구조가 말한다. */
      case 'combine-up':
        return { ...scene, folded: true, step: { kind: 'fold' } };

      /* 파일 하나가 바뀐다. 어느 잎인가는 두 벌을 견주면 나온다. */
      case 'change-leaf':
        return { ...scene, leafChanged: true, step: { kind: 'change' } };

      /* 갈림이 꼭대기까지 올라간다. 어디가 갈리는가도 두 벌이 말한다. */
      case 'mark-path':
        return { ...scene, pathMarked: true, step: { kind: 'path' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다. 객체 리터럴을 넘긴다. */
      case 'rewind':
        return atStart({ before: scene.before, after: scene.after });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
