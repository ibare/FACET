/**
 * matrix-ops 무대 — 뛰는 점 넷과 유령 점, 그리고 행렬 카드 넷.
 *
 * 왼쪽은 수학 좌표평면(위가 +y). 점 넷이 X 로 한 번, Y 로 또 한 번 뛰고, 처음 자리의 자국에서
 * YX 로 한 번에 뛴 고리가 두 번 간 자리에 포개진다. 끝으로 XY 로 뛴 유령(점선 마름모)이 따로 선다.
 * 포갠 자리에는 `×n` 표지를 단다 — 캡션이 세는 자리 수와 눈에 보이는 무더기가 같게.
 *
 * 오른쪽은 카드 넷: 먼저 X · 다음 Y (기호 · 행렬 · 표시 이름 · det), 걸음 3 에 서는 YX (det 식),
 * 걸음 5 에 서는 XY (같은 곳).
 *
 * 무대는 셈하지 않는다 — 좌표 · 곱 · det · 자리 · 개수는 모두 projector 가 넘긴 payload 값이다.
 * 운동 중의 자리는 출발과 도착 사이를 보간한 그림일 뿐이다. 수학 좌표 → 픽셀 옮김만 여기서 한다.
 *
 * 멱등: `round` 는 동적 요소(고리 · 유령 · 표지 · 궤적)를 비우고 다시 짓는다. 골격(평면 · 카드 · 점)은
 * 같은 요소를 다시 쓴다. `reset` 은 모든 것을 비운다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type StagePoint = [number, number];
export type StageSpot = { x: number; y: number; n: number };
export type StageCard = { mapId: string; symbol: string; m: number[]; det: number };

export type MatrixOpsStage = {
  reset(): void;
  round(v: { axisMax: number; total: number; home: StagePoint[]; xCard: StageCard; yCard: StageCard }, ms: number): void;
  jumpFirst(v: { points: StagePoint[]; spots: StageSpot[]; spotCount: number }, ms: number): void;
  jumpSecond(v: { points: StagePoint[]; spots: StageSpot[]; spotCount: number; homeCount: number; total: number }, ms: number): void;
  product(v: { yx: number[]; detY: number; detX: number; detYX: number }, ms: number): void;
  /** 고리는 두 번 간 점 위에 포개지므로 자리 표지는 걸음 2 의 것을 그대로 둔다 — 자리 목록을 받지 않는다 */
  jumpOnce(v: { points: StagePoint[]; matchCount: number; total: number }, ms: number): void;
  jumpSwapped(v: { xy: number[]; points: StagePoint[]; spots: StageSpot[]; sameCount: number; total: number }, ms: number): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 500;
/** 좌표평면 자리 — 가운데와 반폭(픽셀) */
const PLANE_CX = 230;
const PLANE_CY = 226;
const PLANE_HALF = 206;
/** 카드 자리 */
const CARD_X = 468;
const CARD_W = 276;
const CARD_H = 92;
const CARD_Y = [12, 112, 212, 312] as const;
const LEGEND_Y = 454;
const CAPTION_Y = 486;

const DOT_R = 7;
const HOME_R = 4;
const RING_R = 12;
const GHOST_R = 10;

/** 빼기는 U+2212 — 한 완제품 안에서 통일. 0 에는 부호를 달지 않는다 */
function num(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`matrix-ops-stage: 수가 아니다 (${v})`);
  if (v === 0) return '0';
  return v < 0 ? `−${String(-v)}` : String(v);
}

export function formatMatrix(m: readonly number[]): string {
  if (m.length !== 4) throw new Error('matrix-ops-stage: 행렬 칸이 넷이 아니다');
  return `[${num(m[0]!)} ${num(m[1]!)} ; ${num(m[2]!)} ${num(m[3]!)}]`;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  if (parent) parent.appendChild(e);
  return e;
}

function clear(g: Element): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

type Tween = { frame: number; finish: () => void };

