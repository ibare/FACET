/**
 * space-error-tradeoff stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대 (질문의 동사에서 나왔다 — **좁아지고 부푼다**)
 *
 *   1. 표가 **갈라진다.** 폭이 2 → 4 → 8 로 가면 칸 하나가 둘로 나뉘어 좌우로
 *      미끄러져 나간다. 칸 폭은 그대로이므로 표 자체가 가운데에서 바깥으로
 *      넓어진다 — 좁았다는 사실이 넓어지는 운동으로 드러난다.
 *   2. 막대가 **내려앉는다.** 읽힌 값은 참값 선 위로 솟아 있고, 표가 넓어질
 *      때마다 제자리에서 아래로 흘러내린다. 내려앉기 전 높이는 흐린 눈금으로
 *      남아, 부풀었던 만큼이 같은 자 위에 쌓인다 (S-piece "잰 값은 재는 그
 *      자리에 남긴다" — 견줌의 기준이 같은 계기 위에 있어야 한다).
 *   3. 마지막 걸음은 **부풀었다 내려앉는다.** 가장 좁았을 때의 높이까지 한 번
 *      솟았다가 지금 높이로 돌아온다 — 결론이 말하는 두 수가 한 몸짓이 된다.
 *      이름만 붙이고 마는 걸음을 두지 않기 위한 얇은 운동이다 (프로토콜 4 절).
 *
 * 막대의 세로 축척은 장면의 바탕이 정하고 걸음마다 바뀌지 않는다. 축척이
 * 걸음마다 달라지면 흐린 눈금이 거짓말을 하게 된다. 상한은 `키 수 × 반복 수`
 * (`totalOf`) — 칸 하나가 스트림 전부를 이고 있는 경우이며 어떤 읽힌 값도
 * 이것을 넘을 수 없다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 표가 지금 몇 칸인가는 `let curWidth` 에, 막대가 선 높이는 `let curEstimates` 에,
 * 칸이 어디서 나왔고 무슨 값을 이고 있나는 `CellNode` 라는 **DOM 손잡이와 수치가
 * 한 객체에 묶인** 배열에, 흐린 눈금을 몇 벌 남겼나는 `ghostGroup` 의 자식 유무에
 * 있었다. 이제 장면의 `passes` 가 그것을 전부 말하므로 **정적 그리기가 통째로
 * 세운다** — 되짚어 그 걸음에 가도 표의 폭과 쌓인 눈금이 그대로 남는다.
 *
 * ── 화면에 뜨는 수는 모두 표에서 나온다
 *
 * 막대의 높이는 `estimatesOf` 가 **그려진 칸에서** 읽고, 캡션의 부푼 양 · 정확히
 * 맞은 수 · 칸 수 · 센 항목 수도 모두 `scene.ts` 의 같은 함수를 지난다. 걸음이
 * 실어 오는 것은 칸 값과 앉는 자리뿐이다 (`scene.ts` 의 "수는 한 출처에서만").
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는
 * 값이라 이 파일이 상수로 갖는다 (S-piece). 색은 전부 design-tokens 경유다 (S-view).
 *
 * 줄 이름 `r0` 은 해시 첨자 표기라 번역하지 않는다 (C10 — 수식·기호는 표식).
 * 문장인 캡션은 `params.t` 로 만든다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  cellsOf,
  currentPass,
  depthOf,
  estimatesOf,
  exactCountOf,
  overshootOf,
  readPasses,
  totalOf,
  widthOf,
  type SpaceErrorTradeoffScene,
  type TradeoffStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캡션 두 줄 · 표 세 줄 · 막대 자가 들어가는 높이. 마운트 뒤로 바뀌지 않는다 (S-view). */
const CANVAS_H = 338;

const CAPTION_X = 24;
const CAPTION_Y1 = 20;
const CAPTION_Y2 = 38;
const CAPTION_LINES = 2;

/** 칸 폭의 **상한**만 둔다. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 62;
const CELL_H = 32;
const TABLE_SIDE_MIN = 30;
const TABLE_TOP = 54;
const LOAD_STRIP_H = 4;
/** 줄 이름이 표 왼쪽에서 떨어져 앉는 거리. */
const ROW_LABEL_GAP = 10;

