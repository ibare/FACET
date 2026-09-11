/**
 * euclidean-stage — 직사각형에서 정사각형을 잘라 내고, 남은 것으로 파고든다.
 *
 * 그리는 것은 셋이다.
 *   1. 왼쪽 — 지금 다루는 직사각형. 작은 변을 한 변으로 하는 정사각형이 **자라
 *      나오며** 잘려 나가고, 남은 직사각형이 화면을 다시 채우도록 파고든다.
 *      호제법의 한 걸음이 곧 "재고 자른다" 라서 운동도 그 둘이 진다 — 자라는
 *      정사각형과 파고드는 변환이다.
 *   2. 가운데 — 처음 직사각형의 축소도. 잘라 낸 것이 거기 쌓인다. 왼쪽이 파고드는
 *      동안 이쪽은 그 조각이 전체에서 얼마나 작은지 보인다.
 *   3. 오른쪽 — 나눗셈 사다리. 한 줄이 한 번의 나눗셈이라 줄 수가 곧 걸음 수다.
 *
 * **세로는 마운트한 뒤 바뀌지 않는다** (S-view). 파고드는 것은 `viewBox` 가 아니라
 * 그림 안의 `transform` 이다.
 *
 * **손잡이 눈금을 자기 상수로 들지 않는다.** 어떤 쌍이 걸려 있는지는 선언이 정하고
 * (`facet.ts` 의 `initialData`), 이 파일은 `mount` 가 받은 두 수와 걸음마다 오는
 * payload 로만 그린다. stage 가 algorithm 을 참조할 수 없으므로 (원칙 1) 눈금을
 * 여기 다시 적고 싶어지는 자리인데, 그러면 선언과 갈려도 화면이 멀쩡해 보인다 —
 * 나눗셈 횟수만 맞으면 `(377,233)` 을 `(377,234)` 로 적어도 아무도 못 잡는다.
 * `test/euclidean.test.ts` 의 "눈금과 걸음" 이 셋을 한 검사로 묶는다.
 *
 * 애니메이션이 있으므로 메서드가 `Promise` 를 돌려주고 (S-view), `destroy()` 는
 * 걸어 둔 타이머를 거두고 **기다리던 것을 깨운다** (S-piece). 깨우지 않으면
 * projector 가 붙든 promise 때문에 `await ctx.emit` 이 영영 안 돌아온다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 320;

const LABEL_Y = 34;
const TOP = 46;
const BOTTOM = 266;

/** 왼쪽 — 파고드는 그림. */
const BOX_X = 20;
const BOX_W = 250;
const BOX_H = BOTTOM - TOP;

/** 가운데 — 축소도와 답. */
const MINI_X = 292;
const MINI_W = 148;
const MINI_H = 92;
const GCD_LABEL_Y = 176;
const GCD_VALUE_Y = 206;

/** 오른쪽 — 나눗셈 사다리. */
const LADDER_X = 452;
const LINE_H = 15;
const LADDER_MAX = Math.floor(BOX_H / LINE_H);

const CAPTION_Y = 300;

/** 판이 펴지는 시간, 정사각형 하나가 자라는 시간, 남은 것으로 파고드는 시간. */
const SETUP_MS = 340;
const CARVE_MS = 170;
const ZOOM_MS = 320;
const FRAME_MS = 16;

type Box = { x: number; y: number; w: number; h: number };
type View = { k: number; tx: number; ty: number };

/**
 * clipPath 는 문서 전역 id 로 참조된다. 한 글에 facet 이 여럿 박히면 같은 id 가
 * 겹쳐 엉뚱한 틀로 잘리므로 마운트마다 다른 이름을 쓴다.
 */
let nextClipId = 0;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  x: number,
  y: number,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
): SVGTextElement {
  return el('text', {
    x,
    y,
    'font-family': fonts.body,
    'font-size': size,
    fill,
    'text-anchor': anchor,
  });
}

