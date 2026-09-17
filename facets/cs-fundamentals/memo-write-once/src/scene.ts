/**
 * memoWriteOnce 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 축은 "표에 무엇이 적혀 있나" 다
 *
 * 명령형 stage 에서 그 답은 **DOM 에만** 있었다. 적힌 값은 칸의 `textContent` 에,
 * 칸이 찼는지는 `rect` 의 `fill` 과 `stroke-dasharray` 에, 마디가 받은 값은 또
 * 마디 라벨의 `textContent` 에 있었다. `cells: CellEntry[]` 는 `const` 라 `let`
 * 을 쫓는 눈에 걸리지 않고, 그 안의 값은 `fillCell` · `emptyCell` 이 제자리에서
 * 고쳤다. 되감으면 그것을 복원할 자가 없었다.
 *
 * 여기서는 `memo` 하나가 그것을 말한다. **마디에 뜨는 수도 표에서 읽는다** —
 * 마디는 "답이 나왔나 / 표에서 읽어 왔나" 만 쥐고, 수 자체는 `memo[n]` 이 유일한
 * 출처다. 화면에 나란히 뜨는 두 수가 갈릴 자리가 아예 없어진다.
 *
 * ── 다시 읽은 자취는 쌓인다
 *
 * 이 조각이 말하려는 것은 "한 번만 셈하고 계속 쓴다" 이므로, **몇 번이나 표에서
 * 되읽었는지가 다 끝난 화면에 남아야** 주장이 선다. `outcome: 'read'` 인 호출이
 * 지워지지 않고 쌓이고, 그리는 쪽이 그것을 표와 마디를 잇는 선으로 세운다
 * (`reuseLinks`). 걸음마다 지우면 마지막 화면에는 "새로 푼 마디" 와 "읽어 온
 * 마디" 의 구별이 없어진다.
 *
 * ── 자리는 발신이 오는 순서가 말한다
 *
 * `branch` 가 호출 하나를 열고 `resolve`/`read` 가 그것을 닫는다. 그러니 아직
 * 닫히지 않은 호출들이 곧 지금의 호출 스택이고, 그 맨 안쪽이 이번 걸음이 말하는
 * 자리다 (`innermostOpen`). 부모도 몇째 자식인지도 거기서 나온다 — algorithm 이
 * 자리 번호를 따로 세어 실을 까닭이 없다.
 *
 * 싣는 것은 **걸음이 내리는 판정** 둘뿐이다.
 *
 * - `branch` 의 `n` — 어느 항을 부르는가. 부모의 `n` 에서 셈하려면 장면이
 *   `f(k)=f(k-1)+f(k-2)` 를 다시 적어야 한다. 그것은 algorithm 그 자체다.
 * - `resolve` 의 `value` — 그 항의 답. 마찬가지로 점화식의 결과다.
 *
 * `read` 는 payload 가 **없다**. 읽어 오는 값은 표에 이미 적혀 있고, 그것을
 * 표에서 꺼내 쓰는 것이 이 조각의 주장이기 때문이다.
 *
 * 좌표는 담지 않는다. 항과 부모가 구조를 정하므로 자리는 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { readMemoTerm } from './algorithm.js';

/**
 * 호출 자리 하나의 형편.
 *
 * - `open`   불렸고 아직 답이 없다.
 * - `solved` 아래를 다 펴서 답을 냈고, 그 답이 표로 옮겨 적혔다.
 * - `read`   이미 적힌 항이라 표에서 값을 되읽었다. 아래로 뻗지 않는다.
 */
export type MemoOutcome = 'open' | 'solved' | 'read';

/**
 * 재귀가 연 호출 자리 하나.
 *
 * 값을 쥐지 않는다 — 답이 난 자리의 수는 `memo[n]` 에서 읽는다. 그래야 마디에
 * 뜨는 수와 표에 뜨는 수가 한 출처다.
 *
 * 깊이도 좌우도 쥐지 않는다 — 부모가 누구인지와 몇째 자식인지가 그것을 정하고,
 * 둘 다 이 목록에서 셈해진다.
 */
