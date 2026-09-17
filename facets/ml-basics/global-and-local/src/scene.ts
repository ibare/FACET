/**
 * globalAndLocal 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 261 줄인데 `let` 은 `loudestShift` 안의 접기 하나뿐이었고 조회로
 * 갈리는 분기도 없었다. **숨은 상태는 전부 stage 에 있었고, 그중 넷은 `const` 로
 * 묶여 어떤 grep 에도 걸리지 않았다.**
 *
 * - **`let unitLo` · `let unitHi`** — **연속 좌표의 척도**. 화면의 모든 가로 자리가
 *   `xOfUnit` 을 지나고 그것이 이 둘을 읽었다. 첫 걸음이 실어 온 `rows` 를 stage 가
 *   적어 두고 그 뒤로 계속 쓴 자리다 — 척도를 정하는 자리와 쓰는 자리가 갈라져
 *   있었다. 지금은 `unitRangeOf` 가 담긴 자리들에서 **매번** 셈한다. 장면이 담는
 *   것은 픽셀이 아니라 **값의 범위**다 (S-piece).
 * - **`const anchors = new Map<GlobalAndLocalRow, {lo,hi}>()`** — 두 자의 앵커.
 *   `Map` 은 값만이 아니라 **자리가 있느냐**도 상태였다: `xOf` 는 앵커가 없으면
 *   `W/2` 를 돌려주어 "아직 자를 안 세웠다" 를 화면 한복판으로 말했다. 지금은
 *   `plan === null` 이 그것을 말한다.
 * - **`const pointX = new Map<string, number>()`** — **DOM 의 거울**(함정 28).
 *   점이 지금 어느 가로 자리에 있는지를 따로 적어 둔 표다. `showTies` 가 실의 두
 *   끝을 **여기서** 꺼냈고, 게다가 `for (const [key, from] of pointX)` 로 돌아
 *   **삽입 순서가 실을 긋는 차례**였다 (함정 36). `getAttribute` 를 안 쓰니 ④ 의
 *   grep 을 통과하고 `const` 라 ② 도 통과한다. 지금은 두 자의 점 값에서 그리는
 *   쪽이 셈하고, 차례는 `plan.global.points` 의 차례다.
 * - **`const centroidX` · `const extents`** — 같은 모양의 거울 둘. 앞의 것은 사이를
 *   재는 괄호의 두 끝을, 뒤의 것은 무리 띠의 폭을 쥐었다. `showInside()` 와
 *   `showVerdict()` 가 **인자를 하나도 안 받는다**는 것이 그 증거다 — 그릴 것을
 *   전부 이 두 표에서 꺼냈다.
 * - **`type Bracket = { line, ticks, label, x1, x2 }`** 와 `const topBrackets` ·
 *   `const bottomBrackets` — DOM 손잡이와 픽셀 수치가 한 객체에 묶인 ⑤ 의 전형.
 *   `push` 로 알맹이가 제자리에서 자라고 `length = 0` 으로 비워졌다. 지금은
 *   `gapsShown` 하나가 몇 쌍을 재었나를 말하고 자리는 `gapsOf` 가 셈한다.
 * - `let loudest` · `let loudestAmount` — 가장 크게 밀린 무리. 실의 굵기와 짙기에만
 *   적혀 있었다. 지금은 `loudestGroupOf` 가 자취에서 센다.
 *
 * ── 수는 한 출처에서만 나온다 (프로토콜 4 절의 잣대 표)
 *
 * 옛 발신은 payload 를 열 줄에 실어 왔다. 그 대부분이 **두 자의 자리에서 곧바로
 * 나오는 몫**이라, 실어 오면 화면의 자와 글자의 수가 다른 출처가 된다.
 *
 * - **자의 범위와 앵커**(`rulers.rows`) — 놓인 점과 무리 가운데의 최솟값·최댓값이다.
 * - **밀린 폭**(`tie.shifts`) — 두 자의 무리 가운데를 앵커로 잰 몫의 차다.
 * - **무리가 차지하는 몫**(`inside`) — 무리 안 점들의 폭을 앵커 폭으로 나눈 것이다.
 * - **사이의 몫**(`measure-gap` 의 `globalShare`·`localShare`) — 이웃한 두 무리
 *   가운데의 차다. 괄호의 폭을 정하는 바로 그 수라 실으면 **글자와 그림이 갈린다**.
 * - **원래 사이의 몫**(`measure-gap.originShare`) — 선언의 2차원 좌표에서 무리
 *   가운데를 평균 내 잰 거리다. 펴는 셈이 아니라 **바탕에서 곧바로 나오는 값**이라
 *   장면이 센다 (잣대 표 가운데 줄).
 * - **어느 두 무리 사이인가**(`from`·`to`) — 사이는 올 때마다 하나씩 쌓이므로
 *   `gapsShown` 이 그 번호이고 짝은 선언의 무리 차례가 말한다.
 * - **비**(`ratio`) — 마지막 사이를 첫 사이로 나눈 것이다.
 *
 * 남긴 것은 **하나**다. `rulers` 가 싣는 **두 자의 자리**(`plan`) — 첫 주성분에
 * 내려 찍는 것과 무리 안 차례만 지켜 고르게 늘어놓는 것, 곧 **이 조각의 알고리즘
 * 그 자체**다. 내주면 장면이 이 조각이 피하려는 셈을 하게 된다 (4 절 B 갈래의 경계).
 *
 * ── 이 조각의 주장은 *견줌*이라 세 답이 함께 서야 한다
 *
 * 원래 자료는 "뒤 사이가 앞 사이의 세 배" 라고 답하고, 큰 거리를 지키는 자는 그
 * 답을 그대로 옮기고, 이웃만 지키는 자는 "둘이 같다" 고 답한다. 옛 화면은 앞 두
 * 답을 **캡션에만** 말했다 — 괄호에 적히는 백분율은 그 자의 몫뿐이고 원래 몫은
 * 다음 걸음의 캡션에 덮였다. 완주 화면에는 "두 자가 서로 다르다" 만 남고 **어느
 * 쪽이 옳은가**가 없었다.
 *
 * 지금은 괄호의 글자가 `원래 → 이 자` 두 몫을 나란히 이고 끝까지 남는다. 위 자는
 * 두 수가 같고 아래 자는 벌어지므로, 캡션을 읽지 않아도 주장이 선다 (함정 7).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 자 위의 **값**과 앵커로 잰 **몫**만 담고 픽셀은 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 자취가
 * 무엇을 말할지를 정하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 자 둘. 위는 큰 거리를 지키는 쪽, 아래는 이웃만 지키는 쪽. */
