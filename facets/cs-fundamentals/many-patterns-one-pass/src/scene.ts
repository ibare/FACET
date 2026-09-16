/**
 * ManyPatternsOnePass 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 주장이 어디에 있었나
 *
 * 이 조각은 둘을 말한다. **여러 무늬를 한 나무로 합친다** 와 **한 번 지나가며 여럿을
 * 동시에 찾는다.**
 *
 * 뒤엣것은 옮기기 전에도 화면에 남았다 — 걸린 딱지가 텍스트 아래에 앉고 지워지지
 * 않는다. 그런데 **앞엣것이 없었다.** 명령형 stage 의 `buildTrie` 는 포개는 운동이
 * 끝나자마자 같은 자리에 내려앉은 칸을 `entry.tile.g.remove()` 로 **지워 버렸다.**
 * 다 끝난 화면에는 세 무늬가 나눠 쓴 `h` 마디와 한 무늬만 지나간 `s` 마디의 구별이
 * 남지 않는다. "합친다" 가 560ms 운동 동안만 보이고 사라진 것이다 (프로토콜 4절
 * "조각의 주장이 애초에 화면에 안 남아 있는 수가 있다" — 같은 결의
 * `share-prefix-path` 가 정확히 같은 자리에 걸렸다).
 *
 * 이제 나눠 쓴 마디와 가지가 **남는 표식**으로 선다. 그 수는 장면이 담지 않고
 * `sharedByCount` 가 무늬 목록에서 센다 — 마디를 지나는 무늬 수는 구조가 이미
 * 말하고 있으므로 따로 적으면 두 자리에서 세는 꼴이 된다.
 *
 * ── 숨어 있던 상태
 *
 * projector 에는 `let` 이 하나도 없었다. stage 의 `let` 열 중 여섯이 DOM 손잡이였고,
 * 나머지 넷과 `const` 하나가 화면이 혼자 쥐고 있던 것이다.
 *
 * - **몇 번째 글자까지 읽었나** — `lastCell`. 이제 `reads.length` 가 말한다.
 * - **띠가 어디까지 찼나** — `ribbonW`. 화면의 지금 자리를 따로 적어 둔 **거울**이고,
 *   다음 운동의 **출발값**으로 쓰였다. 되짚어 세운 직후에는 옛 화면의 것이라 띠가
 *   엉뚱한 데서 출발한다 (프로토콜 함정 28). 이제 읽은 글자 수에서 나온다.
 * - **줄기의 텍스트 쪽 끝이 어디 있나** — `headX`. 위와 같은 거울이다. 이제 앞
 *   걸음의 읽은 자리에서 나온다.
 * - **어느 딱지가 몇째 줄에 앉았나** — `const lanes: {start,end}[][]`. `const` 인데
 *   `laneFor` 가 알맹이를 제자리에서 고쳤다(`taken.push`). `let` grep 도
 *   `new Map` grep 도 통과한다. 이제 걸린 목록에서 그릴 때마다 새로 셈한다.
 * - **어느 글자 칸이 어느 마디에 앉나** — `letterTiles` 의 `{ tile, homeX, rowY,
 *   nodeId }`. **DOM 손잡이와 뜻이 한 객체**에 묶여 있었고 `nodeId` 는 발신이 실어
 *   온 `paths` 로 채워졌다. 무늬 목록에서 나오는 것이라 이제 그리는 쪽이 셈한다.
 * - **어느 마디에서 무늬가 걸렸나** — `nodeTile` 이 쥔 칸의 `fill` 뿐이었다. 되돌리는
 *   명령이 없어 칠이 쌓이던 자리이고, 그 누적이 곧 정보였다 (프로토콜 4절). 이제
 *   `catches` 가 말하고 **정적 그리기가 매번 다시 세운다.**
 * - **끝났나** — `cursor` 와 `connector` 의 `opacity` 0.35. 이제 `done`.
 *
 * ── 장면이 담지 않는 것
 *
 * 좌표를 담지 않는다. 마디의 구조만 말하고 자리는 그리는 쪽이 캔버스에서 셈한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지는 `step` 이 그대로 말하고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10). 나무의 모양도 담지 않는다 —
 * `manyPatternsOnePassNodes` 가 무늬 목록에서 셈한다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { ROOT, manyPatternsOnePassNodes } from './algorithm.js';

/** 글자 하나를 읽고 커서가 옮겨 간 자취. */
export type ManyPatternsOnePassRead = {
  /** 커서가 간 마디의 id. */
  to: string;
  /** 길이 끊겨 들른 마디. 미끄러지지 않았으면 `null`. */
  via: string | null;
};

