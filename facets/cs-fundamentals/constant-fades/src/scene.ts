/**
 * ConstantFades 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 273 줄이나 되는데 `let` 이 한 자리도 없었다. **상태는 전부 stage 에
 * 있었고, 그중 절반은 변수가 아니라 화면 자신이었다.**
 *
 * - `let topN` · `let ticks` — **축의 척도.** `xOf` 가 `log(n)/log(topN)` 으로 자리를
 *   셈하므로 화면의 모든 가로 좌표가 이 둘에서 나왔다. 걸음이 실어 온 눈금을 stage 가
 *   제 변수에 옮겨 담는 짜임이라, 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다.
 *   지금은 장면의 `ticks` 하나가 척도이고 그리는 쪽은 그것을 읽기만 한다.
 * - `let probeX` · `let postX` — **DOM 의 거울.** 칩과 기둥이 지금 선 가로 자리를 따로
 *   적어 두고 다음 운동의 **출발값**으로 삼았다 (`const from = probeX`). `getAttribute`
 *   도 `textContent` 도 안 쓰니 ④ 의 grep 을 지나가지만 병은 같다 — 되짚어 세운
 *   직후에는 그 거울이 옛 화면의 것이라 칩이 엉뚱한 자리에서 출발한다. 지금은
 *   `cursorOf` · `cursorBefore` 가 자취에서 셈한다.
 * - `let marks: Mark[]` — `Mark = { coef, tail, x, coefW, tailW }`. **DOM 손잡이와
 *   좌표·폭이 한 객체다.** 게다가 그 셋이 어느 상수의 기둥인지는 `coef.textContent`
 *   에만 있었다. 지금은 `posts` 가 말하고 자리는 그리는 쪽이 셈한다.
 * - `ghostLayer` 의 **자식 수** — 기둥이 몇 번 옮겨 앉았나. 어떤 변수도 그것을 말하지
 *   않았고 `buildScene()` 이 통째로 비우는 것이 유일한 되돌림이었다. 지금은
 *   `posts.length - 1` 이다.
 * - `band.coef.textContent` — **지금 띠가 이고 있는 상수.** 화면의 글자가 유일한
 *   보관처라, `positionBandLabel` 이 그 글자를 **도로 읽어** 폭을 재고 자리를 잡았다
 *   (`textWidth(band.coef.textContent ?? '', 12)`). `eraseConstants` 는 한술 더 떠
 *   `Number(band.tail.getAttribute('x') ?? PAD_L)` 로 출발 자리를 화면에서 꺼냈다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 칩 두 장에 `100·n = 1000` 과 `n² = 100` 이 나란히 뜨고 캡션이 그 배수를 말한다.
 * 옛 발신은 `linear` · `quad` · `lead` · `ratio` 를 전부 실어 보냈는데, 그러면 같은
 * 물음에 답이 둘이 된다. 지금은 `algorithm.ts` 가 내준 `linearValueAt` ·
 * `quadValueAt` 한 쌍만 지나고 (프로토콜 4 절의 B 갈래), 앞선 쪽과 배수는 그 두 값에서
 * 곧바로 나온다.
 *
 * 반대로 **만나는 자리(`meeting`)는 싣는다.** 그것을 찾는 `meetingOf` 가 이 조각의
 * 알고리즘 그 자체라, 내주면 장면이 알고리즘을 되풀이하고 발신이 장식이 된다.
 * 같은 까닭으로 **눈금(`ticks`)도 싣는다** — 축의 끝이 가장 먼 만나는 자리에서
 * 나오기 때문이다. 다만 척도를 정하는 자리는 그 하나뿐이고, 그리는 쪽은 다시 자르지
 * 않는다 (프로토콜 4 절 "자르는 잣대가 두 군데면 갈린다").
 *
 * 나머지는 전부 걷어냈다. 직전 기둥(`previous`)도, 기둥 셋의 목록(`marks`)도,
 * 배율(`factor`)도 세운 기둥의 자취에 이미 있다.
 *
 * ── 짚은 자국은 쌓인다 — 이행이 화면을 고친 자리
 *
 * 옛 화면은 칩 한 쌍이 자리를 옮겨 다니며 값을 갈아 끼웠다. 그래서 **n = 10 에서
 * 100·n 이 열 배 컸다는 사실이 다음 걸음에 지워졌고**, 마지막 걸음에서 칩이 통째로
 * 날아가면 "작을 때는 상수가 컸다" 가 화면에서 사라졌다. 그것이 이 조각의 문제 제기
 * 자체인데도 그랬다.
 *
 * 지금은 짚은 자리가 `probes` 에 쌓이고 정적 그리기가 자국을 남긴다. 상수를 지운
 * 마지막 화면에도 "여기선 상수 쪽이 열 배 · 여기서 만나고 · 여기선 n² 가 열 배" 가
 * 함께 서 있다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. `n` 과 상수라는 **구조**만 담고 가로 자리는 눈금에서 역산하는
 * 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — `step` 이 무엇을 말할지만
 * 말하고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는
 * 까닭은 `step` 과 캡션의 갈래가 정확히 1 대 1 이기 때문이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { linearValueAt, quadValueAt } from './algorithm.js';

/** 짚어 본 자리 하나. 어느 상수로 짚었는지가 함께 있어야 값이 정해진다. */
export type ProbeMark = {
  /** 짚은 n. */
  n: number;
  /** 그때 상수가 붙은 쪽의 계수. */
  coefficient: number;
};

