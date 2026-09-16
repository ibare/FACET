/**
 * load-factor-rehash-stage — 적재율과 재해싱 조각의 전용 시각화.
 *
 * ── 형태가 어디서 나왔는가 ────────────────────────────────────────────────
 * 동사는 "다시 뿌려진다" 이다. 판이 커지면 나누는 수가 달라지므로 자리를 다시
 * 셈해야 하고, 그래서 어떤 것은 자리가 바뀌고 어떤 것은 그대로 남는다.
 *
 * 그 "어떤 것" 을 가르는 것은 나머지에 붙는 **비트 하나**다. 열여섯으로 나눈
 * 나머지는 여덟으로 나눈 나머지에 비트가 하나 더 붙은 값이라, 그 비트가 0 이면
 * 자리가 그대로다. 그래서 넓힌 판을 한 줄로 늘어놓지 않고 **여덟 칸씩 두 줄로**
 * 접어 그린다. 열은 옛 자리(나머지 8), 줄은 새로 붙은 비트다. 모든 칩이 자기
 * 열에 머무르고 줄만 갈리므로, 화면에서 그 비트가 곧 위아래가 된다.
 *
 * 운동은 셋뿐이며 전부 위치가 변한다.
 *   - 여섯 번째 키가 판 위 대기 자리에서 자기 칸으로 내려앉는다.
 *   - 적재율 막대가 임계 눈금까지 차오르고, 판이 넓어지면 되돌아 짧아진다.
 *   - 판을 넓힐 때 둘째 줄이 첫 줄 밑에서 세로로 펼쳐진다.
 * 재계산은 칩이 **들렸다 앉는** 한 동작으로 그린다 — 같은 동작의 두 결과가
 * "제자리에 다시 앉음" 과 "아랫줄로 내려앉음" 이다.
 *
 * ── 장면 하나로 화면을 세운다 ────────────────────────────────────────────
 *
 * 걸음마다 부르는 메서드(`insert()` · `grow()` · `rehash()` …) 를 두지 않는다.
 * 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그 장면의
 * 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다 (S-scene).
 * 장면의 모양은 `scene.ts`.
 *
 * 정적 그리기(`stand`)가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은
 * 출발 자리로 **물렸다가** 되돌아오는 꼴이 되고, 운동이 끝나면 그 장면을 통째로
 * 다시 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도 다르면 되짚기
 * 판정이 어긋나기 때문이다 (프로토콜 4 절).
 *
 * **한 걸음에 흐르는 것이 둘이면 시계는 하나다.** 여섯째가 앉는 걸음에는 칩이
 * 내려앉는 동시에 막대가 차오르고, 판이 넓어지는 걸음에는 줄이 펼쳐지는 동시에
 * 막대가 짧아진다. 둘은 서로 다른 뜻이 아니라 **같은 사건의 두 얼굴**이라 한
 * `animate` 안에서 함께 그린다 — 그러면 `Promise.all` 도, `void` 로 던질 Promise
 * 도 생기지 않는다 (프로토콜 3-4).
 *
 * 색은 전부 design-tokens 경유 (S-view). 화면 문자는 params.t 경유 (C10) 이며,
 * 수식(`3076014 % 16 = 14`)과 키 이름은 표식이라 키를 만들지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  loadedCount,
  type LoadFactorRehashScene,
  type RehashCaption,
  type RehashChipState,
  type RehashFormula,
  type RehashMark,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표 ────────────────────────────────────────────────────────────────
// 크기는 캔버스 폭에서 역산하고 상수로는 상한만 둔다 (S-piece).

const W = PIECE_CANVAS_W;
const SIDE_MIN = 26;
const CELL_MAX_W = 78;

/** 판을 접었을 때의 기본 줄 수 — 캔버스가 처음 잡는 높이. 장면이 다시 정한다. */
const DEFAULT_ROWS = 2;

const GAUGE_Y = 18;
const GAUGE_H = 12;
const GAUGE_LABEL_W = 84;
const GAUGE_READOUT_W = 132;
const GAUGE_GAP = 10;

