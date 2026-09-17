/**
 * failLink 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 주장이 마지막 화면에 없었다
 *
 * 이 조각이 말하는 것은 **어긋나면 처음이 아니라 겹치는 자리로 미끄러진다** 는 것이고,
 * 그 값은 "처음으로 돌아갔다면 놓쳤을 것" 과의 **대조**에서만 나온다. 그런데 옮기기
 * 전 `finish()` 가 `clearMarks()` 를 불러 그 대조를 **마지막 걸음에서 통째로 지웠다.**
 * 놓친 패턴에 둘렀던 고리도, 'missed' 딱지도, 뿌리로 돌아간 유령도 전부 사라지고
 * 완주 화면에는 "미끄러졌다" 쪽만 남았다 — 견줄 상대가 없으니 "덕분에 이만큼 아꼈다"
 * 가 캡션의 말로만 남는다 (프로토콜 4절 "조각의 주장이 애초에 화면에 안 남아 있는 수").
 *
 * 그래서 나이브 갈래를 `naive` 로 장면에 올려 **정적 그리기가 매번 세우게** 했다.
 * 두 길이 완주 화면에 나란히 선다.
 *
 * ── 어휘를 먼저 가른다
 *
 * 한 화면에 "실제로 간 길" 과 "가지 않은 길" 이 함께 있으므로 어휘부터 나눈다.
 *
 * - **실선** — 실제로 일어난 것. 그어 둔 실패 링크(얇고 옅다) 와 실제로 미끄러진
 *   링크(굵고 itemActive).
 * - **점선** — 일어나지 않은 것. 뿌리로 돌아갔을 길, 뿌리에 선 유령, 그때 놓쳤을
 *   패턴의 바깥 고리. 전부 `danger` 한 식구다.
 *
 * 헛걸음을 살아 있는 자국과 같은 모양으로 그리면 읽기가 뒤집힌다.
 *
 * ── 숨어 있던 상태
 *
 * `projector.ts` 에는 `let` 도 조회 분기도 하나도 없었다. 전부 stage 의 DOM 속성과
 * `const` 묶음에 있었다 — 다섯 자리 가운데 ④ 와 ⑤ 다.
 *
 * - **어느 마디가 났나** — `nodeEls` 의 `g.opacity` 0/1. 이제 `grown`.
 * - **어느 마디에서 패턴을 거뒀나** — `matchedNodes` 라는 `Set` 이 선언되어 있었으나
 *   **어디에서도 읽히지 않았다.** 사실은 `circle` 의 `fill` 에만 있었다. 이제
 *   `matches` 가 말하고, 글줄의 띠(`matchBars`)도 같은 목록에서 나온다.
 * - **실패 링크를 이미 그었나** — `arcEls` 맵의 키. 이제 `links`.
 * - **어느 링크로 실제로 미끄러졌나** — `slideToFail` 이 그 호의 `stroke` 를
 *   `itemActive` 로 바꾸고 되돌리지 않은 것. **이 조각의 결론이 칠에만 있었다.**
 *   이제 `slid`.
 * - **커서가 어느 마디에 있나** — `cursor` 의 `cx`/`cy`. 이제 `cursor`.
 * - **어디까지 읽었나** — 글자 칸의 `fill` 과 `stripCursor` 의 `x`. 이제 `read`·`probe`.
 * - **훑기가 시작되었나** — `cursor.getAttribute('opacity') !== '1'` 로 화면을 되읽어
 *   갈렸다. 이제 `cursor === null` 이 말한다.
 *
 * ── 같은 것을 두 자리에서 세지 않는다
 *
 * 글자 자리(`index`) · 마디의 글자열(`word`·`suffix`) · 깊이(`depth`) · 거둔 패턴
 * 이름(`matched`) · 새로 난 마디 목록(`nodeIds`) · 무늬 이름(`pattern`) 은 전부
 * 장면에서 나오므로 **algorithm 의 발신에서 걷어냈다.** 실려 있으면 다음 사람이
 * 집어 쓰는 순간 출처가 둘이 된다.
 *
 * 남긴 것은 셋이고 모두 **걸음이 내리는 판정**이다.
 *
 * - `tree-ready` 의 `nodes` — 나무의 모양 그 자체. 구조에서 셀 수 있는 것이 아니다.
 * - `fail-linked` / `fail-slid` 의 `to` — **실패 링크는 이 조각의 알고리즘 그 자체다.**
 *   순수 함수라 내줄 수는 있으나, 내주면 장면이 알고리즘을 되풀이하고 발신이 장식이
 *   된다. 잣대대로 "그 함수만 떼어 내도 조각이 말하려는 바가 남아 있나" 를 물으면
 *   답이 아니오다 — 조각의 이름이 `fail-link` 다. 그래서 **멈추고 싣는다**
 *   (프로토콜 2-4 가운데 줄의 경계).
 * - `scan-advanced` 의 `to` — 그 글자로 어디까지 갔는가라는 판정.
 * - `naive-restart` 의 `missed` — **다른 주행**(뿌리로 돌아가는 쪽)의 결과라 이 장면의
 *   자취에서는 셀 수 없다. 대신 `done` 에서 같은 값을 다시 싣던 것은 걷어냈다.
 *
 * 좌표는 담지 않는다 — 부모·글자라는 **구조**만 담고 자리는 그리는 쪽이 캔버스에서
 * 셈한다 (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 뿌리의 마디 번호. 실패 링크가 뿌리를 가리키면 "처음으로" 라는 뜻이다. */
