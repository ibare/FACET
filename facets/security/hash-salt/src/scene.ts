/**
 * hashSalt 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회로 갈리는 분기도, 화면을 되읽는
 * 자리도 없었다. **상태는 전부 stage 에 있었고, 그중 대부분은 변수가 아니라 화면
 * 자신이었다.**
 *
 * - `let rows: Row[]` — **DOM 손잡이와 뜻이 한 객체**였다 (함정 24). 손잡이 자체는
 *   무해하나 알맹이는 그 요소의 속성에 있었다. `group` 의 `opacity` 가 "두 사람이
 *   드러났나", `saltGroup` 의 `opacity` 가 "소금이 붙었나", `stored` 의 `fill` 이
 *   "지금 적힌 값이 위험한 값이냐 갈라진 값이냐" 였다. 지금은 `revealed` ·
 *   `salted` · `plain` · `hashed` 넷이 말한다.
 * - `let snapshot: InitPayload | null` — stage 가 쥐고 있던 **바탕 자료의 사본**.
 *   `hashUnsalted` 도 `hashSalted` 도 여기서 값을 꺼내 글자를 갈아 끼웠다. 지금은
 *   장면이 바탕을 쥐고 그리는 쪽은 그것을 읽기만 한다.
 * - **`stored` 의 `textContent`** — 한 글자 자리에 **두 답이 겹쳐 실려** 있었다.
 *   소금 없이 해싱한 값이 소금을 친 값으로 갈아 끼워져, 완주 화면에는 뒤엣답만
 *   남았다. 아래 "두 답이 함께 서야 한다" 를 보라.
 * - `verdict` 의 `textContent` — "똑같다" 가 "갈렸다" 로 갈아 끼워졌다. 같은 병이다.
 *
 * ── 이 조각의 주장은 *견줌*이라 양쪽 답이 함께 서야 한다
 *
 * "같은 비밀번호라도 소금을 치면 해시가 달라진다" 는 **소금 치기 전과 후의 견줌**이다.
 * 그런데 옛 화면은 값 열 하나를 돌려 쓰며 뒤엣답으로 앞엣답을 덮었다 — 완주 화면에는
 * 갈라진 값 둘만 남고 "소금 없이 해싱했을 때는 둘이 똑같았다" 가 어디에도 없었다.
 * 판정 글자도 하나뿐이라 "똑같다" 가 "갈렸다" 에 지워졌다 (프로토콜 4 절 · 함정 7).
 *
 * 지금은 어휘를 갈라 둘을 한 화면에 세운다. **값 열이 둘**이고(그대로 해싱한 값 ·
 * 소금을 치고 해싱한 값) **판정도 제 열 아래 하나씩** 선다. 소금을 친 값은 그대로
 * 해싱한 값의 자리에서 미끄러져 나오므로 "같은 자리의 값이 갈린다" 는 원래의 동사는
 * 운동으로 남고, 갈라진 뒤에도 앞엣답이 제자리를 지킨다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 어느 국면까지 왔나 (드러났나 · 해싱했나 · 소금이 붙었나) | **장면이 쥔다** (발신의 어휘 그대로) |
 * | 각 행이 저장하는 값 · 그 값들이 같은가 다른가 | **장면이 센다** (`storedPlain` · `storedSalted` · `allSame`) |
 * | 해시 함수 이름 · 비밀번호 · 소금 · 해시값 | **`init` 이 싣는다** — 저작 선언이 정하는 바탕이다 |
 *
 * 판정("똑같다" / "갈렸다")을 싣지 않는 것이 요점이다. 화면에 적히는 그 값들을
 * 그대로 견주어 나오게 해야 결론과 그림이 한 자료를 쓴다 (함정 34).
 *
 * ── 바탕을 참조로 쥐지 않는다
 *
 * `initial` 은 **빈 장면**을 돌려주고 `init` 이벤트가 값을 베껴 채운다. 러너가 주는
 * `initialData` 는 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때
 * 이미 굴러간 자료로 바탕을 그린다 (S-scene MUST).
 *
 * 좌표는 담지 않는다. 열과 행의 자리는 캔버스가 정하는 값이라 그리는 쪽의 몫이다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 사람 — 이름, 그 사람만의 소금, 소금을 친 해시. 값이지 화면이 아니다. */
