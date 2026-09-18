/**
 * erase-the-impossible 의 그림.
 *
 * 위 두 줄은 문법의 자리와 지금까지의 출력이다. 채울 자리가 밝게 표시된다.
 * 아래는 후보 여섯 — 원의 **넓이**가 확률이다. 문법이 막는 후보는 고르기 전에 지워진다:
 * 원이 줄어 사라지고(점선 자국만 남는다), 그 몫이 작은 원으로 떨어져 나와 남은 후보에게
 * 날아가 붙는다. 남은 후보가 그만큼 커진다. 고르는 걸음에서 남은 1등이 출력 자리로 올라간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { EraseBase, EraseScene, GrammarCell } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 420;
const W = PIECE_CANVAS_W;

const PAD = 16;
const LABEL_COL = 80;
const ROW_GRAMMAR = 36;
const ROW_OUTPUT = 80;
const SLOT_H = 28;
const SLOT_W_MAX = 104;
const GRID_LABEL_Y = 126;
const GRID_TOP = 136;
const CAPTION_Y = H - 16;
const GRID_BOTTOM = H - 40;
const COLS_MAX = 3;
const R_CAP = 44;

const OFFER_MS = 700;
const ERASE_MS = 1100;
const PICK_MS = 800;

type Cell = { cx: number; cy: number; rMax: number; labelY: number; probY: number };

/** 좌표 문자열 — 끝자리와 -0 을 걷는다. */
function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function slotLayout(count: number): { x0: number; w: number } {
  const avail = W - PAD - LABEL_COL - PAD;
  const w = Math.min(SLOT_W_MAX, avail / Math.max(1, count));
  return { x0: PAD + LABEL_COL, w };
}

function gridLayout(count: number): Cell[] {
  const cols = Math.max(1, Math.min(COLS_MAX, count));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (W - 2 * PAD) / cols;
  const cellH = (GRID_BOTTOM - GRID_TOP) / rows;
  // 원 아래에 토큰 한 줄 · 확률 한 줄 (합 40) 을 둔다
  const rMax = Math.max(4, Math.min(R_CAP, cellW / 2 - 8, (cellH - 44) / 2));
  const cells: Cell[] = [];
  for (let i = 0; i < count; i += 1) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const top = GRID_TOP + r * cellH;
    const cx = PAD + cellW * (c + 0.5);
    const cy = top + 4 + rMax;
    cells.push({ cx, cy, rMax, labelY: cy + rMax + 18, probY: cy + rMax + 34 });
  }
  return cells;
}

/** 원 옆 꼬리표 — 오른쪽 끝 칸은 캔버스를 넘지 않게 왼쪽에 단다. */
function tagOnLeft(cell: Cell): boolean {
  return cell.cx > W * 0.66;
}

function tagX(cell: Cell): number {
  return tagOnLeft(cell) ? cell.cx - cell.rMax - 8 : cell.cx + cell.rMax + 8;
}

function tagAnchor(cell: Cell): string {
  return tagOnLeft(cell) ? 'end' : 'start';
}

function radius(cell: Cell, p: number): number {
  return cell.rMax * Math.sqrt(Math.max(0, p));
}