export const ROOT = 0;

/** 뿌리의 부모 자리. */
const NO_PARENT = -1;

/** 아직 어느 무늬도 내지 않은 자리 — 뿌리뿐이다. */
const BORN_BY_NONE = -1;

/**
 * 나무의 마디 하나. **좌표도 깊이도 글자열도 담지 않는다** — 부모와 글자가 구조를
 * 정하고, 깊이·글자열·자리는 거기서 파생된다 (S-piece).
 */
export type FailLinkSceneNode = {
  id: number;
  /** 부모 마디. 뿌리는 `-1`. */
  parent: number;
  /** 부모에서 이 마디로 들어오는 글자. 뿌리는 빈 글자. */
  ch: string;
  /** 이 마디에서 끝나는 무늬. 없으면 `null`. */
  terminal: string | null;
};

/** 난 마디 하나. `by` 는 그것을 처음 낸 무늬의 번호. 뿌리는 `-1`. */
export type FailLinkGrown = { id: number; by: number };

/** 실패 링크 하나. 뿌리를 가리키는 것은 그리지 않으므로 여기 들지 않는다. */
export type FailLinkArc = { from: number; to: number };

/** 거둔 무늬 하나. `at` 은 그 무늬가 끝난 글자 자리, `node` 는 끝난 마디. */
export type FailLinkMatch = { at: number; node: number };

/**
 * 뿌리로 돌아갔다면 어땠을까 — **가지 않은 길**.
 *
 * 출발 마디는 담지 않는다. 처음으로 미끄러진 자리(`slid[0].from`)가 곧 그 자리다.
 * `missed` 만 담는다 — 그것만이 이 장면의 자취에서 셀 수 없는 것이기 때문이다.
 */
export type FailLinkNaive = { missed: string[] };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * 커서가 자리를 옮기는 갈래만 계기값을 싣는다 — 출발 그림을 `prev` 에서 꺼내면
 * S-scene 위반이고, DOM 을 되읽으면 되짚은 직후 옛 화면에서 출발한다 (함정 28).
 */
export type FailLinkStep =
  | { readonly kind: 'tree' }
  | { readonly kind: 'insert' }
  | { readonly kind: 'link' }
  /** `from` 은 커서가 떠난 마디, `wasAt` 은 글줄 커서가 떠난 자리 (처음이면 `null`). */
  | { readonly kind: 'scan'; readonly from: number; readonly wasAt: number | null }
  | { readonly kind: 'slide'; readonly from: number; readonly wasAt: number | null }
  | { readonly kind: 'naive' }
  | { readonly kind: 'done' };

/**
 * 캡션이 말할 것. **인자를 담지 않는다** — 무늬 이름도 글자도 마디의 글자열도 전부
 * 장면에서 나오므로, 여기 또 적으면 같은 것을 두 자리에서 말하는 꼴이 된다.
 */