export type GlobalAndLocalRow = 'global' | 'local';

/** 두 자를 언제나 같은 차례로 돈다 — 순회 순서가 숨은 상태가 되지 않게 한다. */
export const GLOBAL_AND_LOCAL_ROWS: readonly GlobalAndLocalRow[] = ['global', 'local'];

/** 선언에 적힌 자리 하나. 펴기 전의 2차원 좌표다. */
export type SceneBasePoint = { id: string; x: number; y: number };

/** 선언에 적힌 무리 하나. 차례가 곧 색의 차례다. */
export type SceneGroup = { name: string; points: readonly SceneBasePoint[] };

/** 한 자 위에 놓인 자리. 값이지 픽셀이 아니다. */
export type SpreadPoint = { id: string; group: string; value: number };

/** 한 자 위의 무리 가운데. */
export type SpreadCentroid = { group: string; value: number };

/** 한 자의 자리 전부. */
export type Flattening = {
  points: readonly SpreadPoint[];
  centroids: readonly SpreadCentroid[];
};

/**
 * 두 자의 자리. **이 조각의 알고리즘이 내놓는 것**이라 걸음이 싣는다.
 *
 * 첫 주성분에 내려 찍는 것도, 무리 안 차례를 제 무리의 주축에서 얻어 고르게
 * 늘어놓는 것도 여기 들어 있다. 장면이 다시 풀면 조각이 피하려는 셈을 장면이 한다.
 */
