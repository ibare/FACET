/**
 * longest-match-wins 의 무대 — 뻗어 나가 겨룬다.
 *
 * 원문 한 줄이 위에 놓이고, 지금 자리에서 맞는 규칙마다 줄 하나를 받아 원문 아래로
 * 제 길이만큼 뻗는다. 가장 멀리 간 끝에 결승선이 서고, 집음 걸음에서 이긴 줄은
 * 원문으로 올라가 그 구간을 집고, 진 줄은 제 출발점으로 도로 물러나 빈 테두리만 남는다.
 */
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { LaneCand, LongestMatchWinsScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 24;
const CELL_MAX = 40;
const INDEX_Y = 20;
const CURSOR_TOP = 26;
const CELL_TOP = 36;
const CELL_H = 36;
const SPAN_Y = CELL_TOP + CELL_H + 8;
const SPAN_H = 4;
const SPAN_LABEL_Y = SPAN_Y + SPAN_H + 16;
const LANES_TOP = SPAN_LABEL_Y + 20;
const LANES_BOTTOM = H - 64;
const COUNT_Y = H - 44;
const LANE_PITCH_MAX = 58;
const BAR_H = 26;
const CAPTION_Y = H - 16;

const GROW_MS = 400;
const PICK_MS = 450;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Geometry = { cellW: number; x0: number; pitch: number };

function geometry(scene: LongestMatchWinsScene): Geometry {
  const n = Math.max(1, scene.source.length);
  const cellW = Math.min(CELL_MAX, (PIECE_CANVAS_W - 2 * PAD_X) / n);
  const x0 = (PIECE_CANVAS_W - n * cellW) / 2;
  const lanes = Math.max(1, scene.cands.length);
  const pitch = Math.min(LANE_PITCH_MAX, (LANES_BOTTOM - LANES_TOP) / lanes);
  return { cellW, x0, pitch };
}

function laneBarY(i: number, g: Geometry): number {
  return LANES_TOP + i * g.pitch + 16;
}

/** 운동이 손대는 요소들 — drawStatic 이 매번 새로 만든다 */
type Handles = {
  bars: { rect: SVGRectElement; num: SVGTextElement; full: number; x: number }[];
  lastSpan: SVGElement[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function drawStatic(
  svg: SVGSVGElement,
  scene: LongestMatchWinsScene,
  c: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const handles: Handles = { bars: [], lastSpan: [] };
  if (scene.source.length === 0) throw new Error('무대: 원문이 없다');
  const g = geometry(scene);

  // 자리 번호와 원문 글자
  for (let i = 0; i < scene.source.length; i += 1) {
    const ch = scene.source[i]!;
    const cx = g.x0 + (i + 0.5) * g.cellW;
    const idx = el('text', {
      x: cx, y: INDEX_Y, 'text-anchor': 'middle', 'font-family': fonts.mono,
      'font-size': fontSizes.xs, fill: c.textMuted,
    }, svg);
    idx.textContent = String(i);
    if (ch === ' ') continue;
    el('rect', {
      x: g.x0 + i * g.cellW + 1, y: CELL_TOP, width: g.cellW - 2, height: CELL_H, rx: 3,
      fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1,
    }, svg);
    const glyph = el('text', {
      x: cx, y: CELL_TOP + CELL_H / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': fonts.mono, 'font-size': fontSizes.xl, fill: c.text,
    }, svg);
    glyph.textContent = ch;
  }

  // 집은 토큰 — 원문 아래 구간 줄과 종류
  scene.tokens.forEach((tok, k) => {
    const x = g.x0 + tok.pos * g.cellW + 2;
    const w = tok.len * g.cellW - 4;
    const bar = el('rect', { x, y: SPAN_Y, width: w, height: SPAN_H, rx: 2, fill: c.text }, svg);
    const label = el('text', {
      x: x + w / 2, y: SPAN_LABEL_Y, 'text-anchor': 'middle', 'font-family': fonts.mono,
      'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text,
    }, svg);
    label.textContent = tok.kind;
    if (k === scene.tokens.length - 1 && scene.step === 'pick') handles.lastSpan.push(bar, label);
  });

  // 토큰 수
  const count = el('text', {
    x: PIECE_CANVAS_W - PAD_X, y: COUNT_Y, 'text-anchor': 'end', 'font-family': fonts.body,
    'font-size': fontSizes.sm, fill: c.textMuted,
  }, svg);
  count.textContent = t('label.tokens', 'Tokens: {n}', { n: scene.tokens.length });

  const pos = scene.pos;
  if (scene.step !== 'start' && (pos === null || scene.cands.length === 0)) {
    throw new Error(`무대: ${scene.step} 걸음인데 자리나 후보가 없다`);
  }
  if (pos !== null) {
    const originX = g.x0 + pos * g.cellW;

    // 지금 자리 표시
    const tipX = originX + g.cellW / 2;
    el('path', {
      d: `M ${r2(tipX - 5)} ${CURSOR_TOP} L ${r2(tipX + 5)} ${CURSOR_TOP} L ${r2(tipX)} ${CURSOR_TOP + 7} Z`,
      fill: c.primary,
    }, svg);

    // 결승선 — 가장 멀리 뻗은 끝
    const far = scene.cands.reduce((m, cand) => Math.max(m, cand.len), 0);
    const finishX = originX + far * g.cellW;
    const lastBarBottom = laneBarY(scene.cands.length - 1, g) + BAR_H;
    el('line', {
      x1: finishX, y1: CELL_TOP, x2: finishX, y2: lastBarBottom + 4,
      stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3',
    }, svg);

    scene.cands.forEach((cand: LaneCand, i) => {
      const barY = laneBarY(i, g);
      const full = cand.len * g.cellW;
      const won = scene.step === 'pick' && cand.rule === scene.winner;
      const lost = scene.step === 'pick' && !won;

      // 규칙 이름 · 규칙 열의 번째
      const head = el('text', {
        x: originX + 2, y: barY - 5, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        fill: lost ? c.textMuted : c.text,
        // 결승선이 글자를 지나가도 읽히게 바탕색 테두리를 두른다
        stroke: c.bg, 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
      }, svg);
      const nameSpan = el('tspan', { 'font-weight': 600 }, head);
      nameSpan.textContent = cand.name;
      const rankSpan = el('tspan', { dx: 8, 'font-family': fonts.body, fill: c.textMuted }, head);
      rankSpan.textContent = t('label.rank', 'rule #{n}', { n: cand.rule + 1 });

      const rect = el('rect', {
        x: originX + 2, y: barY, width: Math.max(0, full - 4), height: BAR_H, rx: 4,
        fill: lost ? 'none' : won ? c.accent : c.itemComparing,
        stroke: lost ? c.textMuted : won ? c.text : 'none',
        'stroke-width': won ? 1.5 : 1,
        ...(lost ? { 'stroke-dasharray': '4 3' } : {}),
      }, svg);
      const numText = el('text', {
        x: originX + full - 8, y: barY + BAR_H / 2, 'text-anchor': 'end', 'dominant-baseline': 'central',
        'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600,
        fill: lost ? c.textMuted : c.stateInk,
      }, svg);
      numText.textContent = String(cand.len);
      handles.bars.push({ rect, num: numText, full, x: originX });
    });
  }

  // 캡션 — 지금 일어나는 일
  const caption = el('text', {
    x: PIECE_CANVAS_W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-family': fonts.body,
    'font-size': fontSizes.md, fill: c.text,
  }, svg);
  caption.textContent = captionOf(scene, t);
  return handles;
}

function captionOf(scene: LongestMatchWinsScene, t: Translate): string {
  if (scene.step === 'candidates') {
    if (scene.pos === null) throw new Error('무대: 후보 걸음인데 자리가 없다');
    return t('caption.candidates', 'Position {pos} — rules that match: {n}', {
      pos: scene.pos,
      n: scene.cands.length,
    });
  }
  if (scene.step === 'pick') {
    const win = scene.cands.find((cand) => cand.rule === scene.winner);
    if (win === undefined) throw new Error(`무대: 이긴 규칙 ${String(scene.winner)} 이 후보에 없다`);
    const vars = { name: win.name, len: win.len };
    if (scene.why === 'only') return t('caption.only', 'Only one rule matches: {name}, length {len}', vars);
    if (scene.why === 'tie') {
      return t('caption.tie', 'Same length {len} — the rule listed earlier takes it: {name}', vars);
    }
    return t('caption.longer', 'The farthest reach takes it: {name}, length {len}', vars);
  }
  return t('caption.start', 'Reading from the left, one position at a time.');
}

export const longestMatchWinsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let start: number | null = null;
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(ease(p));
          if (p < 1) {
            id = requestAnimationFrame(tick);
            frames.add(id);
          } else {
            finish();
          }
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    const renderer: SceneRenderer<LongestMatchWinsScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        const handles = drawStatic(svg, next, c, t);
        if (!opts.animate || destroyed) return;

        if (next.step === 'candidates') {
          // 후보마다 제 출발점에서 제 길이만큼 뻗는다
          const grow = (p: number): void => {
            for (const b of handles.bars) {
              const w = b.full * p;
              b.rect.setAttribute('width', String(r2(Math.max(0, w - 4))));
              b.num.setAttribute('x', String(r2(b.x + w - 8)));
              b.num.setAttribute('opacity', String(r2(p)));
            }
          };
          grow(0);
          await tween(GROW_MS, mine, grow);
        } else if (next.step === 'pick' && prev !== null) {
          await animatePick(next, handles, mine);
        } else {
          return;
        }
        if (mine === gen && !destroyed) drawStatic(svg, next, c, t);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    /** 진 줄은 채움이 출발점으로 물러나고, 이긴 줄은 원문으로 올라가 구간을 집는다 */
    async function animatePick(next: LongestMatchWinsScene, handles: Handles, mine: number): Promise<void> {
      const g = geometry(next);
      const pos = next.pos;
      if (pos === null) throw new Error('무대: 집음 걸음인데 자리가 없다');
      const originX = g.x0 + pos * g.cellW;
      for (const node of handles.lastSpan) node.setAttribute('opacity', '0');

      const retreats: { fill: SVGRectElement; full: number }[] = [];
      let flyer: { rect: SVGRectElement; fromY: number; w: number } | null = null;
      next.cands.forEach((cand, i) => {
        const barY = laneBarY(i, g);
        const full = cand.len * g.cellW;
        if (cand.rule === next.winner) {
          const rect = el('rect', {
            x: originX + 2, y: barY, width: full - 4, height: BAR_H, rx: 4,
            fill: c.accent, stroke: c.text, 'stroke-width': 1.5,
          }, svg);
          flyer = { rect, fromY: barY, w: full - 4 };
        } else {
          const fill = el('rect', {
            x: originX + 2, y: barY, width: full - 4, height: BAR_H, rx: 4, fill: c.itemComparing,
          }, svg);
          retreats.push({ fill, full });
        }
      });
      const fly = flyer as { rect: SVGRectElement; fromY: number; w: number } | null;

      await tween(PICK_MS, mine, (p) => {
        for (const r of retreats) r.fill.setAttribute('width', String(r2(Math.max(0, (r.full - 4) * (1 - p)))));
        if (fly !== null) {
          const y = fly.fromY + (SPAN_Y - fly.fromY) * p;
          const h = BAR_H + (SPAN_H - BAR_H) * p;
          fly.rect.setAttribute('y', String(r2(y)));
          fly.rect.setAttribute('height', String(r2(h)));
        }
      });
    }

    return renderer as unknown as ViewInstance;
  },
};