export type FailLinkCaption =
  | { readonly kind: 'insert' }
  | { readonly kind: 'failLink' }
  | { readonly kind: 'match' }
  | { readonly kind: 'rootStay' }
  | { readonly kind: 'step' }
  | { readonly kind: 'slide' }
  | { readonly kind: 'naive' }
  | { readonly kind: 'done' };

export type FailLinkScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 훑을 글줄. 글자 칸과 띠의 자리를 이것 하나가 정한다. */
  readonly text: string;
  /** 나무에 이을 무늬들. 넣는 차례가 곧 이 목록의 차례다. */
  readonly patterns: readonly string[];

  // ── 걸어온 자취.
  /** 나무 전체의 모양. `tree-ready` 가 채운다. 자리는 이것 하나로 정해진다. */
  readonly nodes: readonly FailLinkSceneNode[];
  /** 지금까지 난 마디들. 뿌리를 포함한다. 가지는 여기서 파생된다. */
  readonly grown: readonly FailLinkGrown[];
  /** 다 넣은 무늬 수. 다음에 넣을 무늬의 번호이기도 하다. */
  readonly inserted: number;
  /** 그어 둔 실패 링크들. **남는다.** */
  readonly links: readonly FailLinkArc[];
  /**
   * 실제로 미끄러진 링크들. **이 조각의 결론이라 남는다.**
   *
   * 그어 둔 링크와 실제로 지나간 링크를 가르지 않으면 "이 약속이 쓰였다" 가 화면에서
   * 사라진다 (함정 29 — 한 축에 값을 셋 이상 욱여넣지 않는다).
   */
  readonly slid: readonly FailLinkArc[];
  /** 커서가 선 마디. 아직 훑기를 시작하지 않았으면 `null`. */
  readonly cursor: number | null;
  /** 삼킨 글자 수. 다음에 읽을 글자의 자리이기도 하다. */
  readonly read: number;
  /** 커서가 짚고 있는 글자 자리. 아직 짚지 않았으면 `null`. */
  readonly probe: number | null;
  /** 거둔 무늬들. **남는다.** 글줄의 띠도 마디의 칠도 이 목록 하나에서 나온다. */
  readonly matches: readonly FailLinkMatch[];
  /** 뿌리로 돌아갔을 길. **남는다.** 없으면 `null`. */
  readonly naive: FailLinkNaive | null;

  readonly step: FailLinkStep | null;
  readonly caption: FailLinkCaption | null;
  /** 할 말을 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  readonly done: boolean;
};

/**
 * 되감기가 딛는 바탕.
 *
 * 글줄과 무늬 목록뿐이다. `nodes` 는 `tree-ready` 가 채우는 **걸음의 몫**이라 여기
 * 들지 않는다 — 들면 되감은 화면이 이미 다 선 나무를 쥔 채로 서고, 그 위에
 * algorithm 이 처음부터 다시 낸 나무가 겹친다 (함정 14).
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다 (함정 15).
 */
type Base = Pick<FailLinkScene, 'text' | 'patterns'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: Base): FailLinkScene {
  return {
    text: base.text,
    patterns: base.patterns,
    nodes: [],
    grown: [],
    inserted: 0,
    links: [],
    slid: [],
    cursor: null,
    read: 0,
    probe: null,
    matches: [],
    naive: null,
    step: null,
    caption: null,
    done: false,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

function readNodes(v: unknown): FailLinkSceneNode[] {
  if (!Array.isArray(v)) return [];
  const out: FailLinkSceneNode[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const n = raw as Record<string, unknown>;
    const id = int(n.id);
    if (id === null) continue;
    out.push({
      id,
      parent: int(n.parent) ?? NO_PARENT,
      ch: str(n.ch) ?? '',
      terminal: str(n.terminal),
    });
  }
  return out;
}

function readStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const s = str(raw);
    if (s !== null && s !== '') out.push(s);
  }
  return out;
}

// ── 구조에서 나오는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 것은 전부 이 아래를 지난다. 마디의 글자열도, 깊이도, 무늬가 지나는
// 길도 payload 가 아니라 `nodes` 하나에서 풀린다.

/** 마디 번호로 마디를 찾는다. 없으면 `null`. */
export function nodeOf(
  nodes: readonly FailLinkSceneNode[],
  id: number,
): FailLinkSceneNode | null {
  return nodes.find((n) => n.id === id) ?? null;
}

