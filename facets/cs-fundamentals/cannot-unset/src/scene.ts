/**
 * CannotUnset 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **네 자리**에 흩어져 있었고, 그중 셋은 `let` grep 에 안 걸린다.
 *
 * - `let rows: Row[]` — 서 있는 삼각대 전부. 여기까지는 눈에 띈다.
 * - `const cellOn = [...scene.bits]` — **지금 비트열.** `const` 인데 `cellOn[s] = 0`
 *   으로 제자리에서 고쳐진다. 화면의 0/1 도 collapse 의 "이 발이 빠지나" 판정도
 *   전부 이 배열 하나에서 나왔다.
 * - `type Row = Plan & { apexY, footY, badgeDy, legsG, seatG, … }` — **DOM 손잡이와
 *   뜻·수치가 한 객체에 묶인 것.** 누가 주저앉았고 누가 가라앉았나가 `apexY` 라는
 *   수 하나로만 적혀 있었다. `baseApexY + SAG` 면 발밑을 잃은 것이고 `CELL_TOP + 32`
 *   면 지워진 것인데, 그 뜻을 말하는 자리가 코드 어디에도 없었다.
 * - `setBadge(row, kind: 'found' | 'missing')` — **선언만 있고 저장되는 곳이 없는
 *   타입.** 배지가 무엇이라 답했나는 `badgeText.textContent` 와 `badgeBox` 의 stroke
 *   색에만 있었고, 아예 물어본 적이 있나는 `badgeG` 의 `opacity` 에 있었다.
 * - `const probing` / `const marked` — Set 두 개. 짚어 보는 중인 칸과 표식 단 칸.
 *
 * 여기서는 그 넷이 **`phase` 하나**다. 이 조각의 논증은 한 줄기로만 흐르므로
 * (선다 → 묻는다 → 고른다 → 끈다 → 무너진다 → 다시 묻는다 → 결론) 지금 어디까지
 * 왔나가 곧 방금 밟은 걸음이고, 나머지는 전부 바탕에서 셈해 낸다.
 *
 * ── 되돌림이 지우던 것이 주장이었다
 *
 * 옛 stage 의 `select` 는 지울 값이 켜 둔 칸에 표식을 달았는데 `clear` 가
 * `marked.delete(s)` 로 그것을 거뒀다. 그래서 **다 끝난 화면에는 어느 칸이 이번에
 * 꺼진 것이고 어느 칸이 처음부터 0 이었는지 구별이 없었다** — 되짚기 이전에 이미
 * 주장의 절반이 화면에서 사라지고 있었다.
 *
 * 여기서는 갈라 둔다. **채움은 값의 형편**(1 인가 0 인가), **테두리는 표식**(이 칸을
 * 내가 껐다). 둘이 다른 것을 말하므로 부딪히지 않고, 꺼진 칸의 표식은 `phase` 가
 * `picked` 를 지난 뒤로 끝까지 남는다. 그 칸 밑으로 빠져 있는 남의 발이 "그래서
 * 무엇이 함께 무너졌나" 를 마저 말한다.
 *
 * ── 수는 바탕에서만 나온다
 *
 * 걸음은 수를 하나도 실어 오지 않는다. 각 값이 밟는 자리는 `h_i = (h1 + i·h2) mod m`
 * 이고 `initialData` 가 `h1` · `h2` · `m` · `k` 를 전부 주므로 장면이 직접 센다.
 * 꺼질 자리 · 끄고 난 비트열 · 함께 밟던 칸 · 발밑을 잃은 값 · 없다고 답할 값도
 * 모두 거기서 파생한다 — **베끼는 것이 아니라 세는 것**이라 화면과 캡션이 갈릴
 * 자리가 없다.
 *
 * 좌표는 담지 않는다. 칸 번호와 밟는 자리라는 **구조**만 담고, 칸 폭도 좌판의 층도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지는 `phase` 가 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 값 하나와 그것이 밟고 선 자리들. 자리는 `initial` 이 이중 해싱으로 센다. */
export type WordStand = { word: string; slots: readonly number[] };

/**
 * 논증이 어디까지 왔나.
 *
 * 한 줄기로만 흐르므로 이것 하나가 **지금 화면**과 **방금 밟은 걸음**을 겸한다.
 * 그리는 쪽은 여기서 자세도 칠도 배지도 캡션도 전부 파생시킨다.
 */
const PHASES = [
  /** 아직 아무것도 서지 않았다. 바닥만 깔려 있다. */
  'idle',
  /** 세 값이 저마다 세 칸을 밟고 섰다. */
  'stood',
  /** 물었더니 모두 있다고 답했다. */
  'asked',
  /** 지울 값을 집어 들었고 그 자리에 표식이 붙었다. */
  'picked',
  /** 그 칸을 껐다. */
  'cleared',
  /** 발밑을 잃은 값이 주저앉고 지워진 값은 가라앉았다. */
  'collapsed',
  /** 다시 물었더니 아무도 지우지 않은 값이 없다고 답했다. */
  'reasked',
  /** 할 말을 마치고 결론만 말한다. */
  'settled',
] as const;

