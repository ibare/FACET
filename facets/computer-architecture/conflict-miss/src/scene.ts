/**
 * ConflictMiss 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **둘이 한 줄을 다투어 서로 밀어냈다.** 그러니 완주 화면이 반드시 쥐고 있어야
 * 하는 것은 "지금 무엇이 앉아 있나" 가 아니라 **누가 누구를 밀어냈는가의 이력**
 * 이다. 옛 화면은 그 이력의 절반만 남겼다 — 밀려난 조각은 기둥 아래에 쌓였지만
 * 판정(MISS)은 걸음마다 지워졌고 `done` 에서 아예 거두어졌다. 그래서 다 끝난
 * 화면은 "여섯 번 물어 여섯 번 다 빗나갔다" 를 캡션 문장으로만 말했다.
 *
 * 여기서는 `accesses` 하나가 그 이력이다. 판정도 밀려난 것도 빈 줄도 전부
 * 이 목록을 훑어 나오므로 (`replayOf`), 화면의 자취와 셈이 같은 자료를 쓴다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 없었고 stage 의 `let` 은 넷 다 배관이었다. 화면이 아는
 * 것은 전부 **⑤ 자리**(타입 선언과 모듈 스코프 선언)에 있었다.
 *
 * - **`const seated: Array<SVGGElement | null>`** — 어느 줄에 무엇이 앉아 있나.
 *   `const` 로 묶였지만 `seated[index] = tile` · `seated.fill(null)` 로 알맹이가
 *   제자리에서 고쳐졌다. DOM 손잡이와 뜻이 한 배열에 묶인 자리다.
 * - **`const chipsByCol = new Map<number, number[]>()`** — **이 조각의 결론**.
 *   어느 기둥에서 무엇이 밀려났나를 밀려난 차례대로 쥐고 있었고 `tags.push` 로
 *   자랐다. 게다가 그 Map 의 **삽입 순서**가 "밀려남" 라벨이 설 가로 자리를
 *   정했다 — 순서 자체가 숨은 상태였다.
 * - **`type Tone = 'incoming' | 'seated' | 'leaving'`** — 타일의 형편. 선언만
 *   있고 값이 어디에도 저장되지 않는다. 형편은 `rect` 의 `fill`·`stroke` 에만
 *   있었고, `tone()` 이 그것을 고치려고 `tile.firstElementChild` 와
 *   `tile.children.item(1)` 로 **DOM 구조를 도로 읽었다** (④).
 * - **`emptyMarks[i]` 의 `opacity` 와 `slots[i]` 의 `stroke-dasharray`** — 그 줄이
 *   차 있나. `seated` 와 **같은 물음에 답이 둘**이었다.
 * - **`badgeLayer` 의 자식** — 이번 판정(HIT/MISS). 걸음마다 지워졌다.
 *
 * ── 수는 한 출처에서만 나온다 — 접근 목록
 *
 * 옛 `access` 발신은 열세 필드를 실었고 그중 `hitCount` · `missCount` 는
 * **projector 가 읽지도 않았다.** `done` 은 여섯을 실었는데 셋이 버려졌다.
 * 받는 쪽이 안 읽는 payload 는 "조각이 말해야 하는데 말하지 않는 자리" 의
 * 증거다 — 실제로 판정의 이력이 화면에 없었다.
 *
 * 지금 싣는 것은 셋뿐이다 — `lineNo` · `index` · `tag`. 셋 다 주소 하나를 푸는
 * **algorithm 의 판정**이고, 그것을 함수로 내주면 장면이 조각의 알고리즘을
 * 통째로 되풀이하는 꼴이 되어 발신이 장식이 된다 (프로토콜 4 절의 경계 —
 * `bottom-up-table` 의 점화식이 그 자리였다).
 *
 * 나머지는 전부 여기서 나온다.
 *
 * - `address` · `order` — `addresses` 가 쥐고 있고 차례는 `accesses.length` 다.
 * - `hit` · `evictedAddress` · `evictedTag` — 접근 목록을 훑으면 그 줄에 무엇이
 *   앉아 있었는지가 나온다 (`replayOf`). 직접 사상이라 고를 여지가 없어 밀어내기에
 *   정책이랄 것이 없다.
 * - `emptyIndices` · `emptyLines` · `hitCount` · `missCount` · `evictionCount` —
 *   같은 훑기의 결과다. 캡션의 수와 화면의 기둥이 한 출처에서 나온다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 줄 번호와 태그라는 **구조**만 담고 기둥 너비도 조각의
 * 크기도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 갈래만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다. 캡션이 제 수를 따로 들고 있으면 화면의 기둥과 갈릴
 * 자리가 생기므로 인자조차 담지 않았다 — 줄 번호도 밀려난 주소도 `replayOf` 가
 * 낸다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 접근 하나. **algorithm 이 주소 하나를 푼 결과**다.
 *
 * 몇 번째인지도, 맞았는지도, 무엇을 밀어냈는지도 담지 않는다 — 전부 목록에서
 * 나온다. 담으면 화면의 자취와 갈릴 자리가 생긴다.
 */
