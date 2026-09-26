/**
 * three-numbers stage — 세 자리 칸 아래에 자리마다 그 자리를 올리는 바뀜의 길이 있다.
 *
 * 내보냄마다 바뀐 것들이 제 종류의 길로 아래에서 올라오고, 가장 무거운 하나가 위의 칸을
 * 가리킨다. 그 칸의 수는 위로 굴러 오르고, 오른쪽 칸의 수는 아래로 떨어져 0 이 된다.
 * 오른쪽 길에 있던 가벼운 바뀜은 함께 가라앉는다 — 제 자리를 올리지 못하고 묻힌다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance } from '@ffacet/core/runtime';
import type { ChangeKind, Place } from './algorithm.js';
import type { ThreeNumbersScene } from './scene.js';

const H = 400;
const SVG = 'http://www.w3.org/2000/svg';

const MARGIN = 24;
const DOT_GAP = 28;
const TRAIL_Y = 28;
const HEAD_Y = 72;
const BOX_TOP = 84;
const BOX_H = 80;
const LANE_HEAD_Y = 196;
const LANE_TOP = 210;
const LANE_BOTTOM = 312;
const CARD_H_MAX = 44;
const CARD_GAP = 6;
const SINK = 22;
/** 가리키는 화살은 길 머리 글자를 피해 칸 오른쪽에 선다 */
const ARROW_INSET = 22;
const CAPTION_Y = 350;
const SUMMARY_Y = 376;
const RELEASE_MS = 450;
const BUMP_MS = 520;

const SM_PX = parseFloat(fontSizes.sm);
const XS_PX = parseFloat(fontSizes.xs);
const MD_PX = parseFloat(fontSizes.md);
const DIGIT_PX = parseFloat(fontSizes.xl) * 2.4;

/** 바뀜의 종류가 어느 자리의 길로 가는가 (0 major · 1 minor · 2 patch) */
const LANE_OF: Record<ChangeKind, Place> = { breaking: 0, feature: 1, fix: 2 };
const KIND_OF_LANE: readonly ChangeKind[] = ['breaking', 'feature', 'fix'];

type Attrs = Record<string, string | number>;

