/**
 * growth-outpaces stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 한 식이 한 막대다. 항 셋이 그 막대를 몫으로 나눠 갖고, n 이 커질수록 최고차항의
 * 경계가 오른쪽으로 미끄러져 나머지 둘을 벽에 밀어붙인다. 라벨은 제 몫 위에
 * 매달려 함께 끌려가고, 자리를 잃으면 지시선이 길게 늘어난다 — 밀려나는 것이
 * 눈에 보이게.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 축척을 몫(%)으로 잡은 것이 이 그림의 전제다
 *
 * 합이 111 에서 1,010,100 으로 자라 선형 축척으로는 한 화면에 들어오지 않고,
 * 로그를 쓰면 "먹어 치운다" 는 주장이 납작해진다. 몫으로 보이면 축척 문제가
 * 통째로 사라지고 주장만 남는다. 사라진 절대 크기는 머리의 `f(n) = …` 읽기와
 * 항마다의 값이 도로 말해 준다. 전제를 밝히는 것은 글의 일이므로 화면에 각주를
 * 두지 않는다 (S-piece).
 *
 * **축척을 두 군데서 정하지 않는다.** 막대는 언제나 몫 0~1 을 통째로 채우므로
 * 자의 양 끝이 곧 0% 와 100% 이고, 그 잣대는 `sharesOf` 하나를 지난다. 단마다
 * 축을 다시 잡으면 앞 단의 눈금이 거짓말을 한다.
 *
 * ── 자취가 남아야 *결국*이 보인다
 *
 * 옛 화면은 단마다 막대를 통째로 갈아 끼웠고, 자 위의 발자국 여섯이 **다 같은
 * 색**이었다. 그래서 다 끝난 화면에 *어느 단까지 상수가 가장 컸는지* 도
 * *어디가 갈림목인지* 도 남지 않았다 — "결국 앞지른다" 에서 *결국*이 빠진 것이다.
 *
 * 두 축을 갈라 놓았다 (프로토콜 4 절 — 채움과 표식은 부딪히지 않는다).
 *
 * - **채움(눈금의 색) = 값의 형편** — 그 단에서 가장 컸던 항의 색.
 * - **표식(테를 두른 고리) = 갈림목** — 세 항이 정확히 같아진 단.
 *
 * 같은 잣대가 막대에도 걸린다 — 가장 큰 항만 제 잉크를 온전히 쓰고 나머지는 한
 * 단계 밝다 (S-view 결정 트리 5).
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 막대가 지금 선 폭은 `let widths` 에, 마지막으로 그린 단은 `let current` 에,
 * 발자국을 몇 개 떨궜나는 `trailLayer` 의 **자식 유무**에 있었다. 특히 `widths` 는
 * `getAttribute` 를 쓰지 않을 뿐 화면의 지금 자리를 따로 적어 둔 **거울**이라,
 * 되짚어 세운 직후에는 옛 화면의 폭에서 몫이 출발했다. 이제 장면의 `rungs` 가
 * 그것을 전부 말하고, 출발 폭은 **앞 단**에서 셈한다 (`previousRung`).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는
 * 값이라 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 수식 표기(`n²` · `O(n²)`)는 표식이라 번역하지 않는다 (C10). 문장인 캡션은
 * `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  shiftLightness,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionFor,
  currentRung,
  pctOf,
  previousRung,
  rungAt,
  sharesOf,
  type GrowthOutpacesScene,
} from './scene.js';
import type { GrowthRung } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). 가로는 러너가 준다. */
const H = 196;
const W = PIECE_CANVAS_W;

const SIDE = 30;
const BAR_X = SIDE;
const BAR_W = W - SIDE * 2;
const BAR_Y = 70;
const BAR_H = 54;

const HEAD_Y = 26;
const LABEL_Y = 52;
const TRAIL_Y = 142;
const TRAIL_LABEL_Y = 158;
const CAP_Y = 182;

/** 자 위에 선 눈금의 길이. 위아래로 반씩 걸친다. */
const TICK_LEN = 8;
/** 갈림목을 두르는 고리의 반지름. */
const TIE_RING_R = 5;

/** 라벨 사이의 최소 틈. 좁아지면 밀어낸다. */
const LABEL_GAP = 10;
/** 막대 안에 몫을 적을 수 있는 최소 폭. */
const PCT_MIN_W = 46;