export type CacheAccess = {
  /** 찾은 주소. 선언의 `addresses` 에서 온다. */
  address: number;
  /** 주소가 속한 메모리 줄 번호 (`address ÷ lineSize`). */
  lineNo: number;
  /** 그 주소가 앉을 수 있는 **유일한** 줄 (`lineNo mod lineCount`). */
  index: number;
  /** 그 줄에 앉은 것이 누구인지 가리는 값 (`lineNo ÷ lineCount`). */
  tag: number;
};

/** 줄 하나에 앉아 있는 것. */
export type LineResident = {
  tag: number;
  address: number;
  /** 몇 번째 접근이 이것을 앉혔나 (0부터). */
  at: number;
};

/**
 * 접근 하나의 판정. **접근 목록을 훑어 나온다** (`replayOf`).
 *
 * 화면의 자취(앉은 타일 · 밀려난 조각 · 자취 띠)와 캡션의 수가 전부 이 하나에서
 * 나오므로 둘이 갈릴 자리가 없다.
 */
export type AccessVerdict = {
  /** 몇 번째 접근인가 (0부터). */
  at: number;
  address: number;
  lineNo: number;
  index: number;
  tag: number;
  /** 같은 태그가 이미 그 줄에 앉아 있었나. */
  hit: boolean;
  /** 이 접근이 밀어낸 것. 빈 줄이었거나 맞았으면 null. */
  evicted: LineResident | null;
};

