/**
 * WrongInOneDirection 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에는 **다섯 자리**에 흩어져 있었다. `let` 두 개 말고는 grep 에 걸리지 않는다.
 *
 * - `type Gate = { shutter, label, dropper, height }` — **DOM 손잡이와 수치가 한
 *   객체에 묶인 것.** `height` 가 셔터의 세 형편(아직 안 읽음 / 올라감 / 내려와 막음)
 *   이었고, 그 문이 어느 자리를 읽는지는 `label.textContent` 에만 적혀 있었다.
 * - `let token = { group, rect, width, x, y }` — 복도에 들어와 있는 낱말과 그 자리.
 *   같은 모양의 은신처다.
 * - `const landed: SVGElement[]` · `const binFilled = [0, 0]` — **답이 어느 칸에 몇
 *   번째로 앉았나.** `const` 라 `let` grep 을 통과한다. 이 조각의 결론 자체가 여기
 *   있었는데 되감기는 `landed` 를 지우고 `binFilled` 를 0 으로 밀었다.
 * - `let litCells: number[]` — 지금 낱말이 짚어 본 칸들.
 * - `showConclusion` 의 `Number(tag.getAttribute('x'))` — **화면을 도로 읽어 셈했다.**
 *   되짚기가 그 운동을 가운데서 끊으면 `x` 가 옛 화면의 것이라 다음 번 출발이 어긋난다.
 *
 * 여기서는 그 다섯이 `query` · `answers` · `owners` · `concluded` 넷이다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 이 조각의 주장은 **"꺼진 자리를 만나면 답이 틀릴 수 없다"** 이므로, 문이 열렸나
 * 닫혔나와 칸에 적힌 0/1 이 갈리면 그림이 제 안에서 거짓이 된다. 그래서 `probe` 가
 * 실어 오던 것을 전부 버리고 `bits` 하나에서 낸다.
 *
 * - **`bit` 을 받지 않는다** — `bits[slot]` 이 곧 그 자리의 형편이고, 칸의 숫자도
 *   셔터의 오르내림도 그 한 글자에서 나온다.
 * - **`probeIndex` 를 받지 않는다** — 몇 번째 문인가는 지금까지 짚은 자리의 수다.
 * - **`slots` 를 받지 않는다** — algorithm 이 내보내는 `slotsFor` 를 그대로 부른다.
 *   베끼는 것이 아니라 **같은 함수를 지나는 것**이라 둘이 갈릴 수 없다.
 * - **`present` · `truth` · `blockedSlot` 을 받지 않는다** — 답은 짚은 자리들이 정하고
 *   (하나라도 꺼져 있으면 "없다"), 넣은 것이 맞나는 `inserted` 가 안다.
 * - **`owners` 를 받지 않는다** — 누가 켰나는 `inserted` 를 같은 `slotsFor` 로 훑어
 *   낸다. 이름표에 뜨는 낱말과 명부의 알약이 한 목록에서 나온다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 자리 번호와 문의 차례라는 **구조**만 담고, 칸 폭·문의 자리·
 * 칸에 쌓이는 높이는 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 * 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { slotsFor, type WordHash } from './algorithm.js';

/**
 * 문 하나가 읽은 자리와 그 판정. 목록의 차례가 곧 **몇 번째 문**이다.
 *
 * `open` 은 `bits[slot]` 을 옮겨 적은 것이지 따로 받은 수가 아니다 — `reduce` 가
 * 그 자리에서 읽어 굳힌다.
 */
export type WrongProbe = { slot: number; open: boolean };

/**
 * 복도에 들어와 있는 낱말. 문들의 형편이 여기 있다.
 *
 * `answered` 가 참이면 낱말은 이미 제 칸으로 떨어졌고 문들의 형편만 남는다 — 다음
 * 낱말이 들어오기 전까지 셔터와 물든 칸이 그대로 서 있는 것이 옛 화면의 결이었다.
 */
export type WrongQuery = {
  word: string;
  /** 이 낱말이 짚을 자리들. 문마다 하나씩 배정된다. */
  slots: readonly number[];
  /** 지금까지 읽은 문. 마지막이 닫혀 있으면 거기서 멈춘 것이다. */
  probes: readonly WrongProbe[];
  answered: boolean;
};

/**
 * 답이 나 칸에 떨어진 낱말. 차례가 곧 그 칸에 몇 번째로 앉았나다.
 *
 * `present === truth` 면 옳은 답이다 — 그 견줌이 이 조각의 결론이라 정적 그리기가
 * 표식까지 세운다.
 */
export type WrongAnswer = { word: string; present: boolean; truth: boolean };

/** 그 자리를 켠 것이 누구였나. 밝혀진 뒤로는 **남는다**. */
export type WrongAttribution = { slot: number; owner: string };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 그림이 필요한 자리(복도에서 멎어 있던 곳, 칸에
 * 앉는 높이)는 전부 `query` 와 `answers` 에서 셈으로 나온다. 그래서 그리는 쪽이
 * `prev` 를 아예 들추지 않는다 (S-scene).
 */