/**
 * 그 마디가 나타내는 글자열. 부모를 거슬러 올라가며 글자를 앞에 붙인다.
 *
 * 걸음이 `word`·`suffix` 를 실어 오던 자리다. 나무가 있으면 셈할 수 있으므로
 * 싣지 않는다.
 */
export function wordOf(nodes: readonly FailLinkSceneNode[], id: number): string {
  let out = '';
  let cur = id;
  // 나무의 마디 수보다 더 거슬러 오를 일이 없다 — 고리가 생겨도 멈춘다.
  for (let guard = 0; guard <= nodes.length; guard += 1) {
    const node = nodeOf(nodes, cur);
    if (node === null || node.parent === NO_PARENT) break;
    out = node.ch + out;
    cur = node.parent;
  }
  return out;
}

/** 뿌리로부터의 깊이. 자리의 세로를 정하는 값이라 그리는 쪽이 부른다. */
export function depthOf(nodes: readonly FailLinkSceneNode[], id: number): number {
  let depth = 0;
  let cur = id;
  for (let guard = 0; guard <= nodes.length; guard += 1) {
    const node = nodeOf(nodes, cur);
    if (node === null || node.parent === NO_PARENT) break;
    depth += 1;
    cur = node.parent;
  }
  return depth;
}

/**
 * 무늬 하나가 뿌리에서 내려가며 지나는 마디들.
 *
 * 나무를 **따라 내려가는 조회**이지 나무를 **짓는** 일이 아니다. 그래서 algorithm 의
 * 삽입 루프와 같은 규칙이 두 곳에 적히는 자리가 아니다.
 */
export function pathOf(nodes: readonly FailLinkSceneNode[], pattern: string): number[] {
  const out: number[] = [];
  let cur = ROOT;
  for (const ch of pattern) {
    const next = nodes.find((n) => n.parent === cur && n.ch === ch);
    if (next === undefined) return out;
    cur = next.id;
    out.push(cur);
  }
  return out;
}

/**
 * 거둔 무늬가 글줄에서 덮는 자리. 무늬 길이가 띠의 길이를 정한다.
 *
 * 길이는 코드 포인트로 잰다 — algorithm 의 훑기도 글줄을 그 단위로 나아가므로,
 * `length` 로 재면 글자 하나가 두 칸을 차지하는 자리에서 띠가 어긋난다.
 */
export function spanOf(
  scene: FailLinkScene,
  match: FailLinkMatch,
): { start: number; end: number } | null {
  const node = nodeOf(scene.nodes, match.node);
  if (node === null || node.terminal === null) return null;
  return { start: Math.max(0, match.at - [...node.terminal].length + 1), end: match.at };
}

/** 지금까지 거둔 마디들. 마디의 칠이 이 집합 하나에서 나온다. */
export function matchedNodes(scene: FailLinkScene): Set<number> {
  return new Set(scene.matches.map((m) => m.node));
}

/**
 * 뿌리로 돌아갔다면 놓쳤을 무늬들이 앉은 마디.
 *
 * 무늬 이름으로 마디를 찾는다 — 이름이 마디의 `terminal` 이기 때문이다.
 */
export function missedNodes(scene: FailLinkScene): { id: number; pattern: string }[] {
  if (scene.naive === null) return [];
  const born = new Set(scene.grown.map((g) => g.id));
  const out: { id: number; pattern: string }[] = [];
  for (const pattern of scene.naive.missed) {
    const node = scene.nodes.find((n) => n.terminal === pattern && born.has(n.id));
    if (node !== undefined) out.push({ id: node.id, pattern });
  }
  return out;
}