/** 접근 목록을 훑은 결과 — 걸음마다의 판정과 그 끝의 줄 형편. */
export type CacheReplay = {
  verdicts: readonly AccessVerdict[];
  /** 훑기가 끝난 시점에 각 줄에 앉아 있는 것. 비어 있으면 null. */
  lines: readonly (LineResident | null)[];
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 대상을 싣지 않는다 — 움직이는 것은 늘 마지막 접근이고, 그 접근이 어느 기둥으로
 * 가는지도 무엇을 밀어내는지도 `accesses` 가 이미 말한다.
 */
export type ConflictMissStep =
  /** 주소 하나가 제 기둥으로 미끄러져 내려앉는다. */
  | { kind: 'access' }
  /** 다 찾았다. 자취 띠를 훑어 셈을 낸다. */
  | { kind: 'tally' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다.
 *
 * 인자도 담지 않는다 — 줄 번호와 밀려난 주소는 `replayOf` 가 내므로, 담으면
 * 같은 수가 두 자리에서 나온다.
 */
export type ConflictMissCaption =
  /** 빈 줄에 앉았거나 이미 제가 앉아 있었다 — 갈 곳이 하나뿐임을 말한다. */
  | { kind: 'fill' }
  /** 살던 것을 밀어냈다. */
  | { kind: 'evict' }
  /** 다 찾고 난 셈. */
  | { kind: 'done' };

export type ConflictMissScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 캐시의 줄 수. 직접 사상이라 줄 하나에 한 자리다. */
  lineCount: number;
  /** 한 줄이 담는 바이트 수. 주소를 줄 번호로 접는 제수다. */
  lineSize: number;
  /** 차례로 찾는 주소. 자취 띠의 칸 수도 이 길이가 정한다. */
  addresses: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 밟은 접근들, 찾은 차례대로.
   *
   * **남는 자취**다 — 앉은 타일도, 기둥 아래 밀려난 조각도, 판정의 띠도, 빈 줄의
   * 셈도 전부 여기서 파생되므로 정적 그리기에 그대로 들어간다 (S-scene).
   */
  accesses: readonly CacheAccess[];

  step: ConflictMissStep | null;
  caption: ConflictMissCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `accesses` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 앉은
 * 타일과 밀려난 조각을 단 채로 서고 그 위에 algorithm 이 새로 밟는 것이 겹친다
 * (S-scene).
 */
type ConflictMissBase = Pick<ConflictMissScene, 'lineCount' | 'lineSize' | 'addresses'>;

/**
 * 아무것도 찾지 않은 처음 화면. 빈 기둥만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: ConflictMissBase): ConflictMissScene {
  return {
    lineCount: base.lineCount,
    lineSize: base.lineSize,
    addresses: base.addresses,
    accesses: [],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
}

/** 1 이상의 정수로 좁힌다. 줄 수와 라인 크기는 나눗셈의 제수라 0 이면 안 된다. */
function positive(v: unknown, fallback: number): number {
  const n = num(v);
  return n !== null && n >= 1 ? Math.floor(n) : fallback;
}

/**
 * 접근 목록을 처음부터 `upto` 개까지 훑어 걸음마다의 판정과 줄 형편을 낸다.
 *
 * **이 함수 하나가 판정도 밀려난 것도 빈 줄도 셈도 전부 낸다.** 직접 사상이라
 * 줄이 정해지면 고를 여지가 없으므로, 앉히기는 덮어쓰기 하나뿐이고 밀어내기에
 * 정책이랄 것이 없다 — 그래서 되풀이되는 알고리즘이 아니라 **화면의 자취를 읽는
 * 일**이다.
 *
 * @param upto 훑을 접근 수. 생략하면 전부. 운동의 출발 그림(한 걸음 전)이
 *   필요할 때 `accesses.length - 1` 을 넘긴다 — `prev` 를 출발값으로 꺼내는 대신
 *   장면이 스스로 말하게 하는 자리다 (S-scene).
 */
export function replayOf(scene: ConflictMissScene, upto?: number): CacheReplay {
  const count = Math.max(0, Math.min(scene.accesses.length, upto ?? scene.accesses.length));
  const lines: (LineResident | null)[] = new Array<LineResident | null>(scene.lineCount).fill(
    null,
  );
  const verdicts: AccessVerdict[] = [];

  for (let at = 0; at < count; at += 1) {
    const access = scene.accesses[at];
    if (access === undefined) continue;
    const index = Math.max(0, Math.min(scene.lineCount - 1, access.index));
    const resident = lines[index] ?? null;
    const hit = resident !== null && resident.tag === access.tag;
    verdicts.push({
      at,
      address: access.address,
      lineNo: access.lineNo,
      index,
      tag: access.tag,
      hit,
      evicted: hit ? null : resident,
    });
    lines[index] = { tag: access.tag, address: access.address, at };
  }

  return { verdicts, lines };
}

/** 빈 채로 남은 줄의 번호. 조각의 주장이 걸린 수다. */
export function emptyIndicesOf(replay: CacheReplay): number[] {
  const out: number[] = [];
  for (let i = 0; i < replay.lines.length; i += 1) {
    if ((replay.lines[i] ?? null) === null) out.push(i);
  }
  return out;
}

/** 맞은 횟수. 캡션의 수와 자취 띠의 칠이 같은 훑기에서 나온다. */
export function hitCountOf(replay: CacheReplay): number {
  let n = 0;
  for (const v of replay.verdicts) if (v.hit) n += 1;
  return n;
}

/**
 * 어느 줄에서 무엇이 밀려났나 — 밀려난 차례대로.
 *
 * 기둥 아래에 쌓이는 조각이 이것이다. 옛 stage 는 이것을 Map 에 `push` 로 쌓아
 * 두었고, 그 Map 의 삽입 순서가 라벨의 자리까지 정하고 있었다.
 */
export function evictedByLineOf(replay: CacheReplay): Map<number, LineResident[]> {
  const out = new Map<number, LineResident[]>();
  for (const v of replay.verdicts) {
    if (v.evicted === null) continue;
    const list = out.get(v.index);
    if (list === undefined) out.set(v.index, [v.evicted]);
    else list.push(v.evicted);
  }
  return out;
}

/** 물음이 온 적 있는 줄. 이 조각에서는 끝까지 하나뿐이고, 그것이 주장이다. */
export function askedLinesOf(replay: CacheReplay): Set<number> {
  const out = new Set<number>();
  for (const v of replay.verdicts) out.add(v.index);
  return out;
}

export const conflictMissScene: ScenePlan<ConflictMissScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene). `nums` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): ConflictMissScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      lineCount: positive(d.lineCount, 4),
      lineSize: positive(d.lineSize, 16),
      addresses: nums(d.addresses),
    });
  },

  reduce(scene: ConflictMissScene, event: FacetRuntimeEvent): ConflictMissScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 주소 하나를 찾는다. 싣고 오는 것은 주소를 푼 결과 셋뿐이다.
       *
       * 주소도 차례도 받지 않는다 — 접근은 올 때마다 하나씩 쌓이므로 지금
       * `accesses.length` 가 곧 그 차례이고, 주소는 선언의 `addresses` 가 쥔다.
       * 선언과 발신의 길이가 어긋나면 그릴 근거가 없으므로 장면을 그대로 둔다.
       *
       * 캡션의 갈래는 여기서 정한다 — **앞 장면의 줄 형편**을 보고 빈 줄에
       * 앉았는지 살던 것을 밀어냈는지 가린다. 판정을 그리는 쪽에 미루면 같은
       * 물음에 답이 둘이 된다.
       */
      case 'access': {
        const lineNo = num(p.lineNo);
        const index = num(p.index);
        const tag = num(p.tag);
        if (lineNo === null || index === null || tag === null) return scene;

        const at = scene.accesses.length;
        const address = scene.addresses[at];
        if (address === undefined) return scene;

        const before = replayOf(scene).lines;
        const seat = Math.max(0, Math.min(scene.lineCount - 1, index));
        const resident = before[seat] ?? null;
        const pushesOut = resident !== null && resident.tag !== tag;

        return {
          ...scene,
          accesses: [...scene.accesses, { address, lineNo, index, tag }],
          step: { kind: 'access' },
          caption: pushesOut ? { kind: 'evict' } : { kind: 'fill' },
        };
      }

      /*
       * 다 찾았다. 셈은 하나도 받지 않는다 — 찾은 횟수도 맞은 횟수도 밀려난
       * 수도 빈 줄도 전부 `accesses` 를 훑으면 나온다 (`replayOf`).
       *
       * 구조는 바뀌지 않는다. 이 걸음이 하는 일은 쌓인 판정을 훑어 보이는 것뿐이다.
       */
      case 'done':
        return { ...scene, step: { kind: 'tally' }, caption: { kind: 'done' } };

      /*
       * 처음으로 되감는다. 바탕만 남기고 자취를 턴다 — 변수가 아니라 객체
       * 리터럴을 넘긴다 (S-scene).
       *
       * 캡션도 함께 비운다. 흐를 것은 없다.
       */
      case 'rewind':
        return atStart({
          lineCount: scene.lineCount,
          lineSize: scene.lineSize,
          addresses: scene.addresses,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 셋이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
