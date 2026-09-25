/**
 * certificate-chain 무대 — 확인이 잎에서 발급자 쪽으로 한 칸씩 거슬러 오른다.
 *
 * 위 띠가 클라이언트의 신뢰 저장소, 아래가 받은 꾸러미다. 사슬은 아래에서 위로 쌓이고,
 * 마지막 오르기는 받은 꾸러미를 떠나 저장소 띠로 선을 넘는다. 서버 칸은 왼쪽 아래에 있어
 * 꾸러미는 옆으로 건너오고, 확인은 위로 오른다 — 두 운동의 방향을 갈라 둔다.
 *
 * 운동
 *   receive  꾸러미 카드가 서버 칸에서 받은 꾸러미 자리로 옆으로 건너온다
 *   find     아래 칸의 발급자 이름표가 떠올라 후보 카드마다 subject 바로 밑에 대어 본다
 *   verify   찾은 칸의 열쇠가 내려와 아래 칸의 서명에 닿고, 맞으면 표식이 한 칸 오른다
 *   anchor   잎에서 뿌리까지 오른 길이 아래부터 한 번 더 훑어진다
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ChainScene, SceneCert } from './scene.js';

const W = PIECE_CANVAS_W;
const H = 290;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 10;
const CARD_W_MAX = 180;
const STORE_MIN_GAP = 16;
const INSET = 6;
const TOP = 6;
const STORE_Y = 28;
const STORE_H = 42;
const CUT = 80;
const BUNDLE_H = 56;
const BUNDLE_TOP = 106;
const BUNDLE_BOTTOM = 236;
const LEVEL_GAP_MAX = 24;
const CLIENT_BOTTOM = 250;
const CAPTION_Y = 274;
const SPINE_OFF = 14;

const MOVE_MS = 600;
const FIND_MS = 600;
const KEY_MS = 380;
const CLIMB_MS = 300;
const SWEEP_MS = 600;

const XS = parseFloat(fontSizes.xs);
const MONO_W = XS * 0.62;

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number; inStore: boolean };

function r(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 걸음의 효과를 빼 둔 장면 — 운동이 출발할 화면. 계기값은 next.step 이 말한다. */
function holdScene(s: ChainScene): ChainScene {
  const step = s.step;
  if (step.kind === 'receive') return { ...s, arrived: false, chain: [] };
  if (step.kind === 'find') {
    const missed = step.looked.filter((id) => id !== step.to);
    return { ...s, pending: null, rejected: s.rejected.filter((id) => !missed.includes(id)) };
  }
  if (step.kind === 'verify') {
    return {
      ...s,
      chain: step.ok ? s.chain.slice(0, -1) : s.chain,
      pending: { from: step.lower, to: step.upper },
      verdicts: s.verdicts.filter((v) => v.lower !== step.lower),
    };
  }
  if (step.kind === 'anchor') return { ...s, trusted: null };
  return s;
}

type Layout = {
  cardW: number;
  storeBox: (i: number) => Box;
  bundleBox: (i: number) => Box;
  serverBox: (i: number) => Box;
  clientLeft: number;
  serverRight: number;
};

function layoutFor(s: ChainScene): Layout {
  const n = Math.max(1, s.store.length);
  const cardW = Math.min(CARD_W_MAX, Math.floor((W - 2 * PAD - (n - 1) * STORE_MIN_GAP) / n));
  const storeGap = n > 1 ? (W - 2 * PAD - n * cardW) / (n - 1) : 0;
  const k = Math.max(1, s.bundle.length);
  const levelGap = k > 1 ? Math.min(LEVEL_GAP_MAX, (BUNDLE_BOTTOM - BUNDLE_TOP - k * BUNDLE_H) / (k - 1)) : 0;
  const bundleX = r((W - cardW) / 2);
  const serverRight = PAD + cardW + 2 * INSET;
  const levelY = (i: number): number => r(BUNDLE_BOTTOM - BUNDLE_H - i * (BUNDLE_H + levelGap));
  return {
    cardW,
    storeBox: (i) => ({ x: r(PAD + i * (cardW + storeGap)), y: STORE_Y, w: cardW, h: STORE_H, inStore: true }),
    bundleBox: (i) => ({ x: bundleX, y: levelY(i), w: cardW, h: BUNDLE_H, inStore: false }),
    serverBox: (i) => ({ x: PAD + INSET, y: levelY(i), w: cardW, h: BUNDLE_H, inStore: false }),
    clientLeft: serverRight + 8,
    serverRight,
  };
}