const BAR_BASE_Y = 306;
const BAR_MAX_H = 148;
const BAR_SIDE = 56;
const BAR_MAX_W = 48;
const KEY_LABEL_Y = 322;

const SPLIT_MS = 420;
const FILL_MS = 460;
const BAR_MS = 520;
/** 결론의 얇은 운동. 솟았다 돌아오는 한 몸짓이라 짧게 둔다 (프로토콜 4 절). */
const SWELL_MS = 300;

/** 줄 이름은 해시 첨자 표기라 번역하지 않는다 (C10 — 수식·기호는 표식). */
const ROW_LABEL_PREFIX = 'r';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 한글·한자·가나는 라틴보다 넓다. 캡션 줄바꿈을 재기 위한 어림이다. */
function charWidth(ch: string): number {
  return /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿︰-﹏＀-｠]/.test(ch) ? 13.5 : 7.2;
}

function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let curWidth = 0;
  let lastSpace = -1;

  for (const ch of text) {
    const w = charWidth(ch);
    if (cur !== '' && curWidth + w > maxWidth) {
      if (lastSpace > 0) {
        lines.push(cur.slice(0, lastSpace));
        cur = cur.slice(lastSpace + 1);
      } else {
        lines.push(cur);
        cur = '';
      }
      curWidth = 0;
      for (const c of cur) curWidth += charWidth(c);
      lastSpace = -1;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
    if (ch === ' ') lastSpace = cur.length;
    cur += ch;
    curWidth += w;
  }
  if (cur !== '') lines.push(cur);
  return lines.slice(0, maxLines);
}

/**
 * 정적 그리기가 셈한 자리. 장면에는 좌표가 없으므로 매번 여기서 낸다 (S-piece).
 *
 * 폭은 `widths` 의 가장 넓은 것에서 한 번 역산한다 — 걸음마다 다시 재면 표가
 * 넓어질 때 칸이 함께 줄어들어 "넓어진다" 가 화면에서 사라진다.
 */
type Geom = {
  cellW: number;
  barW: number;
  /** 막대 세로 축척의 상한. */
  total: number;
  originX: (width: number) => number;
  barCenter: (i: number) => number;
  valueY: (v: number) => number;
};

/**
 * 표의 칸 하나.
 *
 * 줄·칸 번호만 지닌다 — 값도 출발 자리도 장면과 `Geom` 에서 다시 셈하므로
 * 손잡이에 수치를 얹지 않는다.
 */
type DrawnCell = {
  rect: SVGRectElement;
  label: SVGTextElement;
  strip: SVGRectElement;
  row: number;
  col: number;
};

/** 막대 하나 — 참값까지의 몸통, 그 위로 솟은 부푼 몫, 읽힌 값. */
type DrawnBar = { base: SVGRectElement; over: SVGRectElement; value: SVGTextElement };

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  cells: DrawnCell[];
  rowLabels: SVGTextElement[];
  bars: DrawnBar[];
};