export type SpreadPlan = { global: Flattening; local: Flattening };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 점이 어디서 미끄러져 오는지도, 괄호가 어디서
 * 자라는지도 전부 자취에서 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type GlobalAndLocalStep =
  /** 두 자의 앵커가 위아래로 내려온다. */
  | { kind: 'rule' }
  /** 자 하나가 펴진다. 어느 자인지는 `spreadRows` 의 끝이 말한다. */
  | { kind: 'spread' }
  /** 같은 자리끼리 실로 잇는다. */
  | { kind: 'tie' }
  /** 무리 하나가 차지하는 몫을 띠로 덮는다. */
  | { kind: 'inside' }
  /** 이웃한 두 무리 사이를 괄호로 잰다. 몇 번째인지는 `gapsShown` 이 말한다. */
  | { kind: 'gap' }
  /** 뒤 사이를 앞 사이로 나눈 비를 자마다 적는다. */
  | { kind: 'ratio' }
  /** 아래 자에서 무리 사이를 읽으면 안 된다는 판정. */
  | { kind: 'verdict' }
  /** 닫는 말. */
  | { kind: 'close' };

export type GlobalAndLocalScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 선언의 무리들. 이름의 차례가 색판의 차례이고, 좌표가 원래 사이의 출처다. */
  groups: readonly SceneGroup[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 두 자의 자리. 아직 안 왔으면 null 이라 자만 비어 있다. */
  plan: SpreadPlan | null;
  /** 펴진 자, 펴진 차례대로. */
  spreadRows: readonly GlobalAndLocalRow[];
  /** 같은 자리끼리 이었나. */
  tied: boolean;
  /** 무리 안의 몫을 띠로 덮었나. */
  inside: boolean;
  /** 몇 쌍의 사이를 재었나. 짝은 무리의 차례가 말한다. */
  gapsShown: number;
  /** 비를 적었나. */
  ratioShown: boolean;
  /** 판정을 내렸나. */
  verdict: boolean;
  /** 닫는 말을 했나. */
  closed: boolean;

  step: GlobalAndLocalStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `plan` 부터 `closed` 까지는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 펴진 자리를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는
 * 것이 겹친다 (S-scene, 함정 14).
 */
type Base = Pick<GlobalAndLocalScene, 'groups'>;

/**
 * 되돌린 뒤의 장면 — 자 둘과 그 이름 말고는 아무것도 서 있지 않다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): GlobalAndLocalScene {
  return {
    groups: base.groups,
    plan: null,
    spreadRows: [],
    tied: false,
    inside: false,
    gapsShown: 0,
    ratioShown: false,
    verdict: false,
    closed: false,
    step: null,
  };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBaseGroups(raw: unknown): SceneGroup[] {
  const groups: SceneGroup[] = [];
  if (!Array.isArray(raw)) return groups;
  for (const entry of raw) {
    const rec = fields(entry);
    if (rec === null) continue;
    const name = text(rec['name']);
    if (name === '') continue;
    const points: SceneBasePoint[] = [];
    const rawPoints = rec['points'];
    if (Array.isArray(rawPoints)) {
      for (const item of rawPoints) {
        const p = fields(item);
        if (p === null) continue;
        const id = text(p['id']);
        const x = num(p['x']);
        const y = num(p['y']);
        if (id === '' || x === null || y === null) continue;
        // 값을 베껴 담는다 — 러너가 mechanism 과 함께 주는 객체를 쥐지 않는다.
        points.push({ id, x, y });
      }
    }
    groups.push({ name, points });
  }
  return groups;
}

function readFlattening(raw: unknown): Flattening | null {
  const rec = fields(raw);
  if (rec === null) return null;
  const points: SpreadPoint[] = [];
  if (Array.isArray(rec['points'])) {
    for (const item of rec['points']) {
      const p = fields(item);
      if (p === null) continue;
      const id = text(p['id']);
      const group = text(p['group']);
      const value = num(p['value']);
      if (id === '' || group === '' || value === null) continue;
      points.push({ id, group, value });
    }
  }
  const centroids: SpreadCentroid[] = [];
  if (Array.isArray(rec['centroids'])) {
    for (const item of rec['centroids']) {
      const p = fields(item);
      if (p === null) continue;
      const group = text(p['group']);
      const value = num(p['value']);
      if (group === '' || value === null) continue;
      centroids.push({ group, value });
    }
  }
  if (points.length === 0 || centroids.length < 2) return null;
  return { points, centroids };
}

function readPlan(payload: unknown): SpreadPlan | null {
  const rec = fields(payload);
  if (rec === null) return null;
  const global = readFlattening(rec['global']);
  const local = readFlattening(rec['local']);
  return global !== null && local !== null ? { global, local } : null;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 괄호의 폭도 곁의 백분율도 자마다의 비도
// 캡션의 수도 같은 함수를 부르므로 갈릴 자리가 없다.

/** 그 자의 자리들. 아직 안 왔으면 null. */
export function flatteningOf(
  scene: GlobalAndLocalScene,
  row: GlobalAndLocalRow,
): Flattening | null {
  return scene.plan === null ? null : scene.plan[row];
}

/** 그 자의 값 범위와 앵커 — 첫 무리와 마지막 무리의 가운데. */
export function extentOf(
  scene: GlobalAndLocalScene,
  row: GlobalAndLocalRow,
): { lo: number; hi: number; anchorLo: number; anchorHi: number } | null {
  const flat = flatteningOf(scene, row);
  if (flat === null) return null;
  const values = flat.points.map((p) => p.value);
  const first = flat.centroids[0];
  const last = flat.centroids[flat.centroids.length - 1];
  if (first === undefined || last === undefined) return null;
  return {
    lo: Math.min(...values),
    hi: Math.max(...values),
    anchorLo: first.value,
    anchorHi: last.value,
  };
}

/**
 * 앵커 사이를 1 로 놓았을 때의 눈금 범위.
 *
 * 두 자의 자리가 다 들어가도록 넓힌다. 앵커 0·1 은 늘 들어간다. **두 자를 함께
 * 보므로 어느 자가 펴졌느냐와 무관하게 같은 값이 나온다** — 척도가 걸음마다
 * 흔들리지 않는 까닭이다.
 */
export function unitRangeOf(scene: GlobalAndLocalScene): { lo: number; hi: number } {
  let lo = 0;
  let hi = 1;
  for (const row of GLOBAL_AND_LOCAL_ROWS) {
    const ext = extentOf(scene, row);
    if (ext === null) continue;
    const range = ext.anchorHi - ext.anchorLo || 1;
    lo = Math.min(lo, (ext.lo - ext.anchorLo) / range);
    hi = Math.max(hi, (ext.hi - ext.anchorLo) / range);
  }
  return { lo, hi };
}

/** 그 자 위의 값을 앵커 사이를 1 로 본 몫으로 옮긴다. */
export function unitOf(
  scene: GlobalAndLocalScene,
  row: GlobalAndLocalRow,
  value: number,
): number {
  const ext = extentOf(scene, row);
  if (ext === null) return 0.5;
  const range = ext.anchorHi - ext.anchorLo || 1;
  return (value - ext.anchorLo) / range;
}

/** 그 자에서 그 무리의 가운데가 앉은 몫. */
export function centroidUnitOf(
  scene: GlobalAndLocalScene,
  row: GlobalAndLocalRow,
  group: string,
): number | null {
  const flat = flatteningOf(scene, row);
  const found = flat?.centroids.find((c) => c.group === group);
  return found === undefined ? null : unitOf(scene, row, found.value);
}

/** 그 자에서 그 무리의 자리들이 차지한 몫의 양 끝. */
export function groupUnitSpanOf(
  scene: GlobalAndLocalScene,
  row: GlobalAndLocalRow,
  group: string,
): { min: number; max: number } | null {
  const flat = flatteningOf(scene, row);
  if (flat === null) return null;
  const units = flat.points.filter((p) => p.group === group).map((p) => unitOf(scene, row, p.value));
  if (units.length === 0) return null;
  return { min: Math.min(...units), max: Math.max(...units) };
}

/**
 * 무리마다 두 자에서 앉은 몫과 그 차.
 *
 * 양 끝 무리는 앵커라 언제나 0 과 1 이고, 남는 이야기는 가운데 무리다.
 */
export function shiftsOf(
  scene: GlobalAndLocalScene,
): { group: string; global: number; local: number; shift: number }[] {
  const out: { group: string; global: number; local: number; shift: number }[] = [];
  for (const g of scene.groups) {
    const uG = centroidUnitOf(scene, 'global', g.name);
    const uL = centroidUnitOf(scene, 'local', g.name);
    if (uG === null || uL === null) continue;
    out.push({ group: g.name, global: uG, local: uL, shift: uL - uG });
  }
  return out;
}

/** 가장 크게 밀린 무리. 실을 굵게 긋는 표식이 여기서 나온다. */
export function loudestGroupOf(scene: GlobalAndLocalScene): string {
  let group = '';
  let amount = -1;
  for (const entry of shiftsOf(scene)) {
    if (Math.abs(entry.shift) > amount) {
      amount = Math.abs(entry.shift);
      group = entry.group;
    }
  }
  return group;
}

/** 가장 크게 밀린 폭. 캡션이 말하는 수다. */
export function loudestShiftOf(scene: GlobalAndLocalScene): number {
  let amount = 0;
  for (const entry of shiftsOf(scene)) amount = Math.max(amount, Math.abs(entry.shift));
  return amount;
}

/** 무리 하나가 차지하는 몫의 평균. 자마다 하나씩. */
export function insideSharesOf(scene: GlobalAndLocalScene): { global: number; local: number } {
  const meanSpan = (row: GlobalAndLocalRow): number => {
    const spans: number[] = [];
    for (const g of scene.groups) {
      const span = groupUnitSpanOf(scene, row, g.name);
      if (span !== null) spans.push(span.max - span.min);
    }
    if (spans.length === 0) return 0;
    return spans.reduce((sum, v) => sum + v, 0) / spans.length;
  };
  return { global: meanSpan('global'), local: meanSpan('local') };
}

/** 선언의 2차원 좌표에서 잰 무리 가운데. 원래 사이의 출처다. */
function originCentres(scene: GlobalAndLocalScene): { x: number; y: number }[] {
  return scene.groups.map((g) => {
    const n = g.points.length;
    if (n === 0) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    for (const p of g.points) {
      x += p.x;
      y += p.y;
    }
    return { x: x / n, y: y / n };
  });
}

/**
 * 이웃한 두 무리 사이 — 원래 자료에서 하나, 자마다 하나.
 *
 * 셋 다 **같은 무리 가운데**에서 나온다. 괄호의 폭을 정하는 수와 곁에 적히는
 * 백분율이 한 자료를 지나므로 갈릴 자리가 없다 (함정 34).
 */
export function gapsOf(scene: GlobalAndLocalScene): {
  from: string;
  to: string;
  originShare: number;
  globalShare: number;
  localShare: number;
}[] {
  const out: {
    from: string;
    to: string;
    originShare: number;
    globalShare: number;
    localShare: number;
  }[] = [];
  if (scene.groups.length < 2) return out;

  const centres = originCentres(scene);
  const head = centres[0];
  const tail = centres[centres.length - 1];
  if (head === undefined || tail === undefined) return out;
  const originSpan = Math.hypot(tail.x - head.x, tail.y - head.y) || 1;

  for (let i = 0; i + 1 < scene.groups.length; i += 1) {
    const from = scene.groups[i];
    const to = scene.groups[i + 1];
    const a = centres[i];
    const b = centres[i + 1];
    if (from === undefined || to === undefined || a === undefined || b === undefined) continue;
    const gFrom = centroidUnitOf(scene, 'global', from.name);
    const gTo = centroidUnitOf(scene, 'global', to.name);
    const lFrom = centroidUnitOf(scene, 'local', from.name);
    const lTo = centroidUnitOf(scene, 'local', to.name);
    out.push({
      from: from.name,
      to: to.name,
      originShare: Math.hypot(b.x - a.x, b.y - a.y) / originSpan,
      globalShare: gFrom === null || gTo === null ? 0 : gTo - gFrom,
      localShare: lFrom === null || lTo === null ? 0 : lTo - lFrom,
    });
  }
  return out;
}

/**
 * 마지막 사이를 첫 사이로 나눈 비.
 *
 * 조각의 결론이 여기서 나온다 — 원래 비와 위 자의 비는 같고 아래 자의 비만
 * 1 에 붙는다. 상수로 적어 두지 않고 괄호를 그리는 바로 그 수에서 셈한다.
 */
export function ratiosOf(
  scene: GlobalAndLocalScene,
): { origin: number; global: number; local: number } | null {
  const gaps = gapsOf(scene);
  const head = gaps[0];
  const tail = gaps[gaps.length - 1];
  if (head === undefined || tail === undefined) return null;
  const div = (a: number, b: number): number => (b === 0 ? 0 : a / b);
  return {
    origin: div(tail.originShare, head.originShare),
    global: div(tail.globalShare, head.globalShare),
    local: div(tail.localShare, head.localShare),
  };
}

/**
 * 가장 작은 무리의 자리 수.
 *
 * "아래에서는 넷이 다 보인다" 는 캡션이 못박고 있던 상수다 (함정 33). 어느
 * 무리에서도 참이 되도록 가장 작은 무리로 센다.
 */
export function smallestGroupSize(scene: GlobalAndLocalScene): number {
  if (scene.groups.length === 0) return 0;
  return Math.min(...scene.groups.map((g) => g.points.length));
}

export const globalAndLocalScene: ScenePlan<GlobalAndLocalScene> = {
  /**
   * 첫 장면은 자 둘만 서 있다. 첫 걸음이 앵커를 내리고 자리를 채운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은
   * 것을 참조로 쥐지 않는다** — 점 배열은 러너가 mechanism 과 view 에 함께 주는
   * 한 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): GlobalAndLocalScene {
    const d = fields(initialData) ?? {};
    return atStart({ groups: readBaseGroups(d['groups']) });
  },

  reduce(scene: GlobalAndLocalScene, event: FacetRuntimeEvent): GlobalAndLocalScene {
    switch (event.type) {
      /*
       * 두 자의 앵커가 내려온다. 자리는 이 조각의 알고리즘이 내놓는 것이라 걸음이
       * 싣고, 값 범위·앵커·척도는 그 자리들에서 장면이 셈한다.
       */
      case 'rulers': {
        const plan = readPlan(event.payload);
        if (plan === null) return scene;
        return { ...scene, plan, step: { kind: 'rule' } };
      }

      /* 위 자가 펴진다. 몇 자리인가도 어디에 앉는가도 이미 `plan` 에 있다. */
      case 'spread-global': {
        if (scene.plan === null || scene.spreadRows.includes('global')) return scene;
        return { ...scene, spreadRows: [...scene.spreadRows, 'global'], step: { kind: 'spread' } };
      }

      /* 아래 자가 펴진다. */
      case 'spread-local': {
        if (scene.plan === null || scene.spreadRows.includes('local')) return scene;
        return { ...scene, spreadRows: [...scene.spreadRows, 'local'], step: { kind: 'spread' } };
      }

      /* 같은 자리끼리 잇는다. 밀린 폭은 두 자의 무리 가운데가 말한다. */
      case 'tie':
        return { ...scene, tied: true, step: { kind: 'tie' } };

      /* 무리 안의 몫을 띠로 덮는다. 몫은 무리 안 자리들의 폭이다. */
      case 'inside':
        return { ...scene, inside: true, step: { kind: 'inside' } };

      /*
       * 이웃한 두 무리 사이를 잰다. 어느 짝인지도 몫이 얼마인지도 싣지 않는다 —
       * 사이는 올 때마다 하나씩 쌓이므로 그 수가 곧 번호이고, 짝은 선언의 무리
       * 차례가 말한다.
       */
      case 'measure-gap': {
        const total = Math.max(0, scene.groups.length - 1);
        if (scene.gapsShown >= total) return scene;
        return { ...scene, gapsShown: scene.gapsShown + 1, step: { kind: 'gap' } };
      }

      /* 비를 적는다. 마지막 사이를 첫 사이로 나눈 값이다. */
      case 'ratio':
        return { ...scene, ratioShown: true, step: { kind: 'ratio' } };

      /* 아래 자에서 무리 사이를 읽으면 안 된다는 판정. */
      case 'verdict':
        return { ...scene, verdict: true, step: { kind: 'verdict' } };

      /* 닫는 말. */
      case 'done':
        return { ...scene, closed: true, step: { kind: 'close' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ groups: scene.groups });

      default:
        // 이 algorithm 이 발신하는 것은 위 열이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
