/**
 * aliasing 무대 — 이름 둘이 양쪽에서 목록 하나를 가리킨다.
 *
 * 고침은 왼쪽 이름(prices)을 거쳐 들어가 가운데 목록의 칸을 바꾸고, 읽기는 오른쪽 이름(backup)을
 * 거쳐 같은 칸에서 값을 꺼내 나온다. 한쪽으로 들어간 것이 다른 쪽으로 비쳐 나오는 길이 그림이다.
 * 이름은 차례대로 왼쪽 · 오른쪽에 번갈아 서고, 목록은 가운데 선다.
 */
import {
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
import type { AliasingScene, SceneVal, AliasingStep } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const H = 320;

const M = 24;
const CODE_TOP = 12;
const CODE_BOTTOM = 110;
const LINE_H_MAX = 22;
const ROW_Y = 186;
const ROW_GAP = 70;
const SLOT_W_MAX = 112;
const SLOT_H = 36;
const LINK_GAP = 64;
const CELL_W_MAX = 64;
const OUT_H = 28;
const FRAME_MS = 16;

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

type Layout = {
  slotBox: Map<string, Box>;
  cellBox: Map<string, Box>;
  listBox: Map<number, Box>;
  outBox: Box;
};

type Handles = {
  slotText: Map<string, SVGTextElement>;
  cellText: Map<string, SVGTextElement>;
  link: Map<string, { line: SVGLineElement; head: SVGPolygonElement; from: Pt; to: Pt }>;
  list: Map<number, SVGGElement>;
  outText: SVGTextElement[];
  overlay: SVGGElement;
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function fmt(v: SceneVal): string {
  if ('num' in v) return String(v.num);
  if ('str' in v) return `"${v.str}"`;
  return `@${v.ref}`;
}

function cellKey(ref: number, at: number): string {
  return `${ref}:${at}`;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  body: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = body;
  return node;
}

function slotSide(i: number): 'left' | 'right' {
  return i % 2 === 0 ? 'left' : 'right';
}

function layout(scene: AliasingScene): Layout {
  const slotW = Math.min(SLOT_W_MAX, W * 0.18);
  const slotBox = new Map<string, Box>();
  scene.slots.forEach((s, i) => {
    const row = Math.floor(i / 2);
    const x = slotSide(i) === 'left' ? M : W - M - slotW;
    slotBox.set(s.name, { x, y: ROW_Y + row * ROW_GAP - SLOT_H / 2, w: slotW, h: SLOT_H });
  });

  const midL = M + slotW + LINK_GAP;
  const midR = W - M - slotW - LINK_GAP;
  const cellBox = new Map<string, Box>();
  const listBox = new Map<number, Box>();
  scene.lists.forEach((l, li) => {
    const n = Math.max(1, l.items.length);
    const cw = Math.min(CELL_W_MAX, (midR - midL) / n);
    const x0 = (W - cw * n) / 2;
    const y = ROW_Y + li * ROW_GAP - SLOT_H / 2;
    listBox.set(l.ref, { x: x0, y, w: cw * n, h: SLOT_H });
    l.items.forEach((_, i) => cellBox.set(cellKey(l.ref, i), { x: x0 + cw * i, y, w: cw, h: SLOT_H }));
  });

  const outBox = { x: W - M - slotW, y: ROW_Y + SLOT_H / 2 + 38, w: slotW, h: OUT_H };
  return { slotBox, cellBox, listBox, outBox };
}

function mid(b: Box): Pt {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** 꺾인 길 위에서 p (0..1) 만큼 간 자리 */
function along(pts: Pt[], p: number): Pt {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    lens.push(d);
    total += d;
  }
  let left = Math.max(0, Math.min(1, p)) * total;
  for (let i = 0; i < lens.length; i += 1) {
    const d = lens[i]!;
    if (left <= d || i === lens.length - 1) {
      const k = d === 0 ? 1 : Math.min(1, left / d);
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= d;
  }
  return pts[pts.length - 1]!;
}

function ease(p: number): number {
  const q = Math.max(0, Math.min(1, p));
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

/** 구간 [a, b] 안에서의 진행 (0..1) */
function span(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

export const aliasingStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const codePx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.xs);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function caption(scene: AliasingScene, step: AliasingStep | null): string {
      if (!step) return '';
      if (step.kind === 'start') return t('caption.start', 'The program before it runs.');
      if (step.kind === 'assign') {
        const slot = scene.slots.find((s) => s.name === step.name);
        const val = slot ? slot.val : { num: 0 };
        if (step.made !== null) {
          return t('caption.made', 'A list is placed at {ref}. The slot of {name} holds only its address.', {
            ref: `@${step.made}`,
            name: step.name,
          });
        }
        if (step.source !== null && 'ref' in val) {
          return t('caption.alias', '{name} gets a new slot, and only the address {addr} is copied into it. Lists: {n}.', {
            name: step.name,
            addr: fmt(val),
            n: scene.lists.length,
          });
        }
        return t('caption.assign', 'The slot of {name} now holds {value}.', { name: step.name, value: fmt(val) });
      }
      if (step.kind === 'set') {
        const list = scene.lists.find((l) => l.ref === step.ref);
        const now = list?.items[step.at];
        return t('caption.set', 'Changed through {via}: slot {at} of the list at {ref} goes {old} → {value}.', {
          via: step.via,
          at: step.at,
          ref: `@${step.ref}`,
          old: fmt(step.was),
          value: now ? fmt(now) : '',
        });
      }
      if (step.read) {
        return t('caption.show', 'Read through {via}: slot {at} of the list at {ref} gives {value}.', {
          via: step.read.via,
          at: step.read.at,
          ref: `@${step.read.ref}`,
          value: fmt(step.value),
        });
      }
      return t('caption.out', 'Output: {value}.', { value: fmt(step.value) });
    }

    function drawStatic(scene: AliasingScene): Handles {
      svg.textContent = '';
      const lay = layout(scene);
      const handles: Handles = {
        slotText: new Map(),
        cellText: new Map(),
        link: new Map(),
        list: new Map(),
        outText: [],
        overlay: document.createElementNS(NS, 'g'),
      };
      const step = scene.step;
      const wrote = new Set(scene.writes.map((w) => w.via));
      const readVia = new Set(scene.reads.map((r) => r.via));
      const wroteCell = new Set(scene.writes.map((w) => cellKey(w.ref, w.at)));
      const readCell = new Set(scene.reads.map((r) => cellKey(r.ref, r.at)));

      // 코드 — 한 줄에 문 하나, 밟은 줄에 표지
      const n = Math.max(1, scene.lines.length);
      const lineH = Math.min(LINE_H_MAX, (CODE_BOTTOM - CODE_TOP) / n);
      const codeH = lineH * n + 8;
      el(svg, 'rect', { x: M, y: CODE_TOP, width: W - 2 * M, height: codeH, rx: 6, fill: c.bgSubtle });
      const current = step && step.kind !== 'start' ? step.line : -1;
      scene.lines.forEach((ln, i) => {
        const y = CODE_TOP + 4 + lineH * i;
        if (i === current) {
          el(svg, 'rect', { x: M, y, width: W - 2 * M, height: lineH, fill: c.accent, 'fill-opacity': 0.28 });
          el(svg, 'rect', { x: M, y, width: 4, height: lineH, fill: c.accent });
        }
        label(svg, M + 16 + ln.indent * codePx * 2.4, y + lineH / 2, ln.text, {
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': codePx,
          fill: c.text,
        });
      });

      // 목록 — 자리 밖, 가운데
      for (const l of scene.lists) {
        const box = lay.listBox.get(l.ref)!;
        const g = el(svg, 'g', {});
        handles.list.set(l.ref, g);
        label(g, box.x + box.w / 2, box.y - 10, t('label.list', 'list {addr}', { addr: `@${l.ref}` }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': smallPx,
          fill: c.textMuted,
        });
        l.items.forEach((v, i) => {
          const key = cellKey(l.ref, i);
          const cb = lay.cellBox.get(key)!;
          const hit = wroteCell.has(key);
          el(g, 'rect', {
            x: cb.x,
            y: cb.y,
            width: cb.w,
            height: cb.h,
            fill: c.bg,
            stroke: hit ? c.itemSwapping : c.border,
            'stroke-width': hit ? 2.5 : 1,
          });
          if (readCell.has(key)) {
            el(g, 'rect', { x: cb.x + 4, y: cb.y + cb.h - 5, width: cb.w - 8, height: 3, fill: c.primary });
          }
          handles.cellText.set(
            key,
            label(g, cb.x + cb.w / 2, cb.y + cb.h / 2, fmt(v), {
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': codePx,
              fill: c.text,
            }),
          );
          label(g, cb.x + cb.w / 2, cb.y + cb.h + 14, String(i), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': smallPx,
            fill: c.textMuted,
          });
        });
      }

      // 이름과 자리
      scene.slots.forEach((s, i) => {
        const box = lay.slotBox.get(s.name)!;
        const hue = wrote.has(s.name) ? c.itemSwapping : readVia.has(s.name) ? c.primary : c.textMuted;
        label(svg, box.x + box.w / 2, box.y - 10, s.name, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': codePx,
          'font-weight': 600,
          fill: c.text,
        });
        el(svg, 'rect', {
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          rx: 4,
          fill: c.bgSubtle,
          stroke: hue === c.textMuted ? c.border : hue,
          'stroke-width': hue === c.textMuted ? 1 : 2,
        });
        handles.slotText.set(
          s.name,
          label(svg, box.x + box.w / 2, box.y + box.h / 2, fmt(s.val), {
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': codePx,
            fill: c.text,
          }),
        );
        label(svg, box.x + box.w / 2, box.y + box.h + 14, `@${s.addr}`, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': smallPx,
          fill: c.textMuted,
        });

        // 자리 안의 주소가 가리키는 목록으로
        if (!('ref' in s.val)) return;
        const target = lay.listBox.get(s.val.ref);
        if (!target) return;
        const left = slotSide(i) === 'left';
        const from = { x: left ? box.x + box.w : box.x, y: box.y + box.h / 2 };
        const to = { x: left ? target.x - 2 : target.x + target.w + 2, y: target.y + target.h / 2 };
        const line = el(svg, 'line', {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: hue,
          'stroke-width': hue === c.textMuted ? 1.5 : 2.5,
        });
        const head = el(svg, 'polygon', { points: arrowHead(from, to), fill: hue });
        handles.link.set(s.name, { line, head, from, to });
      });

      // 출력
      const ob = lay.outBox;
      const showed = scene.output.length > 0;
      label(svg, ob.x - 10, ob.y + ob.h / 2, t('label.output', 'output'), {
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': smallPx,
        fill: c.textMuted,
      });
      el(svg, 'rect', {
        x: ob.x,
        y: ob.y,
        width: ob.w,
        height: ob.h,
        rx: 4,
        fill: c.bg,
        stroke: showed && scene.reads.length > 0 ? c.primary : c.border,
        'stroke-width': showed && scene.reads.length > 0 ? 2 : 1,
        'stroke-dasharray': showed ? 'none' : '4 3',
      });
      handles.outText.push(
        label(svg, ob.x + ob.w / 2, ob.y + ob.h / 2, scene.output.map(fmt).join('  '), {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': codePx,
          fill: c.text,
        }),
      );

      label(svg, W / 2, H - 14, caption(scene, step), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': parseFloat(fontSizes.md),
        fill: c.text,
      });

      svg.appendChild(handles.overlay);
      return handles;
    }

    function arrowHead(from: Pt, to: Pt): string {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const bx = to.x - ux * 9;
      const by = to.y - uy * 9;
      const pts = [
        [to.x, to.y],
        [bx - uy * 5, by + ux * 5],
        [bx + uy * 5, by - ux * 5],
      ];
      return pts.map(([x, y]) => `${r2(x!)},${r2(y!)}`).join(' ');
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        let elapsed = 0;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          elapsed += FRAME_MS;
          const p = Math.min(1, elapsed / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function token(h: Handles, body: string, hue: string): SVGTextElement {
      return label(h.overlay, 0, 0, body, {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': codePx,
        'font-weight': 700,
        fill: hue,
      });
    }

    function place(node: SVGElement, p: Pt): void {
      node.setAttribute('x', String(r2(p.x)));
      node.setAttribute('y', String(r2(p.y)));
    }

    function growLink(h: Handles, name: string, k: number): void {
      const link = h.link.get(name);
      if (!link) return;
      const end = { x: link.from.x + (link.to.x - link.from.x) * k, y: link.from.y + (link.to.y - link.from.y) * k };
      link.line.setAttribute('x2', String(r2(end.x)));
      link.line.setAttribute('y2', String(r2(end.y)));
      if (k < 1) link.head.setAttribute('visibility', 'hidden');
      else link.head.removeAttribute('visibility');
    }

    async function animate(scene: AliasingScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind === 'start') return;
      const lay = layout(scene);

      if (step.kind === 'assign') {
        const slotText = h.slotText.get(step.name);
        const box = lay.slotBox.get(step.name);
        if (!slotText || !box) return;

        if (step.made !== null) {
          // 목록이 자리 밖 가운데에 내려앉고, 자리에서 그 목록으로 주소의 줄이 뻗는다
          const g = h.list.get(step.made);
          slotText.setAttribute('visibility', 'hidden');
          await tween(520, mine, (p) => {
            const k = ease(span(p, 0, 0.55));
            g?.setAttribute('transform', `translate(0 ${r2(-28 * (1 - k))})`);
            g?.setAttribute('opacity', String(r2(k)));
            growLink(h, step.name, ease(span(p, 0.55, 1)));
            if (p >= 0.55) slotText.removeAttribute('visibility');
          });
          return;
        }

        const from = step.source !== null ? lay.slotBox.get(step.source) : undefined;
        if (from) {
          // 주소 글자가 옛 자리에서 베껴져 목록 위를 넘어 새 자리로 건너간다 — 목록은 제자리
          const a = mid(from);
          const b = mid(box);
          const top = Math.min(...[...lay.listBox.values()].map((l) => l.y), a.y) - 70;
          const copy = token(h, slotText.textContent ?? '', c.text);
          slotText.setAttribute('visibility', 'hidden');
          growLink(h, step.name, 0);
          await tween(760, mine, (p) => {
            const k = ease(span(p, 0, 0.7));
            const x = a.x + (b.x - a.x) * k;
            const y = (1 - k) * (1 - k) * a.y + 2 * k * (1 - k) * top + k * k * b.y;
            place(copy, { x, y });
            if (p >= 0.7) {
              copy.setAttribute('visibility', 'hidden');
              slotText.removeAttribute('visibility');
            }
            growLink(h, step.name, ease(span(p, 0.7, 1)));
          });
          return;
        }

        // 그 밖의 대입 — 값이 자리 안으로 들어앉는다
        const b = mid(box);
        await tween(360, mine, (p) => place(slotText, { x: b.x, y: b.y - 16 * (1 - ease(p)) }));
        return;
      }

      if (step.kind === 'set') {
        // 고침이 via 의 줄을 타고 들어가 칸에 박히고, 옛 값은 칸 아래로 떨어진다
        const via = lay.slotBox.get(step.via);
        const cell = lay.cellBox.get(cellKey(step.ref, step.at));
        const list = lay.listBox.get(step.ref);
        const cellText = h.cellText.get(cellKey(step.ref, step.at));
        if (!via || !cell || !list || !cellText) return;
        const cm = mid(cell);
        const viaLeft = mid(via).x < W / 2;
        const edge = { x: viaLeft ? list.x : list.x + list.w, y: cm.y };
        const path = [mid(via), edge, { x: edge.x, y: cell.y - 18 }, { x: cm.x, y: cell.y - 18 }, cm];
        const fix = token(h, cellText.textContent ?? '', c.itemSwapping);
        const old = token(h, fmt(step.was), c.textMuted);
        cellText.setAttribute('visibility', 'hidden');
        place(old, cm);
        await tween(820, mine, (p) => {
          place(fix, along(path, ease(span(p, 0, 0.75))));
          const fall = ease(span(p, 0.6, 1));
          place(old, { x: cm.x, y: cm.y + 40 * fall });
          old.setAttribute('opacity', String(r2(1 - fall)));
          if (p >= 0.75) {
            fix.setAttribute('visibility', 'hidden');
            cellText.removeAttribute('visibility');
          }
        });
        return;
      }

      // show — 읽기가 via 의 줄을 타고 칸에 닿고, 칸의 값이 같은 줄을 거슬러 나와 출력에 선다
      const read = step.read;
      const out = h.outText[0];
      if (!read || !out) return;
      const via = lay.slotBox.get(read.via);
      const cell = lay.cellBox.get(cellKey(read.ref, read.at));
      const list = lay.listBox.get(read.ref);
      if (!via || !cell || !list) return;
      const cm = mid(cell);
      const vm = mid(via);
      const viaLeft = vm.x < W / 2;
      const edge = { x: viaLeft ? list.x : list.x + list.w, y: cm.y };
      const inward = [vm, edge, { x: edge.x, y: cell.y - 18 }, { x: cm.x, y: cell.y - 18 }, cm];
      const outward = [...inward].reverse().concat([mid(lay.outBox)]);
      const probe = el(h.overlay, 'circle', { cx: vm.x, cy: vm.y, r: 5, fill: c.primary });
      const carry = token(h, fmt(step.value), c.primary);
      carry.setAttribute('visibility', 'hidden');
      out.setAttribute('visibility', 'hidden');
      await tween(980, mine, (p) => {
        const q = along(inward, ease(span(p, 0, 0.35)));
        probe.setAttribute('cx', String(r2(q.x)));
        probe.setAttribute('cy', String(r2(q.y)));
        if (p >= 0.35) {
          probe.setAttribute('visibility', 'hidden');
          carry.removeAttribute('visibility');
          place(carry, along(outward, ease(span(p, 0.35, 1))));
        }
        if (p >= 1) {
          carry.setAttribute('visibility', 'hidden');
          out.removeAttribute('visibility');
        }
      });
    }

    return {
      async render(next: AliasingScene, _prev: AliasingScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, handles, mine);
        if (destroyed || mine !== gen) return;
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
  },
};