/**
 * 한 자리에서 함께 걸린 무늬들. **남는다** — 여럿이 동시에 걸리는 것이 이 조각의
 * 결론이라, 하나 찾고 다음 걸음에 지우면 *동시에* 가 사라진다.
 */
export type ManyPatternsOnePassCatch = {
  /**
   * 몇 번째 글자를 읽은 자리에서 걸렸나. 발신이 싣지 않고 장면이 센다 —
   * 읽은 글자가 하나씩 쌓이므로 그때의 `reads.length - 1` 이 곧 그 자리다.
   */
  at: number;
  /** 함께 걸린 무늬들. 무늬 이름과 그 길이가 텍스트에서의 구간을 정한다. */
  patterns: string[];
};

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 캡션도 이것 하나에서 나온다. 걸음마다 할 말이 정해져 있어 따로 담으면 같은 물음에
 * 답이 둘이 되기 때문이다 — 머무름·내려감·미끄러짐의 갈래도 `reads` 에서 나온다.
 *
 * 출발 그림은 싣지 않는다. 커서가 어디서 출발하는지는 앞 읽기의 `to` 이고, 띠와
 * 줄기가 어디서 출발하는지는 읽은 글자 수다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type ManyPatternsOnePassStep =
  | { kind: 'lay' }
  | { kind: 'merge' }
  | { kind: 'read' }
  | { kind: 'catch' }
  | { kind: 'finish' };

export type ManyPatternsOnePassScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 함께 찾을 무늬들. 나무의 모양(=좌표)과 나눠 쓴 자리를 이것 하나가 정한다. */
  patterns: string[];
  /** 한 번만 지나갈 텍스트. */
  text: string;

  // ── 걸어온 자취.
  /** 무늬 넉 줄이 놓였나. */
  laid: boolean;
  /** 한 나무로 포개졌나. 이때부터 나무와 커서가 선다. */
  merged: boolean;
  /**
   * 읽은 글자마다 커서가 어디로 갔나. **길이가 곧 몇 번째 글자를 읽고 있나다.**
   *
   * 텍스트 칸의 칠도 띠의 길이도 여기서 나온다 — 읽는 자리는 한 번도 왼쪽으로
   * 가지 않으므로 길이 하나로 충분하다.
   */
  reads: ManyPatternsOnePassRead[];
  /** 걸린 자리들. **남는다.** */
  catches: ManyPatternsOnePassCatch[];
  /** 훑기를 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  done: boolean;

  step: ManyPatternsOnePassStep | null;
};

/**
 * 걸음이 고치지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * `reads` · `catches` 는 여기 들지 않는다 — 들면 되감은 화면이 이미 다 훑은 자취를
 * 단 채로 서고, 그 위에 algorithm 이 처음부터 다시 읽은 걸음이 겹친다 (프로토콜 4절).
 */
