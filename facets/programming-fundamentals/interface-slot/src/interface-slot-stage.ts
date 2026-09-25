/**
 * interface-slot 의 무대.
 *
 * 가운데 약속(`interface`)의 서명마다 빈칸이 하나씩 있다. 아래 구현 클래스 카드에는 몸이 **몸통 조각**으로
 * 들어 있다. 꽂음 걸음에서 그 조각이 카드에서 떠올라 약속의 칸으로 올라가 꽂히고, 다른 구현이 오면 꽂혀
 * 있던 조각은 제 카드로 내려가고 새 조각이 올라온다. 위의 함수 글자는 그대로 두고, 부름 걸음에서는 그 줄에서
 * 칸으로 점 하나가 건너간다 — 줄은 칸을 거쳐 꽂힌 몸을 돌린다.
 */
import {
  type CanvasView,
  type Palette,
  type SceneRenderer,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { InterfaceSlotScene, SlotBase } from './scene.js';

const H = 470;
const NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 420;
const PAD = 16;

type Pt = { x: number; y: number };

type Layout = {
  W: number;
  lh: number;
  ch: number;
  capY: number;
  /** 줄 번호 → 기준선 y, 글자 시작 x (함수 · 맨 바깥 줄) */
  flipRow: Map<number, Pt>;
  flipX: number;
  tallyY: number;
  out: { x: number; y: number; w: number; h: number };
  socket: { x: number; y: number; w: number; h: number; headY: number };
  sigRow: Map<string, Pt>;
  slot: Map<string, { x: number; y: number; w: number; h: number }>;
  cartW: number;
  cartH: number;
  cards: Map<string, { x: number; y: number; w: number; h: number; headY: number; rows: Map<number, Pt> }>;
  /** `${cls}:${sig}` → 카드 안 몸통 조각 자리 */
  home: Map<string, Pt>;
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function textWidth(s: string, px: number): number {
  let w = 0;
  for (const c of s) w += (c.codePointAt(0) ?? 0) >= 0x2e80 ? px : px * 0.58;
  return w;
}

function layout(base: SlotBase, W: number): Layout {
  const fs = parseFloat(fontSizes.sm);
  const ch = fs * 0.6;
  const lines = base.lines;
  const bodyLen = (b: number[]): number => b.length;
  const maxBody = Math.max(1, ...base.impls.flatMap((im) => im.methods.map((m) => bodyLen(m.body))));
  let maxBodyChars = 1;
  for (const im of base.impls)
    for (const m of im.methods) for (const b of m.body) maxBodyChars = Math.max(maxBodyChars, lines[b]!.text.length);
  const nSig = base.iface.sigs.length;
  const nMethods = Math.max(1, ...base.impls.map((im) => im.methods.length));
  const flipRows = 1 + base.fn.body.length;

  // 세로에 담기도록 줄 높이를 줄인다 (세로는 바뀌지 않는다)
  let lh = fs * 1.55;
  let need = 0;
  for (let k = 0; k < 24; k += 1) {
    const cartH = maxBody * lh + 10;
    const rowA = (flipRows + 0.5 + base.sites.length + 1.5) * lh;
    const rowB = lh * 1.5 + nSig * (cartH + 10) + 4;
    const rowC = lh * 1.5 + nMethods * (lh + cartH + 6) + 4;
    need = 42 + rowA + 12 + rowB + 14 + rowC + 6;
    if (need <= H) break;
    lh -= 0.5;
  }
  const cartH = maxBody * lh + 10;
  const cartW = maxBodyChars * ch + 16;
  const capY = 24;

  // 위 — 함수와 맨 바깥 줄, 오른쪽에 출력
  const aTop = 42;
  const flipX = PAD + 4;
  const flipRow = new Map<number, Pt>();
  const at = (row: number): number => aTop + (row + 0.75) * lh;
  flipRow.set(base.fn.line, { x: flipX + lines[base.fn.line]!.indent * 4 * ch, y: at(0) });
  base.fn.body.forEach((b, k) => flipRow.set(b, { x: flipX + lines[b]!.indent * 4 * ch, y: at(1 + k) }));
  base.sites.forEach((s, k) => flipRow.set(s, { x: flipX + lines[s]!.indent * 4 * ch, y: at(flipRows + 0.5 + k) }));
  const tallyY = at(flipRows + 0.5 + base.sites.length + 0.4);
  const aBottom = aTop + (flipRows + 0.5 + base.sites.length + 1.5) * lh;
  const outX = W * 0.62;
  const out = { x: outX, y: aTop, w: W - PAD - outX, h: aBottom - aTop - 4 };

  // 가운데 — 약속
  const bTop = aBottom + 12;
  const socketW = W - 2 * PAD;
  const headY = bTop + lh * 1.05;
  let maxSigChars = 1;
  for (const s of base.iface.sigs) maxSigChars = Math.max(maxSigChars, lines[s.line]!.text.length);
  const sigRow = new Map<string, Pt>();
  const slot = new Map<string, { x: number; y: number; w: number; h: number }>();
  base.iface.sigs.forEach((s, k) => {
    const y = bTop + lh * 1.5 + k * (cartH + 10);
    const sx = PAD + 12 + lines[s.line]!.indent * 4 * ch;
    sigRow.set(s.name, { x: sx, y: y + cartH / 2 + fs * 0.35 });
    slot.set(s.name, { x: sx + maxSigChars * ch + 24, y, w: cartW + 12, h: cartH + 4 });
  });
  const bH = lh * 1.5 + nSig * (cartH + 10) + 4;
  const socket = { x: PAD, y: bTop, w: socketW, h: bH, headY };

  // 아래 — 구현 카드
  const cTop = bTop + bH + 14;
  const n = Math.max(1, base.impls.length);
  const gap = 16;
  const cw = (W - 2 * PAD - (n - 1) * gap) / n;
  const cards: Layout['cards'] = new Map();
  const home = new Map<string, Pt>();
  const cH = lh * 1.5 + nMethods * (lh + cartH + 6) + 4;
  base.impls.forEach((im, i) => {
    const x = PAD + i * (cw + gap);
    const rows = new Map<number, Pt>();
    im.methods.forEach((m, k) => {
      const y0 = cTop + lh * 1.5 + k * (lh + cartH + 6);
      rows.set(m.line, { x: x + 12 + lines[m.line]!.indent * 4 * ch, y: y0 + lh * 0.75 });
      const first = m.body[0];
      const ind = first === undefined ? 2 : lines[first]!.indent;
      home.set(`${im.cls}:${m.sig}`, { x: x + 12 + ind * 4 * ch - 8, y: y0 + lh });
    });
    cards.set(im.cls, { x, y: cTop, w: cw, h: cH, headY: cTop + lh * 1.05, rows });
  });

  return { W, lh, ch, capY, flipRow, flipX, tallyY, out, socket, sigRow, slot, cartW, cartH, cards, home };
}

export const interfaceSlotStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): SceneRenderer<InterfaceSlotScene> & { destroy(): void } {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const vb = svg.viewBox?.baseVal;
    const W = vb !== undefined && vb !== null && vb.width > 0 ? vb.width : PIECE_CANVAS_W;
    const fs = parseFloat(fontSizes.sm);
    const fsXs = parseFloat(fontSizes.xs);
    const fsMd = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let cached: { base: SlotBase; lay: Layout } | null = null;

    function lay(base: SlotBase): Layout {
      if (cached === null || cached.base !== base) cached = { base, lay: layout(base, W) };
      return cached.lay;
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      s: string,
      x: number,
      y: number,
      o: { mono?: boolean; px?: number; fill?: string; weight?: string; anchor?: string; max?: number } = {},
    ): SVGTextElement {
      const px = o.px ?? fs;
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === false ? fonts.body : fonts.mono,
          'font-size': px,
          fill: o.fill ?? c.text,
          'text-anchor': o.anchor ?? 'start',
        },
        parent,
      );
      if (o.weight !== undefined) node.setAttribute('font-weight', o.weight);
      if (o.mono !== false) node.setAttribute('xml:space', 'preserve');
      node.textContent = s;
      if (o.max !== undefined && textWidth(s, px) > o.max) {
        node.setAttribute('textLength', String(r2(o.max)));
        node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
      return node;
    }

    function classColor(base: SlotBase, cls: string): string {
      const pal = categorical(base.impls.length);
      const i = base.impls.findIndex((im) => im.cls === cls);
      return pal[i < 0 ? 0 : i] ?? c.primary;
    }

    /** 몸통 조각 — 몸의 줄을 담은 작은 판 */
    function cartridge(
      parent: Element,
      base: SlotBase,
      L: Layout,
      cls: string,
      sig: string,
      at: Pt,
      o: { inSlot: boolean; active: boolean },
    ): SVGGElement {
      const im = base.impls.find((x) => x.cls === cls);
      const m = im?.methods.find((x) => x.sig === sig);
      const g = el('g', { transform: `translate(${r2(at.x)},${r2(at.y)})` }, parent);
      el(
        'rect',
        {
          x: 0,
          y: 0,
          width: L.cartW,
          height: L.cartH,
          rx: 5,
          fill: o.inSlot ? c.bgSubtle : c.bg,
          stroke: o.active ? c.accent : classColor(base, cls),
          'stroke-width': o.active ? 2.4 : 1.4,
        },
        g,
      );
      el('rect', { x: 0, y: 0, width: 4, height: L.cartH, rx: 2, fill: classColor(base, cls) }, g);
      (m?.body ?? []).forEach((b, k) => {
        write(g, base.lines[b]!.text, 10, 5 + (k + 0.75) * L.lh, { weight: o.active ? '700' : '400' });
      });
      return g;
    }

    type Handles = {
      slotCarts: Map<string, SVGGElement>;
      pill: SVGGElement | null;
      dot: SVGCircleElement | null;
      overlay: SVGGElement;
    };

    function drawStatic(s: InterfaceSlotScene): Handles | null {
      svg.textContent = '';
      const base = s.base;
      if (base === null) return null;
      const L = lay(base);
      const lines = base.lines;
      const step = s.step;
      const root = el('g', {}, svg);

      // 캡션 — 지금 일어나는 일
      write(root, caption(s, base), PAD, L.capY, { mono: false, px: fsMd, weight: '600', max: L.W - 2 * PAD });

      // 위 — 함수 글자 (글자는 걸음 내내 그대로다)
      const calling = step?.kind === 'call' ? step : null;
      for (const [line, p] of L.flipRow) {
        const isSite = s.site === line && base.sites.includes(line);
        const isCall = calling !== null && calling.line === line;
        if (isSite || isCall) {
          el(
            'rect',
            {
              x: L.flipX - 6,
              y: p.y - L.lh * 0.72,
              width: (lines[line]!.indent * 4 + lines[line]!.text.length) * L.ch + 12,
              height: L.lh,
              rx: 3,
              fill: c.bgSubtle,
              stroke: isCall ? c.accent : c.border,
              'stroke-width': isCall ? 1.8 : 1,
            },
            root,
          );
        }
        write(root, lines[line]!.text, p.x, p.y, { fill: base.sites.includes(line) && !isSite ? c.textMuted : c.text });
      }
      // 함수의 `light` 가 쥔 객체
      let pill: SVGGElement | null = null;
      if (s.plugged !== null) {
        const label = t('label.holds', '{param}: {cls} object', { param: base.fn.params[0] ?? '', cls: s.plugged });
        const pw = textWidth(label, fsXs) + 16;
        const pp = pillAt(base, L, base.fn.line);
        pill = el('g', { transform: `translate(${r2(pp.x)},${r2(pp.y)})` }, root);
        el('rect', { x: 0, y: 0, width: pw, height: L.lh, rx: L.lh / 2, fill: c.bg, stroke: classColor(base, s.plugged), 'stroke-width': 1.6 }, pill);
        write(pill, label, 8, L.lh * 0.7, { mono: false, px: fsXs, fill: c.text });
      }
      // 셈 — 함수의 줄 수와 지금까지 돈 몸 수
      let bodiesRun = 0;
      for (const im of base.impls) for (const m of im.methods) if (m.body.some((b) => s.ran.includes(b))) bodiesRun += 1;
      write(
        root,
        t('label.tally', '{fn} lines: {lines} · bodies run: {bodies}', {
          fn: base.fn.name,
          lines: base.fn.body.length,
          bodies: bodiesRun,
        }),
        L.flipX - 2,
        L.tallyY,
        { mono: false, px: fsXs, fill: c.textMuted },
      );

      // 출력
      el('rect', { x: L.out.x, y: L.out.y, width: L.out.w, height: L.out.h, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
      write(root, t('label.output', 'Output'), L.out.x + 10, L.out.y + L.lh * 0.85, { mono: false, px: fsXs, fill: c.textMuted });
      const room = L.out.h - L.lh * 1.3;
      const rowH = Math.min(L.lh, room / Math.max(1, s.outputs.length));
      s.outputs.forEach((o, k) => {
        const last = calling !== null && k >= s.outputs.length - calling.outs.length;
        write(root, o, L.out.x + 12, L.out.y + L.lh * 1.3 + (k + 0.8) * rowH, {
          fill: last ? c.text : c.textMuted,
          weight: last ? '700' : '400',
          max: L.out.w - 20,
        });
      });

      // 가운데 — 약속과 그 칸
      const S = L.socket;
      el('rect', { x: S.x, y: S.y, width: S.w, height: S.h, rx: 8, fill: c.bg, stroke: c.text, 'stroke-width': 1.4 }, root);
      write(root, lines[base.iface.line]!.text, S.x + 12, S.headY, { weight: '700' });
      write(root, t('label.promise', 'promise'), S.x + S.w - 12, S.headY, {
        mono: false,
        px: fsXs,
        fill: c.textMuted,
        anchor: 'end',
      });
      const slotCarts = new Map<string, SVGGElement>();
      for (const sig of base.iface.sigs) {
        const p = L.sigRow.get(sig.name)!;
        const box = L.slot.get(sig.name)!;
        write(root, lines[sig.line]!.text, p.x, p.y);
        const hot = calling !== null && calling.method === sig.name;
        el(
          'rect',
          {
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            rx: 6,
            fill: 'none',
            stroke: hot ? c.accent : c.textMuted,
            'stroke-width': hot ? 1.8 : 1.2,
            'stroke-dasharray': '5 4',
          },
          root,
        );
        if (s.plugged === null) {
          write(root, t('label.empty', 'empty'), box.x + box.w / 2, box.y + box.h / 2 + fsXs * 0.35, {
            mono: false,
            px: fsXs,
            fill: c.textMuted,
            anchor: 'middle',
          });
        }
      }

      // 아래 — 구현 카드 (정의는 늘 제자리에 있다)
      for (const im of base.impls) {
        const card = L.cards.get(im.cls)!;
        const col = classColor(base, im.cls);
        el('rect', { x: card.x, y: card.y, width: card.w, height: card.h, rx: 8, fill: c.bg, stroke: col, 'stroke-width': 1.4 }, root);
        write(root, lines[im.line]!.text, card.x + 12, card.headY, { weight: '700', max: card.w - 24 });
        for (const m of im.methods) {
          const p = card.rows.get(m.line)!;
          write(root, lines[m.line]!.text, p.x, p.y);
          const hp = L.home.get(`${im.cls}:${m.sig}`)!;
          const g = cartridge(root, base, L, im.cls, m.sig, hp, { inSlot: false, active: false });
          if (s.plugged === im.cls) g.setAttribute('opacity', '0.45');
        }
      }

      // 부름 — 줄에서 칸으로 잇는 선
      let dot: SVGCircleElement | null = null;
      if (calling !== null) {
        const a = callFrom(base, L, calling.line);
        const b = callTo(L, calling.method);
        if (a !== null && b !== null) {
          el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c.accent, 'stroke-width': 1.6 }, root);
          dot = el('circle', { cx: b.x, cy: b.y, r: 4.5, fill: c.accent }, root);
        }
      }

      // 칸에 꽂힌 몸 — 가장 위에 그린다
      const top = el('g', {}, root);
      if (s.plugged !== null) {
        for (const sig of base.iface.sigs) {
          const box = L.slot.get(sig.name)!;
          const hot = calling !== null && calling.method === sig.name;
          slotCarts.set(sig.name, cartridge(top, base, L, s.plugged, sig.name, { x: box.x + 6, y: box.y + 2 }, { inSlot: true, active: hot }));
        }
      }
      const overlay = el('g', {}, root);
      return { slotCarts, pill, dot, overlay };
    }

    /** 줄 글자 끝 바로 뒤 — 객체 표지가 서는 자리 */
    function pillAt(base: SlotBase, L: Layout, line: number): Pt {
      const p = L.flipRow.get(line) ?? { x: L.flipX, y: L.capY };
      return { x: p.x + base.lines[line]!.text.length * L.ch + 10, y: p.y - L.lh * 0.7 };
    }

    function callFrom(base: SlotBase, L: Layout, line: number): Pt | null {
      const p = L.flipRow.get(line);
      if (p === undefined) return null;
      return { x: p.x + base.lines[line]!.text.length * L.ch + 8, y: p.y - L.lh * 0.25 };
    }
    function callTo(L: Layout, sig: string): Pt | null {
      const box = L.slot.get(sig);
      return box === undefined ? null : { x: box.x, y: box.y + box.h / 2 };
    }

    function caption(s: InterfaceSlotScene, base: SlotBase): string {
      const step = s.step;
      if (step === null || step.kind === 'start') {
        return t('caption.start', 'Nothing has run yet. Empty slots in {iface}: {n}', {
          iface: base.iface.name,
          n: base.iface.sigs.length,
        });
      }
      if (step.kind === 'plug') {
        if (step.was === null) {
          return t('caption.plug', '{fn} receives: {cls} object — its bodies plug into the slots. Filled: {n}', {
            fn: base.fn.name,
            cls: step.cls,
            n: base.impls.find((im) => im.cls === step.cls)?.methods.length ?? 0,
          });
        }
        return t('caption.swap', '{fn} receives: {cls} object — {old} bodies come out, {cls} bodies go in.', {
          fn: base.fn.name,
          cls: step.cls,
          old: step.was,
        });
      }
      return t('caption.call', '{code} goes through the slot to the {cls} body. Output: {out}', {
        code: base.lines[step.line]?.text ?? step.method,
        cls: step.cls,
        out: step.outs.join(', '),
      });
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / ms);
          const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          frame(p);
          if (raw >= 1) {
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

    function move(g: Element, from: Pt, to: Pt, p: number): void {
      g.setAttribute('transform', `translate(${r2(from.x + (to.x - from.x) * p)},${r2(from.y + (to.y - from.y) * p)})`);
    }

    async function render(next: InterfaceSlotScene, prev: InterfaceSlotScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const base = next.base;
      const step = next.step;
      if (!opts.animate || h === null || base === null || step === null || prev === null) return;
      const L = lay(base);

      if (step.kind === 'plug') {
        // 새 몸은 제 카드에서 칸으로 올라가고, 앞서 꽂혀 있던 몸은 제 카드로 내려간다
        const ups: { g: Element; from: Pt; to: Pt }[] = [];
        for (const sig of base.iface.sigs) {
          const g = h.slotCarts.get(sig.name);
          const from = L.home.get(`${step.cls}:${sig.name}`);
          const box = L.slot.get(sig.name);
          if (g === undefined || from === undefined || box === undefined) continue;
          ups.push({ g, from, to: { x: box.x + 6, y: box.y + 2 } });
          if (step.was !== null) {
            const back = L.home.get(`${step.was}:${sig.name}`);
            if (back !== undefined) {
              const og = cartridge(h.overlay, base, L, step.was, sig.name, { x: box.x + 6, y: box.y + 2 }, { inSlot: true, active: false });
              ups.push({ g: og, from: { x: box.x + 6, y: box.y + 2 }, to: back });
            }
          }
        }
        // `light` 가 쥔 객체 표지는 부르는 줄에서 함수 머리로 건너간다
        const pillStart = pillAt(base, L, step.site);
        const pillEnd = pillAt(base, L, base.fn.line);
        const frame = (p: number): void => {
          for (const u of ups) move(u.g, u.from, u.to, p);
          if (h.pill !== null) move(h.pill, pillStart, pillEnd, p);
        };
        await tween(mine, MOVE_MS, frame);
      } else if (step.kind === 'call' && h.dot !== null) {
        const a = callFrom(base, L, step.line);
        const b = callTo(L, step.method);
        const dot = h.dot;
        if (a !== null && b !== null) {
          await tween(mine, MOVE_MS, (p) => {
            dot.setAttribute('cx', String(r2(a.x + (b.x - a.x) * p)));
            dot.setAttribute('cy', String(r2(a.y + (b.y - a.y) * p)));
          });
        }
      }
      if (destroyed || mine !== gen) return;
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