const SLIDE_MS = 460;
const DROP_MS = 160;
const COLLAPSE_MS = 520;
const FRAME_MS = 16;

/** 접히는 항 라벨이 아래로 흘러내리는 거리. */
const FADE_DROP = 14;

type Widths = [number, number, number];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 자릿수가 폭을 먹는 자리라 천 단위를 끊어 준다. 도식 위의 표식이다 (C10). */
function group(value: number): string {
  const sign = value < 0 ? '-' : '';
  const digits = Math.abs(Math.round(value)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
}

/** 계수에서 항의 이름을 만든다. 수식 표기는 표식이라 키를 만들지 않는다 (C10). */
function termNames(scene: GrowthOutpacesScene): [string, string, string] {
  const quad = scene.quadratic === 1 ? 'n²' : `${scene.quadratic}n²`;
  const lin = scene.linear === 1 ? 'n' : `${scene.linear}n`;
  return [quad, lin, `${scene.constant}`];
}

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * 세 몫이 차지하는 막대의 가로.
 *
 * 몫은 장면이 내고 (`sharesOf`) 가로는 캔버스에서 역산한다 — 장면에 좌표가 없는
 * 까닭이다 (S-piece). 셋째 몫은 남은 자리를 다 받아 이음매에 틈이 생기지 않게 한다.
 */
function widthsOf(rung: GrowthRung | null, settled: boolean): Widths {
  if (settled) return [BAR_W, 0, 0];
  if (rung === null) return [0, 0, 0];
  const shares = sharesOf(rung);
  const w0 = shares[0] * BAR_W;
  const w1 = shares[1] * BAR_W;
  return [w0, w1, Math.max(0, BAR_W - w0 - w1)];
}

/** 정적 그리기가 세운 항 라벨 한 벌. 지시선과 막대 안의 몫이 딸린다. */
type DrawnTerms = {
  labels: SVGTextElement[];
  leaders: SVGLineElement[];
  pct: SVGTextElement;
  /** 글자 폭의 절반. 밀어내기가 쓰는 어림이라 한 번만 잰다. */
  halves: number[];
};

/** 자 위에 선 눈금 하나. 고리는 갈림목에만 있다. */
type DrawnTick = { line: SVGLineElement; mark: SVGTextElement; ring: SVGCircleElement | null };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  segs: SVGRectElement[];
  /** 최고차항만 남은 화면에는 항 라벨이 없다. */
  terms: DrawnTerms | null;
  /** 최고차항만 남은 화면에만 있다. */
  bigO: SVGTextElement | null;
  /** 방금 밟은 단의 눈금. 아직 아무 단도 안 밟았으면 null. */
  newest: DrawnTick | null;
};