export const spaceErrorTradeoffStageView: CanvasView = {
  canvas: { height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SpaceErrorTradeoffScene> {
    const svg = params.canvas;
    const C = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gCaption = el('g', {});
    const gTable = el('g', {});
    const gFrame = el('g', {});
    const gGhost = el('g', {});
    const gBars = el('g', {});
    svg.append(gCaption, gTable, gFrame, gGhost, gBars);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 되짚기가 끼어들면 남은 프레임과
     * **운동 뒤의 다시 세우기**가 이미 새로 선 화면을 덮으므로, 마디마다 자기
     * 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는
     * 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        // 첫 마디를 곧바로 그린다 — rAF 를 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: SpaceErrorTradeoffScene): Geom {
      let maxWidth = 1;
      for (const w of scene.widths) if (w > maxWidth) maxWidth = w;

      // 남는 폭을 좌우 여백으로 버리지 않는다 — 칸 폭을 캔버스에서 역산한다 (S-piece).
      const cellW = Math.max(
        8,
        Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - TABLE_SIDE_MIN * 2) / maxWidth)),
      );
      const keyCount = Math.max(1, scene.keys.length);
      const slotW = (PIECE_CANVAS_W - BAR_SIDE * 2) / keyCount;
      const barW = Math.max(12, Math.min(BAR_MAX_W, Math.floor(slotW - 16)));
      const total = totalOf(scene);

      return {
        cellW,
        barW,
        total,
        originX: (width: number): number =>
          width <= 0
            ? (PIECE_CANVAS_W - cellW) / 2
            : Math.round((PIECE_CANVAS_W - width * cellW) / 2),
        barCenter: (i: number): number => BAR_SIDE + slotW * i + slotW / 2,
        valueY: (v: number): number => BAR_BASE_Y - (v / total) * BAR_MAX_H,
      };
    }

    /**
     * 갈라지기 전의 칸 중 어느 것에서 나왔는가 — 그 자리가 곧 출발 자리다.
     *
     * 앞 폭은 장면의 앞 표가 말한다. `prev` 를 들추지 않는다 (S-scene).
     */
    function birthX(geom: Geom, col: number, width: number, prevWidth: number): number {
      if (prevWidth <= 0 || width <= 0) return (PIECE_CANVAS_W - geom.cellW) / 2;
      return geom.originX(prevWidth) + Math.floor((col * prevWidth) / width) * geom.cellW;
    }

    // ── 칠 ────────────────────────────────────────────────────────────────

    function setCellX(geom: Geom, cell: DrawnCell, x: number): void {
      cell.rect.setAttribute('x', String(x));
      cell.label.setAttribute('x', String(x + geom.cellW / 2));
      cell.strip.setAttribute('x', String(x + 1));
    }

    /**
     * 칸에 든 셈. 참값을 넘긴 칸은 남의 셈까지 이고 있다는 뜻이라 붉게 쓴다.
     *
     * 정적 그리기와 채우는 운동이 같은 함수를 지난다 (S-scene 의 "걸음 함수를
     * 버리지 않는다").
     */
    function paintCount(
      scene: SpaceErrorTradeoffScene,
      geom: Geom,
      cell: DrawnCell,
      shown: number,
    ): void {
      const rounded = Math.round(shown);
      cell.label.textContent = String(rounded);
      cell.label.setAttribute(
        'fill',
        rounded === 0 ? C.textMuted : rounded > scene.repeats ? C.danger : C.text,
      );
      const ratio = Math.min(1, shown / geom.total);
      cell.strip.setAttribute('width', String(Math.max(0, ratio * (geom.cellW - 2))));
    }

    /** 막대 하나를 그 높이에 세운다. 참값까지가 몸통이고 그 위가 부푼 몫이다. */
    function drawBar(geom: Geom, bar: DrawnBar, v: number, truth: number): void {
      const solidTop = geom.valueY(Math.min(v, truth));
      const top = geom.valueY(v);
      bar.base.setAttribute('y', String(solidTop));
      bar.base.setAttribute('height', String(Math.max(0, BAR_BASE_Y - solidTop)));
      bar.over.setAttribute('y', String(top));
      bar.over.setAttribute('height', String(Math.max(0, solidTop - top)));
      bar.value.setAttribute('y', String(top - 6));
      bar.value.textContent = v <= 0 ? '' : String(Math.round(v));
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 수는 하나도 장면에 실려 오지 않는다 — 표의 꼴과 읽힌 값에서 여기서 센다.
     * 그러니 캡션의 수와 화면의 칸·막대가 갈릴 자리가 없다.
     */
    function captionFor(scene: SpaceErrorTradeoffScene): string {
      const cap = scene.caption;
      if (cap === null) return '';
      const pass = currentPass(scene);

      switch (cap.kind) {
        case 'stage': {
          if (pass === null) return '';
          return t(
            'caption.stage',
            'Width {width}: {depth} rows x {width} columns = {cells} cells. Items counted: {total}.',
            {
              width: widthOf(pass),
              depth: depthOf(pass),
              cells: cellsOf(pass),
              total: totalOf(scene),
            },
          );
        }

        case 'reads': {
          if (pass === null) return '';
          const estimates = estimatesOf(scene, pass);
          return t(
            'caption.reads',
            'Reading all {keyCount} keys back. Overshoot total: {errorSum}. Exact hits: {exact}.',
            {
              keyCount: scene.keys.length,
              errorSum: overshootOf(scene, estimates),
              exact: exactCountOf(scene, estimates),
            },
          );
        }

        case 'done': {
          // 견줌의 양 끝 — 선언이 폭을 좁은 것부터 주므로 첫 표가 가장 좁다.
          const read = readPasses(scene);
          const narrowest = read[0];
          const widest = read[read.length - 1];
          if (narrowest === undefined || widest === undefined) return '';
          return t(
            'caption.done',
            'Narrower table, more swollen reads. Overshoot at {cellsMin} cells: {errorMax}. At {cellsMax} cells: {errorMin}.',
            {
              cellsMin: cellsOf(narrowest),
              errorMax: overshootOf(scene, estimatesOf(scene, narrowest)),
              cellsMax: cellsOf(widest),
              errorMin: overshootOf(scene, estimatesOf(scene, widest)),
            },
          );
        }
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gCaption, gTable, gFrame, gGhost, gBars]) g.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: SpaceErrorTradeoffScene): Drawn {
      rewind();
      const geom = geomOf(scene);

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const lines = wrapText(captionFor(scene), PIECE_CANVAS_W - CAPTION_X * 2, CAPTION_LINES);
      [CAPTION_Y1, CAPTION_Y2].forEach((y, i) => {
        const node = el('text', {
          x: CAPTION_X,
          y,
          fill: C.text,
          'font-size': fontSizes.md,
          'text-anchor': 'start',
        });
        node.textContent = lines[i] ?? '';
        gCaption.appendChild(node);
      });

      // ── 막대 자. 축척이 걸음마다 바뀌지 않으므로 눈금이 거짓말하지 않는다.
      gFrame.appendChild(
        el('line', {
          x1: BAR_SIDE - 10,
          y1: BAR_BASE_Y,
          x2: PIECE_CANVAS_W - BAR_SIDE + 10,
          y2: BAR_BASE_Y,
          stroke: C.border,
          'stroke-width': 1,
        }),
      );

      const truthY = geom.valueY(scene.repeats);
      gFrame.appendChild(
        el('line', {
          x1: BAR_SIDE - 10,
          y1: truthY,
          x2: PIECE_CANVAS_W - BAR_SIDE - 10,
          y2: truthY,
          stroke: C.success,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        }),
      );
      const truthLabel = el('text', {
        x: PIECE_CANVAS_W - BAR_SIDE - 4,
        y: truthY + 4,
        fill: C.success,
        'font-size': fontSizes.xs,
        'text-anchor': 'start',
      });
      truthLabel.textContent = t('label.trueValue', 'true = {truth}', { truth: scene.repeats });
      gFrame.appendChild(truthLabel);

      const readLabel = el('text', {
        x: 8,
        y: geom.valueY(geom.total) + 14,
        fill: C.textMuted,
        'font-size': fontSizes.xs,
        'text-anchor': 'start',
      });
      readLabel.textContent = t('label.readValue', 'read value');
      gFrame.appendChild(readLabel);

      // ── 표. 지금 폭의 칸들이 제자리에 서고 셈이 다 들어 있다.
      const pass = currentPass(scene);
      const cells: DrawnCell[] = [];
      const rowLabels: SVGTextElement[] = [];

      if (pass !== null) {
        const width = widthOf(pass);
        const origin = geom.originX(width);

        for (let r = 0; r < depthOf(pass); r += 1) {
          const top = TABLE_TOP + r * CELL_H;

          const rowLabel = el('text', {
            x: origin - ROW_LABEL_GAP,
            y: top + CELL_H / 2 + 4,
            fill: C.textMuted,
            'font-size': fontSizes.xs,
            'text-anchor': 'end',
          });
          rowLabel.textContent = `${ROW_LABEL_PREFIX}${r}`;
          gTable.appendChild(rowLabel);
          rowLabels.push(rowLabel);

          for (let j = 0; j < width; j += 1) {
            const x = origin + j * geom.cellW;
            const rect = el('rect', {
              x,
              y: top,
              width: geom.cellW,
              height: CELL_H,
              fill: C.bg,
              stroke: C.border,
              'stroke-width': 1,
              rx: 3,
            });
            const strip = el('rect', {
              x: x + 1,
              y: top + CELL_H - LOAD_STRIP_H - 1,
              width: 0,
              height: LOAD_STRIP_H,
              fill: C.danger,
              rx: 1,
            });
            const label = el('text', {
              x: x + geom.cellW / 2,
              y: top + 19,
              fill: C.textMuted,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
            });
            gTable.appendChild(rect);
            gTable.appendChild(strip);
            gTable.appendChild(label);

            const cell: DrawnCell = { rect, label, strip, row: r, col: j };
            paintCount(scene, geom, cell, pass.counts[r]?.[j] ?? 0);
            cells.push(cell);
          }
        }
      }

      /*
       * ── 흐린 눈금. 앞 폭에서 막대가 서 있던 높이다.
       *
       * **남는 자취라 정적 그리기에 넣는다** — 빠뜨리면 되짚었을 때 "앞서 이만큼
       * 부풀어 있었다" 가 화면에서 사라진다 (S-scene).
       */
      const read = readPasses(scene);
      for (const earlier of read.slice(0, -1)) {
        estimatesOf(scene, earlier).forEach((v, i) => {
          if (v <= 0) return;
          const cx = geom.barCenter(i);
          const y = geom.valueY(v);
          gGhost.appendChild(
            el('line', {
              x1: cx - geom.barW / 2 - 3,
              y1: y,
              x2: cx + geom.barW / 2 + 3,
              y2: y,
              stroke: C.ghostOutline,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 3',
            }),
          );
        });
      }

      // ── 막대. 가장 마지막에 되읽은 표의 값이 지금 높이다.
      const settled = read[read.length - 1];
      const heights = settled === undefined ? scene.keys.map(() => 0) : estimatesOf(scene, settled);
      const bars: DrawnBar[] = scene.keys.map((key, i) => {
        const cx = geom.barCenter(i);
        const base = el('rect', {
          x: cx - geom.barW / 2,
          y: BAR_BASE_Y,
          width: geom.barW,
          height: 0,
          fill: C.itemSorted,
          rx: 2,
        });
        const over = el('rect', {
          x: cx - geom.barW / 2,
          y: BAR_BASE_Y,
          width: geom.barW,
          height: 0,
          fill: C.danger,
          rx: 2,
        });
        const value = el('text', {
          x: cx,
          y: BAR_BASE_Y - 6,
          fill: C.text,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
        const name = el('text', {
          x: cx,
          y: KEY_LABEL_Y,
          fill: C.textMuted,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        name.textContent = key;
        gBars.appendChild(base);
        gBars.appendChild(over);
        gBars.appendChild(value);
        gBars.appendChild(name);

        const bar: DrawnBar = { base, over, value };
        drawBar(geom, bar, heights[i] ?? 0, scene.repeats);
        return bar;
      });

      return { geom, cells, rowLabels, bars };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 그림은 장면의 `passes` 가 말한다.

    /**
     * 표가 갈라지고 칸에 셈이 찬다.
     *
     * 두 마디를 **한 시계**로 돌린다 — 갈라짐과 채움은 "이 폭으로 세었다" 는 한
     * 뜻이라 시계를 나누면 lockstep 이 우연히 맞는 꼴이 된다 (S-scene).
     */
    function flowSplit(
      scene: SpaceErrorTradeoffScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const pass = currentPass(scene);
      if (pass === null) return Promise.resolve();

      const { geom } = drawn;
      const width = widthOf(pass);
      const prev = scene.passes[scene.passes.length - 2];
      const prevWidth = prev === undefined ? 0 : widthOf(prev);
      const origin = geom.originX(width);
      const fromLabelX = geom.originX(prevWidth) - ROW_LABEL_GAP;
      const toLabelX = origin - ROW_LABEL_GAP;
      const total = SPLIT_MS + FILL_MS;

      const setLabels = (x: number): void => {
        for (const label of drawn.rowLabels) label.setAttribute('x', String(x));
      };

      return tween(total, mine, (p) => {
        const ms = p * total;

        if (ms < SPLIT_MS) {
          // 갈라지는 중 — 칸은 앞 폭의 자리에서 제자리로 미끄러지고 셈은 아직 0 이다.
          const e = ease(clamp01(ms / SPLIT_MS));
          for (const cell of drawn.cells) {
            setCellX(
              geom,
              cell,
              lerp(birthX(geom, cell.col, width, prevWidth), origin + cell.col * geom.cellW, e),
            );
            paintCount(scene, geom, cell, 0);
          }
          setLabels(lerp(fromLabelX, toLabelX, e));
          return;
        }

        // 채우는 중 — 자리는 다 잡혔고 스트림이 칸에 담긴다.
        const e = ease(clamp01((ms - SPLIT_MS) / FILL_MS));
        setLabels(toLabelX);
        for (const cell of drawn.cells) {
          setCellX(geom, cell, origin + cell.col * geom.cellW);
          const target = pass.counts[cell.row]?.[cell.col] ?? 0;
          // 끝에서는 보간값 대신 목표값을 그대로 쓴다 — 부동소수 끝자리가 화면을 가른다.
          paintCount(scene, geom, cell, p >= 1 ? target : target * e);
        }
      });
    }

    /**
     * 막대가 새 높이로 옮겨 간다.
     *
     * 출발 높이는 **앞서 되읽은 표**에서 셈한다 — 흐린 눈금이 그어진 그 높이다.
     * `prev` 에서 꺼내지 않으므로 어느 걸음에서 와도 같은 곳에서 출발한다 (S-scene).
     */
    function flowReads(
      scene: SpaceErrorTradeoffScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const read = readPasses(scene);
      const settled = read[read.length - 1];
      if (settled === undefined) return Promise.resolve();
      const earlier = read[read.length - 2];

      const to = estimatesOf(scene, settled);
      const from = earlier === undefined ? scene.keys.map(() => 0) : estimatesOf(scene, earlier);
      const { geom } = drawn;

      return tween(BAR_MS, mine, (p) => {
        const e = ease(clamp01(p));
        drawn.bars.forEach((bar, i) => {
          const target = to[i] ?? 0;
          // 끝에서는 보간값 대신 목표값을 그대로 쓴다 (부동소수 끝자리).
          drawBar(geom, bar, p >= 1 ? target : lerp(from[i] ?? 0, target, e), scene.repeats);
        });
      });
    }

    /**
     * 결론 — 가장 좁았을 때까지 부풀었다 지금 높이로 돌아온다.
     *
     * 이 걸음은 캡션만 바뀌므로 그냥 두면 흐를 것이 없는 **얇은 걸음**이 된다.
     * 얹는 운동은 이 조각의 동사 그대로다 — 이미 서 있는 것이라 나타나는 꼴이
     * 아니라 부풀었다 돌아오는 꼴이다 (프로토콜 4 절).
     */
    function flowSwell(
      scene: SpaceErrorTradeoffScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const read = readPasses(scene);
      const settled = read[read.length - 1];
      const narrowest = read[0];
      if (settled === undefined || narrowest === undefined) return Promise.resolve();

      const here = estimatesOf(scene, settled);
      const peak = estimatesOf(scene, narrowest);
      const { geom } = drawn;

      return tween(SWELL_MS, mine, (p) => {
        // sin 은 0 에서도 1 에서도 0 이라 솟았다 제자리로 돌아온다.
        const lift = Math.sin(Math.PI * clamp01(p));
        drawn.bars.forEach((bar, i) => {
          const base = here[i] ?? 0;
          const top = peak[i] ?? base;
          // 끝에서는 보간값 대신 지금 높이를 그대로 쓴다 (부동소수 끝자리).
          drawBar(geom, bar, p >= 1 ? base : base + (top - base) * lift, scene.repeats);
        });
      });
    }

    function flowFor(
      step: TradeoffStep,
      scene: SpaceErrorTradeoffScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'split':
          return flowSplit(scene, drawn, mine);
        case 'reads':
          return flowReads(scene, drawn, mine);
        case 'swell':
          return flowSwell(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SpaceErrorTradeoffScene,
      _prev: SpaceErrorTradeoffScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 채움 폭이 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