function r1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? 0 : v;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const threeNumbersStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const colW = (W - 2 * MARGIN - 2 * DOT_GAP) / 3;
    const colX = (i: number): number => MARGIN + i * (colW + DOT_GAP);
    const colMid = (i: number): number => colX(i) + colW / 2;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element): SVGElement {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGElement {
      const node = el('text', { x, y, 'dominant-baseline': 'middle', ...attrs }, parent);
      node.textContent = s;
      return node;
    }

    function changeLabel(id: string): string {
      switch (id) {
        case 'fixTimeout': return t('label.fixTimeout', 'Timeout fix');
        case 'addRetry': return t('label.addRetry', 'Retry added');
        case 'fixTypo': return t('label.fixTypo', 'Typo fix');
        case 'removeCallback': return t('label.removeCallback', 'Callback style removed');
        case 'addStream': return t('label.addStream', 'Streams added');
        case 'fixLeak': return t('label.fixLeak', 'Memory leak fix');
        case 'fixHeader': return t('label.fixHeader', 'Header fix');
        default: throw new Error(`three-numbers: 표시 이름이 없는 바뀐 것 '${id}'`);
      }
    }

    function kindLabel(kind: ChangeKind): string {
      switch (kind) {
        case 'breaking': return t('label.breaking', 'Breaking change');
        case 'feature': return t('label.feature', 'New feature');
        case 'fix': return t('label.fix', 'Fix');
      }
    }

    function placeLabel(place: number): string {
      switch (place) {
        case 0: return t('label.major', 'Major');
        case 1: return t('label.minor', 'Minor');
        case 2: return t('label.patch', 'Patch');
        default: throw new Error(`three-numbers: 모르는 자리 ${place}`);
      }
    }

    /** 글자 폭 짐작으로 칸에 맞는 크기 — 넘치면 줄인다 */
    function fitPx(s: string, px: number, room: number): number {
      const est = s.length * px * 0.56;
      return est <= room ? px : Math.max(9, (px * room) / est);
    }

    type Handles = {
      digits: SVGElement[];
      cards: { g: SVGElement; heavy: boolean; lane: number }[];
    };

    function drawStatic(scene: ThreeNumbersScene): Handles {
      svg.textContent = '';
      const step = scene.step;
      const bumped = step.kind === 'bump' ? step : null;
      const handles: Handles = { digits: [], cards: [] };

      // 자취 — 지나온 버전들
      const trail = el('g', {}, svg);
      let x = MARGIN;
      const arrowW = 22;
      const chipPad = 8;
      const needed = scene.history.reduce((s, v) => s + v.length * SM_PX * 0.62 + 2 * chipPad, 0)
        + arrowW * Math.max(0, scene.history.length - 1);
      const squeeze = Math.min(1, (W - 2 * MARGIN) / needed);
      scene.history.forEach((v, i) => {
        const last = i === scene.history.length - 1;
        const w = (v.length * SM_PX * 0.62 + 2 * chipPad) * squeeze;
        if (last) {
          el('rect', { x, y: TRAIL_Y - 12, width: w, height: 24, rx: 4, fill: c.bg, stroke: c.text, 'stroke-width': 1.2 }, trail);
        }
        text(trail, x + w / 2, TRAIL_Y, v, {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          fill: last ? c.text : c.textMuted, 'font-weight': last ? 700 : 400,
        });
        x += w;
        if (!last) {
          text(trail, x + (arrowW * squeeze) / 2, TRAIL_Y, '→', {
            'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted,
          });
          x += arrowW * squeeze;
        }
      });

      // 세 자리 칸
      for (let i = 0; i < 3; i += 1) {
        const raised = bumped !== null && bumped.place === i;
        const dropped = bumped !== null && bumped.dropped.includes(i);
        text(svg, colMid(i), HEAD_Y, placeLabel(i), {
          'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md,
          fill: raised ? c.text : c.textMuted, 'font-weight': raised ? 700 : 400,
        });
        el('rect', {
          x: colX(i), y: BOX_TOP, width: colW, height: BOX_H, rx: 8,
          fill: raised ? c.accent : dropped ? c.bg : c.bgSubtle,
          stroke: raised ? c.accent : dropped ? c.itemComparing : c.border,
          'stroke-width': dropped ? 2 : 1.2,
          ...(dropped ? { 'stroke-dasharray': '6 4' } : {}),
        }, svg);
        handles.digits.push(text(svg, colMid(i), BOX_TOP + BOX_H / 2 + 2, String(scene.digits[i]), {
          'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': `${DIGIT_PX}px`,
          'font-weight': 700, fill: raised ? c.stateInk : c.text,
        }));
        if (raised) {
          text(svg, colX(i) + colW - 10, BOX_TOP + 14, '+1', {
            'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm,
            'font-weight': 700, fill: c.stateInk,
          });
        }
        if (i < 2) {
          el('circle', { cx: colX(i) + colW + DOT_GAP / 2, cy: BOX_TOP + BOX_H - 18, r: 3.5, fill: c.textMuted }, svg);
        }
        // 길 머리 — 이 자리를 올리는 바뀜의 종류
        const kind = KIND_OF_LANE[i];
        if (!kind) throw new Error(`three-numbers: 길 ${i} 의 종류가 없다`);
        const head = `▲ ${kindLabel(kind)}`;
        text(svg, colX(i) + 4, LANE_HEAD_Y, head, {
          'font-family': fonts.body, 'font-size': `${r1(fitPx(head, XS_PX, colW - 2 * ARROW_INSET))}px`, fill: c.textMuted,
        });
        el('line', {
          x1: colX(i), y1: LANE_HEAD_Y + 8, x2: colX(i) + colW, y2: LANE_HEAD_Y + 8,
          stroke: c.border, 'stroke-width': 1,
        }, svg);
      }

      // 지금 내보냄의 바뀐 것들
      const rel = scene.release;
      if (rel) {
        const perLane: [number, number, number] = [0, 0, 0];
        for (const ch of rel.changes) perLane[LANE_OF[ch.kind]] += 1;
        const maxN = Math.max(1, ...perLane);
        const cardH = Math.min(CARD_H_MAX, (LANE_BOTTOM - LANE_TOP - SINK - CARD_GAP * (maxN - 1)) / maxN);
        const used: [number, number, number] = [0, 0, 0];
        let heavyLane = -1;
        for (const ch of rel.changes) {
          const lane = LANE_OF[ch.kind];
          const heavy = ch.id === rel.heaviest;
          if (heavy) heavyLane = lane;
          const sunk = !heavy && bumped !== null;
          const y = LANE_TOP + used[lane] * (cardH + CARD_GAP) + (sunk ? SINK : 0);
          used[lane] += 1;
          const g = el('g', {}, svg);
          const cx = colX(lane) + 8;
          const cw = colW - 16;
          el('rect', {
            x: cx, y, width: cw, height: cardH, rx: 5,
            fill: heavy ? c.accent : c.bg,
            stroke: heavy ? c.accent : c.textMuted,
            'stroke-width': heavy ? 1.5 : 1,
            ...(heavy ? {} : { 'stroke-dasharray': '4 3' }),
          }, g);
          const name = changeLabel(ch.id);
          text(g, cx + cw / 2, y + cardH * 0.36, name, {
            'text-anchor': 'middle', 'font-family': fonts.body,
            'font-size': `${r1(fitPx(name, SM_PX, cw - 12))}px`,
            'font-weight': heavy ? 700 : 400, fill: heavy ? c.stateInk : c.textMuted,
          });
          text(g, cx + cw / 2, y + cardH * 0.74, ch.id, {
            'text-anchor': 'middle', 'font-family': fonts.mono,
            'font-size': `${r1(fitPx(ch.id, XS_PX, cw - 12))}px`,
            fill: heavy ? c.stateInk : c.textMuted,
          });
          handles.cards.push({ g, heavy, lane });
        }
        // 가장 무거운 것이 제 자리 칸을 가리킨다
        if (heavyLane >= 0) {
          const ax = colX(heavyLane) + colW - ARROW_INSET;
          const y1 = LANE_TOP - 2;
          const y2 = BOX_TOP + BOX_H + 4;
          el('line', { x1: ax, y1, x2: ax, y2: y2 + 7, stroke: c.text, 'stroke-width': 2 }, svg);
          el('path', { d: `M ${r1(ax - 6)} ${r1(y2 + 9)} L ${r1(ax)} ${r1(y2)} L ${r1(ax + 6)} ${r1(y2 + 9)} Z`, fill: c.text }, svg);
        }
      }

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Current version: {version}', { version: scene.text });
      } else if (step.kind === 'release') {
        const heavy = rel?.changes.find((ch) => ch.id === rel.heaviest);
        if (!rel || !heavy) throw new Error('three-numbers: 내보냄 걸음에 바뀐 것이 없다');
        caption = t('caption.release', 'Release {n} · changes: {count} · heaviest: {kind}', {
          n: step.index, count: rel.changes.length, kind: kindLabel(heavy.kind),
        });
      } else if (step.dropped.length === 0) {
        caption = t('caption.bumpNoDrop', '{from} → {to} · raised: {place} · dropped to 0: none', {
          from: step.fromText, to: scene.text, place: placeLabel(step.place),
        });
      } else {
        caption = t('caption.bump', '{from} → {to} · raised: {place} · dropped to 0: {dropped}', {
          from: step.fromText, to: scene.text, place: placeLabel(step.place),
          dropped: step.dropped.map((d) => placeLabel(d)).join(' · '),
        });
      }
      text(svg, W / 2, CAPTION_Y, caption, {
        'text-anchor': 'middle', 'font-family': fonts.body,
        'font-size': `${r1(fitPx(caption, MD_PX, W - 2 * MARGIN))}px`, fill: c.text,
      });
      if (scene.done) {
        const summary = t('caption.done', 'Releases: {releases} · changes: {changes} · drops to 0: {drops}', {
          releases: scene.releases, changes: scene.changesSeen, drops: scene.drops,
        });
        text(svg, W / 2, SUMMARY_Y, summary, {
          'text-anchor': 'middle', 'font-family': fonts.body,
          'font-size': `${r1(fitPx(summary, SM_PX, W - 2 * MARGIN))}px`, fill: c.textMuted,
        });
      }
      return handles;
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = performance.now();
        let over = false;
        const finish = (): void => {
          if (over) return;
          over = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) { finish(); return; }
          const k = Math.min(1, (performance.now() - t0) / ms);
          frame(ease(k));
          if (k >= 1) { finish(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function ghost(i: number, value: number, fill: string): SVGElement {
      return text(svg, colMid(i), BOX_TOP + BOX_H / 2 + 2, String(value), {
        'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': `${DIGIT_PX}px`,
        'font-weight': 700, fill,
      });
    }

    async function render(next: ThreeNumbersScene, _prev: ThreeNumbersScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      const h = drawStatic(next);
      if (!opts.animate || destroyed) return;
      const step = next.step;

      if (step.kind === 'release') {
        // 바뀐 것들이 아래에서 제 길로 올라온다
        const rise = LANE_BOTTOM - LANE_TOP + 40;
        await tween(RELEASE_MS, mine, (k) => {
          const dy = r1((1 - k) * rise);
          for (const card of h.cards) card.g.setAttribute('transform', `translate(0 ${dy})`);
        });
      } else if (step.kind === 'bump') {
        // 고른 자리는 위로 굴러 오르고, 오른쪽 자리는 아래로 떨어진다
        const dy = BOX_H * 0.62;
        const up = ghost(step.place, step.from[step.place], c.stateInk);
        const downs = step.dropped.map((i) => ({ i, g: ghost(i, step.from[i], c.textMuted) }));
        const raisedDigit = h.digits[step.place];
        await tween(BUMP_MS, mine, (k) => {
          const rest = 1 - k;
          raisedDigit?.setAttribute('transform', `translate(0 ${r1(rest * dy)})`);
          up.setAttribute('transform', `translate(0 ${r1(-k * dy)})`);
          up.setAttribute('opacity', String(r1(rest)));
          for (const d of downs) {
            h.digits[d.i]?.setAttribute('transform', `translate(0 ${r1(-rest * dy)})`);
            d.g.setAttribute('transform', `translate(0 ${r1(k * dy)})`);
            d.g.setAttribute('opacity', String(r1(rest)));
          }
          for (const card of h.cards) {
            if (!card.heavy) card.g.setAttribute('transform', `translate(0 ${r1(-rest * SINK)})`);
          }
        });
      } else {
        return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
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
        svg.textContent = '';
      },
    };
  },
};
