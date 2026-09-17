/**
 * CompareWithAll 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 는 121 줄인데 `let` 이 한 자리도 없고 조회로 갈리는 분기도 없었다.
 * **숨은 상태는 전부 stage 에 있었고 여섯이 한 덩어리로 얽혀 있었다.**
 *
 * - `let unit` — **척도.** 곱셈 하나가 차지하는 세로다. 기둥의 높이도, 눈금의 세로
 *   자리도, 표식이 앉는 자리도 전부 여기를 지났다. 게다가 이것은 단순한 값이 아니라
 *   **걸어온 줄 전부를 접은 결과**였다 — `fitUnit(지금 줄, 앞 자, 앞 줄)` 이 앞 자와
 *   앞 줄을 함께 읽으므로 자의 지금 값은 지나온 모든 줄의 함수다. 지금은 stage 의
 *   `geomOf` 가 `pileRows` 를 접어 매번 다시 낸다. 장면이 담는 것은 픽셀이 아니라
 *   **줄의 목록**이다 (S-piece).
 * - `let total` — 지금 줄의 곱셈 수. 걸음이 실어 오던 값을 stage 가 제 변수에 옮겨
 *   담았다. 지금은 `n × dims` 라 바탕에서 곧바로 나온다.
 * - `let spokeDeg` — **DOM 의 거울**(함정 28). 바늘이 지금 선 각도를 따로 적어 두고
 *   `rotateSpoke` 가 그것을 **운동의 출발값**으로 삼았다 (`const from = spokeDeg`).
 *   `getAttribute` 도 `textContent` 도 안 쓰니 ④ 의 grep 을 지나가지만 병은 같다 —
 *   되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 바늘이 엉뚱한 데서 돈다. 지금은
 *   훑은 수에서 자리가 곧바로 나온다.
 * - `let ghosts: Ghost[]` — `Ghost = { total, line, text }`. **DOM 손잡이와 수치가 한
 *   객체**다 (함정 24). 그리고 이것이 **이 조각의 자취 그 자체**였다 — 손으로 센 32 가
 *   바닥의 실금이 되어 남는 자리이고, 그것이 남아 있어야 "커지면 못 감당한다" 가
 *   보인다 (함정 7). stage 의 `let` 에만 있었으므로 임의의 걸음으로 뛰면 통째로
 *   사라졌다. 지금은 `pileRows` 의 앞자락이다.
 * - `let beyondFrame` — 자가 더 물러서지 못해 기둥이 화면 밖으로 자랐나. 국면이다.
 *   지금은 `geomOf` 가 접으면서 함께 낸다.
 * - `type Scene = { arcGuide, band, dots, spoke, … }` — **이름이 부딪히던 자리**
 *   (함정 21). 장면이 아니라 **DOM 손잡이 묶음**이었고 `let scene = build()` 가
 *   그것을 들고 있었다. 정적 그리기가 걸음마다 전부 새로 세우게 되면서 통째로
 *   없어졌다.
 * - `readBoard` — 선언을 좁히는 자리가 stage 에 있었다. 좁히개는 여기 `initial` 로
 *   옮겨 왔고, `board` 하나만 좁히던 것이 `scales` 와 `real` 까지 좁힌다.
 *
 * 그리고 **화면 자신이 상태였던 자리 넷**이 ⑤ 를 눈으로 읽어 나왔다.
 *
 * - **알갱이의 `fill`** — `itemDefault`(아직 안 봄) · `itemComparing`(지금 봄) ·
 *   `itemSorted`(봤음). `type DotState` 같은 선언은 어디에도 없고 형편이 오직 칠에만
 *   있었다 (함정 24 의 둘째 모양). 지금은 `swept` 하나가 그것을 말한다.
 * - **알갱이의 `r`** — `sweepBand` 가 `(1 - p) * DOT_R` 로 0 까지 줄여 놓는다. 그러니
 *   반지름이 "낱낱을 아직 셀 수 있나" 를 쥐고 있었다. 지금은 `dotsAlive` 다.
 * - **`tilesG` 의 자식 수** — 깔린 곱셈 조각이 몇인가. 어떤 변수도 그것을 말하지
 *   않았고 `fuse` 가 `tilesG.textContent = ''` 로 통째로 지우는 것이 유일한 되돌림
 *   이었다. 지금은 `grainCount` 가 `swept × dims` 로 낸다 — 캡션이 말하는 수와
 *   **같은 자료**다 (함정 34).
 * - **`column` 의 `opacity` 와 `markLine`/`markText` 의 `opacity`** — 기둥과 표식이
 *   이미 섰나. 지금은 `fused` 다.
 *
 * ── 셈하는 것과 판정하는 것 (프로토콜 4 절)
 *
 * **이 조각에는 걸음이 내리는 판정이 하나도 없다.** 무엇을 몇 번째로 훑을지는 후보
 * 수가 정하고, 키운 줄은 선언의 `scales` 에 적혀 있으며, 곱셈 수는 `n × dims` 라
 * 바탕에서 곧바로 나온다. 그래서 **payload 를 통째로 걷어냈다** — 발신은 어휘만
 * 나른다.
 *
 *   index   온 차례다. 훑음이 하나씩 쌓이므로 `swept` 가 그 번호다.
 *   n·dims  바탕이다. 선언의 `board` · `scales[i]` · `real` 이 말한다.
 *   total   곱셈이다. 두 수의 곱이라 장면이 센다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 후보 수와 차원이라는 **구조**만 담고 자리는 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — `captionOf` 가
 * 무엇을 말할지와 그 인자만 내놓고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 * 캡션 필드를 따로 두지 않는 까닭은 자취의 갈래와 캡션의 갈래가 정확히 1 대 1 이라
 * 따로 실으면 같은 것을 두 번 말하는 꼴이 되기 때문이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 후보 수와 차원의 짝. 곱셈 횟수는 둘의 곱이다. */