const WAIT_Y = 52;
const ROW0_Y = 94;
const ROW_H = 48;
const ROW_GAP = 8;

const CHIP_PAD = 5;
const CHIP_TOP = 17;
const CHIP_H = 26;
const CHIP_LIFT = 18;

const SEAT_MS = 380;
const GROW_MS = 420;
const LIFT_MS = 280;
const MOVE_MS = 320;
const FRAME_MS = 16;

const RX = Number.parseInt(radii.sm, 10);

const trackX = SIDE_MIN + GAUGE_LABEL_W;
const trackW = W - SIDE_MIN - GAUGE_READOUT_W - GAUGE_GAP - trackX;

function boardBottom(rows: number): number {
  return ROW0_Y + rows * ROW_H + (rows - 1) * ROW_GAP;
}
function formulaY(rows: number): number {
  return boardBottom(rows) + 20;
}
function captionY(rows: number): number {
  return formulaY(rows) + 22;
}
function canvasHeight(rows: number): number {
  return captionY(rows) + 14;
}

/** 칸 수를 줄 수로. 열은 언제나 `cols` 이므로 줄만 늘어난다. */
function rowsOf(buckets: number, cols: number): number {
  return Math.max(1, Math.round(buckets / Math.max(1, cols)));
}

function cellWidth(cols: number): number {
  return Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, cols)));
}
function boardOriginX(cols: number): number {
  return Math.round((W - cellWidth(cols) * cols) / 2);
}

