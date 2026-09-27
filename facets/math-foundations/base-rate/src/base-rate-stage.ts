/**
 * 기저율 무대 — 두 무리를 나란히 두고, 양성인 사람이 무리에서 빠져나와 더미로 쌓인다.
 *
 * 왼쪽 · 오른쪽에 무리 하나씩. 위는 사람 1000 명의 칸, 아래는 양성 더미 자리.
 * 걸음 1 에 병 있는 양성이 참 양성 더미로, 걸음 2 에 병 없는 양성이 거짓 양성 더미로 떨어진다.
 * 걸음 3 에 두 더미가 한 더미로 섞이고 (참 양성이 거짓 양성 사이에 묻힌다),
 * 걸음 4 에 더미 아래 막대가 양성 가운데 병의 몫만큼 찬다.
 * 두 무리의 칸 · 더미는 같은 축척이라 더미의 크기를 그대로 견줄 수 있다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { BaseRateGroupScene, BaseRatePhase, BaseRateScene } from './scene.js';

const H = 404;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 · 두 무리 사이 */
const PAD_X = 16;
const GAP = 28;
/** 무리 이름 줄의 글자 바닥 */
const HEAD_Y = 20;
/** 사람 칸 */
const GRID_TOP = 32;
const GRID_COLS = 50;
const GRID_H_MAX = 116;
const CELL_PITCH_MAX = 7;
/** 칸 아래 이번 걸음의 수 */
const STEP_LINE_Y = 170;
/** 더미 자리 — 위에서 바닥까지 */
const PILE_TOP = 186;
const PILE_BASE = 306;
/** 더미 하나의 가로 칸 수 (가른 두 더미) · 섞은 더미는 그 두 배 */
const PILE_COLS = 24;
/** 더미 이름 · 몫 막대 */
const PILE_LABEL_Y = 324;
const BAR_Y = 336;
const BAR_H = 10;
/** 아래 캡션 두 줄 */
const CAPTION_Y = 374;
const CAPTION_LINE = 20;
/** 칸 안의 네모가 차지하는 몫 */
const FILL = 0.78;

/** 운동 — 한 걸음 600ms 안쪽, 앞 칸부터 조금씩 늦게 출발 */
const MOVE_MS = 600;
const STAGGER_MS = 240;
const FRAME_MS = 16;

type Box = { x: number; y: number; s: number };

interface Mover {
  el: SVGRectElement;
  from: Box;
  to: Box;
}

interface Built {
  movers: Mover[];
  bars: Array<{ el: SVGRectElement; width: number }>;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권 · 가나)는 한 칸, 나머지는 반 칸 남짓 */
function estimateWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) throw new Error('baseRateStage: 글자를 읽을 수 없다');
    w += code >= 0x1100 ? px : px * 0.56;
  }
  return w;
}

/** 폭에 들어가도록 글자 크기를 줄인다 (하한 9px). */
function fitPx(text: string, maxW: number, px: number): number {
  const w = estimateWidth(text, px);
  return w <= maxW ? px : Math.max(9, Math.floor((px * maxW) / w * 10) / 10);
}