function setBox(node: SVGRectElement, b: Box): void {
  node.setAttribute('x', String(b.x));
  node.setAttribute('y', String(b.y));
  node.setAttribute('width', String(Math.max(0, b.w)));
  node.setAttribute('height', String(Math.max(0, b.h)));
}

export const euclideanStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const init = params.initialData as Record<string, unknown> | undefined;
    const initA = typeof init?.a === 'number' ? init.a : 0;
    const initB = typeof init?.b === 'number' ? init.b : 0;

    // ── 기다림 관리 ────────────────────────────────────────────
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 0 → 1 을 ms 동안 흘려 보낸다. 접히면 끝 상태로 건너뛰고 곧바로 돌아온다. */
    function animate(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          step(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - started) / ms);
          if (t >= 1) {
            finish();
            return;
          }
          step(1 - Math.pow(1 - t, 3));
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 고정 층 ────────────────────────────────────────────────
    const squaresLabel = text(BOX_X, LABEL_Y, fontSizes.xs, colors.textMuted);
    squaresLabel.textContent = tr('label.squares', 'Squares');
    svg.appendChild(squaresLabel);

    const wholeLabel = text(MINI_X, LABEL_Y, fontSizes.xs, colors.textMuted);
    wholeLabel.textContent = tr('label.whole', 'Whole');
    svg.appendChild(wholeLabel);

    const ladderLabel = text(LADDER_X, LABEL_Y, fontSizes.xs, colors.textMuted);
    ladderLabel.textContent = tr('label.divisions', 'Divisions');
    svg.appendChild(ladderLabel);

    const gcdLabel = text(MINI_X, GCD_LABEL_Y, fontSizes.xs, colors.textMuted);
    gcdLabel.textContent = tr('label.gcd', 'GCD');
    svg.appendChild(gcdLabel);

    const gcdValue = text(MINI_X, GCD_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(gcdValue);

    svg.appendChild(
      el('rect', {
        x: BOX_X,
        y: TOP,
        width: BOX_W,
        height: BOX_H,
        fill: colors.bgSubtle,
        stroke: colors.border,
      }),
    );

    const caption = text(BOX_X, CAPTION_Y, fontSizes.sm, colors.text);
    svg.appendChild(caption);

    // ── 파고드는 층 ────────────────────────────────────────────
    const clipId = `euclidean-clip-${(nextClipId += 1)}`;
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('rect', { x: BOX_X, y: TOP, width: BOX_W, height: BOX_H }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const clipped = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(clipped);
    const zoomG = el('g', {});
    clipped.appendChild(zoomG);

    const miniG = el('g', {});
    svg.appendChild(miniG);
    const ladderG = el('g', {});
    svg.appendChild(ladderG);

    // ── 다시 지어지는 상태 ──────────────────────────────────────
    /** 지금 남은 직사각형. 처음 직사각형을 (0,0,a,b) 로 둔 좌표계다. */
    let unit: Box = { x: 0, y: 0, w: 0, h: 0 };
    /** 이번 걸음에 잘라 내고 남을 자리. `divide` 가 셈해 두고 `reduce` 가 쓴다. */
    let pending: Box | null = null;
    let origin: Box = { x: 0, y: 0, w: 0, h: 0 };
    let view: View = { k: 1, tx: 0, ty: 0 };
    let carved: { box: Box; rect: SVGRectElement }[] = [];
    let lastSquare: Box | null = null;
    let ladderLines: SVGTextElement[] = [];
    let baseRect: SVGRectElement | null = null;
    let workOutline: SVGRectElement | null = null;

    /** 한 직사각형이 왼쪽 틀을 가득 채우는 변환. */
    function fitOf(b: Box): View {
      const w = Math.max(1e-6, b.w);
      const h = Math.max(1e-6, b.h);
      const k = Math.min(BOX_W / w, BOX_H / h);
      return {
        k,
        tx: BOX_X + (BOX_W - w * k) / 2 - b.x * k,
        ty: TOP + (BOX_H - h * k) / 2 - b.y * k,
      };
    }

    function applyView(v: View): void {
      view = v;
      zoomG.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
    }

    function drawMini(): void {
      miniG.textContent = '';
      if (origin.w <= 0 || origin.h <= 0) return;
      const k = Math.min(MINI_W / origin.w, MINI_H / origin.h);
      const ox = MINI_X + (MINI_W - origin.w * k) / 2;
      const oy = TOP + (MINI_H - origin.h * k) / 2;
      const at = (b: Box): Record<string, number> => ({
        x: ox + b.x * k,
        y: oy + b.y * k,
        width: Math.max(0.5, b.w * k),
        height: Math.max(0.5, b.h * k),
      });
      miniG.appendChild(
        el('rect', { ...at(origin), fill: colors.itemDefault, stroke: colors.border }),
      );
      for (const c of carved) {
        miniG.appendChild(el('rect', { ...at(c.box), fill: colors.itemSorted, stroke: colors.bg }));
      }
      if (unit.w > 0 && unit.h > 0) {
        miniG.appendChild(el('rect', { ...at(unit), fill: colors.itemActive, stroke: colors.bg }));
      }
    }

    function layoutLadder(): void {
      for (let i = 0; i < ladderLines.length; i += 1) {
        const line = ladderLines[i];
        if (!line) continue;
        line.setAttribute('y', String(TOP + 11 + i * LINE_H));
        line.setAttribute('fill', i === ladderLines.length - 1 ? colors.text : colors.textMuted);
      }
    }

    function addLadderLine(content: string): void {
      const line = text(LADDER_X, TOP, fontSizes.xs, colors.text);
      line.textContent = content;
      ladderG.appendChild(line);
      ladderLines.push(line);
      // 다섯 손잡이 중 가장 긴 것이 열넷이라 틀에 딱 든다. 그래도 넘치면 위를
      // 버린다 — 늘려서 담으면 세로가 바뀐다 (S-view).
      while (ladderLines.length > LADDER_MAX) {
        const gone = ladderLines.shift();
        gone?.remove();
      }
      layoutLadder();
    }

    /** 이번 판의 두 수로 화면을 다시 짓는다. 세로는 건드리지 않는다. */
    function build(a: number, b: number): void {
      zoomG.textContent = '';
      ladderG.textContent = '';
      ladderLines = [];
      carved = [];
      lastSquare = null;
      pending = null;
      gcdValue.textContent = '';
      baseRect = null;
      workOutline = null;

      origin = { x: 0, y: 0, w: Math.max(0, a), h: Math.max(0, b) };
      unit = { ...origin };
      if (origin.w <= 0 || origin.h <= 0) {
        drawMini();
        return;
      }

      baseRect = el('rect', {
        fill: colors.itemDefault,
        stroke: colors.border,
        'vector-effect': 'non-scaling-stroke',
      });
      setBox(baseRect, origin);
      zoomG.appendChild(baseRect);

      workOutline = el('rect', {
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke',
      });
      setBox(workOutline, unit);
      zoomG.appendChild(workOutline);

      applyView(fitOf(unit));
      drawMini();
    }

    build(initA, initB);
    caption.textContent = tr('caption.setup', 'Start with two numbers: {a} and {b}.', {
      a: initA,
      b: initB,
    });

    return {
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },

      /**
       * 판을 세운다. 그냥 떠 있지 않고 **펴진다** — 첫 걸음이 정지 화면이면
       * 걸음 벽시계에서 그 한 칸만 읽을 것 없이 흘러간다.
       */
      async setup(a: number, b: number) {
        build(a, b);
        caption.textContent = tr('caption.setup', 'Start with two numbers: {a} and {b}.', { a, b });
        const rect = baseRect;
        const outline = workOutline;
        if (rect === null) return;
        await animate(SETUP_MS, (t) => {
          rect.setAttribute('width', String(origin.w * t));
          outline?.setAttribute('width', String(origin.w * t));
        });
      },

      /** 재서 자른다 — 작은 변을 한 변으로 하는 정사각형이 q 개 자라 나온다. */
      async divide(a: number, b: number, q: number, r: number, index: number) {
        const horizontal = unit.w >= unit.h;
        const cuts: Box[] = [];
        for (let i = 0; i < q; i += 1) {
          cuts.push(
            horizontal
              ? { x: unit.x + i * b, y: unit.y, w: b, h: b }
              : { x: unit.x, y: unit.y + i * b, w: b, h: b },
          );
        }
        pending = horizontal
          ? { x: unit.x + q * b, y: unit.y, w: r, h: unit.h }
          : { x: unit.x, y: unit.y + q * b, w: unit.w, h: r };

        addLadderLine(tr('value.division', '{a} = {q} × {b} + {r}', { a, q, b, r }));
        caption.textContent =
          r === 0
            ? tr('caption.exact', 'No remainder — it divides exactly. That square is the answer.')
            : tr('caption.divide', 'The smaller one fits {q} times. Remainder {r}.', { q, r });
        // index 는 사다리의 몇 번째 줄인지다. 줄을 이미 붙였으므로 여기서는 쓰지
        // 않는다 — payload 에 실려 오는 것은 projector 가 좁힌 값이 맞는지 보는
        // 자리가 테스트이기 때문이다.
        void index;

        for (const cut of cuts) {
          const rect = el('rect', {
            x: cut.x,
            y: cut.y,
            width: horizontal ? 0 : cut.w,
            height: horizontal ? cut.h : 0,
            fill: colors.itemActive,
            stroke: colors.bg,
            'vector-effect': 'non-scaling-stroke',
          });
          zoomG.insertBefore(rect, workOutline);
          // 재는 방향으로 자란다. 가로로 재면 폭이, 세로로 재면 높이가 자란다.
          await animate(CARVE_MS, (t) => {
            rect.setAttribute('width', String(horizontal ? cut.w * t : cut.w));
            rect.setAttribute('height', String(horizontal ? cut.h : cut.h * t));
          });
          carved.push({ box: cut, rect });
          lastSquare = cut;
        }
        drawMini();
      },

      /** 남은 것이 다음 짝이다 — 그쪽으로 파고든다. */
      async reduce(_a: number, b: number) {
        for (const c of carved) c.rect.setAttribute('fill', colors.itemSorted);

        const target = b > 0 ? pending : lastSquare;
        if (target === null) return;
        if (b <= 0) {
          // 남은 직사각형이 없다. 마지막 정사각형의 한 변이 곧 답이라 그것을 짚는다.
          const answer = carved[carved.length - 1];
          answer?.rect.setAttribute('fill', colors.itemPivot);
        }
        unit = { ...target };
        if (workOutline) setBox(workOutline, unit);

        const from = view;
        const to = fitOf(unit);
        await animate(ZOOM_MS, (t) => {
          applyView({
            k: from.k + (to.k - from.k) * t,
            tx: from.tx + (to.tx - from.tx) * t,
            ty: from.ty + (to.ty - from.ty) * t,
          });
        });
        drawMini();
      },

      showDone(gcd: number, divisions: number, quotientSum: number) {
        gcdValue.textContent = String(gcd);
        caption.textContent = tr(
          'caption.done',
          'The gcd is {g}. Divisions {n}, quotient sum {s}.',
          { g: gcd, n: divisions, s: quotientSum },
        );
      },

      reset() {
        build(initA, initB);
        caption.textContent = tr('caption.setup', 'Start with two numbers: {a} and {b}.', {
          a: initA,
          b: initB,
        });
      },
    };
  },
};