export type WrongStep =
  /** 자리 하나를 짚었다. 열렸으면 지나고 닫혔으면 부딪혀 멎는다. */
  | { kind: 'probe' }
  /** 답이 제 칸으로 떨어진다. */
  | { kind: 'verdict' }
  /** 그 자리들을 켠 것들이 명부에서 날아와 칸 아래에 붙는다. */
  | { kind: 'attribute' }
  /** 두 칸이 서로 무엇인지 말한다. */
  | { kind: 'conclude' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다.
 *
 * 인자를 싣지 않는다 — 자리 번호는 마지막으로 짚은 자리가, 낱말은 마지막 답이,
 * 켠 것들의 이름은 `owners` 가 쥐고 있다. 캡션에 그것을 따로 실으면 화면의 칸·
 * 이름표와 갈릴 자리가 생긴다.
 */
export type WrongCaption =
  | { kind: 'pass' }
  | { kind: 'block' }
  | { kind: 'verdict' }
  | { kind: 'owners' }
  | { kind: 'conclusion' };

export type WrongInOneDirectionScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 비트 배열의 길이 m. 칸 수이고 이중 해싱의 제수다. */
  slotCount: number;
  /** 해시 수 k. 문의 개수다. */
  hashCount: number;
  /** 이미 채워진 비트열. `'0'`/`'1'` 문자 `slotCount` 개. 칸의 숫자와 문의 여닫힘이 전부 여기서 나온다. */
  bits: string;
  /** 넣은 것. 명부의 알약이고, "넣은 것이 맞나" 와 "누가 켰나" 의 정본이다. */
  inserted: readonly string[];
  /** 낱말별 두 해시. 자리는 `slotsFor` 가 여기서 셈한다. */
  hashes: Readonly<Record<string, WordHash>>;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 복도에 들어와 있거나 방금 답이 난 낱말. 없으면 문들이 아직 아무것도 안 읽었다. */
  query: WrongQuery | null;
  /** 답이 난 것들, 답한 차례대로. 쌓이는 자취라 되짚어도 남는다. */
  answers: readonly WrongAnswer[];
  /**
   * 켠 것이 누구였는지 밝혀진 자리들.
   *
   * **남는 자취다.** 옛 화면은 다음 낱말이 들어올 때 `clearOwners()` 로 이것을
   * 지웠다 — 이 조각의 논증("켠 것은 이 낱말이 아니다")이 한 걸음만 보이고 사라진
   * 것이다. 정적 그리기가 세우게 옮겨 마지막 화면까지 남는다.
   */
  owners: readonly WrongAttribution[];
  /** 두 칸이 서로 무엇인지 말했나. */
  concluded: boolean;

  step: WrongStep | null;
  caption: WrongCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `query` · `answers` · `owners` · `concluded` 는 전부 걸어온 자취라 여기 넣지
 * 않는다 — 넣으면 되감은 화면이 이미 앉은 답과 내려온 셔터를 단 채로 선다
 * (S-scene · 프로토콜 4 절).
 */
type Base = Pick<
  WrongInOneDirectionScene,
  'slotCount' | 'hashCount' | 'bits' | 'inserted' | 'hashes'
>;

/**
 * 아무것도 묻지 않은 처음 화면. 비트 배열과 명부만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): WrongInOneDirectionScene {
  return {
    slotCount: base.slotCount,
    hashCount: base.hashCount,
    bits: base.bits,
    inserted: base.inserted,
    hashes: base.hashes,
    query: null,
    answers: [],
    owners: [],
    concluded: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((s): s is string => typeof s === 'string') : [];
}

/** 선언의 해시 표를 **값으로 복사**한다. 참조를 쥐면 되짚을 때 굴러간 자료를 본다 (S-scene). */
function readHashes(v: unknown): Record<string, WordHash> {
  const out: Record<string, WordHash> = {};
  if (typeof v !== 'object' || v === null) return out;
  for (const [word, raw] of Object.entries(v as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const h1 = num((raw as Record<string, unknown>).h1);
    const h2 = num((raw as Record<string, unknown>).h2);
    if (h1 === null || h2 === null) continue;
    out[word] = { h1, h2 };
  }
  return out;
}

/** 그 자리가 켜져 있나. 칸의 숫자도 셔터의 형편도 이 한 함수를 지난다. */
export function bitOf(scene: Pick<WrongInOneDirectionScene, 'bits'>, slot: number): boolean {
  return scene.bits[slot] === '1';
}

/** 마지막으로 짚은 자리. 캡션의 자리 번호가 여기서 나온다. */
export function lastProbe(query: WrongQuery | null): WrongProbe | null {
  if (query === null) return null;
  return query.probes[query.probes.length - 1] ?? null;
}

/**
 * 자리마다 그 자리를 켠 낱말.
 *
 * 한 자리를 둘이 켤 수 있으므로(자리 2 는 kiwi 와 mango 가 함께 켠다) 넣은 순서가
 * 앞선 것을 답으로 삼는다. 이 조각이 묻는 것은 "누가 켰는가" 가 아니라 "켠 것이
 * 이 낱말이 아니다" 이므로 하나만 대면 족하다.
 *
 * 옛 algorithm 이 payload 로 실어 보내던 셈이다. 여기로 옮기니 이름표에 뜨는 낱말과
 * 명부의 알약이 한 목록에서 나온다.
 */
export function ownersFor(
  scene: WrongInOneDirectionScene,
  slots: readonly number[],
): WrongAttribution[] {
  const lit = new Map<number, string>();
  for (const word of scene.inserted) {
    for (const slot of slotsFor(scene.hashes[word], scene.hashCount, scene.slotCount)) {
      if (!lit.has(slot)) lit.set(slot, word);
    }
  }
  const out: WrongAttribution[] = [];
  for (const slot of slots) {
    const owner = lit.get(slot);
    if (owner !== undefined) out.push({ slot, owner });
  }
  return out;
}

export const wrongInOneDirectionScene: ScenePlan<WrongInOneDirectionScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 표를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께
   * 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): WrongInOneDirectionScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const bits = typeof d.bits === 'string' ? d.bits : '';
    const declared = num(d.slotCount);
    const hashCount = num(d.hashCount);
    return atStart({
      slotCount: Math.max(1, declared !== null && declared > 0 ? Math.trunc(declared) : bits.length),
      hashCount: Math.max(1, hashCount !== null && hashCount > 0 ? Math.trunc(hashCount) : 3),
      bits,
      inserted: strs(d.inserted),
      hashes: readHashes(d.hashes),
    });
  },

  reduce(scene: WrongInOneDirectionScene, event: FacetRuntimeEvent): WrongInOneDirectionScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 자리 하나를 짚는다.
       *
       * 앞 낱말의 답이 이미 났으면 새 낱말이 복도로 들어오는 것이다 — 그때 자리
       * 셋을 `slotsFor` 로 셈해 문마다 배정한다. 이어지는 짚기면 다음 문을 읽는다.
       *
       * 어느 자리를 읽는지도 켜져 있는지도 payload 가 아니라 여기서 낸다.
       */
      case 'probe': {
        const word = typeof p.word === 'string' ? p.word : '';
        if (word === '') return scene;
        const cur = scene.query;
        const fresh = cur === null || cur.answered || cur.word !== word;
        const slots = fresh
          ? slotsFor(scene.hashes[word], scene.hashCount, scene.slotCount)
          : cur.slots;
        const probes = fresh ? [] : cur.probes;
        const slot = slots[probes.length];
        // 배정된 자리를 다 읽은 뒤에 또 오면 짚을 것이 없다. 조용히 흘린다 (C2).
        if (slot === undefined) return scene;
        return {
          ...scene,
          query: {
            word,
            slots,
            probes: [...probes, { slot, open: bitOf(scene, slot) }],
            answered: false,
          },
          step: { kind: 'probe' },
          caption: { kind: bitOf(scene, slot) ? 'pass' : 'block' },
        };
      }

      /*
       * 답을 낸다. **무엇이라 답했는지를 받지 않고 짚은 자리들에서 낸다** —
       * 배정된 자리를 다 읽었고 그 전부가 켜져 있었으면 "있다" 다.
       */
      case 'verdict': {
        const q = scene.query;
        if (q === null || q.answered) return scene;
        const present = q.probes.length === q.slots.length && q.probes.every((x) => x.open);
        return {
          ...scene,
          query: { ...q, answered: true },
          answers: [
            ...scene.answers,
            { word: q.word, present, truth: scene.inserted.includes(q.word) },
          ],
          step: { kind: 'verdict' },
          caption: { kind: 'verdict' },
        };
      }

      /*
       * 그 자리들을 켠 것이 누구였는지 밝힌다. 이미 밝혀진 자리는 그대로 두고
       * 새로 드러난 것만 쌓는다 — 한 자리에 이름표가 겹치지 않게.
       */
      case 'attribute': {
        const q = scene.query;
        if (q === null) return scene;
        const known = new Set(scene.owners.map((o) => o.slot));
        const added = ownersFor(scene, q.slots).filter((o) => !known.has(o.slot));
        return {
          ...scene,
          owners: [...scene.owners, ...added],
          step: { kind: 'attribute' },
          caption: { kind: 'owners' },
        };
      }

      // 할 말을 마치고 두 칸이 서로 무엇인지 말한다. 앉은 답은 그대로 둔다.
      case 'done':
        return {
          ...scene,
          concluded: true,
          step: { kind: 'conclude' },
          caption: { kind: 'conclusion' },
        };

      // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
      case 'rewind':
        return atStart({
          slotCount: scene.slotCount,
          hashCount: scene.hashCount,
          bits: scene.bits,
          inserted: scene.inserted,
          hashes: scene.hashes,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