function ease(k: number): number {
  const x = Math.min(1, Math.max(0, k));
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

type Drawn = {
  live: Map<number, SVGCircleElement>;
  strikes: { line: SVGLineElement; x1: number; x2: number }[];
  probLive: SVGTextElement[];
  outChip: SVGGElement | null;
  cells: Cell[];
};

export const eraseTheImpossibleStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<EraseScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    function slotName(slot: GrammarCell | undefined): string {
      if (!slot) return '';
      return slot.int ? t('label.int', '<integer>') : slot.text;
    }

    function drawStatic(scene: EraseScene): Drawn | null {
      svg.textContent = '';
      const base = scene.base;
      if (!base) return null;
      const n = base.grammar.length;
      const { x0, w } = slotLayout(n);
      const cur = scene.d >= 0 && scene.phase !== 'picked' ? base.decisions[scene.d] : undefined;
      const curSlot = cur ? cur.slot : -1;

      // 문법 줄과 출력 줄
      label(svg, PAD, ROW_GRAMMAR + 5, t('label.grammar', 'grammar'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      label(svg, PAD, ROW_OUTPUT + 5, t('label.output', 'output'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      const outTokens: { tok: string; picked: boolean }[] = base.prefix.map((tok) => ({
        tok,
        picked: false,
      }));
      for (const idx of scene.picks) {
        outTokens.push({ tok: base.vocab[idx] ?? '', picked: true });
      }
      let outChip: SVGGElement | null = null;
      for (let s = 0; s < n; s += 1) {
        const cx = x0 + w * (s + 0.5);
        const isCur = s === curSlot;
        el(svg, 'rect', {
          x: x0 + w * s + 3,
          y: ROW_GRAMMAR - SLOT_H / 2,
          width: w - 6,
          height: SLOT_H,
          rx: 5,
          fill: colors.bgSubtle,
          stroke: isCur ? colors.accent : colors.border,
          'stroke-width': isCur ? 3 : 1,
        });
        const slot = base.grammar[s];
        label(svg, cx, ROW_GRAMMAR + 5, slotName(slot), {
          mono: !slot?.int,
          size: slot?.int ? fontSizes.sm : fontSizes.md,
          fill: colors.text,
          weight: isCur ? '700' : '400',
        });
        const out = outTokens[s];
        if (out) {
          const g = el(svg, 'g', {});
          if (out.picked) {
            el(g, 'rect', {
              x: cx - (w - 14) / 2,
              y: ROW_OUTPUT - SLOT_H / 2,
              width: w - 14,
              height: SLOT_H,
              rx: 5,
              fill: colors.primary,
            });
          }
          label(g, cx, ROW_OUTPUT + 5, out.tok, {
            mono: true,
            size: fontSizes.md,
            fill: out.picked ? colors.textInverse : colors.text,
          });
          if (out.picked && s === base.prefix.length + scene.d) outChip = g;
        } else {
          el(svg, 'line', {
            x1: cx - (w - 20) / 2,
            y1: ROW_OUTPUT + 10,
            x2: cx + (w - 20) / 2,
            y2: ROW_OUTPUT + 10,
            stroke: isCur ? colors.accent : colors.border,
            'stroke-width': isCur ? 3 : 1,
            'stroke-dasharray': isCur ? 'none' : '4 4',
          });
        }
      }

      const cells = gridLayout(base.vocab.length);
      const drawn: Drawn = { live: new Map(), strikes: [], probLive: [], outChip, cells };
      if (scene.d < 0 || !scene.phase) return drawn;
      const dec = base.decisions[scene.d];
      if (!dec) return drawn;
      const erased = scene.phase !== 'offer';

      label(
        svg,
        PAD,
        GRID_LABEL_Y,
        t('label.decision', 'Next token — decision {k} of {n}', {
          k: scene.d + 1,
          n: base.decisions.length,
        }),
        { anchor: 'start', fill: colors.textMuted },
      );

      const pickIdx = scene.phase === 'picked' ? (scene.picks[scene.d] ?? -1) : -1;
      for (let i = 0; i < base.vocab.length; i += 1) {
        const cell = cells[i];
        if (!cell) continue;
        const pFull = dec.full[i] ?? 0;
        const pKept = dec.kept[i] ?? 0;
        const gone = erased && !dec.allowed[i];
        const rFull = radius(cell, pFull);
        if (gone) {
          // 지운 자국 — 원래 크기의 점선
          el(svg, 'circle', {
            cx: cell.cx,
            cy: cell.cy,
            r: Math.max(1, rFull),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
        } else {
          const c = el(svg, 'circle', {
            cx: cell.cx,
            cy: cell.cy,
            r: erased ? radius(cell, pKept) : rFull,
            fill: colors.primary,
          });
          drawn.live.set(i, c);
        }
        if (i === dec.top) {
          el(svg, 'circle', {
            cx: cell.cx,
            cy: cell.cy,
            r: rFull + 5,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
          });
          label(svg, tagX(cell), cell.cy - cell.rMax + 10, t('label.modelTop', "model's #1"), {
            anchor: tagAnchor(cell),
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        }
        if (i === pickIdx) {
          label(svg, tagX(cell), cell.cy + 4, t('label.picked', 'picked'), {
            anchor: tagAnchor(cell),
            size: fontSizes.xs,
            fill: colors.success,
            weight: '600',
          });
        }
        label(svg, cell.cx, cell.labelY, base.vocab[i] ?? '', {
          mono: true,
          size: fontSizes.md,
          fill: gone ? colors.textMuted : colors.text,
        });
        if (gone) {
          const half = 22;
          const strike = el(svg, 'line', {
            x1: cell.cx - half,
            y1: cell.labelY - 5,
            x2: cell.cx + half,
            y2: cell.labelY - 5,
            stroke: colors.danger,
            'stroke-width': 2,
            'stroke-linecap': 'round',
          });
          drawn.strikes.push({ line: strike, x1: cell.cx - half, x2: cell.cx + half });
          label(svg, cell.cx, cell.probY, pFull.toFixed(2), {
            size: fontSizes.xs,
            fill: colors.textMuted,
          });
        } else if (erased) {
          drawn.probLive.push(
            label(
              svg,
              cell.cx,
              cell.probY,
              t('label.renorm', '{from} → {to}', { from: pFull.toFixed(2), to: pKept.toFixed(2) }),
              { size: fontSizes.xs, fill: colors.text, weight: '600' },
            ),
          );
        } else {
          label(svg, cell.cx, cell.probY, pFull.toFixed(2), { size: fontSizes.xs, fill: colors.text });
        }
      }

      label(svg, W / 2, CAPTION_Y, captionOf(scene, base), { size: fontSizes.md });
      return drawn;
    }

    function captionOf(scene: EraseScene, base: EraseBase): string {
      const dec = base.decisions[scene.d];
      if (!dec) return '';
      if (scene.phase === 'offer') {
        return t('caption.offer', "Model's #1 here: {token} at {p}. The grammar wants {slot}.", {
          token: base.vocab[dec.top] ?? '',
          p: (dec.full[dec.top] ?? 0).toFixed(2),
          slot: slotName(base.grammar[dec.slot]),
        });
      }
      if (scene.phase === 'erased') {
        let count = 0;
        let lastKept = -1;
        let keptCount = 0;
        dec.allowed.forEach((a, i) => {
          if (a) {
            keptCount += 1;
            lastKept = i;
          } else count += 1;
        });
        if (keptCount === 1) {
          return t(
            'caption.eraseOne',
            'Erased {n} forbidden tokens ({mass} in all); all of it goes to {token}.',
            { n: count, mass: dec.erasedMass.toFixed(2), token: base.vocab[lastKept] ?? '' },
          );
        }
        return t(
          'caption.erase',
          'Erased {n} forbidden tokens ({mass} in all); the rest share it.',
          { n: count, mass: dec.erasedMass.toFixed(2) },
        );
      }
      const idx = scene.picks[scene.d] ?? -1;
      return t('caption.pick', 'Picked: {token}. Without erasing: {top}.', {
        token: base.vocab[idx] ?? '',
        top: base.vocab[dec.top] ?? '',
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 k(0→1) 를 흘린다. 세대가 바뀌면 멈춘다. */
    async function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const k = Math.min(1, (Date.now() - start) / ms);
        frame(k);
        if (k >= 1) return true;
        await wait(16);
      }
    }

    async function animateOffer(scene: EraseScene, drawn: Drawn, mine: number): Promise<void> {
      const base = scene.base;
      const dec = base?.decisions[scene.d];
      if (!base || !dec) return;
      const targets = [...drawn.live.entries()].map(([i, c]) => ({
        c,
        r: radius(drawn.cells[i] as Cell, dec.full[i] ?? 0),
      }));
      await tween(OFFER_MS, mine, (k) => {
        const e = ease(k);
        for (const { c, r } of targets) c.setAttribute('r', num(r * e));
      });
    }

    async function animateErase(scene: EraseScene, drawn: Drawn, mine: number): Promise<void> {
      const base = scene.base;
      const dec = base?.decisions[scene.d];
      if (!base || !dec) return;
      const cells = drawn.cells;
      // 지워지는 원 — 원래 크기에서 줄어든다
      const shrinking: { c: SVGCircleElement; r: number }[] = [];
      for (let i = 0; i < base.vocab.length; i += 1) {
        const cell = cells[i];
        if (!cell || dec.allowed[i]) continue;
        shrinking.push({
          c: el(svg, 'circle', { cx: cell.cx, cy: cell.cy, r: radius(cell, dec.full[i] ?? 0), fill: colors.primary }),
          r: radius(cell, dec.full[i] ?? 0),
        });
      }
      // 떨어져 나간 몫 — 지운 후보 e 에서 남은 후보 a 로, 넓이 full[e]·kept[a]
      const flights: { c: SVGCircleElement; x0: number; y0: number; x1: number; y1: number; r: number }[] = [];
      for (let e = 0; e < base.vocab.length; e += 1) {
        const from = cells[e];
        if (!from || dec.allowed[e]) continue;
        for (let a = 0; a < base.vocab.length; a += 1) {
          const to = cells[a];
          if (!to || !dec.allowed[a]) continue;
          const share = (dec.full[e] ?? 0) * (dec.kept[a] ?? 0);
          const r = radius(to, share);
          flights.push({
            c: el(svg, 'circle', {
              cx: from.cx,
              cy: from.cy,
              r: 0,
              fill: colors.primary,
              'fill-opacity': 0.75,
              stroke: colors.bg,
              'stroke-width': 1,
            }),
            x0: from.cx,
            y0: from.cy,
            x1: to.cx,
            y1: to.cy,
            r,
          });
        }
      }
      const growing = [...drawn.live.entries()].map(([i, c]) => ({
        c,
        r0: radius(cells[i] as Cell, dec.full[i] ?? 0),
        r1: radius(cells[i] as Cell, dec.kept[i] ?? 0),
      }));
      const strikeEnds = drawn.strikes;
      for (const p of drawn.probLive) p.setAttribute('opacity', '0');

      await tween(ERASE_MS, mine, (k) => {
        // 0 ~ 0.3: 줄이 그어진다 / 0.15 ~ 0.55: 지운 원이 줄고 몫이 떨어져 나온다
        // 0.35 ~ 1: 몫이 날아가 붙고 남은 원이 자란다
        const ks = ease(k / 0.3);
        for (const { line, x1, x2 } of strikeEnds) line.setAttribute('x2', num(x1 + (x2 - x1) * ks));
        const kShrink = ease((k - 0.15) / 0.4);
        for (const { c, r } of shrinking) c.setAttribute('r', num(r * (1 - kShrink)));
        const kFly = ease((k - 0.35) / 0.55);
        for (const f of flights) {
          const appear = Math.min(1, Math.max(0, (k - 0.15) / 0.2));
          const land = Math.min(1, Math.max(0, (k - 0.85) / 0.15));
          f.c.setAttribute('cx', num(f.x0 + (f.x1 - f.x0) * kFly));
          f.c.setAttribute('cy', num(f.y0 + (f.y1 - f.y0) * kFly));
          f.c.setAttribute('r', num(f.r * appear * (1 - land)));
        }
        const kGrow = ease((k - 0.45) / 0.55);
        for (const g of growing) g.c.setAttribute('r', num(g.r0 + (g.r1 - g.r0) * kGrow));
      });
    }

    async function animatePick(scene: EraseScene, drawn: Drawn, mine: number): Promise<void> {
      const base = scene.base;
      const idx = scene.picks[scene.d];
      if (!base || idx === undefined || !drawn.outChip) return;
      const cell = drawn.cells[idx];
      if (!cell) return;
      const n = base.grammar.length;
      const { x0, w } = slotLayout(n);
      const slot = base.prefix.length + scene.d;
      const tx = x0 + w * (slot + 0.5);
      const ty = ROW_OUTPUT;
      const chip = drawn.outChip;
      // 칩은 이미 끝 자리에 서 있다 — 아직 못 온 만큼 거꾸로 밀어 두고 당긴다
      const dx = cell.cx - tx;
      const dy = cell.cy - ty;
      await tween(PICK_MS, mine, (k) => {
        const e = ease(k);
        chip.setAttribute('transform', `translate(${num(dx * (1 - e))} ${num(dy * (1 - e))})`);
      });
    }

    const renderer = {
      async render(next: EraseScene, prev: EraseScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || !drawn || !next.step || next.step === prev?.step) return;
        const kind = next.step.kind;
        if (kind === 'offer') await animateOffer(next, drawn, mine);
        else if (kind === 'erase') await animateErase(next, drawn, mine);
        else await animatePick(next, drawn, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