export type SceneUser = {
  name: string;
  salt: string;
  hash: string;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 무엇이 어디서 어디로 가는지가 전부 바탕과 자취에서
 * 나오므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type HashSaltStep =
  /** 두 사람과 그들이 고른 같은 비밀번호가 드러난다. */
  | { kind: 'reveal' }
  /** 그대로 해싱한 값이 두 행에 앉는다. 둘이 같다. */
  | { kind: 'plain' }
  /** 계정마다 제 소금을 받는다. 이 조각의 주인공이다. */
  | { kind: 'salt' }
  /** 소금을 친 값이 그대로 해싱한 값의 자리에서 미끄러져 나온다. */
  | { kind: 'split' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type HashSaltCaption =
  | { kind: 'same-password' }
  | { kind: 'unsalted' }
  | { kind: 'salting' }
  | { kind: 'salted' };

export type HashSaltScene = {
  // ── 바탕. `init` 이 값을 베껴 한 번 정하고 걸음이 고치지 않는다.
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 두 사람이 공교롭게 똑같이 고른 비밀번호. */
  password: string;
  /** 소금 없이 해싱했을 때의 값. 둘에게 똑같이 나온다. */
  unsaltedHash: string;
  /** 소금을 받은 사람들. */
  users: readonly SceneUser[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 두 사람이 드러났나. 표의 행이 서는 것이 이것이다. */
  revealed: boolean;
  /** 그대로 해싱한 값이 섰나. **선 뒤로 끝까지 남는다.** */
  plain: boolean;
  /** 소금 열이 섰나. */
  salted: boolean;
  /** 소금을 친 값이 섰나. */
  hashed: boolean;

  step: HashSaltStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `revealed` 부터 `hashed` 까지는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 해싱된 값을 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 세우는 것이 겹친다 (함정 14).
 */
type Base = Pick<HashSaltScene, 'algorithmLabel' | 'password' | 'unsaltedHash' | 'users'>;

/**
 * 되돌린 뒤의 장면 — 표가 비어 있다. 첫 걸음이 두 사람을 세운다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (함정 15).
 */
function atStart(base: Base): HashSaltScene {
  return {
    algorithmLabel: base.algorithmLabel,
    password: base.password,
    unsaltedHash: base.unsaltedHash,
    users: base.users,
    revealed: false,
    plain: false,
    salted: false,
    hashed: false,
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

/** 사람 목록을 **값으로 베낀다.** 넘겨받은 배열을 그대로 쥐지 않는다 (S-scene). */
function readUsers(raw: unknown): SceneUser[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneUser[] = [];
  for (const item of raw) {
    const u = fields(item);
    if (u === null) continue;
    out.push({ name: str(u.name), salt: str(u.salt), hash: str(u.hash) });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 값도 그 아래 판정도 전부 여기를 지난다. 글자와 결론이 한 자료를
// 쓰므로 갈릴 자리가 없다 (함정 34).

/**
 * 그대로 해싱했을 때 각 행이 저장하는 값.
 *
 * 소금이 없으니 누구에게나 같은 값이다 — 그 "같음" 이 곧 이 조각이 보이려는 문제라,
 * 상수로 적어 두지 않고 행마다 실제로 앉는 값을 그대로 늘어놓는다.
 */
export function storedPlain(scene: HashSaltScene): string[] {
  return scene.users.map(() => scene.unsaltedHash);
}

/** 소금을 치고 해싱했을 때 각 행이 저장하는 값. */
export function storedSalted(scene: HashSaltScene): string[] {
  return scene.users.map((u) => u.hash);
}

/**
 * 이 값들이 서로 같은가.
 *
 * 판정 글자("똑같다" / "갈렸다")가 여기서 나온다. 걸음이 판정을 싣지 않으므로
 * 화면에 적힌 값과 그 아래 결론이 어긋날 길이 없다.
 */
export function allSame(values: readonly string[]): boolean {
  return values.length > 0 && values.every((v) => v === values[0]);
}

/**
 * 지금 캡션이 말할 것. 자취가 정한다.
 *
 * 걸음(`step`)이 아니라 자취를 보므로 되짚어 세운 화면에도 그 걸음의 말이 남는다 —
 * 정적 그리기는 `step` 을 읽지 않는다 (공통 지시문 8 절).
 */
export function captionOf(scene: HashSaltScene): HashSaltCaption | null {
  if (scene.hashed) return { kind: 'salted' };
  if (scene.salted) return { kind: 'salting' };
  if (scene.plain) return { kind: 'unsalted' };
  if (scene.revealed) return { kind: 'same-password' };
  return null;
}

export const hashSaltScene: ScenePlan<HashSaltScene> = {
  /**
   * 첫 장면은 **비어 있다.** 바탕은 `init` 이벤트가 값을 베껴 채운다.
   *
   * `initialData` 를 여기서 읽지 않는 까닭은 그것이 mechanism 과 view 가 함께 쓰는
   * 한 객체이기 때문이다 — 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene MUST).
   */
  initial(): HashSaltScene {
    return atStart({ algorithmLabel: '', password: '', unsaltedHash: '', users: [] });
  },

  reduce(scene: HashSaltScene, event: FacetRuntimeEvent): HashSaltScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 바탕이 들어선다. 저작 선언이 정하는 값들이라 걸음이 셈할 수 있는 것이 없다 —
       * 여기서 **값을 베껴** 쥔다.
       */
      case 'init': {
        if (p === null) return scene;
        return atStart({
          algorithmLabel: str(p.algorithmLabel),
          password: str(p.password),
          unsaltedHash: str(p.unsaltedHash),
          users: readUsers(p.users),
        });
      }

      /* 두 사람과 그들이 고른 같은 비밀번호가 드러난다. 누구인지는 바탕이 말한다. */
      case 'reveal-users':
        return { ...scene, revealed: true, step: { kind: 'reveal' } };

      /* 그대로 해싱한 값이 앉는다. 그 값도 둘이 같다는 판정도 바탕에서 나온다. */
      case 'hash-unsalted':
        return { ...scene, plain: true, step: { kind: 'plain' } };

      /* 계정마다 제 소금을 받는다. 어떤 소금인지는 바탕이 말한다. */
      case 'add-salt':
        return { ...scene, salted: true, step: { kind: 'salt' } };

      /* 소금을 친 값이 갈라져 나온다. 그대로 해싱한 값은 제자리를 지킨다. */
      case 'hash-salted':
        return { ...scene, hashed: true, step: { kind: 'split' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다 (함정 14·15). */
      case 'rewind':
        return atStart({
          algorithmLabel: scene.algorithmLabel,
          password: scene.password,
          unsaltedHash: scene.unsaltedHash,
          users: scene.users,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