export const growthOutpacesStageView: CanvasView = {
  canvas: { height: H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 이 그림은 캔버스
  // 안쪽에만 그리므로 컨테이너를 건드리지 않는다 — 비우면 그 캔버스가 떨어져
  // 나가 화면이 통째로 빈다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GrowthOutpacesScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // 항 셋은 서로를 가리는 세 범주다 → categorical (S-view 결정 트리 3).
    // 셋은 바탕이 정하는 수라 걸음마다 다시 세지 않는다 — 씨앗이 흔들리면 이미
    // 칠한 항의 색이 바뀐다 (프로토콜 4 절).
    const hues = categorical(3, 'vivid');
    const hueOf = (i: number): string => hues[i] ?? colors.itemDefault;
    // 가장 큰 항만 제 색을 온전히 쓰고 나머지는 한 단계 밝힌다 (결정 트리 5).
    const dimOf = (i: number): string => shiftLightness(hueOf(i), 0.12);

    // 마운트마다 한 번 정한다. 걸음마다 새로 지으면 같은 장면이 다른 화면이 된다.
    const clipId = `growth-outpaces-clip-${Math.random().toString(36).slice(2, 9)}`;

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gDefs = el('g', {});
    const gHead = el('g', {});
    const gBar = el('g', {});
    const gTerms = el('g', {});
    const gFade = el('g', {});
    const gTrail = el('g', {});
    const gCaption = el('g', {});
    const layers = [gDefs, gHead, gBar, gTerms, gFade, gTrail, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 마디 둘(미끄러짐 · 떨굼)을 잇달아 지난다. 가운데에 `destroy` 가
     * 끼어들면 남은 타이머가 이미 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음마다의 운동. 타이머를 걸고 destroy 가 일괄로 거둔다.
     *
     * rAF 가 아니라 타이머인 것은 옛 stage 를 그대로 물려받은 것이다 — 벽시계로
     * 도는 상시 루프가 아니라 걸음 안에서 시작하고 끝나므로 되짚기가 흔들리지
     * 않는다 (프로토콜 4 절의 상시 rAF 금지와는 다른 자리다).
     */
    function tween(durationMs: number, mine: number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 기다리던 약속은 반드시 푼다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = durationMs <= 0 ? 1 : Math.min(1, (Date.now() - started) / durationMs);
          apply(easeInOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 타이머를 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    /** 라벨이 겹치면 밀어내고, 벽에 닿으면 되민다. */
    function placeLabels(centers: number[], halves: number[]): number[] {
      const out = centers.slice();
      for (let i = 1; i < out.length; i += 1) {
        const min = out[i - 1]! + halves[i - 1]! + LABEL_GAP + halves[i]!;
        if (out[i]! < min) out[i] = min;
      }
      let rightLimit = W - 4;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        const max = rightLimit - halves[i]!;
        if (out[i]! > max) out[i] = max;
        rightLimit = out[i]! - halves[i]! - LABEL_GAP;
      }
      let leftLimit = 4;
      for (let i = 0; i < out.length; i += 1) {
        const min = leftLimit + halves[i]!;
        if (out[i]! < min) out[i] = min;
        leftLimit = out[i]! + halves[i]! + LABEL_GAP;
      }
      return out;
    }

    /**
     * 주어진 폭으로 막대·라벨·지시선을 놓는다.
     *
     * 자리를 **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금
     * 좌표를 읽으면 순회 순서가 숨은 상태가 된다 (프로토콜 4 절).
     */
    function place(segs: SVGRectElement[], terms: DrawnTerms | null, widths: Widths): void {
      let x = BAR_X;
      const centers: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const w = Math.max(0, widths[i]!);
        segs[i]!.setAttribute('x', String(x));
        segs[i]!.setAttribute('width', String(w));
        centers.push(x + w / 2);
        x += w;
      }
      if (terms === null) return;

      const placed = placeLabels(centers, terms.halves);
      for (let i = 0; i < 3; i += 1) {
        terms.labels[i]!.setAttribute('x', String(placed[i]!));
        terms.leaders[i]!.setAttribute('x1', String(placed[i]!));
        terms.leaders[i]!.setAttribute('x2', String(centers[i]!));
      }

      const quadW = Math.max(0, widths[0]!);
      // 몫을 적을 자리가 없으면 적지 않는다. 정적 경로와 운동 경로가 같은 한
      // 줄을 지나므로 어느 쪽에서 와도 같은 화면이 된다 (프로토콜 4 절).
      terms.pct.setAttribute('x', String(BAR_X + quadW / 2));
      terms.pct.setAttribute('opacity', quadW >= PCT_MIN_W ? '1' : '0');
    }

    /** 항 라벨 한 벌을 짓는다. 정적 그리기와 접히는 운동이 같은 모양을 쓴다. */
    function buildTerms(
      parent: SVGGElement,
      scene: GrowthOutpacesScene,
      rung: GrowthRung,
    ): DrawnTerms {
      const names = termNames(scene);
      const values = [rung.quad, rung.lin, rung.cons];
      const texts = [0, 1, 2].map((i) => `${names[i]} = ${group(values[i]!)}`);
      const halves = texts.map((s) => (s.length * Number.parseFloat(fontSizes.sm) * 0.6) / 2);

      const leaders = [0, 1, 2].map((i) =>
        el('line', {
          x1: BAR_X,
          y1: LABEL_Y + 5,
          x2: BAR_X,
          y2: BAR_Y - 3,
          stroke: hueOf(i),
          'stroke-width': 1,
        }),
      );
      const labels = [0, 1, 2].map((i) => {
        const node = el('text', {
          x: BAR_X,
          y: LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          // 가장 큰 항만 제 잉크를 쓰고 나머지는 흐려진다.
          fill: i === rung.topIndex ? colors.text : colors.textMuted,
        });
        node.textContent = texts[i]!;
        return node;
      });
      const pct = el('text', {
        x: BAR_X,
        y: BAR_Y + BAR_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.stateInk,
      });
      pct.textContent = `${pctOf(rung.share)}%`;

      for (const l of leaders) parent.appendChild(l);
      for (const l of labels) parent.appendChild(l);
      parent.appendChild(pct);
      return { labels, leaders, pct, halves };
    }

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: GrowthOutpacesScene): Drawn {
      rewind();

      const rung = currentRung(scene);
      const widths = widthsOf(rung, scene.settled);

      // ── 머리 읽기 — 지금의 n 과 그 자리의 합. 접힌 뒤에도 마지막 단을 읽는다.
      const nText = el('text', {
        x: BAR_X,
        y: HEAD_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      const sumText = el('text', {
        x: BAR_X + BAR_W,
        y: HEAD_Y,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
      });
      nText.textContent = rung === null ? '' : `n = ${group(rung.n)}`;
      sumText.textContent = rung === null ? '' : `f(n) = ${group(rung.sum)}`;
      gHead.appendChild(nText);
      gHead.appendChild(sumText);

      // ── 막대 — 빈 테두리가 서고 그 안이 세 몫으로 찬다.
      const clip = el('clipPath', { id: clipId });
      clip.appendChild(el('rect', { x: BAR_X, y: BAR_Y, width: BAR_W, height: BAR_H, rx: 4 }));
      const defs = el('defs', {});
      defs.appendChild(clip);
      gDefs.appendChild(defs);

      const segLayer = el('g', { 'clip-path': `url(#${clipId})` });
      const top = scene.settled ? 0 : (rung?.topIndex ?? -1);
      const segs = [0, 1, 2].map((i) =>
        el('rect', {
          x: BAR_X,
          y: BAR_Y,
          width: 0,
          height: BAR_H,
          fill: i === top ? hueOf(i) : dimOf(i),
        }),
      );
      for (const s of segs) segLayer.appendChild(s);
      gBar.appendChild(segLayer);
      gBar.appendChild(
        el('rect', {
          x: BAR_X,
          y: BAR_Y,
          width: BAR_W,
          height: BAR_H,
          rx: 4,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      // ── 항 라벨. 최고차항만 남은 화면에는 지을 것이 없다 (짓지 않는다, 숨기지 않는다).
      const terms = rung !== null && !scene.settled ? buildTerms(gTerms, scene, rung) : null;

      // ── 접힌 뒤의 이름. 조각의 결론이 남는 자리다.
      let bigO: SVGTextElement | null = null;
      if (scene.settled) {
        bigO = el('text', {
          x: BAR_X + BAR_W / 2,
          y: BAR_Y + BAR_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: colors.stateInk,
        });
        bigO.textContent = `O(${termNames(scene)[0]})`;
        gTerms.appendChild(bigO);
      }

      place(segs, terms, widths);

      // ── 자와 발자국 — 단마다 최고차항의 경계가 어디까지 왔는지 남는다.
      gTrail.appendChild(
        el('line', {
          x1: BAR_X,
          y1: TRAIL_Y,
          x2: BAR_X + BAR_W,
          y2: TRAIL_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      let newest: DrawnTick | null = null;
      scene.rungs.forEach((kind, i) => {
        const r = rungAt(scene, i);
        if (r === null) return;
        const x = BAR_X + sharesOf(r)[0] * BAR_W;
        // 채움 = 값의 형편. 그 단에서 가장 컸던 항의 색이다.
        const line = el('line', {
          x1: x,
          y1: TRAIL_Y - TICK_LEN / 2,
          x2: x,
          y2: TRAIL_Y + TICK_LEN / 2,
          stroke: hueOf(r.topIndex),
          'stroke-width': 2,
        });
        const mark = el('text', {
          x: Math.min(W - 12, Math.max(12, x)),
          y: TRAIL_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        mark.textContent = `${r.n}`;
        // 표식 = 갈림목. 채움과 축이 달라 둘이 부딪히지 않는다 (프로토콜 4 절).
        const ring =
          kind === 'tie'
            ? el('circle', {
                cx: x,
                cy: TRAIL_Y,
                r: TIE_RING_R,
                fill: 'none',
                stroke: colors.text,
                'stroke-width': 1.5,
              })
            : null;
        gTrail.appendChild(line);
        if (ring !== null) gTrail.appendChild(ring);
        gTrail.appendChild(mark);
        if (i === scene.rungs.length - 1) newest = { line, mark, ring };
      });

      // ── 캡션.
      const caption = el('text', {
        x: BAR_X,
        y: CAP_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      caption.textContent = captionText(scene);
      gCaption.appendChild(caption);

      return { segs, terms, bigO, newest };
    }

    function captionText(scene: GrowthOutpacesScene): string {
      const c = captionFor(scene);
      if (c === null) return '';
      switch (c.kind) {
        case 'begin':
          return t(
            'caption.begin',
            'One formula, three terms, one bar. At n = {n} the largest term holds {pct}% of it.',
            { n: c.n, pct: pctOf(c.pct) },
          );
        case 'rung':
          return t('caption.rung', 'n = {n} — n² now takes {pct}% of the bar.', {
            n: c.n,
            pct: pctOf(c.pct),
          });
        case 'tie':
          return t(
            'caption.tie',
            'n = {n} — the three terms are exactly equal. Each one is {each}. This is the tipping point.',
            { n: c.n, each: c.each },
          );
        case 'settle':
          return t('caption.settle', 'Only n² is left. Dropping the smaller terms is what O(n²) means.');
      }
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /**
     * 사다리를 한 단 오른다.
     *
     * 출발 폭은 **앞 단**에서 셈한다 — `prev` 장면에서 꺼내지 않는다 (S-scene).
     * 눈금은 정적 그리기가 이미 자 위에 세워 두었으므로, 아직 안 온 만큼을 뒤로
     * 물려 막대 밑에 붙였다가 제자리로 떨어뜨린다.
     */
    async function flowClimb(
      scene: GrowthOutpacesScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const rung = currentRung(scene);
      if (rung === null) return;
      const to = widthsOf(rung, false);
      const from = widthsOf(previousRung(scene), false);
      const tick = drawn.newest;
      const park = BAR_Y + BAR_H;

      if (tick !== null) {
        tick.line.setAttribute('y1', String(park));
        tick.line.setAttribute('y2', String(park + TICK_LEN));
        tick.mark.setAttribute('opacity', '0');
        tick.ring?.setAttribute('opacity', '0');
      }

      await tween(SLIDE_MS, mine, (e) => {
        place(drawn.segs, drawn.terms, [
          from[0] + (to[0] - from[0]) * e,
          from[1] + (to[1] - from[1]) * e,
          from[2] + (to[2] - from[2]) * e,
        ]);
      });
      if (!alive(mine) || tick === null) return;

      await tween(DROP_MS, mine, (e) => {
        const y = park + (TRAIL_Y - TICK_LEN / 2 - park) * e;
        tick.line.setAttribute('y1', String(y));
        tick.line.setAttribute('y2', String(y + TICK_LEN));
        tick.mark.setAttribute('opacity', String(e));
        tick.ring?.setAttribute('opacity', String(e));
      });
    }

    /**
     * 작은 항 둘을 지우고 최고차항이 벽까지 밀고 간다.
     *
     * 접히는 항 라벨은 정적 그리기가 이미 지운 것들이라 임시로 다시 짓는다 —
     * 운동이 끝나면 마지막 `drawStatic` 이 통째로 걷어 간다.
     */
    async function flowSettle(
      scene: GrowthOutpacesScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const rung = currentRung(scene);
      if (rung === null) return;
      const from = widthsOf(rung, false);
      const fading = buildTerms(gFade, scene, rung);

      place(drawn.segs, fading, from);
      drawn.bigO?.setAttribute('opacity', '0');

      await tween(COLLAPSE_MS, mine, (e) => {
        place(drawn.segs, fading, [
          from[0] + (BAR_W - from[0]) * e,
          from[1] * (1 - e),
          from[2] * (1 - e),
        ]);
        const alpha = String(1 - e);
        for (let i = 0; i < 3; i += 1) {
          fading.labels[i]!.setAttribute('opacity', alpha);
          fading.leaders[i]!.setAttribute('opacity', alpha);
          // 작은 항 둘은 흘러내리며 사라진다 — 지워지는 것이 무엇인지 보이게.
          if (i > 0) {
            fading.labels[i]!.setAttribute('transform', `translate(0,${(FADE_DROP * e).toFixed(2)})`);
          }
        }
        fading.pct.setAttribute('opacity', alpha);
        // 이름은 몫이 거의 다 찬 뒤에야 떠오른다.
        drawn.bigO?.setAttribute('opacity', String(Math.max(0, e * 2 - 1)));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: GrowthOutpacesScene,
      _prev: GrowthOutpacesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      if (step.kind === 'climb') await flowClimb(next, drawn, mine);
      else await flowSettle(next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
      },
    };
  },
};