export type CannotUnsetPhase = (typeof PHASES)[number];

export type CannotUnsetScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 비트 배열의 길이. 바닥의 칸 수다. */
  m: number;
  /** **처음** 비트열. 걸음이 끈 자리는 여기 반영되지 않는다 — `bitsAt` 가 셈한다. */
  bits0: readonly number[];
  /** 값들과 저마다 밟는 자리. 순서가 곧 색판의 차례다. */
  words: readonly WordStand[];
  /** 지우려 드는 값의 이름. */
  erase: string;

  // ── 자취. 걸음이 밀고 `rewind` 가 되돌린다.
  phase: CannotUnsetPhase;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `phase` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 무너진
 * 채로 서고 그 위에 algorithm 이 새로 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<CannotUnsetScene, 'm' | 'bits0' | 'words' | 'erase'>;

/**
 * 되돌린 뒤의 장면 — 바닥만 깔려 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 `phase` 가 실린 장면도 그대로 통과한다
 * (S-scene).
 */
function atStart(base: Base): CannotUnsetScene {
  return { m: base.m, bits0: base.bits0, words: base.words, erase: base.erase, phase: 'idle' };
}

// ── phase 를 재는 자 ────────────────────────────────────────────────────────

export function phaseIndex(phase: CannotUnsetPhase): number {
  return PHASES.indexOf(phase);
}

/** 논증이 그 단계를 지났나. */
export function atLeast(scene: CannotUnsetScene, phase: CannotUnsetPhase): boolean {
  return phaseIndex(scene.phase) >= phaseIndex(phase);
}

/**
 * 한 단계 앞의 장면.
 *
 * 흐르는 그림의 **출발 자리**를 여기서 셈으로 복원한다. `prev` 를 들춰 꺼내면
 * "`prev` 는 무엇을 흐르게 할지 고르는 데만" 을 어긴다 (S-scene).
 */
export function before(scene: CannotUnsetScene): CannotUnsetScene {
  const i = phaseIndex(scene.phase);
  return { ...scene, phase: PHASES[Math.max(0, i - 1)] ?? 'idle' };
}

// ── 바탕에서 파생하는 것들 ──────────────────────────────────────────────────

/** 이중 해싱 — `h_i = (h1 + i·h2) mod m`. 같은 자리가 두 번 나와도 그대로 둔다. */
export function slotsFor(h1: number, h2: number, m: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i += 1) out.push(((h1 + i * h2) % m + m) % m);
  return out;
}

/** 모든 자리가 켜져 있어야 "있다" 다. 한 자리라도 0 이면 없다고 답한다. */
function present(slots: readonly number[], bits: readonly number[]): boolean {
  return slots.every((s) => bits[s] === 1);
}

function standOf(scene: CannotUnsetScene, word: string): WordStand | undefined {
  return scene.words.find((w) => w.word === word);
}

/** 지울 값 말고 나머지. */
export function otherWords(scene: CannotUnsetScene): WordStand[] {
  return scene.words.filter((w) => w.word !== scene.erase);
}

/**
 * 끄게 될 자리 — 지울 값이 켜 둔 칸들.
 *
 * 같은 칸을 두 번 셈했으면 한 번만 센다. **화면의 표식도 캡션의 `{slots}` 도 이
 * 한 함수를 지난다** — 자르는 잣대가 두 군데면 갈린다.
 */
export function clearedSlots(scene: CannotUnsetScene): number[] {
  return [...new Set(standOf(scene, scene.erase)?.slots ?? [])];
}

/** 지금 비트열. `cleared` 를 지났으면 끈 뒤의 것이다. */
export function bitsAt(scene: CannotUnsetScene): number[] {
  const bits = [...scene.bits0];
  if (!atLeast(scene, 'cleared')) return bits;
  for (const s of clearedSlots(scene)) if (s >= 0 && s < bits.length) bits[s] = 0;
  return bits;
}

/** 끈 자리 중 남이 함께 밟고 있던 것. 이 조각의 주장이 바로 여기 있다. */
export function sharedSlots(scene: CannotUnsetScene): number[] {
  const others = otherWords(scene);
  return clearedSlots(scene).filter((s) => others.some((w) => w.slots.includes(s)));
}

/** 발판을 하나라도 잃은 값. */
export function brokenWords(scene: CannotUnsetScene): string[] {
  const cleared = clearedSlots(scene);
  return otherWords(scene)
    .filter((w) => w.slots.some((s) => cleared.includes(s)))
    .map((w) => w.word);
}

/** 처음 물었을 때 있다고 답하는 값. 지울 값도 포함한다. */
export function presentWords(scene: CannotUnsetScene): string[] {
  return scene.words.filter((w) => present(w.slots, scene.bits0)).map((w) => w.word);
}