type ManyPatternsOnePassBase = Pick<ManyPatternsOnePassScene, 'patterns' | 'text'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ManyPatternsOnePassBase): ManyPatternsOnePassScene {
  return {
    patterns: base.patterns,
    text: base.text,
    laid: false,
    merged: false,
    reads: [],
    catches: [],
    done: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string');
}

// ── 장면에서 세는 것들 ───────────────────────────────────────────────────
//
// 걸음의 payload 가 실어 온 수를 쓰지 않는다. 화면에 함께 뜨는 수가 두 군데에서
// 셈해지면 언젠가 갈린다 (프로토콜 4절).

/** 지금 읽고 있는 글자의 자리. 아직 하나도 안 읽었으면 `-1`. */
export function readIndex(scene: ManyPatternsOnePassScene): number {
  return scene.reads.length - 1;
}

/** 커서가 선 마디. 나무가 서기 전에는 `null`, 선 직후에는 뿌리다. */
export function cursorAt(scene: ManyPatternsOnePassScene): string | null {
  if (!scene.merged) return null;
  const last = scene.reads[scene.reads.length - 1];
  return last ? last.to : ROOT;
}

/** 방금 읽기가 어떤 옮김이었나. `via` 가 있으면 미끄러짐, 제자리면 머무름. */
export function lastMove(
  scene: ManyPatternsOnePassScene,
): 'stay' | 'descend' | 'slide' | null {
  const at = readIndex(scene);
  const last = scene.reads[at];
  if (!last) return null;
  if (last.via !== null) return 'slide';
  const from = scene.reads[at - 1]?.to ?? ROOT;
  return last.to === from ? 'stay' : 'descend';
}

/** 지금까지 걸린 무늬의 수. 걸린 목록에서 센다 — 발신이 싣지 않는 까닭이 이것이다. */
export function foundCount(scene: ManyPatternsOnePassScene): number {
  return scene.catches.reduce((sum, caught) => sum + caught.patterns.length, 0);
}

/**
 * 마디마다 그 마디를 지나는 무늬가 몇인가.
 *
 * **이 조각의 앞쪽 주장이 여기 있다.** 둘 이상이면 나눠 쓴 길이고, 그것이 곧
 * "여럿을 한 나무로 합쳤다" 는 말이다. 남는 표식이라 정적 그리기에도 반드시
 * 들어간다 — 빠뜨리면 합친 자리와 혼자 난 자리의 구별이 사라진다.
 *
 * 무늬 목록에서 바로 세므로 장면에 담지 않는다. 뿌리는 세지 않는다 (모두가 지난다).
 */
export function sharedByCount(patterns: string[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const node of manyPatternsOnePassNodes(patterns)) {
    if (node.id === ROOT) continue;
    count.set(node.id, patterns.filter((pattern) => pattern.startsWith(node.id)).length);
  }
  return count;
}

export const manyPatternsOnePassScene: ScenePlan<ManyPatternsOnePassScene> = {
  /**
   * 첫 장면은 바탕만 쥐고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 무늬 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께
   * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene).
   */
  initial(initialData: unknown): ManyPatternsOnePassScene {
    const d = (initialData ?? {}) as { patterns?: unknown; text?: unknown };
    return atStart({ patterns: strList(d.patterns), text: str(d.text) ?? '' });
  },

  reduce(
    scene: ManyPatternsOnePassScene,
    event: FacetRuntimeEvent,
  ): ManyPatternsOnePassScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 무늬 넉 줄을 늘어놓는다. 따로 훑을 때의 횟수는 무늬 수 그대로다.
      case 'patterns-laid':
        return { ...scene, laid: true, step: { kind: 'lay' } };

      // 같은 앞머리를 포개어 한 나무로 세운다. 나무의 모양은 무늬 목록이 정한다.
      case 'trie-merged':
        return { ...scene, laid: true, merged: true, step: { kind: 'merge' } };

      // 글자 하나를 읽고 커서가 옮겨 간다. 읽은 자리는 쌓이는 길이가 말한다.
      case 'read': {
        const to = str(p.to);
        if (to === null) return scene;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          reads: [...scene.reads, { to, via: str(p.via) }],
          step: { kind: 'read' },
        };
      }

      // 이 자리에서 무늬가 걸린다. 여럿이면 한 번에 온다.
      case 'match': {
        const patterns = strList(p.patterns);
        const at = readIndex(scene);
        if (patterns.length === 0 || at < 0) return scene;
        return {
          ...scene,
          catches: [...scene.catches, { at, patterns }],
          step: { kind: 'catch' },
        };
      }

      // 훑기를 마쳤다. 찾은 수는 걸린 목록에서 센다.
      case 'done':
        return { ...scene, done: true, step: { kind: 'finish' } };

      case 'rewind':
        // 바탕만 넘긴다. 변수째 넘기면 초과 속성 검사가 돌지 않아 자취가 딸려 간다.
        return atStart({ patterns: scene.patterns, text: scene.text });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