export type MemoCall = {
  /** 이 자리가 부르는 항. `f(n)`. */
  readonly n: number;
  /** 부모 자리의 번호 (이 목록의 인덱스). 뿌리는 `null`. */
  readonly parent: number | null;
  readonly outcome: MemoOutcome;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데 쓴다.
 *
 * `at` 은 걸음이 말하는 호출 자리의 번호다. 걸음 번호가 아니다 — 차례는 장면이
 * 쌓이는 순서가 이미 말한다.
 */
export type MemoWriteOnceStep =
  /** 새 호출 자리가 났다. */
  | { readonly kind: 'call'; readonly at: number }
  /** 답이 나와 표에 적혔다. */
  | { readonly kind: 'write'; readonly at: number }
  /** 이미 적힌 항이라 표에서 되읽었다. */
  | { readonly kind: 'read'; readonly at: number }
  /** 다 폈다. */
  | { readonly kind: 'done' };

export type MemoWriteOnceScene = {
  /**
   * 펼칠 항. `f(term)` 을 편다.
   *
   * 표의 칸 수도 나무의 층 수도 여기서 나온다 — 자르는 잣대가 두 군데면 갈린다.
   */
  readonly term: number;
  /** 지금까지 열린 호출 자리들. 열린 차례 그대로 쌓인다. */
  readonly calls: readonly MemoCall[];
  /**
   * 표. 칸 `k` 에 적힌 값, 아직 비었으면 `null`. **이 조각의 본체다.**
   *
   * 한 번 적히면 바뀌지 않는다 (write-once). 그래서 어느 걸음에서 읽어도 같은
   * 값이고, 마디에 뜨는 수를 여기서 꺼내 써도 갈리지 않는다.
   */
  readonly memo: readonly (number | null)[];
  readonly step: MemoWriteOnceStep | null;
  /** 다 폈다고 선언되었나. 뿌리의 강조가 여기서 갈린다. */
  readonly finished: boolean;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `calls` 와 `memo` 를 일부러 뺀다 — 걸음이 고치는 것을 바탕과 같은 급으로 묶어
 * 넘기면 되감은 화면이 **이미 다 적힌 표**로 서고, 그 위에 algorithm 이 새로
 * 펴는 첫 걸음이 겹친다.
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다. 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<MemoWriteOnceScene, 'term'>;

/** 아직 아무 걸음도 밟지 않은 화면 — 빈 표만 서 있고 가지는 없다. */
function atStart(b: Base): MemoWriteOnceScene {
  return {
    term: b.term,
    calls: [],
    memo: new Array<number | null>(b.term + 1).fill(null),
    step: null,
    finished: false,
  };
}

// ── 구조에서 나오는 것들 ───────────────────────────────────────────────────

/**
 * 아직 답이 나오지 않은 호출들 — 바깥에서 안쪽 순.
 *
 * 곧 지금의 호출 스택이다. 재귀는 연 자리를 반드시 닫고 나오므로, 열린 채인
 * 자리들이 정확히 지금 밟고 있는 길이다.
 */
export function openCalls(scene: MemoWriteOnceScene): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < scene.calls.length; i += 1) {
    if (scene.calls[i].outcome === 'open') out.push(i);
  }
  return out;
}

/** 지금 밟고 있는 가장 안쪽 자리. 없으면 `-1`. */
export function innermostOpen(scene: MemoWriteOnceScene): number {
  for (let i = scene.calls.length - 1; i >= 0; i -= 1) {
    if (scene.calls[i].outcome === 'open') return i;
  }
  return -1;
}

/**
 * 그 자리에 적힌 답. 아직 열려 있으면 `null`.
 *
 * **표에서 읽는다.** 자리가 값을 따로 쥐면 마디의 수와 표의 수가 두 출처가 되고,
 * 그 둘이 갈리는 순간 이 조각의 주장이 무너진다.
 */
export function answerOf(scene: MemoWriteOnceScene, at: number): number | null {
  const call = scene.calls[at];
  if (call === undefined || call.outcome === 'open') return null;
  return scene.memo[call.n] ?? null;
}

/**
 * 표에서 되읽은 자취 전부. **지워지지 않고 쌓인다.**
 *
 * 그리는 쪽이 이것을 표의 칸과 마디를 잇는 선으로 세운다. 다 끝난 화면에 이
 * 선들이 남아야 "한 번만 셈하고 계속 쓴다" 가 보인다.
 */
