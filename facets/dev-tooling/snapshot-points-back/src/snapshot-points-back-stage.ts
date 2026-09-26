/**
 * snapshot-points-back 의 무대.
 *
 * 커밋은 만든 차례대로 왼쪽에서 오른쪽으로 선다. 카드 머리에는 커밋 글자와 해시, 몸에는
 * 해시에 들어가는 두 줄(`tree <변경>` · `parent <부모 해시>`)이 있다.
 *
 * 동사는 "적혀 들어간다" 다.
 * - 부모 해시 걸음: 새 카드가 들어서고, 부모 머리의 해시 **사본**이 새 카드의 `parent` 칸으로
 *   건너가 적힌다. 부모의 해시는 제자리에 그대로 남는다. 적힌 칸에서 부모 쪽으로 화살이 난다.
 * - 새 해시 걸음: 새 카드 몸의 두 줄이 머리의 빈 해시 칸으로 모여들고, 그다음 해시가 한 자씩 선다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SnapshotScene } from './scene.js';

const H = 190;
const W = PIECE_CANVAS_W;

const MARGIN = 14;
const GAP_MIN = 40;
const CARD_MAX_W = 150;
const PAD = 8;
const CARD_TOP = 34;
const HEAD_H = 30;
const ROW_H = 20;
const HASH_LEN = 7;

const WRITE_MS = 1000;
const HASH_MS = 800;

const SVG_NS = 'http://www.w3.org/2000/svg';

const PX_SM = parseFloat(fontSizes.sm);
const PX_XS = parseFloat(fontSizes.xs);
/** 고정폭 글자 한 자의 폭 (대략 0.6em) */
const monoW = (px: number): number => px * 0.6;