export const certificateChainStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { mono?: boolean; size?: string; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? '400',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function certOf(s: ChainScene, id: string): SceneCert {
      const c = s.certs.find((x) => x.id === id);
      if (c === undefined) throw new Error(`certificate-chain 무대: 인증서 ${id} 가 장면에 없다`);
      return c;
    }

    /** 카드 자리 — 꾸러미의 것은 건너오기 전엔 서버 칸에, 뒤엔 받은 꾸러미 자리에 선다. */
    function boxOf(s: ChainScene, lay: Layout, id: string): Box {
      const bi = s.bundle.indexOf(id);
      if (bi >= 0) return s.arrived ? lay.bundleBox(bi) : lay.serverBox(bi);
      const si = s.store.indexOf(id);
      if (si >= 0) return lay.storeBox(si);
      throw new Error(`certificate-chain 무대: ${id} 의 자리가 없다`);
    }

    const spineOf = (b: Box): Pt => ({ x: b.x + b.w + SPINE_OFF, y: b.y + b.h / 2 });
    const keyOf = (b: Box): Pt => ({ x: b.x + 11, y: b.inStore ? b.y + 29 : b.y + 45 });
    const sealOf = (b: Box): Pt => ({ x: b.x + b.w - 14, y: b.y + 45 });

    function keyGlyph(parent: Element, at: Pt, stroke: string): SVGGElement {
      const g = el('g', { transform: `translate(${String(r(at.x))},${String(r(at.y))})` }, parent);
      el('circle', { cx: 0, cy: 0, r: 3.5, fill: 'none', stroke, 'stroke-width': 1.5 }, g);
      el('path', { d: 'M3.5 0 H11 M8.5 0 V3 M11 0 V3', fill: 'none', stroke, 'stroke-width': 1.5 }, g);
      return g;
    }

    function sealGlyph(parent: Element, at: Pt, verdict: boolean | null): void {
      const fill = verdict === null ? colors.bg : verdict ? colors.success : colors.danger;
      const stroke = verdict === null ? colors.textMuted : fill;
      el('circle', { cx: at.x, cy: at.y, r: 6.5, fill, stroke, 'stroke-width': 1.5 }, parent);
      if (verdict === true) {
        el(
          'path',
          { d: `M${String(r(at.x - 3))} ${String(r(at.y))} l2.2 2.4 l4 -4.6`, fill: 'none', stroke: colors.textInverse, 'stroke-width': 1.6 },
          parent,
        );
      } else if (verdict === false) {
        el(
          'path',
          { d: `M${String(r(at.x - 2.6))} ${String(r(at.y - 2.6))} l5.2 5.2 m0 -5.2 l-5.2 5.2`, fill: 'none', stroke: colors.textInverse, 'stroke-width': 1.6 },
          parent,
        );
      }
    }

    function crossMark(parent: Element, b: Box): void {
      const cx = b.x + b.w - 12;
      const cy = b.y + 12;
      el('path', { d: `M${String(r(cx - 4))} ${String(r(cy - 4))} l8 8 m0 -8 l-8 8`, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.8 }, parent);
    }

    function trustBadge(parent: Element, b: Box): void {
      const cx = b.x + b.w - 12;
      const cy = b.y + 12;
      el('circle', { cx, cy, r: 7, fill: colors.success }, parent);
      el(
        'path',
        { d: `M${String(r(cx - 3.2))} ${String(r(cy))} l2.3 2.5 l4.2 -4.8`, fill: 'none', stroke: colors.textInverse, 'stroke-width': 1.7 },
        parent,
      );
    }

    function climberShape(parent: Element, at: Pt): SVGPathElement {
      return el(
        'path',
        {
          d: 'M0 -8 L7 5 L-7 5 Z',
          transform: `translate(${String(r(at.x))},${String(r(at.y))})`,
          fill: colors.accent,
          stroke: colors.text,
          'stroke-width': 1,
          'stroke-linejoin': 'round',
        },
        parent,
      );
    }

    type Handles = { cards: Map<string, SVGGElement>; climber: SVGPathElement | null; overlay: SVGGElement };

    function drawStatic(s: ChainScene): Handles {
      svg.textContent = '';
      const lay = layoutFor(s);
      const cards = new Map<string, SVGGElement>();

      // 바탕 — 클라이언트(ㄱ 자 꼴: 위 띠 전체 + 아래 오른쪽)와 서버 칸
      const cl = lay.clientLeft;
      el(
        'path',
        {
          d: `M${String(PAD)} ${String(TOP)} H${String(W - PAD)} V${String(CLIENT_BOTTOM)} H${String(cl)} V${String(CUT + 4)} H${String(PAD)} Z`,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-linejoin': 'round',
        },
        svg,
      );
      el('line', { x1: cl, y1: CUT, x2: W - PAD, y2: CUT, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '4 4' }, svg);
      label(svg, W - PAD - 8, TOP + 14, t('label.client', 'Client'), { anchor: 'end', weight: '600' });
      label(svg, PAD + 8, TOP + 14, t('label.store', 'Trust store'), { fill: colors.textMuted });
      label(svg, cl + 8, CUT + 16, t('label.bundle', 'Received bundle'), { fill: colors.textMuted });
      el(
        'rect',
        { x: PAD, y: CUT + 10, width: lay.serverRight - PAD, height: CLIENT_BOTTOM - CUT - 10, rx: 4, fill: colors.bg, stroke: colors.border, 'stroke-width': 1 },
        svg,
      );
      label(svg, PAD + 8, CUT + 24, t('label.server', 'Server'), { weight: '600' });

      // 사슬 — 확인을 마친 오르기는 굵은 선, 찾았으나 확인 전은 점선
      const spineLayer = el('g', {}, svg);
      for (let i = 0; i + 1 < s.chain.length; i += 1) {
        const a = spineOf(boxOf(s, lay, s.chain[i] as string));
        const b = spineOf(boxOf(s, lay, s.chain[i + 1] as string));
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.success, 'stroke-width': 3, 'stroke-linecap': 'round' }, spineLayer);
      }
      if (s.pending !== null) {
        const a = spineOf(boxOf(s, lay, s.pending.from));
        const b = spineOf(boxOf(s, lay, s.pending.to));
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: colors.itemComparing, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, spineLayer);
      }

      // 카드
      const ids = [...s.bundle, ...s.store];
      for (const id of ids) {
        const c = certOf(s, id);
        const b = boxOf(s, lay, id);
        const inChain = s.chain.includes(id);
        const isPending = s.pending !== null && s.pending.to === id;
        const rejected = s.rejected.includes(id);
        const g = el('g', {}, svg);
        cards.set(id, g);
        const stroke = s.trusted === id ? colors.success : isPending ? colors.itemComparing : inChain ? colors.success : colors.border;
        const sw = s.trusted === id ? 2.5 : isPending ? 2 : inChain ? 1.5 : 1;
        el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 4, fill: colors.bg, stroke, 'stroke-width': sw }, g);
        label(g, b.x + 8, b.y + 16, c.subject, { mono: true, weight: '600', fill: rejected ? colors.textMuted : colors.text });
        if (!b.inStore) {
          // 발급자 줄 — 위를 가리키는 작은 화살
          el('path', { d: `M${String(r(b.x + 11))} ${String(r(b.y + 34))} V${String(r(b.y + 25))} M${String(r(b.x + 8))} ${String(r(b.y + 28))} L${String(r(b.x + 11))} ${String(r(b.y + 25))} L${String(r(b.x + 14))} ${String(r(b.y + 28))}`, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.3 }, g);
          if (c.issuer !== null) label(g, b.x + 18, b.y + 33, c.issuer, { mono: true, fill: colors.textMuted });
          const v = s.verdicts.find((x) => x.lower === id);
          sealGlyph(g, sealOf(b), v === undefined ? null : v.ok);
          label(g, b.x + b.w - 25, b.y + 49, t('label.sig', 'signature'), { anchor: 'end', fill: colors.textMuted });
          keyGlyph(g, keyOf(b), colors.text);
          label(g, b.x + 26, b.y + 49, t('label.key', 'public key'), { fill: colors.textMuted });
        } else {
          keyGlyph(g, keyOf(b), rejected ? colors.textMuted : colors.text);
          label(g, b.x + 26, b.y + 33, t('label.key', 'public key'), { fill: colors.textMuted });
        }
        if (rejected) crossMark(g, b);
        if (s.trusted === id) trustBadge(g, b);
      }

      // 오르는 표식 — 확인을 마친 가장 높은 칸 옆
      let climber: SVGPathElement | null = null;
      const top = s.chain[s.chain.length - 1];
      if (s.arrived && top !== undefined) climber = climberShape(svg, spineOf(boxOf(s, lay, top)));

      // 캡션 — 지금 일어나는 일만
      label(svg, W / 2, CAPTION_Y, captionOf(s), { anchor: 'middle', size: fontSizes.sm });

      const overlay = el('g', {}, svg);
      return { cards, climber, overlay };
    }

    function captionOf(s: ChainScene): string {
      const step = s.step;
      if (step.kind === 'ready') return t('caption.ready', 'The server is about to send its certificates.');
      if (step.kind === 'receive') {
        return t('caption.receive', 'Certificates received from the server: {n}', { n: step.count });
      }
      if (step.kind === 'find') {
        return step.where === 'bundle'
          ? t('caption.findBundle', 'Issuer {issuer} — found in the received bundle.', { issuer: step.issuer })
          : t('caption.findStore', 'Issuer {issuer} — not in the received bundle; found in the trust store.', { issuer: step.issuer });
      }
      if (step.kind === 'verify') {
        return step.ok
          ? t('caption.verifyOk', "Opened the signature with the issuer's public key — it matches the digest.")
          : t('caption.verifyBad', "Opened the signature with the issuer's public key — it does not match. The climb stops.");
      }
      return t('caption.anchor', 'Reached a certificate from the trust store — stop and trust it. Links in the chain: {n}', {
        n: step.links,
      });
    }

    /** 한 시계 — 끝나면 true, 새 render · destroy 로 물러나면 false. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish(true);
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

    const alive = (mine: number): boolean => mine === gen && !destroyed;

    async function animate(next: ChainScene, mine: number): Promise<void> {
      const step = next.step;
      const before = holdScene(next);
      const lay = layoutFor(next);
      const h = drawStatic(before);

      if (step.kind === 'receive') {
        // 꾸러미가 서버 칸에서 받은 꾸러미 자리로 옆으로 건너온다
        const moves = next.bundle.map((id, i) => ({ g: h.cards.get(id), from: lay.serverBox(i), to: lay.bundleBox(i) }));
        await tween(mine, MOVE_MS, (p) => {
          for (const m of moves) {
            if (m.g === undefined) continue;
            m.g.setAttribute('transform', `translate(${String(r((m.to.x - m.from.x) * p))},${String(r((m.to.y - m.from.y) * p))})`);
          }
        });
        return;
      }

      if (step.kind === 'find') {
        // 발급자 이름표가 떠올라 후보마다 subject 밑에 대어 본다
        const fromBox = boxOf(next, lay, step.from);
        const tagW = step.issuer.length * MONO_W + 10;
        const tag = el('g', {}, h.overlay);
        el('rect', { x: 0, y: 0, width: tagW, height: 15, rx: 3, fill: colors.bg, stroke: colors.itemComparing, 'stroke-width': 1.5 }, tag);
        label(tag, 4, 11, step.issuer, { mono: true, fill: colors.text });
        const points: Pt[] = [{ x: fromBox.x + 14, y: fromBox.y + 22 }];
        for (const id of step.looked) {
          const b = boxOf(next, lay, id);
          points.push({ x: b.x + 4, y: b.y + 20 });
        }
        const hops = points.length - 1;
        const marked = new Set<number>();
        await tween(mine, FIND_MS, (p) => {
          const f = p * hops;
          const i = Math.min(hops - 1, Math.floor(f));
          const local = f - i;
          const a = points[i] as Pt;
          const b = points[i + 1] as Pt;
          tag.setAttribute('transform', `translate(${String(r(lerp(a.x, b.x, local)))},${String(r(lerp(a.y, b.y, local)))})`);
          // 이미 지나온 후보 가운데 이름이 다른 것에 표시
          for (let j = 0; j < i || (j === i && local >= 1); j += 1) {
            const id = step.looked[j] as string;
            if (id === step.to || marked.has(j)) continue;
            marked.add(j);
            crossMark(h.overlay, boxOf(next, lay, id));
          }
        });
        return;
      }

      if (step.kind === 'verify') {
        // 찾은 칸의 열쇠가 내려와 아래 칸의 서명에 닿는다
        const upperBox = boxOf(next, lay, step.upper);
        const lowerBox = boxOf(next, lay, step.lower);
        const from = keyOf(upperBox);
        const to = sealOf(lowerBox);
        const key = keyGlyph(h.overlay, from, colors.primary);
        const arrived = await tween(mine, KEY_MS, (p) => {
          key.setAttribute('transform', `translate(${String(r(lerp(from.x, to.x - 16, p)))},${String(r(lerp(from.y, to.y, p)))})`);
        });
        if (!arrived || !alive(mine)) return;
        sealGlyph(h.overlay, to, step.ok);
        if (!step.ok) return;
        // 맞으면 표식이 한 칸 오른다
        const a = spineOf(lowerBox);
        const b = spineOf(upperBox);
        const seg = el('line', { x1: a.x, y1: a.y, x2: a.x, y2: a.y, stroke: colors.success, 'stroke-width': 3, 'stroke-linecap': 'round' }, h.overlay);
        const climber = h.climber;
        if (climber !== null) h.overlay.appendChild(climber);
        await tween(mine, CLIMB_MS, (p) => {
          const x = lerp(a.x, b.x, p);
          const y = lerp(a.y, b.y, p);
          seg.setAttribute('x2', String(r(x)));
          seg.setAttribute('y2', String(r(y)));
          climber?.setAttribute('transform', `translate(${String(r(x))},${String(r(y))})`);
        });
        return;
      }

      if (step.kind === 'anchor') {
        // 오른 길을 아래부터 훑는다
        const pts = next.chain.map((id) => spineOf(boxOf(next, lay, id)));
        let total = 0;
        for (let i = 1; i < pts.length; i += 1) {
          const a = pts[i - 1] as Pt;
          const b = pts[i] as Pt;
          total += Math.hypot(b.x - a.x, b.y - a.y);
        }
        if (total <= 0) return;
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${String(r(p.x))} ${String(r(p.y))}`).join(' ');
        const sweep = el(
          'path',
          { d, fill: 'none', stroke: colors.accent, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': `${String(r(total))} ${String(r(total))}`, 'stroke-dashoffset': total },
          h.overlay,
        );
        if (h.climber !== null) h.overlay.appendChild(h.climber);
        await tween(mine, SWEEP_MS, (p) => {
          sweep.setAttribute('stroke-dashoffset', String(r(total * (1 - p))));
        });
      }
    }

    const renderer: SceneRenderer<ChainScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'ready') {
          drawStatic(next);
          return;
        }
        await animate(next, mine);
        if (alive(mine)) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer as unknown as ViewInstance;
  },
};