/** 5/8 → "0.625", 6/16 → "0.375". 수식 표기이므로 표식이다 (C10). */
function ratioText(count: number, buckets: number): string {
  if (buckets <= 0) return '0';
  return String(Number((count / buckets).toFixed(3)));
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeBoth = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** 들렸다 앉는 동안의 칠. 지나가는 것이라 장면에 없다 (S-scene). */
type ChipPaint = RehashChipState | 'checking';

type Chip = {
  group: SVGGElement;
  box: SVGRectElement;
  text: SVGTextElement;
};

type RowLayer = { layer: SVGGElement; top: number };

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const loadFactorRehashStageView: CanvasView = {
  canvas: { height: canvasHeight(DEFAULT_ROWS) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LoadFactorRehashScene> {
    const c: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    canvas.textContent = '';

    // ── 시간 자원. destroy 에서 모두 거둔다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    /**
     * 기다리다 만 것을 깨우는 자리. 타이머를 거두는 것만으로는 모자란다 — 취소된
     * tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 `render` 의
     * Promise 를 기다리므로 걸음이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * `stand` 가 매번 판과 칩을 새로 지으므로 살아남은 옛 흐름이 쥔 노드는 이미
     * 떨어져 나간 것이라 무해하다. 그러나 **흐름 끝의 `stand(next)`** 는 살아 있는
     * 화면에 쓴다. 그 자리를 막는 것이 이 빗장이다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그 둘을
     * 부르지 않는다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => !destroyed && mine === gen;

    /**
     * 시간 기반 tick 애니메이션. 한 걸음에 흐르는 것이 여럿이어도 시계는 이 하나다.
     *
     * 스스로 다음 회차를 예약하는 루프이므로 세대가 갈리거나 destroy 되면 멈춘다.
     */
    const animate = (ms: number, mine: number, onTick: (t: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (ms <= 0 || !alive(mine)) {
          if (alive(mine)) onTick(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / ms);
          onTick(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });

    // ── 정적 그리기가 매번 다시 채우는 손잡이들 ──────────────────────────
    //
    // 배치는 장면에서만 나오므로 여기 쥐는 것은 손잡이와 그 배치가 정한 수뿐이다.
    const chipEls = new Map<string, Chip>();
    const rowLayers: RowLayer[] = [];
    let fillBar: SVGRectElement | null = null;
    let cols = 1;
    let cellW = cellWidth(1);
    let originX = boardOriginX(1);

    const chipW = (): number => cellW - CHIP_PAD * 2;
    const chipX = (col: number): number => originX + col * cellW + CHIP_PAD;
    const rowTop = (row: number): number => ROW0_Y + row * (ROW_H + ROW_GAP);
    const chipY = (row: number): number => rowTop(row) + CHIP_TOP;

    const fillFor = (state: ChipPaint): string => {
      if (state === 'incoming') return c.itemActive;
      if (state === 'checking') return c.itemComparing;
      if (state === 'moved') return c.itemSwapping;
      if (state === 'kept') return c.itemSorted;
      return c.itemDefault;
    };
    const inkFor = (state: ChipPaint): string => (state === 'idle' ? c.text : c.stateInk);

    const paint = (chip: Chip, state: ChipPaint): void => {
      chip.box.setAttribute('fill', fillFor(state));
      chip.text.style.fill = inkFor(state);
    };

    const place = (chip: Chip, x: number, y: number): void => {
      chip.group.style.transform = `translate(${x}px, ${y}px)`;
    };

    /** 막대의 길이. 적재율이 1 을 넘어도 홈 밖으로 나가지 않는다. */
    const barWidth = (count: number, buckets: number): number =>
      buckets > 0 ? trackW * Math.min(1, Math.max(0, count / buckets)) : 0;

    /** 적재율이 임계에 닿았나. 막대 색이 여기서 갈린다. */
    const overRatio = (ratio: number, threshold: number): boolean => ratio >= threshold - 1e-9;

    const isOver = (count: number, buckets: number, threshold: number): boolean =>
      buckets > 0 && overRatio(count / buckets, threshold);

    // ── 캡션 ─────────────────────────────────────────────────────────────
    //
    // 장면은 무엇을 말할지와 그 인자만 담는다. 문자는 여기서 만든다 (C10).
    const captionText = (cap: RehashCaption | null): string => {
      if (!cap) return '';
      switch (cap.kind) {
        case 'threshold':
          return tr(
            'caption.threshold',
            'One more key fills {count} of {buckets} buckets — the load factor reaches the {threshold} threshold.',
            { count: cap.count, buckets: cap.buckets, threshold: cap.threshold },
          );
        case 'grow':
          return tr(
            'caption.grow',
            'The table doubles, so the same {count} keys now fill far less of it.',
            { count: cap.count },
          );
        case 'recompute':
          return tr(
            'caption.recompute',
            'Nothing is carried over. Every key is divided again by the new bucket count.',
          );
        case 'result':
          return tr('caption.result', '{moved} keys landed somewhere else. {stayed} happened to stay.', {
            moved: cap.moved,
            stayed: cap.stayed,
          });
      }
    };

    /**
     * `date   3076014 % 16 = 14`. 수식이라 문안 키를 만들지 않는다.
     *
     * 몫을 장면에서 받지 않고 여기서 나눈다. 등식의 세 항이 한 출처에서 나와야
     * **화면에 뜬 등식이 스스로 참**이다. 몫을 따로 받으면 그 수가 나눗셈과 갈려도
     * 화면은 아무 말 없이 거짓을 적는다.
     */
    const formulaTextOf = (f: RehashFormula | null): string =>
      f === null ? '' : `${f.key}   ${f.masked} % ${f.buckets} = ${f.masked % f.buckets}`;

    // ── 장면 그리기 ──────────────────────────────────────────────────────
    //
    // 늘 비우고 시작해 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않으므로
    // 되돌릴 명령이 있을 자리가 없다.

    const stand = (s: LoadFactorRehashScene): void => {
      canvas.textContent = '';
      chipEls.clear();
      rowLayers.length = 0;
      fillBar = null;

      cols = Math.max(1, s.cols);
      cellW = cellWidth(cols);
      originX = boardOriginX(cols);

      // 판이 차지할 높이는 **끝내 넓혀질** 칸 수가 정한다. 걸음마다 캔버스가
      // 늘었다 줄었다 하면 첫 그림이 눌린다 (프로토콜 4 절).
      const maxRows = rowsOf(s.grownBuckets, cols);
      const rows = Math.min(maxRows, rowsOf(s.buckets, cols));
      canvas.setAttribute('viewBox', `0 0 ${W} ${canvasHeight(maxRows)}`);

      const root = svg('g');
      canvas.appendChild(root);

      // ── 적재율 게이지 ──────────────────────────────────────────────────
      const count = loadedCount(s.chips);

      const gaugeLabel = svg('text', { x: SIDE_MIN, y: GAUGE_Y + 10 });
      gaugeLabel.style.fontFamily = fonts.body;
      gaugeLabel.style.fontSize = fontSizes.sm;
      gaugeLabel.style.fill = c.textMuted;
      gaugeLabel.textContent = tr('label.loadFactor', 'load factor');
      root.appendChild(gaugeLabel);

      root.appendChild(
        svg('rect', {
          x: trackX,
          y: GAUGE_Y,
          width: trackW,
          height: GAUGE_H,
          rx: RX,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );

      const bar = svg('rect', {
        x: trackX,
        y: GAUGE_Y,
        width: barWidth(count, s.buckets),
        height: GAUGE_H,
        fill: isOver(count, s.buckets, s.threshold) ? c.danger : c.text,
      });
      root.appendChild(bar);
      fillBar = bar;

      const tickX = trackX + trackW * s.threshold;
      const tick = svg('line', {
        x1: tickX,
        y1: GAUGE_Y - 4,
        x2: tickX,
        y2: GAUGE_Y + GAUGE_H + 4,
        stroke: c.accent,
        'stroke-width': 2,
      });
      root.appendChild(tick);

      const tickLabel = svg('text', { x: tickX, y: GAUGE_Y - 8, 'text-anchor': 'middle' });
      tickLabel.style.fontFamily = fonts.mono;
      tickLabel.style.fontSize = fontSizes.xs;
      tickLabel.style.fill = c.textMuted;
      tickLabel.textContent = String(s.threshold);
      root.appendChild(tickLabel);

      const readout = svg('text', { x: W - SIDE_MIN, y: GAUGE_Y + 10, 'text-anchor': 'end' });
      readout.style.fontFamily = fonts.mono;
      readout.style.fontSize = fontSizes.sm;
      readout.style.fill = c.text;
      readout.textContent = `${count} / ${s.buckets} = ${ratioText(count, s.buckets)}`;
      root.appendChild(readout);

      // ── 판 ─────────────────────────────────────────────────────────────
      //
      // 열린 줄만 짓는다. 아직 넓히지 않았으면 둘째 줄은 아예 없고, 넓히는 걸음이
      // 그것을 물렸다가 펼친다 — 접어 둔 줄의 `scaleY(0)` 이 남을 자리가 없다.
      const boardG = svg('g');
      root.appendChild(boardG);

      for (let row = 0; row < rows; row += 1) {
        const layer = svg('g');
        const top = rowTop(row);
        layer.style.transformOrigin = '0 0';
        layer.style.transform = `translate(0px, ${top}px)`;
        for (let col = 0; col < cols; col += 1) {
          const x = originX + col * cellW;
          layer.appendChild(
            svg('rect', {
              x,
              y: 0,
              width: cellW,
              height: ROW_H,
              rx: RX,
              fill: c.bg,
              stroke: c.border,
            }),
          );
          const idx = svg('text', { x: x + 6, y: 15 });
          idx.style.fontFamily = fonts.mono;
          idx.style.fontSize = fontSizes.xs;
          idx.style.fill = c.textMuted;
          idx.textContent = String(row * cols + col);
          layer.appendChild(idx);
        }
        boardG.appendChild(layer);
        rowLayers.push({ layer, top });
      }

      // ── 칩 ─────────────────────────────────────────────────────────────
      //
      // 칩은 늘 판 위 층이다 — 줄이 펼쳐지는 동안에도 가려지지 않는다.
      const chipG = svg('g');
      root.appendChild(chipG);

      for (const ch of s.chips) {
        // 아직 판 밖에서 기다리는 것은 그리지 않는다. 그 없음이 곧 "아직 안 들어왔다" 다.
        if (ch.slot === null) continue;
        const group = svg('g');
        group.style.transformOrigin = '0 0';
        const box = svg('rect', {
          x: 0,
          y: 0,
          width: chipW(),
          height: CHIP_H,
          rx: RX,
          stroke: c.border,
        });
        const text = svg('text', { x: chipW() / 2, y: CHIP_H / 2 + 4, 'text-anchor': 'middle' });
        text.style.fontFamily = fonts.mono;
        text.style.fontSize = fontSizes.sm;
        text.textContent = ch.key;
        group.appendChild(box);
        group.appendChild(text);
        chipG.appendChild(group);

        const chip: Chip = { group, box, text };
        chipEls.set(ch.key, chip);
        paint(chip, ch.state);
        place(chip, chipX(ch.slot % cols), chipY(Math.floor(ch.slot / cols)));
      }

      // ── 계산식 줄 + 캡션 ───────────────────────────────────────────────
      const formula = svg('text', { x: W / 2, y: formulaY(maxRows), 'text-anchor': 'middle' });
      formula.style.fontFamily = fonts.mono;
      formula.style.fontSize = fontSizes.sm;
      formula.style.fill = c.text;
      formula.textContent = formulaTextOf(s.formula);
      root.appendChild(formula);

      const caption = svg('text', { x: W / 2, y: captionY(maxRows), 'text-anchor': 'middle' });
      caption.style.fontFamily = fonts.body;
      caption.style.fontSize = fontSizes.sm;
      caption.style.fill = c.textMuted;
      caption.textContent = captionText(s.caption);
      root.appendChild(caption);
    };

    // ── 운동 ─────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은 출발
    // 자리로 **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `stand` 직후 아직
    // 어떤 기다림도 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /**
     * 여섯째가 대기 자리에서 자기 칸으로 내려앉고, 그만큼 막대가 차오른다.
     *
     * 둘은 같은 사건의 두 얼굴이라 한 시계로 함께 흘린다 (프로토콜 3-4).
     */
    const runSeated = async (
      s: LoadFactorRehashScene,
      m: Extract<RehashMark, { kind: 'seated' }>,
      mine: number,
    ): Promise<void> => {
      const chip = chipEls.get(m.key);
      const seat = s.chips.find((ch) => ch.key === m.key);
      if (!chip || !seat || seat.slot === null) return;

      const toX = chipX(seat.slot % cols);
      const toY = chipY(Math.floor(seat.slot / cols));
      const fromX = originX + CHIP_PAD;

      const count = loadedCount(s.chips);
      const w0 = barWidth(count - 1, s.buckets);
      const w1 = barWidth(count, s.buckets);
      const bar = fillBar;

      // 출발 자리로 물린다 — 칩은 아직 판 밖이고 막대는 아직 옛 길이다.
      place(chip, fromX, WAIT_Y);
      chip.group.style.opacity = '0';
      bar?.setAttribute('width', String(w0));

      await animate(SEAT_MS, mine, (t) => {
        const e = easeOut(t);
        if (t >= 1) {
          place(chip, toX, toY);
          chip.group.style.opacity = '1';
          bar?.setAttribute('width', String(w1));
          return;
        }
        place(chip, lerp(fromX, toX, e), lerp(WAIT_Y, toY, e));
        chip.group.style.opacity = String(Math.min(1, t * 2.5));
        bar?.setAttribute('width', String(lerp(w0, w1, e)));
      });
    };

    /**
     * 판이 넓어진다 — 새 줄이 첫 줄 밑에서 펼쳐지고 막대가 되돌아 짧아진다.
     *
     * 이 장면에는 옛 판이 없다. 표식이 실어 온 `from` 으로 출발 그림을 셈으로
     * 복원한다 (S-scene — `prev` 는 그리기 재료가 아니다).
     */
    const runGrown = async (
      s: LoadFactorRehashScene,
      m: Extract<RehashMark, { kind: 'grown' }>,
      mine: number,
    ): Promise<void> => {
      const opening = rowLayers.slice(rowsOf(m.from, cols));
      const count = loadedCount(s.chips);
      const w0 = barWidth(count, m.from);
      const w1 = barWidth(count, s.buckets);
      const bar = fillBar;
      const inkFrom = isOver(count, m.from, s.threshold) ? c.danger : c.text;
      const inkTo = isOver(count, s.buckets, s.threshold) ? c.danger : c.text;
      if (opening.length === 0 && w0 === w1) return;

      // 펼쳐지기 전으로 물린다 — 새 줄은 납작하고 막대는 아직 임계에 닿아 있다.
      for (const r of opening) {
        r.layer.style.transform = `translate(0px, ${r.top}px) scale(1, 0)`;
      }
      bar?.setAttribute('width', String(w0));
      bar?.setAttribute('fill', inkFrom);

      await animate(GROW_MS, mine, (t) => {
        const e = easeOut(t);
        if (t >= 1) {
          for (const r of opening) r.layer.style.transform = `translate(0px, ${r.top}px)`;
          bar?.setAttribute('width', String(w1));
          bar?.setAttribute('fill', inkTo);
          return;
        }
        for (const r of opening) {
          r.layer.style.transform = `translate(0px, ${r.top}px) scale(1, ${e})`;
        }
        bar?.setAttribute('width', String(lerp(w0, w1, e)));
        // 막대가 눈금 아래로 내려오는 그 순간 색이 돌아온다.
        const ratio = lerp(count / m.from, count / s.buckets, e);
        bar?.setAttribute('fill', overRatio(ratio, s.threshold) ? c.danger : c.text);
      });
    };

    /**
     * 키 하나가 들렸다 앉는다. 같은 동작의 두 결과가 "제자리" 와 "아랫줄" 이다.
     *
     * 출발 칸은 `mark.from` 이 싣고 온다 — 다 그린 장면에는 이미 새 자리뿐이다.
     * 두 마디(들기 · 옮기기)를 한 시계 안에서 이어 그리므로 기다림이 갈라지지 않는다.
     */
    const runRehashed = async (
      m: Extract<RehashMark, { kind: 'rehashed' }>,
      mine: number,
    ): Promise<void> => {
      const chip = chipEls.get(m.key);
      if (!chip) return;

      const x0 = chipX(m.from % cols);
      const y0 = chipY(Math.floor(m.from / cols));
      const x1 = chipX(m.to % cols);
      const y1 = chipY(Math.floor(m.to / cols));
      const landed: RehashChipState = m.from === m.to ? 'kept' : 'moved';

      // 들리기 전으로 물린다 — 칩은 아직 옛 칸에 있고 견주는 칠을 쓴다.
      place(chip, x0, y0);
      paint(chip, 'checking');

      const total = LIFT_MS + MOVE_MS;
      let dropped = false;
      await animate(total, mine, (t) => {
        if (t >= 1) {
          place(chip, x1, y1);
          paint(chip, landed);
          return;
        }
        const ms = t * total;
        if (ms < LIFT_MS) {
          place(chip, x0, y0 - CHIP_LIFT * easeOut(ms / LIFT_MS));
          return;
        }
        if (!dropped) {
          paint(chip, landed);
          dropped = true;
        }
        const e = easeBoth((ms - LIFT_MS) / MOVE_MS);
        place(chip, lerp(x0, x1, e), lerp(y0 - CHIP_LIFT, y1, e));
      });
    };

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 transform
     * 문자열 하나가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기
     * 때문이다 (프로토콜 4 절).
     */
    async function render(
      next: LoadFactorRehashScene,
      /** 흐를 것을 `mark` 가 말하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: LoadFactorRehashScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const mine = gen;
      stand(next);

      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate || destroyed) return;

      const m = next.mark;
      if (!m) return;

      switch (m.kind) {
        case 'seated':
          await runSeated(next, m, mine);
          break;
        case 'grown':
          await runGrown(next, m, mine);
          break;
        case 'rehashed':
          await runRehashed(m, mine);
          break;
      }

      // 옛 세대면 화면에 손대지 않고 물러난다.
      if (!alive(mine)) return;
      stand(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        chipEls.clear();
        rowLayers.length = 0;
        fillBar = null;
        canvas.textContent = '';
      },
    };
  },
};