function r(v: number): number {
  return Math.round(v * 10) / 10 + 0;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 전체 운동 p 에서 [a, b] 구간의 진행 (0..1) */
function phase(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

/** 장면에 있어야 할 값이 없으면 무엇이 없는지 담아 던진다 (C6). */
function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`snapshot-points-back-stage: ${what} 가 없다`);
  return v;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

type Geom = {
  cardW: number;
  cardH: number;
  xs: number[];
};

function layout(n: number): Geom {
  const bodyChars = 'parent '.length + HASH_LEN;
  const need = bodyChars * monoW(PX_XS) + 2 * PAD;
  const free = (W - 2 * MARGIN - (n - 1) * GAP_MIN) / Math.max(1, n);
  const cardW = Math.min(CARD_MAX_W, Math.max(need, free));
  const gap = n > 1 ? Math.min(GAP_MIN * 1.6, (W - 2 * MARGIN - n * cardW) / (n - 1)) : 0;
  const total = n * cardW + (n - 1) * gap;
  const left = (W - total) / 2;
  const xs: number[] = [];
  for (let i = 0; i < n; i += 1) xs.push(left + i * (cardW + gap));
  return { cardW, cardH: HEAD_H + 2 * ROW_H + 10, xs };
}

/** 카드 안 자리들 */
function spots(g: Geom, i: number) {
  const x = need(g.xs[i], `카드 #${i} 의 자리`);
  const headY = CARD_TOP + HEAD_H / 2;
  const row1Y = CARD_TOP + HEAD_H + ROW_H * 0.5 + 4;
  const row2Y = row1Y + ROW_H;
  const hashX = x + g.cardW - PAD - 4 - HASH_LEN * monoW(PX_SM);
  const valueX = x + PAD + 'parent '.length * monoW(PX_XS);
  return { x, headY, row1Y, row2Y, hashX, valueX };
}

type CardHandles = {
  group: SVGGElement;
  border: SVGRectElement;
  hashText: SVGTextElement;
  hashSlot: SVGRectElement;
  row1: SVGTextElement;
  row2Value: SVGTextElement | null;
  row2Mark: SVGRectElement | null;
  row2Slot: SVGRectElement | null;
  arrowLine: SVGLineElement | null;
  arrowHead: SVGPolygonElement | null;
  arrowFrom: { x: number; y: number } | null;
  arrowTo: { x: number; y: number } | null;
  hashMark: SVGRectElement;
};

type Drawn = {
  cards: (CardHandles | null)[];
  overlay: SVGGElement;
  geom: Geom;
};

function arrowHeadPoints(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = 7;
  const bx = to.x - ux * size;
  const by = to.y - uy * size;
  const px = -uy * size * 0.5;
  const py = ux * size * 0.5;
  return [
    `${r(to.x)},${r(to.y)}`,
    `${r(bx + px)},${r(by + py)}`,
    `${r(bx - px)},${r(by - py)}`,
  ].join(' ');
}

export const snapshotPointsBackStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function labelOf(change: string): string {
      switch (change) {
        case 'init':
          return t('label.init', 'First commit');
        case 'add-login':
          return t('label.add-login', 'Add login');
        case 'fix-typo':
          return t('label.fix-typo', 'Fix typo');
        case 'add-test':
          return t('label.add-test', 'Add test');
        default:
          throw new Error(`snapshot-points-back-stage: 변경 ${change} 의 표시 이름(label.*)이 없다`);
      }
    }

    function captionOf(scene: SnapshotScene): string {
      const step = scene.step;
      // init 이 오기 전의 장면에는 아직 일어난 일이 없다 — 캡션도 없다
      if (step === null) return '';
      const c = need(scene.commits[step.commit], `걸음의 커밋 #${step.commit}`);
      if (step.kind === 'start') {
        return t('caption.start', '{commit} has no parent. Its hash: {hash}', {
          commit: c.id,
          hash: need(scene.hashes[step.commit], `${c.id} 의 해시`),
        });
      }
      if (step.kind === 'write') {
        const p = need(scene.commits[step.parent], `${c.id} 의 부모 커밋 #${step.parent}`);
        return t('caption.write', 'Written into {child}: parent {hash}. {parent} keeps {hash}.', {
          child: c.id,
          parent: p.id,
          hash: need(scene.written[step.commit], `${c.id} 안에 적힌 부모 해시`),
        });
      }
      return t('caption.hash', 'Hash of {child}, with parent {parentHash} inside: {hash}', {
        child: c.id,
        parentHash: need(scene.written[step.commit], `${c.id} 안에 적힌 부모 해시`),
        hash: need(scene.hashes[step.commit], `${c.id} 의 해시`),
      });
    }

    function drawStatic(scene: SnapshotScene): Drawn {
      svg.textContent = '';
      const n = scene.commits.length;
      const geom = layout(n);
      const arrows = el(svg, 'g', {});
      const cardsLayer = el(svg, 'g', {});
      const overlay = el(svg, 'g', {});
      const step = scene.step;
      const cards: (CardHandles | null)[] = [];

      scene.commits.forEach((c, i) => {
        const written = scene.written[i] ?? null;
        const hash = scene.hashes[i] ?? null;
        if (written === null && hash === null) {
          cards.push(null);
          return;
        }
        const s = spots(geom, i);
        const group = el(cardsLayer, 'g', {});
        const border = el(group, 'rect', {
          x: s.x,
          y: CARD_TOP,
          width: geom.cardW,
          height: geom.cardH,
          rx: 6,
          fill: colors.bg,
          stroke: hash === null ? colors.textMuted : colors.text,
          'stroke-width': 1.5,
        });
        if (hash === null) border.setAttribute('stroke-dasharray', '4 3');
        el(group, 'line', {
          x1: s.x,
          y1: CARD_TOP + HEAD_H,
          x2: s.x + geom.cardW,
          y2: CARD_TOP + HEAD_H,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const letter = el(group, 'text', {
          x: s.x + PAD,
          y: s.headY,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        });
        letter.textContent = c.id;

        const markOn = step !== null && step.kind === 'hash' && step.commit === i;
        const hashMark = el(group, 'rect', {
          x: s.hashX - 3,
          y: s.headY - 9,
          width: HASH_LEN * monoW(PX_SM) + 6,
          height: 18,
          rx: 3,
          fill: colors.accent,
        });
        if (!markOn) hashMark.setAttribute('display', 'none');
        const hashSlot = el(group, 'rect', {
          x: s.hashX - 3,
          y: s.headY - 9,
          width: HASH_LEN * monoW(PX_SM) + 6,
          height: 18,
          rx: 3,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-dasharray': '3 3',
        });
        if (hash !== null) hashSlot.setAttribute('display', 'none');
        const hashText = el(group, 'text', {
          x: s.hashX,
          y: s.headY,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: markOn ? colors.stateInk : colors.text,
        });
        hashText.textContent = hash ?? '';

        const row1 = el(group, 'text', {
          x: s.x + PAD,
          y: s.row1Y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        row1.textContent = 'tree ' + c.change;

        let row2Value: SVGTextElement | null = null;
        let row2Mark: SVGRectElement | null = null;
        let row2Slot: SVGRectElement | null = null;
        let arrowLine: SVGLineElement | null = null;
        let arrowHead: SVGPolygonElement | null = null;
        let arrowFrom: { x: number; y: number } | null = null;
        let arrowTo: { x: number; y: number } | null = null;
        if (c.parent !== null) {
          const writeOn = step !== null && step.kind === 'write' && step.commit === i;
          const key = el(group, 'text', {
            x: s.x + PAD,
            y: s.row2Y,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
          key.textContent = 'parent';
          row2Slot = el(group, 'rect', {
            x: s.valueX - 2,
            y: s.row2Y - 8,
            width: HASH_LEN * monoW(PX_XS) + 4,
            height: 16,
            rx: 3,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-dasharray': '3 3',
          });
          if (written !== null) row2Slot.setAttribute('display', 'none');
          row2Mark = el(group, 'rect', {
            x: s.valueX - 2,
            y: s.row2Y - 8,
            width: HASH_LEN * monoW(PX_XS) + 4,
            height: 16,
            rx: 3,
            fill: colors.accent,
          });
          if (!writeOn) row2Mark.setAttribute('display', 'none');
          row2Value = el(group, 'text', {
            x: s.valueX,
            y: s.row2Y,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: writeOn ? colors.stateInk : colors.text,
          });
          row2Value.textContent = written ?? '';

          const pi = scene.commits.findIndex((q) => q.id === c.parent);
          if (pi < 0) throw new Error(`snapshot-points-back-stage: ${c.id} 의 부모 ${c.parent} 가 커밋 목록에 없다`);
          if (written !== null) {
            const ps = spots(geom, pi);
            arrowFrom = { x: s.x, y: s.row2Y };
            arrowTo = { x: ps.x + geom.cardW, y: ps.headY };
            arrowLine = el(arrows, 'line', {
              x1: arrowFrom.x,
              y1: arrowFrom.y,
              x2: arrowTo.x,
              y2: arrowTo.y,
              stroke: colors.text,
              'stroke-width': 1.5,
            });
            arrowHead = el(arrows, 'polygon', {
              points: arrowHeadPoints(arrowFrom, arrowTo),
              fill: colors.text,
            });
          }
        }

        const label = el(group, 'text', {
          x: s.x + geom.cardW / 2,
          y: CARD_TOP + geom.cardH + 16,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        label.textContent = labelOf(c.change);

        cards.push({
          group,
          border,
          hashText,
          hashSlot,
          row1,
          row2Value,
          row2Mark,
          row2Slot,
          arrowLine,
          arrowHead,
          arrowFrom,
          arrowTo,
          hashMark,
        });
      });

      const caption = captionOf(scene);
      if (caption !== '') {
        const cap = el(svg, 'text', {
          x: W / 2,
          y: H - 22,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        cap.textContent = caption;
      }
      return { cards, overlay, geom };
    }

    /** 한 시계로 frame(p) 를 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function run(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function animateWrite(d: Drawn, scene: SnapshotScene, child: number, parent: number, mine: number) {
      const card = need(d.cards[child], `그려진 카드 #${child}`);
      need(d.cards[parent], `그려진 부모 카드 #${parent}`);
      const hash = need(scene.written[child], `커밋 #${child} 안에 적힌 부모 해시`);
      if (card.row2Value === null) throw new Error(`snapshot-points-back-stage: 커밋 #${child} 에 parent 칸이 없다`);
      const from = spots(d.geom, parent);
      const to = spots(d.geom, child);
      const ghostMark = el(d.overlay, 'rect', {
        x: from.hashX - 3,
        y: from.headY - 9,
        width: HASH_LEN * monoW(PX_SM) + 6,
        height: 18,
        rx: 3,
        fill: colors.accent,
      });
      const ghost = el(d.overlay, 'text', {
        x: from.hashX,
        y: from.headY,
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': PX_SM,
        fill: colors.stateInk,
      });
      ghost.textContent = hash;
      const value = card.row2Value;
      const mark = card.row2Mark;
      const slot = card.row2Slot;
      const line = card.arrowLine;
      const head = card.arrowHead;
      const aFrom = card.arrowFrom;
      const aTo = card.arrowTo;

      const frame = (p: number): void => {
        // 새 카드가 들어선다
        const a = ease(phase(p, 0, 0.25));
        card.group.setAttribute('transform', `translate(${r((1 - a) * 24)},0)`);
        card.group.setAttribute('opacity', String(r(a)));
        // 부모 해시의 사본이 건너간다
        const b = ease(phase(p, 0.25, 0.75));
        const gx = lerp(from.hashX, to.valueX, b);
        const gy = lerp(from.headY, to.row2Y, b);
        const px = lerp(PX_SM, PX_XS, b);
        const gw = HASH_LEN * monoW(px);
        ghost.setAttribute('x', String(r(gx)));
        ghost.setAttribute('y', String(r(gy)));
        ghost.setAttribute('font-size', String(r(px)));
        ghostMark.setAttribute('x', String(r(gx - 3)));
        ghostMark.setAttribute('y', String(r(gy - lerp(9, 8, b))));
        ghostMark.setAttribute('width', String(r(gw + 6)));
        ghostMark.setAttribute('height', String(r(lerp(18, 16, b))));
        const arrived = b >= 1;
        value.setAttribute('opacity', arrived ? '1' : '0');
        if (mark) mark.setAttribute('opacity', arrived ? '1' : '0');
        if (slot) slot.setAttribute('display', arrived ? 'none' : 'inline');
        ghost.setAttribute('opacity', arrived ? '0' : '1');
        ghostMark.setAttribute('opacity', arrived ? '0' : '1');
        // 적힌 칸에서 부모 쪽으로 화살이 난다
        const c = ease(phase(p, 0.75, 1));
        if (line && aFrom && aTo) {
          line.setAttribute('x2', String(r(lerp(aFrom.x, aTo.x, c))));
          line.setAttribute('y2', String(r(lerp(aFrom.y, aTo.y, c))));
          line.setAttribute('opacity', c > 0 ? '1' : '0');
        }
        if (head) head.setAttribute('opacity', c >= 1 ? '1' : '0');
      };
      frame(0);
      return run(WRITE_MS, mine, frame);
    }

    function animateHash(d: Drawn, scene: SnapshotScene, child: number, mine: number) {
      const card = need(d.cards[child], `그려진 카드 #${child}`);
      const hash = need(scene.hashes[child], `커밋 #${child} 의 해시`);
      const s = spots(d.geom, child);
      const commit = need(scene.commits[child], `커밋 #${child}`);
      const sources: { text: string; x: number; y: number }[] = [
        { text: 'tree ' + commit.change, x: s.x + PAD, y: s.row1Y },
      ];
      const written = scene.written[child] ?? null;
      if (written !== null) sources.push({ text: 'parent ' + written, x: s.x + PAD, y: s.row2Y });
      const ghosts = sources.map((src) => {
        const g = el(d.overlay, 'text', {
          x: src.x,
          y: src.y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': PX_XS,
          fill: colors.textMuted,
        });
        g.textContent = src.text;
        return { g, src };
      });
      const frame = (p: number): void => {
        // 몸의 두 줄이 머리의 빈 칸으로 모여든다
        const a = ease(phase(p, 0, 0.6));
        for (const { g, src } of ghosts) {
          g.setAttribute('x', String(r(lerp(src.x, s.hashX, a))));
          g.setAttribute('y', String(r(lerp(src.y, s.headY, a))));
          g.setAttribute('opacity', String(r(1 - a * 0.8)));
          g.setAttribute('display', a >= 1 ? 'none' : 'inline');
        }
        // 해시가 한 자씩 선다
        const b = phase(p, 0.6, 1);
        const shown = Math.ceil(b * hash.length);
        card.hashText.textContent = hash.slice(0, shown);
        card.hashSlot.setAttribute('display', b >= 1 ? 'none' : 'inline');
        card.hashMark.setAttribute('opacity', b > 0 ? '1' : '0');
        if (b < 1) {
          card.border.setAttribute('stroke', colors.textMuted);
          card.border.setAttribute('stroke-dasharray', '4 3');
        }
      };
      frame(0);
      return run(HASH_MS, mine, frame);
    }

    async function render(next: SnapshotScene, prev: SnapshotScene | null, opts: { animate: boolean }) {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      const step = next.step;
      if (!opts.animate || prev === null || step === null || prev.step === step) return;
      if (step.kind === 'write') {
        await animateWrite(drawn, next, step.commit, step.parent, mine);
      } else if (step.kind === 'hash') {
        await animateHash(drawn, next, step.commit, mine);
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