export function reuseLinks(
  scene: MemoWriteOnceScene,
): readonly { readonly call: number; readonly cell: number }[] {
  const out: { call: number; cell: number }[] = [];
  for (let i = 0; i < scene.calls.length; i += 1) {
    const call = scene.calls[i];
    if (call.outcome === 'read') out.push({ call: i, cell: call.n });
  }
  return out;
}

/** 아래를 펴서 답을 낸 항의 수. */
export function solvedCount(scene: MemoWriteOnceScene): number {
  return scene.calls.filter((c) => c.outcome === 'solved').length;
}

/** 표에서 읽어 온 항의 수. */
export function reusedCount(scene: MemoWriteOnceScene): number {
  return scene.calls.filter((c) => c.outcome === 'read').length;
}

// ── 이어 붙이기 ────────────────────────────────────────────────────────────

/** 자리 하나의 형편만 갈아 낀 새 목록. 앞 장면을 제자리에서 고치지 않는다. */
function withOutcome(
  calls: readonly MemoCall[],
  at: number,
  outcome: MemoOutcome,
): readonly MemoCall[] {
  return calls.map((c, i) => (i === at ? { ...c, outcome } : c));
}

export const memoWriteOnceScene: ScenePlan<MemoWriteOnceScene> = {
  /**
   * 첫 장면은 빈 표뿐이다.
   *
   * 넘겨받은 자료에서 읽는 것은 수 하나라 참조를 쥘 일이 없다. 좁히는 규칙은
   * algorithm 이 내준 `readMemoTerm` 하나뿐이다 — 두 벌이 되면 표의 칸 수와
   * 실제로 펴는 항이 갈린다.
   */
  initial(initialData: unknown): MemoWriteOnceScene {
    const d = (initialData ?? {}) as { n?: unknown };
    return atStart({ term: readMemoTerm(d.n) });
  },

  reduce(scene: MemoWriteOnceScene, event: FacetRuntimeEvent): MemoWriteOnceScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 가지가 한 칸 뻗어 새 호출 자리가 생긴다. 부모는 지금 밟고 있는 가장
      // 안쪽 자리이고, 몇째 자식인지는 그리는 쪽이 이 목록에서 센다.
      case 'branch': {
        if (typeof p.n !== 'number' || !Number.isFinite(p.n)) return scene;
        const parent = innermostOpen(scene);
        const at = scene.calls.length;
        return {
          ...scene,
          calls: [
            ...scene.calls,
            { n: Math.floor(p.n), parent: parent < 0 ? null : parent, outcome: 'open' },
          ],
          step: { kind: 'call', at },
        };
      }

      // 답이 났다. 값이 표의 제 칸으로 옮겨 가 적힌다. 어느 자리의 답인지는
      // 싣지 않는다 — 지금 열린 가장 안쪽 자리가 곧 그 자리다.
      case 'resolve': {
        if (typeof p.value !== 'number' || !Number.isFinite(p.value)) return scene;
        const at = innermostOpen(scene);
        if (at < 0) return scene;
        const k = scene.calls[at].n;
        const memo = [...scene.memo];
        if (k >= 0 && k < memo.length) memo[k] = p.value;
        return {
          ...scene,
          calls: withOutcome(scene.calls, at, 'solved'),
          memo,
          step: { kind: 'write', at },
        };
      }

      // 이미 적힌 항이다. 값은 표에 있으므로 싣지 않는다 — 그것을 표에서 꺼내
      // 쓰는 것이 이 조각의 주장이다.
      case 'read': {
        const at = innermostOpen(scene);
        if (at < 0) return scene;
        return {
          ...scene,
          calls: withOutcome(scene.calls, at, 'read'),
          step: { kind: 'read', at },
        };
      }

      // 다 폈다. 푼 항과 읽은 항의 수는 자리 목록이 센다.
      case 'done':
        return { ...scene, finished: true, step: { kind: 'done' } };

      // 손으로 짚기 시작 — 빈 표만 남긴 처음으로 돌아간다.
      //
      // 객체 리터럴로 넘긴다. 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌
      // 타입이 아무것도 막지 못한다.
      case 'rewind':
        return atStart({ term: scene.term });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히
        // 버린다 (C2).
        return scene;
    }
  },
};