export type SceneRow = { n: number; dims: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 바늘의 출발 각도도, 자가 물러서기 전의 눈금도
 * 자취 한 칸을 물려 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type CompareWithAllStep =
  /** 후보 하나를 짚고 차원마다 곱셈 알갱이를 더미로 보낸다. */
  | { kind: 'sweep' }
  /** 낱낱의 알갱이가 한 기둥으로 굳는다. 이제부터는 높이로만 말한다. */
  | { kind: 'fuse' }
  /** 후보 수와 차원을 키운다. 자가 물러서고 앞 줄은 눈금으로 남는다. */
  | { kind: 'grow' }
  /** 실제 크기에 가까운 줄. 자가 더는 못 물러서고 기둥이 화면을 넘는다. */
  | { kind: 'real' };

export type CompareWithAllScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 실제로 하나씩 훑어 보는 작은 판. */
  board: SceneRow;
  /** 수를 키운 줄들. 온 차례대로 하나씩 밟는다. */
  scales: readonly SceneRow[];
  /** 실제 크기에 가까운 줄. */
  real: SceneRow;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 훑은 후보 수. 알갱이 수도 바늘의 자리도 여기서 나온다. */
  swept: number;
  /** 낱낱이 한 기둥으로 굳었나. 굳은 뒤로는 조각이 아니라 높이가 말한다. */
  fused: boolean;
  /** 키운 줄을 몇 개까지 밟았나. `scales` 의 앞자락 길이다. */
  grown: number;
  /** 실제 크기 줄까지 갔나. 이 조각의 맺음 화면이다. */
  scaled: boolean;

  step: CompareWithAllStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `swept` 아래 넷은 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미
 * 쌓인 더미를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다
 * (함정 14).
 */
type Base = Pick<CompareWithAllScene, 'board' | 'scales' | 'real'>;

/**
 * 되돌린 뒤의 장면 — 아직 아무것도 짚지 않은 판이다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (함정 15).
 */
function atStart(base: Base): CompareWithAllScene {
  return {
    board: base.board,
    scales: base.scales,
    real: base.real,
    swept: 0,
    fused: false,
    grown: 0,
    scaled: false,
    step: null,
  };
}

// ── 선언 좁히기 ─────────────────────────────────────────────────────────────
//
// 좁히는 자리는 여기 하나다. **새 배열에 새 객체를 담아 돌려준다** — 러너가 주는
// 것은 mechanism 과 view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 고쳐진
// 자료로 바탕을 그린다 (S-scene MUST).

/** 판이 비었을 때의 기본값. 옛 stage 의 `DEFAULT_BOARD` 가 이 자리였다. */
const DEFAULT_BOARD: SceneRow = { n: 8, dims: 4 };

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** 후보 수와 차원은 둘 다 1 이상의 정수라야 곱셈 수가 뜻을 갖는다. */
function readRow(raw: unknown, fallback: SceneRow): SceneRow {
  const row = fields(raw);
  if (row === null) return { n: fallback.n, dims: fallback.dims };
  const n = typeof row.n === 'number' && row.n > 0 ? Math.floor(row.n) : fallback.n;
  const dims = typeof row.dims === 'number' && row.dims > 0 ? Math.floor(row.dims) : fallback.dims;
  return { n, dims };
}

function readRows(raw: unknown, fallback: SceneRow): SceneRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => readRow(item, fallback));
}

// ── 파생. 화면에 뜨는 수는 전부 여기를 지난다 ───────────────────────────────

/** 한 줄이 치르는 곱셈 수. 이 조각이 세는 바로 그 값이다. */
export function totalOf(row: SceneRow): number {
  return row.n * row.dims;
}

/**
 * 기둥이 서 온 줄들, 선 차례대로.
 *
 * 마지막이 지금 선 줄이고 **앞의 것들은 눈금으로 남는다.** 손으로 센 32 가 바닥의
 * 실금이 되어도 화면을 떠나지 않는 것이 이 조각의 논증이다 — 작을 때의 값과
 * 커졌을 때의 값이 한 화면에 함께 서야 "못 감당한다" 가 보인다.
 */