export const matrixOpsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const hues = categorical(4, 'vivid');

    const root = el('g', {}, svg);
    const planeG = el('g', {}, root);
    const arcG = el('g', {}, root);
    const homeG = el('g', {}, root);
    const ghostG = el('g', {}, root);
    const dotG = el('g', {}, root);
    const ringG = el('g', {}, root);
    const badgeG = el('g', {}, root);
    const cardG = el('g', {}, root);
    const legendG = el('g', {}, root);
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: pal.text,
    }, root);

    // ── 운동 — 키마다 하나. 같은 키의 새 운동은 앞 운동을 끝 자리로 붙이고 시작한다
    const tweens = new Map<string, Tween>();
    let destroyed = false;
    const tween = (key: string, ms: number, draw: (k: number) => void): void => {
      const prev = tweens.get(key);
      if (prev) {
        cancelAnimationFrame(prev.frame);
        tweens.delete(key);
        prev.finish();
      }
      if (ms <= 0 || isInstant() || destroyed) {
        draw(1);
        return;
      }
      const start = performance.now();
      const rec: Tween = { frame: 0, finish: () => draw(1) };
      const tick = (now: number) => {
        if (destroyed) return;
        const k = Math.min(1, (now - start) / ms);
        draw(ease(k));
        if (k < 1) rec.frame = requestAnimationFrame(tick);
        else tweens.delete(key);
      };
      rec.frame = requestAnimationFrame(tick);
      tweens.set(key, rec);
    };
    /** 같은 키의 앞 운동을 지금 끝 자리로 붙인다 — 다음 걸음이 앞 운동의 끝 그림(표지 등)을 걷기 전에 */
    const finishTween = (key: string): void => {
      const prev = tweens.get(key);
      if (!prev) return;
      cancelAnimationFrame(prev.frame);
      tweens.delete(key);
      prev.finish();
    };
    const stopAll = (finish: boolean): void => {
      for (const rec of tweens.values()) {
        cancelAnimationFrame(rec.frame);
        if (finish) rec.finish();
      }
      tweens.clear();
    };
    params.onScrubStart?.(() => stopAll(true));

    // ── 좌표 옮김 (수학 → 픽셀). 축척 기준 axisMax 는 알고리즘이 싣는다
    let unit = 0;
    let axisMax = 0;
    const px = (x: number): number => PLANE_CX + x * unit;
    const py = (y: number): number => PLANE_CY - y * unit;

    const drawPlane = (max: number): void => {
      if (!Number.isInteger(max) || max <= 0) throw new Error(`matrix-ops-stage: 축 범위가 어긋난다 (${max})`);
      clear(planeG);
      axisMax = max;
      unit = PLANE_HALF / (max + 1);
      el('rect', {
        x: PLANE_CX - PLANE_HALF,
        y: PLANE_CY - PLANE_HALF,
        width: PLANE_HALF * 2,
        height: PLANE_HALF * 2,
        fill: pal.bg,
        stroke: pal.border,
      }, planeG);
      for (let i = -max; i <= max; i += 1) {
        const axis = i === 0;
        const stroke = axis ? pal.textMuted : pal.border;
        const sw = axis ? 1.2 : 0.5;
        el('line', { x1: px(i), y1: py(-max - 0.5), x2: px(i), y2: py(max + 0.5), stroke, 'stroke-width': sw }, planeG);
        el('line', { x1: px(-max - 0.5), y1: py(i), x2: px(max + 0.5), y2: py(i), stroke, 'stroke-width': sw }, planeG);
      }
      const half = max % 2 === 0 ? max / 2 : 0;
      const ticks = half > 0 ? [-max, -half, half, max] : [-max, max];
      for (const v of ticks) {
        el('text', {
          x: px(v), y: py(0) + 14, 'text-anchor': 'middle',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.textMuted,
        }, planeG).textContent = num(v);
        el('text', {
          x: px(0) - 6, y: py(v) + 4, 'text-anchor': 'end',
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.textMuted,
        }, planeG).textContent = num(v);
      }
    };

    // ── 점 · 자국 · 고리 · 유령
    let total = 0;
    let home: StagePoint[] = [];
    let dots: SVGCircleElement[] = [];
    /** 점이 지금 그려진 자리 (운동 도중이면 도중의 자리) — 판이 바뀌면 여기서 처음 자리로 미끄러진다 */
    let shown: StagePoint[] = [];
    let rings: SVGCircleElement[] = [];
    let ghosts: SVGRectElement[] = [];

    const hue = (i: number): string => {
      const c = hues[i % hues.length];
      if (c === undefined) throw new Error('matrix-ops-stage: 색이 없다');
      return c;
    };
    const place = (e: SVGCircleElement, p: StagePoint): void => {
      e.setAttribute('cx', String(px(p[0])));
      e.setAttribute('cy', String(py(p[1])));
    };
    const placeGhost = (e: SVGRectElement, p: StagePoint): void => {
      e.setAttribute('x', String(px(p[0]) - GHOST_R));
      e.setAttribute('y', String(py(p[1]) - GHOST_R));
      e.setAttribute('transform', `rotate(45 ${px(p[0])} ${py(p[1])})`);
    };

    /** 출발 → 도착을 잇는 호 (그림일 뿐 — 중간 자리에 값이 없다) */
    const arcCtrl = (a: StagePoint, b: StagePoint): [number, number] => {
      const ax = px(a[0]);
      const ay = py(a[1]);
      const bx = px(b[0]);
      const by = py(b[1]);
      const dx = bx - ax;
      const dy = by - ay;
      return [(ax + bx) / 2 + dy * 0.3, (ay + by) / 2 - dx * 0.3];
    };
    const arcAt = (a: StagePoint, b: StagePoint, k: number): [number, number] => {
      const [cx, cy] = arcCtrl(a, b);
      const ax = px(a[0]);
      const ay = py(a[1]);
      const bx = px(b[0]);
      const by = py(b[1]);
      const u = 1 - k;
      return [u * u * ax + 2 * u * k * cx + k * k * bx, u * u * ay + 2 * u * k * cy + k * k * by];
    };
    const drawArcs = (from: readonly StagePoint[], to: readonly StagePoint[]): void => {
      clear(arcG);
      from.forEach((a, i) => {
        const b = to[i]!;
        if (a[0] === b[0] && a[1] === b[1]) return;
        const [cx, cy] = arcCtrl(a, b);
        el('path', {
          d: `M ${px(a[0])} ${py(a[1])} Q ${cx} ${cy} ${px(b[0])} ${py(b[1])}`,
          fill: 'none',
          stroke: hue(i),
          'stroke-width': 1.2,
          'stroke-dasharray': '3 4',
          opacity: 0.7,
        }, arcG);
      });
    };

    const checkPoints = (pts: readonly StagePoint[]): void => {
      if (pts.length !== total) throw new Error(`matrix-ops-stage: 점 수가 ${total} 이 아니다 (${pts.length})`);
    };

    /** 포갠 자리의 `×n` 표지. below 면 아래쪽에 단다 (유령 표지) */
    const drawBadges = (spots: readonly StageSpot[], below: boolean, fill: string): void => {
      for (const s of spots) {
        if (s.n < 2) continue;
        el('text', {
          x: px(s.x) + 11,
          y: py(s.y) + (below ? 20 : -10),
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill,
          'data-badge': below ? 'ghost' : 'dot',
        }, badgeG).textContent = t('label.stack', '×{n}', { n: s.n });
      }
    };
    const clearBadges = (kind: 'dot' | 'ghost' | 'all'): void => {
      for (const b of Array.from(badgeG.children)) {
        if (kind === 'all' || b.getAttribute('data-badge') === kind) b.remove();
      }
    };

    const jumpDots = (to: StagePoint[], spots: StageSpot[], ms: number): void => {
      checkPoints(to);
      // 앞 걸음의 운동이 아직 돌면 먼저 끝낸다 — 그 끝 그림이 앞 걸음 표지를 그리므로, 걷기는 그 뒤에
      finishTween('dots');
      const from = shown.map((p) => [p[0], p[1]] as StagePoint);
      drawArcs(from, to);
      clearBadges('all');
      tween('dots', ms, (k) => {
        dots.forEach((d, i) => {
          const [x, y] = arcAt(from[i]!, to[i]!, k);
          d.setAttribute('cx', String(x));
          d.setAttribute('cy', String(y));
          // 운동 도중에 판이 바뀌면 여기서 미끄러져 돌아간다 — 그린 자리를 수학 좌표로 되옮겨 쥔다
          shown[i] = [(x - PLANE_CX) / unit, (PLANE_CY - y) / unit];
        });
        if (k === 1) {
          shown = to.map((p) => [p[0], p[1]] as StagePoint);
          clearBadges('dot');
          drawBadges(spots, false, pal.text);
        }
      });
    };

    // ── 카드
    const mapName = (id: string): string => {
      switch (id) {
        case 'R': return t('label.map.R', 'Quarter turn counterclockwise');
        case 'Rinv': return t('label.map.Rinv', 'Quarter turn clockwise');
        case 'H': return t('label.map.H', 'Shear sideways');
        case 'S': return t('label.map.S', 'Double vertically');
        case 'F': return t('label.map.F', 'Flip upside down');
        case 'P': return t('label.map.P', 'Flatten onto the x-axis');
        default: throw new Error(`matrix-ops-stage: 모르는 변환 ${id}`);
      }
    };

    type Card = {
      g: SVGGElement;
      body: SVGGElement;
      kicker: SVGTextElement;
      title: SVGTextElement;
      line2: SVGTextElement;
      line3: SVGTextElement;
      cells: SVGTextElement[];
    };
    const makeCard = (y: number): Card => {
      const g = el('g', { transform: `translate(${CARD_X} ${y})` }, cardG);
      el('rect', { x: 0, y: 0, width: CARD_W, height: CARD_H, rx: 6, fill: pal.bgSubtle, stroke: pal.border }, g);
      const body = el('g', {}, g);
      const text = (x: number, yy: number, size: string, fill: string, weight = 400, family: string = fonts.body) =>
        el('text', { x, y: yy, 'font-family': family, 'font-size': size, 'font-weight': weight, fill }, body);
      const kicker = text(12, 20, fontSizes.xs, pal.textMuted);
      const title = text(12, 42, fontSizes.lg, pal.text, 700, fonts.mono);
      const line2 = text(12, 62, fontSizes.sm, pal.text);
      const line3 = text(12, 80, fontSizes.sm, pal.textMuted);
      // 행렬 — 괄호와 칸 넷 (행 차례)
      const mx = CARD_W - 88;
      const bracket = (x: number, dir: 1 | -1) =>
        el('path', {
          d: `M ${x + dir * 6} 16 L ${x} 16 L ${x} 72 L ${x + dir * 6} 72`,
          fill: 'none', stroke: pal.text, 'stroke-width': 1.4,
        }, body);
      bracket(mx, 1);
      bracket(mx + 84, -1);
      const cells: SVGTextElement[] = [];
      for (let r = 0; r < 2; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          const cell = el('text', {
            x: mx + 24 + c * 36, y: 38 + r * 26, 'text-anchor': 'middle',
            'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: pal.text,
          }, body);
          cells.push(cell);
        }
      }
      return { g, body, kicker, title, line2, line3, cells };
    };
    const cardX = makeCard(CARD_Y[0]);
    const cardY = makeCard(CARD_Y[1]);
    const cardYX = makeCard(CARD_Y[2]);
    const cardXY = makeCard(CARD_Y[3]);
    const setCells = (card: Card, m: readonly number[]): void => {
      if (m.length !== 4) throw new Error('matrix-ops-stage: 행렬 칸이 넷이 아니다');
      card.cells.forEach((c, i) => { c.textContent = num(m[i]!); });
    };
    const showCard = (card: Card, on: boolean): void => {
      card.g.setAttribute('visibility', on ? 'visible' : 'hidden');
    };
    /** 카드가 선다 — 오른쪽에서 밀려 들어온다 */
    const slideIn = (key: string, card: Card, ms: number): void => {
      showCard(card, true);
      tween(key, ms, (k) => {
        card.body.setAttribute('transform', `translate(${(1 - k) * 28} 0)`);
        card.g.setAttribute('opacity', String(0.25 + 0.75 * k));
      });
    };
    const fillMapCard = (card: Card, kicker: string, letter: 'X' | 'Y', v: StageCard): void => {
      card.kicker.textContent = kicker;
      card.title.textContent = `${letter} = ${v.symbol}`;
      card.line2.textContent = mapName(v.mapId);
      card.line3.textContent = t('label.detOf', 'det {name} = {d}', { name: letter, d: num(v.det) });
      setCells(card, v.m);
    };
    for (const c of [cardX, cardY, cardYX, cardXY]) showCard(c, false);

    // ── 범례 (그림 이름은 messages)
    const drawLegend = (): void => {
      clear(legendG);
      const items: [string, (x: number) => void][] = [
        [t('label.legend.home', 'Home'), (x) => { el('circle', { cx: x, cy: LEGEND_Y - 4, r: HOME_R, fill: 'none', stroke: pal.textMuted, 'stroke-width': 1.4 }, legendG); }],
        [t('label.legend.dot', 'Two jumps'), (x) => { el('circle', { cx: x, cy: LEGEND_Y - 4, r: DOT_R - 1, fill: pal.textMuted }, legendG); }],
        [t('label.legend.ring', 'YX in one jump'), (x) => { el('circle', { cx: x, cy: LEGEND_Y - 4, r: RING_R - 3, fill: 'none', stroke: pal.textMuted, 'stroke-width': 1.6 }, legendG); }],
        [t('label.legend.ghost', 'XY in one jump'), (x) => {
          el('rect', {
            x: x - 6, y: LEGEND_Y - 10, width: 12, height: 12, fill: 'none', stroke: pal.textMuted,
            'stroke-width': 1.4, 'stroke-dasharray': '3 2', transform: `rotate(45 ${x} ${LEGEND_Y - 4})`,
          }, legendG);
        }],
      ];
      items.forEach(([label, icon], i) => {
        const x = 34 + i * 180;
        icon(x);
        el('text', {
          x: x + 14, y: LEGEND_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.textMuted,
        }, legendG).textContent = label;
      });
    };

    const clearConclusions = (): void => {
      clear(arcG);
      clear(ringG);
      clear(ghostG);
      clearBadges('all');
      rings = [];
      ghosts = [];
      showCard(cardYX, false);
      showCard(cardXY, false);
      caption.textContent = '';
    };

    const reset = (): void => {
      stopAll(false);
      clearConclusions();
      clear(planeG);
      clear(homeG);
      clear(dotG);
      clear(legendG);
      dots = [];
      shown = [];
      home = [];
      total = 0;
      axisMax = 0;
      showCard(cardX, false);
      showCard(cardY, false);
    };

    const stage: MatrixOpsStage = {
      reset,
      round(v, ms) {
        // 앞 판의 운동을 끊고 결론을 걷는다. 점의 자리는 미끄러져 돌아올 출발점으로 쓴다
        stopAll(false);
        clearConclusions();
        if (v.home.length !== v.total || v.total === 0) throw new Error('matrix-ops-stage: 처음 자리 수가 어긋난다');
        const fresh = dots.length !== v.total || axisMax !== v.axisMax || isInstant();
        if (axisMax !== v.axisMax) drawPlane(v.axisMax);
        total = v.total;
        home = v.home.map((p) => [p[0], p[1]] as StagePoint);
        clear(homeG);
        home.forEach((p, i) => {
          el('circle', {
            cx: px(p[0]), cy: py(p[1]), r: HOME_R, fill: pal.bg, stroke: hue(i), 'stroke-width': 1.6,
          }, homeG);
        });
        if (dots.length !== total) {
          clear(dotG);
          dots = home.map((p, i) => {
            const d = el('circle', { r: DOT_R, fill: hue(i), stroke: pal.bg, 'stroke-width': 1.5 }, dotG);
            place(d, p);
            return d;
          });
        }
        if (fresh) {
          dots.forEach((d, i) => place(d, home[i]!));
          shown = home.map((p) => [p[0], p[1]] as StagePoint);
        } else {
          const from = shown.map((p) => [p[0], p[1]] as StagePoint);
          tween('dots', ms, (k) => {
            dots.forEach((d, i) => {
              const x = from[i]![0] + (home[i]![0] - from[i]![0]) * k;
              const y = from[i]![1] + (home[i]![1] - from[i]![1]) * k;
              place(d, [x, y]);
              shown[i] = [x, y];
            });
          });
        }
        fillMapCard(cardX, t('label.first', 'First'), 'X', v.xCard);
        fillMapCard(cardY, t('label.then', 'Then'), 'Y', v.yCard);
        if (fresh) {
          showCard(cardX, true);
          showCard(cardY, true);
          cardX.body.removeAttribute('transform');
          cardY.body.removeAttribute('transform');
          cardX.g.setAttribute('opacity', '1');
          cardY.g.setAttribute('opacity', '1');
        } else {
          slideIn('card-x', cardX, ms);
          slideIn('card-y', cardY, ms);
        }
        drawLegend();
        caption.textContent = t('caption.round', 'First X = {x}, then Y = {y} · points at home: {n}', {
          x: v.xCard.symbol,
          y: v.yCard.symbol,
          n: v.total,
        });
      },
      jumpFirst(v, ms) {
        jumpDots(v.points, v.spots, ms);
        caption.textContent = t('caption.jumpX', 'Jump by X → spots: {n}', { n: v.spotCount });
      },
      jumpSecond(v, ms) {
        jumpDots(v.points, v.spots, ms);
        caption.textContent = t('caption.jumpY', 'Jump by Y → spots: {n} · back home: {h} / {total}', {
          n: v.spotCount,
          h: v.homeCount,
          total: v.total,
        });
      },
      product(v, ms) {
        clear(arcG);
        cardYX.kicker.textContent = t('label.product', 'One matrix for both');
        cardYX.title.textContent = 'YX';
        cardYX.line2.textContent = '';
        cardYX.line3.textContent = t('label.detProduct', 'det Y × det X = {dy} × {dx} = {d}', {
          dy: num(v.detY),
          dx: num(v.detX),
          d: num(v.detYX),
        });
        setCells(cardYX, v.yx);
        slideIn('card-yx', cardYX, ms);
        caption.textContent = t('caption.product', 'YX = {m} · det Y × det X = {dy} × {dx} = {d}', {
          m: formatMatrix(v.yx),
          dy: num(v.detY),
          dx: num(v.detX),
          d: num(v.detYX),
        });
      },
      jumpOnce(v, ms) {
        checkPoints(v.points);
        clear(ringG);
        drawArcs(home, v.points);
        rings = home.map((p, i) => {
          const r = el('circle', { r: RING_R, fill: 'none', stroke: hue(i), 'stroke-width': 2 }, ringG);
          place(r, p);
          return r;
        });
        tween('rings', ms, (k) => {
          rings.forEach((r, i) => {
            const [x, y] = arcAt(home[i]!, v.points[i]!, k);
            r.setAttribute('cx', String(x));
            r.setAttribute('cy', String(y));
          });
        });
        caption.textContent = t('caption.once', 'From home by YX in one jump → same as two jumps: {k} / {total}', {
          k: v.matchCount,
          total: v.total,
        });
      },
      jumpSwapped(v, ms) {
        checkPoints(v.points);
        clear(ghostG);
        clearBadges('ghost');
        drawArcs(home, v.points);
        ghosts = home.map((p, i) => {
          const g = el('rect', {
            width: GHOST_R * 2, height: GHOST_R * 2, fill: 'none', stroke: hue(i),
            'stroke-width': 1.8, 'stroke-dasharray': '4 3',
          }, ghostG);
          placeGhost(g, p);
          return g;
        });
        tween('ghosts', ms, (k) => {
          ghosts.forEach((g, i) => {
            const [x, y] = arcAt(home[i]!, v.points[i]!, k);
            g.setAttribute('x', String(x - GHOST_R));
            g.setAttribute('y', String(y - GHOST_R));
            g.setAttribute('transform', `rotate(45 ${x} ${y})`);
          });
          if (k === 1) {
            clearBadges('ghost');
            drawBadges(v.spots, true, pal.textMuted);
          }
        });
        cardXY.kicker.textContent = t('label.swapped', 'Order swapped');
        cardXY.title.textContent = 'XY';
        cardXY.line2.textContent = '';
        cardXY.line3.textContent = t('label.sameSpot', 'Same spot as YX: {s} / {total}', { s: v.sameCount, total: v.total });
        setCells(cardXY, v.xy);
        slideIn('card-xy', cardXY, ms);
        caption.textContent = t('caption.swapped', 'XY = {m} in one jump → same spot as YX: {s} / {total}', {
          m: formatMatrix(v.xy),
          s: v.sameCount,
          total: v.total,
        });
      },
    };

    return {
      ...stage,
      destroy() {
        destroyed = true;
        stopAll(false);
        root.remove();
      },
    };
  },
};