export const failLinkScene: ScenePlan<FailLinkScene> = {
  /**
   * 첫 장면은 글줄과 무늬 목록만 쥐고 비어 있다. 나무는 `tree-ready` 가 세운다.
   *
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene).
   */
  initial(initialData: unknown): FailLinkScene {
    const d = (initialData ?? {}) as { text?: unknown; patterns?: unknown };
    return atStart({ text: str(d.text) ?? '', patterns: readStrings(d.patterns) });
  },

  reduce(scene: FailLinkScene, event: FacetRuntimeEvent): FailLinkScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 나무의 모양이 온다. 자리를 미리 잡되 보이는 것은 뿌리뿐이다.
      // 한 바퀴의 첫 걸음이므로 자취를 여기서 함께 비운다.
      case 'tree-ready': {
        const nodes = readNodes(p.nodes);
        if (nodes.length === 0) return scene;
        return {
          ...atStart({ text: scene.text, patterns: scene.patterns }),
          nodes,
          grown: [{ id: ROOT, by: BORN_BY_NONE }],
          step: { kind: 'tree' },
        };
      }

      // 무늬 하나가 나무에 들어간다. **몇 번째 무늬인지도, 새로 나는 마디가
      // 무엇인지도 장면이 센다** — 무늬 목록과 나무만 있으면 나오는 것들이다.
      case 'pattern-inserted': {
        const by = scene.inserted;
        const pattern = scene.patterns[by];
        if (pattern === undefined) return scene;
        const born = new Set(scene.grown.map((g) => g.id));
        const added = pathOf(scene.nodes, pattern)
          .filter((id) => !born.has(id))
          .map((id) => ({ id, by }));
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          grown: [...scene.grown, ...added],
          inserted: by + 1,
          step: { kind: 'insert' },
          caption: { kind: 'insert' },
        };
      }

      // 실패 링크 하나가 그어진다. **이 조각의 알고리즘 그 자체라 싣는 것을 받는다.**
      case 'fail-linked': {
        const from = int(p.from);
        const to = int(p.to);
        if (from === null || to === null) return scene;
        const known = scene.links.some((l) => l.from === from && l.to === to);
        return {
          ...scene,
          links: known ? scene.links : [...scene.links, { from, to }],
          step: { kind: 'link' },
          caption: { kind: 'failLink' },
        };
      }

      // 글자 하나를 삼키고 커서가 옮겨 간다. 자리도 이름도 장면이 센다.
      case 'scan-advanced': {
        const to = int(p.to);
        if (to === null) return scene;
        const at = scene.read;
        const node = nodeOf(scene.nodes, to);
        const matched = node !== null && node.terminal !== null;
        return {
          ...scene,
          cursor: to,
          read: at + 1,
          probe: at,
          matches: matched ? [...scene.matches, { at, node: to }] : scene.matches,
          // 출발 그림은 걸음이 말한다. `prev` 도 DOM 도 들추지 않는다 (S-scene).
          step: { kind: 'scan', from: scene.cursor ?? ROOT, wasAt: scene.probe },
          caption: matched
            ? { kind: 'match' }
            : to === ROOT
              ? { kind: 'rootStay' }
              : { kind: 'step' },
        };
      }

      // 이 조각의 한 순간 — 이어갈 길이 없어 겹치는 자리로 미끄러진다.
      // 글자는 아직 삼키지 않았다. 그 글자를 짚은 채로 옆으로 간다.
      case 'fail-slid': {
        const to = int(p.to);
        if (to === null) return scene;
        const from = scene.cursor ?? ROOT;
        return {
          ...scene,
          cursor: to,
          probe: scene.read,
          slid: [...scene.slid, { from, to }],
          step: { kind: 'slide', from, wasAt: scene.probe },
          caption: { kind: 'slide' },
        };
      }

      // 대비 — 그 자리에서 뿌리로 돌아갔다면 무엇을 놓쳤을까.
      // **다른 주행의 결과**라 이 장면의 자취에서는 셀 수 없다. 그래서 받는다.
      case 'naive-restart': {
        const missed = readStrings(p.missed);
        return {
          ...scene,
          naive: { missed },
          step: { kind: 'naive' },
          caption: { kind: 'naive' },
        };
      }

      // 마무리. 무엇을 살려 냈는지는 `naive` 가 이미 쥐고 있어 다시 싣지 않는다.
      case 'done':
        return { ...scene, step: { kind: 'done' }, caption: { kind: 'done' }, done: true };

      case 'rewind':
        // 바탕만 넘긴다. 변수째 넘기면 초과 속성 검사가 돌지 않아 자취가 딸려 간다.
        return atStart({ text: scene.text, patterns: scene.patterns });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