export function pileRows(scene: CompareWithAllScene): SceneRow[] {
  if (!scene.fused) return [];
  const rows: SceneRow[] = [scene.board];
  for (let i = 0; i < scene.grown && i < scene.scales.length; i += 1) rows.push(scene.scales[i]);
  if (scene.scaled) rows.push(scene.real);
  return rows;
}

/** 호 위에 선 줄. 낱낱을 훑는 동안은 작은 판이고, 키운 뒤에는 그 줄이다. */
export function arcRow(scene: CompareWithAllScene): SceneRow {
  if (scene.scaled) return scene.real;
  if (scene.grown > 0) return scene.scales[scene.grown - 1] ?? scene.board;
  return scene.board;
}

/**
 * 낱낱의 후보가 아직 셀 수 있게 서 있나.
 *
 * 띠가 한 번 지나가면 알갱이는 삼켜지고 셀 수 있던 것이 셀 수 없게 된다 — 그것이
 * 이 조각이 수를 키우며 말하려는 바다.
 */
export function dotsAlive(scene: CompareWithAllScene): boolean {
  return scene.grown === 0 && !scene.scaled;
}

/**
 * 훑어 쌓인 곱셈 알갱이 수.
 *
 * 판에 깔리는 조각 수와 캡션이 말하는 수가 **이 함수 하나**를 지난다 (함정 34).
 */
export function grainCount(scene: CompareWithAllScene): number {
  return scene.swept * scene.board.dims;
}

/** 캡션이 말할 것. 문자가 아니라 **무엇을 말할지**와 그 인자다 (C10). */
export type CompareWithAllCaption =
  | { kind: 'none' }
  | { kind: 'sweep'; i: number; n: number; total: number }
  | { kind: 'fuse'; total: number }
  | { kind: 'grow'; n: number; dims: number; total: number }
  | { kind: 'real'; n: number; dims: number; total: number };

/**
 * 자취에서 곧바로 나온다 — `step` 을 읽지 않는다.
 *
 * 장면에 캡션 필드를 두지 않는다. 훑은 수와 굳었나·키운 수·끝까지 갔나가 걸음의
 * 갈래와 1 대 1 이므로 따로 실으면 같은 것을 두 번 말하는 꼴이 된다. 정적 그리기가
 * `step` 을 들추지 않는 것은 규율로만 지킬 수 있는 자리다 (S-scene).
 */
export function captionOf(scene: CompareWithAllScene): CompareWithAllCaption {
  if (scene.scaled) {
    return { kind: 'real', n: scene.real.n, dims: scene.real.dims, total: totalOf(scene.real) };
  }
  if (scene.grown > 0) {
    const row = arcRow(scene);
    return { kind: 'grow', n: row.n, dims: row.dims, total: totalOf(row) };
  }
  if (scene.fused) return { kind: 'fuse', total: totalOf(scene.board) };
  if (scene.swept === 0) return { kind: 'none' };
  return { kind: 'sweep', i: scene.swept, n: scene.board.n, total: grainCount(scene) };
}

export const compareWithAllScene: ScenePlan<CompareWithAllScene> = {
  /**
   * 첫 장면은 빈 판이다 — 후보가 호 위에 놓여 있을 뿐 아무것도 짚지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 좁히개가
   * **새 배열에 새 객체**를 담아 돌려주므로 러너의 자료를 참조로 쥐지 않는다.
   */
  initial(initialData: unknown): CompareWithAllScene {
    const d = fields(initialData) ?? {};
    const board = readRow(d.board, DEFAULT_BOARD);
    return atStart({
      board,
      scales: readRows(d.scales, board),
      // 선언에 없으면 작은 판을 그대로 쓴다 — 없는 줄을 지어내지 않는다.
      real: readRow(d.real, board),
    });
  },

  reduce(scene: CompareWithAllScene, event: FacetRuntimeEvent): CompareWithAllScene {
    switch (event.type) {
      /* 후보 하나를 견준다. 몇 번째인가는 훑음이 하나씩 쌓이므로 장면이 센다. */
      case 'sweep':
        if (scene.swept >= scene.board.n) return scene;
        return { ...scene, swept: scene.swept + 1, step: { kind: 'sweep' } };

      /* 작은 판을 다 훑었다. 낱낱의 곱셈이 한 더미로 굳는다. */
      case 'fuse':
        if (scene.fused) return scene;
        return { ...scene, fused: true, step: { kind: 'fuse' } };

      /*
       * 수를 키운다. 어느 줄로 키우는지는 선언의 `scales` 가 차례로 말하므로
       * 걸음은 한 칸 나아갔다는 것만 옮긴다.
       */
      case 'grow':
        if (!scene.fused || scene.scaled) return scene;
        if (scene.grown >= scene.scales.length) return scene;
        return { ...scene, grown: scene.grown + 1, step: { kind: 'grow' } };

      /* 실제 크기에 가까운 줄. 더미가 화면 밖으로 자란다. */
      case 'real-scale':
        if (!scene.fused || scene.scaled) return scene;
        return { ...scene, scaled: true, step: { kind: 'real' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (함정 15).
        return atStart({ board: scene.board, scales: scene.scales, real: scene.real });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