/** 캡션을 두 줄 안에 접는다. 빈칸이 없는 글(중국어 · 일본어)은 글자 단위로 자른다. */
function wrap(text: string, maxW: number, px: number): string[] {
  const tokens = text.includes(' ') ? text.split(' ') : [...text];
  const joiner = text.includes(' ') ? ' ' : '';
  const lines: string[] = [];
  let line = '';
  for (const tok of tokens) {
    const tryLine = line === '' ? tok : `${line}${joiner}${tok}`;
    if (line !== '' && estimateWidth(tryLine, px) > maxW) {
      lines.push(line);
      line = tok;
    } else {
      line = tryLine;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** k 개를 n 자리에 고르게 흩는다 — 자리 번호 목록 (배치일 뿐, 셈이 아니다). */
function spread(n: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i += 1) out.push(Math.floor(((i + 0.5) * n) / k));
  return out;
}

function need(v: number | null, path: string): number {
  if (v === null) throw new Error(`baseRateStage: ${path} 가 장면에 없다`);
  return v;
}

/** 무리 하나의 자리 셈 — 캔버스 폭에서 역산한다. */
class GroupLayout {
  readonly hx: number;
  readonly halfW: number;
  readonly pitch: number;
  readonly gx: number;
  readonly pp: number;
  readonly tpX: number;
  readonly fpX: number;
  readonly mergedX: number;

  constructor(index: number, people: number, pileMax: number | null) {
    this.halfW = (PIECE_CANVAS_W - 2 * PAD_X - GAP) / 2;
    this.hx = PAD_X + index * (this.halfW + GAP);
    const rows = Math.ceil(people / GRID_COLS);
    this.pitch = Math.min(CELL_PITCH_MAX, this.halfW / GRID_COLS, GRID_H_MAX / rows);
    this.gx = this.hx + (this.halfW - GRID_COLS * this.pitch) / 2;
    const pileRows = pileMax === null ? 1 : Math.max(1, Math.ceil(pileMax / PILE_COLS));
    this.pp = Math.min(this.pitch, (PILE_BASE - PILE_TOP) / pileRows);
    this.tpX = this.hx;
    this.fpX = this.hx + this.halfW - PILE_COLS * this.pp;
    this.mergedX = this.hx + (this.halfW - 2 * PILE_COLS * this.pp) / 2;
  }

  grid(k: number): Box {
    const s = this.pitch * FILL;
    const inset = (this.pitch - s) / 2;
    return {
      x: this.gx + (k % GRID_COLS) * this.pitch + inset,
      y: GRID_TOP + Math.floor(k / GRID_COLS) * this.pitch + inset,
      s,
    };
  }

  pile(x0: number, cols: number, i: number): Box {
    const s = this.pp * FILL;
    const inset = (this.pp - s) / 2;
    return {
      x: x0 + (i % cols) * this.pp + inset,
      y: PILE_BASE - (Math.floor(i / cols) + 1) * this.pp + inset,
      s,
    };
  }
}

/** 한 무리 안에서 사람 하나가 걸음 p 에 서는 자리. */
class GroupPlaces {
  private readonly fpOf = new Map<number, number>();
  private readonly tpAt: number[] = [];
  private readonly fpAt: number[] = [];

  constructor(
    private readonly lay: GroupLayout,
    private readonly g: BaseRateGroupScene,
  ) {
    if (g.fp !== null && g.healthy !== null) {
      spread(g.healthy, g.fp).forEach((k, f) => this.fpOf.set(k, f));
    }
    // 섞은 더미의 자리 — 양성 모두(pos)는 장면이 준 값을 쓴다 (걸음 3 부터 있다)
    if (g.tp !== null && g.pos !== null) {
      const pos = g.pos;
      const taken = new Set(spread(pos, g.tp));
      for (let slot = 0; slot < pos; slot += 1) {
        if (taken.has(slot)) this.tpAt.push(slot);
        else this.fpAt.push(slot);
      }
    }
  }

  /** 병 있는 j 번째 사람 */
  sick(j: number, phase: BaseRatePhase): { box: Box; moved: boolean } {
    const tp = this.g.tp;
    if (phase >= 1 && tp !== null && j < tp) {
      if (phase <= 2) return { box: this.lay.pile(this.lay.tpX, PILE_COLS, j), moved: true };
      const slot = this.tpAt[j];
      if (slot === undefined) throw new Error(`baseRateStage: ${this.g.id} 의 참 양성 ${j} 에 섞은 자리가 없다`);
      return { box: this.lay.pile(this.lay.mergedX, 2 * PILE_COLS, slot), moved: true };
    }
    return { box: this.lay.grid(j), moved: false };
  }

  /** 병 없는 k 번째 사람 */
  healthy(k: number, phase: BaseRatePhase): { box: Box; moved: boolean } {
    const sick = need(this.g.sick, `${this.g.id}.sick`);
    const f = this.fpOf.get(k);
    if (phase >= 2 && f !== undefined) {
      if (phase === 2) return { box: this.lay.pile(this.lay.fpX, PILE_COLS, f), moved: true };
      const slot = this.fpAt[f];
      if (slot === undefined) throw new Error(`baseRateStage: ${this.g.id} 의 거짓 양성 ${f} 에 섞은 자리가 없다`);
      return { box: this.lay.pile(this.lay.mergedX, 2 * PILE_COLS, slot), moved: true };
    }
    return { box: this.lay.grid(sick + k), moved: false };
  }
}

function sameBox(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.s === b.s;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export const baseRateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const tones = categorical(2, 'vivid');
    const sickColor = tones[0];
    const falseColor = tones[1];
    if (sickColor === undefined || falseColor === undefined) {
      throw new Error('baseRateStage: categorical(2) 가 색 둘을 주지 않았다');
    }
    const healthyColor = colors.border;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function text(
      content: string,
      x: number,
      y: number,
      opts: { px: number; anchor: 'start' | 'middle' | 'end'; fill: string; weight?: number },
      parent: Element,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor,
          'font-family': fonts.body,
          'font-size': `${opts.px}px`,
          'font-weight': opts.weight ?? 400,
          fill: opts.fill,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function groupName(id: string): string {
      if (id === 'rare') return t('label.rare', 'Rare disease');
      if (id === 'common') return t('label.common', 'Common disease');
      throw new Error(`baseRateStage: 이름이 없는 무리 ${id}`);
    }

    function stepLine(g: BaseRateGroupScene, phase: BaseRatePhase): string | null {
      switch (phase) {
        case -1:
          return null;
        case 0:
          return t('label.split', 'Sick: {sick} · Not sick: {healthy}', {
            sick: need(g.sick, 'sick'),
            healthy: need(g.healthy, 'healthy'),
          });
        case 1:
          return t('label.sickTested', 'Sick, positive: {tp} · missed: {fn}', {
            tp: need(g.tp, 'tp'),
            fn: need(g.fn, 'fn'),
          });
        case 2:
          return t('label.healthyTested', 'Not sick, positive: {fp} · negative: {tn}', {
            fp: need(g.fp, 'fp'),
            tn: need(g.tn, 'tn'),
          });
        case 3:
          return t('label.pooled', 'All positive: {pos} = {tp} + {fp}', {
            pos: need(g.pos, 'pos'),
            tp: need(g.tp, 'tp'),
            fp: need(g.fp, 'fp'),
          });
        case 4:
          return t('label.share', 'Sick among positive: {tp} / {pos} = {pct}', {
            tp: need(g.tp, 'tp'),
            pos: need(g.pos, 'pos'),
            pct: pct(need(g.sharePct, 'sharePct')),
          });
      }
    }

    function caption(scene: BaseRateScene): string {
      switch (scene.phase) {
        case -1:
        case 0: {
          const first = scene.groups[0];
          if (first === undefined) throw new Error('baseRateStage: 무리가 없다');
          return t('caption.start', 'People in each group: {n}. The same test on both.', { n: first.people });
        }
        case 1:
          return t('caption.testSick', 'Test the sick. Their positives pile up as true positives.');
        case 2:
          return t('caption.testHealthy', 'Test the not-sick. Their positives pile up as false positives.');
        case 3:
          return t('caption.pool', 'All positives go into one pile. True and false positives mix.');
        case 4:
          return t('caption.share', 'Among the positives, how many are sick? Same test, only the base rate differs.');
      }
    }

    /** 더미 이름 한 줄 — 색 네모 + 글자 */
    function pileLabel(
      content: string,
      color: string,
      x: number,
      anchor: 'start' | 'end',
      maxW: number,
      parent: Element,
    ): void {
      const px = fitPx(content, maxW - 14, parseFloat(fontSizes.sm));
      const sw = 9;
      if (anchor === 'start') {
        el('rect', { x, y: PILE_LABEL_Y - sw, width: sw, height: sw, fill: color }, parent);
        text(content, x + sw + 5, PILE_LABEL_Y, { px, anchor: 'start', fill: colors.text }, parent);
      } else {
        el('rect', { x: x - sw, y: PILE_LABEL_Y - sw, width: sw, height: sw, fill: color }, parent);
        text(content, x - sw - 5, PILE_LABEL_Y, { px, anchor: 'end', fill: colors.text }, parent);
      }
    }

    function drawGroup(
      g: BaseRateGroupScene,
      index: number,
      scene: BaseRateScene,
      built: Built,
      root: Element,
    ): void {
      const phase = scene.phase;
      const lay = new GroupLayout(index, g.people, scene.pileMax);
      const layer = el('g', { 'data-group': g.id }, root);

      // 머리 — 무리 이름 · 기저율
      text(groupName(g.id), lay.hx, HEAD_Y, {
        px: parseFloat(fontSizes.md),
        anchor: 'start',
        fill: colors.text,
        weight: 600,
      }, layer);
      text(t('label.baseRate', 'Base rate: {pct}', { pct: pct(g.ratePct) }), lay.hx + lay.halfW, HEAD_Y, {
        px: parseFloat(fontSizes.sm),
        anchor: 'end',
        fill: colors.textMuted,
      }, layer);

      const cells = el('g', {}, layer);
      if (phase === -1 || g.sick === null || g.healthy === null) {
        for (let k = 0; k < g.people; k += 1) {
          const b = lay.grid(k);
          el('rect', { x: b.x, y: b.y, width: b.s, height: b.s, fill: healthyColor }, cells);
        }
        return;
      }

      const places = new GroupPlaces(lay, g);
      const ghosts = el('g', {}, cells);
      const people = el('g', {}, cells);
      const prevPhase = (phase - 1) as BaseRatePhase;

      const place = (
        at: { box: Box; moved: boolean },
        before: { box: Box; moved: boolean } | null,
        gridBox: Box,
        color: string,
      ): void => {
        if (at.moved) {
          el('rect', {
            x: gridBox.x,
            y: gridBox.y,
            width: gridBox.s,
            height: gridBox.s,
            fill: 'none',
            stroke: healthyColor,
            'stroke-width': 0.8,
          }, ghosts);
        }
        const node = el('rect', {
          x: at.box.x,
          y: at.box.y,
          width: at.box.s,
          height: at.box.s,
          fill: color,
        }, people);
        if (before !== null && !sameBox(before.box, at.box)) {
          built.movers.push({ el: node, from: before.box, to: at.box });
        }
      };

      for (let j = 0; j < g.sick; j += 1) {
        const at = places.sick(j, phase);
        const before = phase >= 1 ? places.sick(j, prevPhase) : null;
        place(at, before, lay.grid(j), sickColor);
      }
      for (let k = 0; k < g.healthy; k += 1) {
        const at = places.healthy(k, phase);
        const before = phase >= 1 ? places.healthy(k, prevPhase) : null;
        place(at, before, lay.grid(g.sick + k), at.moved ? falseColor : healthyColor);
      }

      // 이번 걸음의 수
      const line = stepLine(g, phase);
      if (line !== null) {
        const px = fitPx(line, lay.halfW, parseFloat(fontSizes.sm));
        text(line, lay.hx + lay.halfW / 2, STEP_LINE_Y, { px, anchor: 'middle', fill: colors.text }, layer);
      }

      // 더미 바닥
      el('line', {
        x1: lay.hx,
        y1: PILE_BASE + 1,
        x2: lay.hx + lay.halfW,
        y2: PILE_BASE + 1,
        stroke: colors.textMuted,
        'stroke-width': 1,
      }, layer);

      // 더미 이름
      if (phase >= 1) {
        pileLabel(
          t('label.truePos', 'True positive: {n}', { n: need(g.tp, 'tp') }),
          sickColor,
          lay.hx,
          'start',
          lay.halfW / 2,
          layer,
        );
      }
      if (phase >= 2) {
        pileLabel(
          t('label.falsePos', 'False positive: {n}', { n: need(g.fp, 'fp') }),
          falseColor,
          lay.hx + lay.halfW,
          'end',
          lay.halfW / 2,
          layer,
        );
      }

      // 양성 가운데 병의 몫
      if (phase >= 4) {
        const share = need(g.sharePct, 'sharePct');
        const barX = lay.mergedX;
        const barW = 2 * PILE_COLS * lay.pp;
        el('rect', { x: barX, y: BAR_Y, width: barW, height: BAR_H, fill: falseColor }, layer);
        const fillW = (barW * share) / 100;
        const tpBar = el('rect', { x: barX, y: BAR_Y, width: fillW, height: BAR_H, fill: sickColor }, layer);
        el('rect', {
          x: barX,
          y: BAR_Y,
          width: barW,
          height: BAR_H,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1,
        }, layer);
        built.bars.push({ el: tpBar, width: fillW });
      }
    }

    function drawStatic(scene: BaseRateScene): Built {
      svg.textContent = '';
      const built: Built = { movers: [], bars: [] };
      const root = el('g', {}, svg);
      scene.groups.forEach((g, i) => drawGroup(g, i, scene, built, root));

      const px = parseFloat(fontSizes.md);
      const lines = wrap(caption(scene), PIECE_CANVAS_W - 2 * PAD_X, px);
      if (lines.length > 2) throw new Error('baseRateStage: 캡션이 두 줄을 넘는다');
      lines.forEach((ln, i) => {
        text(ln, PIECE_CANVAS_W / 2, CAPTION_Y + i * CAPTION_LINE, {
          px,
          anchor: 'middle',
          fill: colors.text,
        }, root);
      });
      return built;
    }

    function frames(mine: number, draw: (u: number) => void): Promise<void> {
      const total = Math.ceil(MOVE_MS / FRAME_MS);
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let i = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          draw(Math.min(1, i / total));
          if (i >= total) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    function setBox(node: SVGRectElement, b: Box): void {
      node.setAttribute('x', String(round(b.x)));
      node.setAttribute('y', String(round(b.y)));
      node.setAttribute('width', String(round(b.s)));
      node.setAttribute('height', String(round(b.s)));
    }

    async function animate(mine: number, built: Built): Promise<void> {
      const { movers, bars } = built;
      const n = movers.length;
      // 아직 못 온 만큼 — 첫 프레임 전에 출발 자리로 되돌린다
      for (const m of movers) setBox(m.el, m.from);
      for (const b of bars) b.el.setAttribute('width', '0');
      const travel = MOVE_MS - STAGGER_MS;
      await frames(mine, (u) => {
        const ms = u * MOVE_MS;
        movers.forEach((m, i) => {
          const delay = n > 1 ? (i / (n - 1)) * STAGGER_MS : 0;
          const k = ease(Math.max(0, Math.min(1, (ms - delay) / travel)));
          setBox(m.el, {
            x: m.from.x + (m.to.x - m.from.x) * k,
            y: m.from.y + (m.to.y - m.from.y) * k,
            s: m.from.s + (m.to.s - m.from.s) * k,
          });
        });
        const kb = ease(u);
        for (const b of bars) b.el.setAttribute('width', String(round(b.width * kb)));
      });
    }

    return {
      async render(next: BaseRateScene, prev: BaseRateScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const built = drawStatic(next);
        const flows = opts.animate && prev !== null && prev.phase === next.phase - 1 && next.phase >= 1;
        if (!flows || (built.movers.length === 0 && built.bars.length === 0)) return;
        await animate(mine, built);
        if (mine === gen && !destroyed) drawStatic(next);
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
  },
};