/** 끄고 난 뒤 다시 물었을 때 없다고 답하는 값. 지운 것은 빼고 센다. */
export function absentWords(scene: CannotUnsetScene): string[] {
  const bits = [...scene.bits0];
  for (const s of clearedSlots(scene)) if (s >= 0 && s < bits.length) bits[s] = 0;
  return otherWords(scene)
    .filter((w) => !present(w.slots, bits))
    .map((w) => w.word);
}

/** 배지가 무엇이라 답하고 있나. 아직 묻지 않았거나 배지가 없으면 `null`. */
export function badgeOf(scene: CannotUnsetScene, word: string): 'yes' | 'no' | null {
  if (!atLeast(scene, 'asked')) return null;
  // 지워진 값은 가라앉으며 배지를 함께 데려간다.
  if (word === scene.erase) return atLeast(scene, 'collapsed') ? null : yesOrNull(scene, word);
  if (atLeast(scene, 'reasked') && absentWords(scene).includes(word)) return 'no';
  return yesOrNull(scene, word);
}

function yesOrNull(scene: CannotUnsetScene, word: string): 'yes' | null {
  return presentWords(scene).includes(word) ? 'yes' : null;
}

/** 지워져 바닥 뒤로 가라앉는 값인가. */
export function isGone(scene: CannotUnsetScene, word: string): boolean {
  return atLeast(scene, 'collapsed') && word === scene.erase;
}

/** 발밑을 잃고 주저앉은 값인가. */
export function isFallen(scene: CannotUnsetScene, word: string): boolean {
  return atLeast(scene, 'collapsed') && brokenWords(scene).includes(word);
}

/** 집어 들려 떠 있는 값인가. 끄고 나서도 든 채로 있다가 가라앉는다. */
export function isLifted(scene: CannotUnsetScene, word: string): boolean {
  return word === scene.erase && atLeast(scene, 'picked') && !atLeast(scene, 'collapsed');
}

/**
 * 그 값의 발마다 — 밟을 칸이 사라져 바닥 아래로 빠졌나.
 *
 * 지워진 값은 통째로 빠지고, 남은 값은 **꺼진 칸을 밟던 발만** 빠진다.
 */
export function sunkFeet(scene: CannotUnsetScene, stand: WordStand): boolean[] {
  if (!atLeast(scene, 'collapsed')) return stand.slots.map(() => false);
  if (stand.word === scene.erase) return stand.slots.map(() => true);
  const bits = bitsAt(scene);
  return stand.slots.map((s) => bits[s] !== 1);
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 값 목록을 좁히고 각자가 밟는 자리를 센다.
 *
 * **넘겨받은 객체를 참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
 * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
 * (S-scene).
 */
function readWords(raw: unknown, m: number, k: number): WordStand[] {
  if (!Array.isArray(raw)) return [];
  const out: WordStand[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const word = str(rec.word);
    if (word === '') continue;
    out.push({ word, slots: slotsFor(num(rec.h1, 0), num(rec.h2, 0), m, k) });
  }
  return out;
}

export const cannotUnsetScene: ScenePlan<CannotUnsetScene> = {
  /**
   * 첫 장면은 바닥만 깔고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 비트열도
   * 값 목록도 새 배열로 낸다.
   */
  initial(initialData: unknown): CannotUnsetScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const raw = str(d.bits);
    const m = Math.max(1, Math.trunc(num(d.m, raw.length)));
    const k = Math.max(1, Math.trunc(num(d.k, 1)));
    const bits0: number[] = [];
    for (let i = 0; i < m; i += 1) bits0.push(raw[i] === '1' ? 1 : 0);
    return atStart({ m, bits0, words: readWords(d.words, m, k), erase: str(d.erase) });
  },

  /**
   * 걸음 하나가 논증을 한 단계 민다.
   *
   * payload 는 쳐다보지 않는다 — 걸음이 실어 오는 수가 하나도 없고, 있어도 받지
   * 않는다. 화면에 뜨는 수는 전부 바탕에서 세는 것이라 두 출처가 될 자리가 없다.
   */
  reduce(scene: CannotUnsetScene, event: FacetRuntimeEvent): CannotUnsetScene {
    switch (event.type) {
      case 'stand':
        return { ...scene, phase: 'stood' };
      case 'verify':
        return { ...scene, phase: 'asked' };
      case 'select':
        return { ...scene, phase: 'picked' };
      case 'clear':
        return { ...scene, phase: 'cleared' };
      case 'collapse':
        return { ...scene, phase: 'collapsed' };
      case 'verdict':
        return { ...scene, phase: 'reasked' };
      case 'done':
        return { ...scene, phase: 'settled' };
      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          m: scene.m,
          bits0: scene.bits0,
          words: scene.words,
          erase: scene.erase,
        });
      default:
        // 이 algorithm 이 발신하는 것은 위 여덟이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