/** 세운 경계 기둥 하나. 마지막이 지금 선 것이고 앞의 것들은 유령으로 남는다. */
export type BoundaryPost = {
  /** 이 기둥을 세운 상수. */
  coefficient: number;
  /** 두 식이 만나는 n. `meetingOf` 가 낸 값이라 그리는 쪽이 다시 풀지 않는다. */
  meeting: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 출발 자리는 `cursorBefore` 가 자취에서 셈하므로 `prev` 를
 * 들출 일이 없다 (S-scene).
 */
export type ConstantFadesStep =
  /** n 이 자라는 길을 편다. */
  | { kind: 'axis' }
  /** 한 자리를 짚어 두 값을 읽는다. */
  | { kind: 'probe' }
  /** 만나는 자리에 기둥을 세우고 두 땅이 갈린다. */
  | { kind: 'boundary' }
  /** 상수를 갈아 기둥이 옮겨 앉는다. */
  | { kind: 'move' }
  /** 기둥 사이가 몇 배씩 벌어졌는지 잰다. */
  | { kind: 'spacing' }
  /** 상수가 떨어져 나가고 셋이 한 말이 된다. */
  | { kind: 'erase' };

/** 어느 쪽이 앞서나. `tie` 는 두 값이 정확히 같은 자리다. */
export type Lead = 'linear' | 'quad' | 'tie';

/** 한 자리에서 읽히는 것 전부. 화면의 칩도 캡션도 이 한 함수를 지난다. */
export type Reading = {
  n: number;
  coefficient: number;
  linear: number;
  quad: number;
  lead: Lead;
  /** 큰 쪽을 작은 쪽으로 나눈 값. 정확히 만나는 자리면 1. */
  ratio: number;
};

export type ConstantFadesScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 상수가 붙은 쪽의 차수. 식의 이름(`n` · `n²`)이 여기서 나온다. */
  linearDegree: number;
  /** 상수가 없는 쪽의 차수. */
  quadraticDegree: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * n 의 눈금 자리, 오름차순.
   *
   * **이 장면의 유일한 척도다.** 끝 값이 축의 오른쪽 끝이고 가로 자리는 전부 여기서
   * 역산된다. 걸음이 정하는 값이라 바탕이 아니라 자취다 — `rewind` 가 함께 턴다.
   */
  ticks: readonly number[];
  /** 짚어 본 자리들, 짚은 차례대로. **남는 자취**라 정적 그리기가 자국을 세운다. */
  probes: readonly ProbeMark[];
  /** 세운 기둥들, 세운 차례대로. 마지막이 선 기둥, 앞의 것들이 유령이다. */
  posts: readonly BoundaryPost[];
  /** 기둥 사이를 재었나. */
  spaced: boolean;
  /** 상수를 지웠나. */
  erased: boolean;

  step: ConstantFadesStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `ticks` 도 `probes` 도 `posts` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 이미 선 기둥과 자국을 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 세우는 것이 겹친다 (S-scene).
 */
type Base = Pick<ConstantFadesScene, 'linearDegree' | 'quadraticDegree'>;

/**
 * 아무것도 서지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): ConstantFadesScene {
  return {
    linearDegree: base.linearDegree,
    quadraticDegree: base.quadraticDegree,
    ticks: [],
    probes: [],
    posts: [],
    spaced: false,
    erased: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function positiveInt(v: unknown, fallback: number): number {
  const n = num(v);
  return n === null ? fallback : Math.max(1, Math.trunc(n));
}

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 칩도 캡션도 자국도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 축의 오른쪽 끝. 눈금이 아직 안 왔으면 1 이라 자리 셈이 왼쪽 끝으로 눌린다. */
export function topOf(scene: ConstantFadesScene): number {
  const last = scene.ticks[scene.ticks.length - 1];
  return last === undefined || last <= 1 ? 1 : last;
}

/** 지금 선 기둥. 아직 하나도 안 세웠으면 null. */
export function standingPost(scene: ConstantFadesScene): BoundaryPost | null {
  return scene.posts[scene.posts.length - 1] ?? null;
}

/** 지나온 기둥들 — 유령으로 남는 자취다. */
export function ghostPosts(scene: ConstantFadesScene): readonly BoundaryPost[] {
  return scene.posts.slice(0, -1);
}

/** 어디를 짚고 있나. 기둥을 세운 뒤에는 기둥이, 그 전에는 마지막으로 짚은 자리가 정한다. */
export type Cursor = { n: number; coefficient: number };

export function cursorOf(scene: ConstantFadesScene): Cursor | null {
  const post = standingPost(scene);
  if (post !== null) return { n: post.meeting, coefficient: post.coefficient };
  const probe = scene.probes[scene.probes.length - 1];
  return probe === undefined ? null : { n: probe.n, coefficient: probe.coefficient };
}

/**
 * 이 걸음이 오기 **전**의 커서. 옮겨 가는 운동의 출발 자리다.
 *
 * 자취를 한 칸 물려 셈하므로 `prev` 를 들추지 않는다 — 어느 걸음에서 와도 같은
 * 곳에서 출발한다 (S-scene).
 */
export function cursorBefore(scene: ConstantFadesScene): Cursor | null {
  const step = scene.step;
  if (step === null) return null;
  if (step.kind === 'probe') {
    const before = scene.probes[scene.probes.length - 2];
    return before === undefined ? null : { n: before.n, coefficient: before.coefficient };
  }
  if (step.kind === 'boundary' || step.kind === 'move') {
    const before = scene.posts[scene.posts.length - 2];
    if (before !== undefined) return { n: before.meeting, coefficient: before.coefficient };
    // 첫 기둥은 마지막으로 짚은 자리에서 걸어온다.
    const probe = scene.probes[scene.probes.length - 1];
    return probe === undefined ? null : { n: probe.n, coefficient: probe.coefficient };
  }
  return cursorOf(scene);
}

/**
 * 그 자리에서 두 식이 갖는 값과 그 견줌.
 *
 * `algorithm.ts` 가 내준 두 함수만 지난다. 걸음이 값을 실어 오지 않으므로 칩에 뜨는
 * 수와 캡션이 말하는 배수가 갈릴 자리가 없다.
 */
export function readingAt(scene: ConstantFadesScene, at: Cursor): Reading {
  const linear = linearValueAt(at.coefficient, at.n, scene.linearDegree);
  const quad = quadValueAt(at.n, scene.quadraticDegree);
  const lead: Lead = linear === quad ? 'tie' : linear > quad ? 'linear' : 'quad';
  const big = Math.max(linear, quad);
  const small = Math.min(linear, quad);
  const ratio = lead === 'tie' || small === 0 ? 1 : big / small;
  return { n: at.n, coefficient: at.coefficient, linear, quad, lead, ratio };
}

/**
 * 세운 기둥들을 n 오름차순으로. 간격을 재는 걸음이 이 차례로 읽는다.
 *
 * 걸음이 목록을 실어 오지 않는다 — 기둥은 세울 때마다 하나씩 쌓이므로 자취가 이미
 * 셋을 쥐고 있다.
 */
export function marksOf(scene: ConstantFadesScene): BoundaryPost[] {
  return [...scene.posts].sort((a, b) => a.meeting - b.meeting);
}

/** 이웃한 두 기둥 사이. `ratio` 는 자리가 몇 배 밀렸나다. */
export type Span = { from: BoundaryPost; to: BoundaryPost; ratio: number };

/**
 * 기둥 사이의 간격.
 *
 * **배수를 선언에서 가져오지 않는다.** "상수를 열 배 하면 자리도 열 배" 가 이 조각의
 * 결론인데, 그 열 배를 `factor` 로 실어 오면 결론이 화면의 기둥과 다른 자료를 쓰게
 * 된다. 여기서는 실제로 선 두 기둥의 거리를 잰다.
 */
export function spansOf(scene: ConstantFadesScene): Span[] {
  const marks = marksOf(scene);
  const out: Span[] = [];
  for (let i = 1; i < marks.length; i += 1) {
    const from = marks[i - 1]!;
    const to = marks[i]!;
    out.push({ from, to, ratio: from.meeting === 0 ? 1 : to.meeting / from.meeting });
  }
  return out;
}

/**
 * 상수가 이웃 사이에서 몇 배로 커졌나. 기둥이 둘 미만이면 null.
 *
 * 간격을 말하는 캡션이 쓴다. 위와 같은 까닭으로 선언의 배율이 아니라 세운 기둥의
 * 상수에서 잰다.
 */
export function coefficientStepOf(scene: ConstantFadesScene): number | null {
  const marks = marksOf(scene);
  const first = marks[0];
  const second = marks[1];
  if (first === undefined || second === undefined || first.coefficient === 0) return null;
  return second.coefficient / first.coefficient;
}

export const constantFadesScene: ScenePlan<ConstantFadesScene> = {
  /**
   * 첫 장면은 두 식의 차수만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은 것을
   * 참조로 쥐지 않는다 — 수만 꺼내 새 장면을 만든다 (S-scene).
   */
  initial(initialData: unknown): ConstantFadesScene {
    const d = fields(initialData) ?? {};
    return atStart({
      linearDegree: positiveInt(d.linearDegree, 1),
      quadraticDegree: positiveInt(d.quadraticDegree, 2),
    });
  },

  reduce(scene: ConstantFadesScene, event: FacetRuntimeEvent): ConstantFadesScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 눈금이 선다. 이 발신이 척도를 정하는 유일한 자리이고, 그리는 쪽은 여기서
       * 온 목록을 다시 자르지 않는다.
       */
      case 'axis': {
        if (!p || !Array.isArray(p.ticks)) return scene;
        const ticks: number[] = [];
        for (const raw of p.ticks) {
          const n = num(raw);
          // 눈금 하나가 수가 아니면 자가 통째로 거짓이 된다. 조용히 흘린다 (C2).
          if (n === null) return scene;
          ticks.push(n);
        }
        if (ticks.length === 0) return scene;
        return { ...scene, ticks, step: { kind: 'axis' } };
      }

      /*
       * 한 자리를 짚는다. 두 값은 여기서 셈하지 않는다 — 그리는 쪽이 `readingAt`
       * 으로 내므로 자국과 칩과 캡션이 같은 수를 쓴다.
       */
      case 'probe': {
        if (!p) return scene;
        const n = num(p.n);
        const coefficient = num(p.coefficient);
        if (n === null || coefficient === null) return scene;
        return {
          ...scene,
          probes: [...scene.probes, { n, coefficient }],
          step: { kind: 'probe' },
        };
      }

      /*
       * 기둥을 세운다. 첫 기둥과 옮겨 앉는 기둥은 같은 목록에 쌓이고 말하는 바만
       * 다르다 — 앞 장면을 제자리에서 고치지 않는다 (S-scene).
       */
      case 'boundary':
      case 'boundary-move': {
        if (!p) return scene;
        const coefficient = num(p.coefficient);
        const meeting = num(p.meeting);
        if (coefficient === null || meeting === null) return scene;
        return {
          ...scene,
          posts: [...scene.posts, { coefficient, meeting }],
          step: { kind: event.type === 'boundary' ? 'boundary' : 'move' },
        };
      }

      /* 기둥 사이를 잰다. 잴 대상도 잰 값도 자취에 이미 있다. */
      case 'spacing':
        return { ...scene, spaced: true, step: { kind: 'spacing' } };

      /* 상수가 떨어져 나간다. 짚은 자국은 남는다 — 그것이 문제 제기였다. */
      case 'constant-erased':
        return { ...scene, erased: true, step: { kind: 'erase' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          linearDegree: scene.linearDegree,
          quadraticDegree: scene.quadraticDegree,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
