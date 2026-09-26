/**
 * isolate-the-flood 무대 — 칸으로 나뉜 스레드 풀.
 *
 * 동사는 "찬다 / 옆은 돈다". 멎은 서비스로 가는 호출이 왼쪽 입구에서 제 칸의 스레드 자리로
 * 들어가 **붙어 남고**(선이 멎은 서비스로 이어진 채), 칸이 차면 뒤이어 오는 호출은 칸 문턱까지
 * 왔다가 그 아래 "자리 없음" 줄로 떨어진다. 벽 건너 옆 칸에서는 호출이 자리에 들어갔다가
 * 다음 틱에 "돌아옴" 줄로 빠져나가고, 그 빈자리에 다음 호출이 들어간다 — 같은 자리가 계속 돈다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { IsolateTheFloodScene } from './scene';

const H = 356;
const NS = 'http://www.w3.org/2000/svg';

const TICK_Y = 18;
const CAPTION_Y = 42;
const POOL_TITLE_Y = 62;
const TOP = 76;
const BOTTOM = H - 8;
const WALL_GAP = 20;
const LEFT = 8;
const CHIP_W = 24;
const CHIP_H = 18;
const SLOT_GAP = 6;

const RETURN_MS = 300;
const ARRIVE_MS = 380;
const STAGGER_MS = 110;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: Pt, b: Pt, u: number): Pt {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export const isolateTheFloodStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    /** 지금 화면의 호출 칩 · 붙든 선. drawStatic 이 매번 새로 짓는다 */
    let chips = new Map<string, SVGGElement>();
    let links = new Map<string, SVGLineElement>();

    // ── 자리 (캔버스 폭에서 역산) ──────────────────────────────────────────
    const poolX = Math.round(W * 0.36);
    const servW = Math.min(132, Math.round(W * 0.21));
    const servX = W - LEFT - servW;
    const poolR = servX - 46;
    const slotX = poolX + 12;
    const slotW = poolR - 12 - slotX;

    function laneH(n: number): number {
      return Math.min(130, (BOTTOM - TOP - (n - 1) * WALL_GAP) / n);
    }
    function laneTop(i: number, n: number): number {
      return TOP + i * (laneH(n) + WALL_GAP);
    }
    function slotH(size: number, n: number): number {
      return Math.min(26, (laneH(n) - 30 - (size - 1) * SLOT_GAP) / size);
    }
    function slotY(i: number, j: number, size: number, n: number): number {
      return laneTop(i, n) + 24 + j * (slotH(size, n) + SLOT_GAP);
    }
    function inSlot(i: number, j: number, size: number, n: number): Pt {
      return { x: slotX + 6, y: slotY(i, j, size, n) + (slotH(size, n) - CHIP_H) / 2 };
    }
    function entry(i: number, size: number, n: number): Pt {
      return { x: LEFT, y: inSlot(i, 0, size, n).y };
    }
    function door(i: number, size: number, n: number): Pt {
      return { x: poolX - CHIP_W - 4, y: entry(i, size, n).y };
    }
    /** row 0 = 자리 없음 줄, row 1 = 돌아옴 줄 */
    function tray(i: number, n: number, row: 0 | 1, k: number, count: number): Pt {
      const span = poolX - 12 - LEFT - CHIP_W;
      const stepX = count <= 1 ? 0 : Math.min(CHIP_W + 3, span / (count - 1));
      return { x: LEFT + k * stepX, y: laneTop(i, n) + (row === 0 ? 64 : 106) };
    }
    function trayLabelY(i: number, n: number, row: 0 | 1): number {
      return laneTop(i, n) + (row === 0 ? 58 : 100);
    }

    // ── 그리기 도구 ─────────────────────────────────────────────────────
    function put<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }
    function words(parent: Element, x: number, y: number, body: string, o: {
      size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean;
    } = {}): SVGTextElement {
      const node = put('text', {
        x, y,
        'font-family': o.mono ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.sm,
        fill: o.fill ?? colors.text,
        'text-anchor': o.anchor ?? 'start',
      }, parent);
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.textContent = body;
      return node;
    }

    type ChipLook = 'stuck' | 'busy' | 'away' | 'back';
    function chip(parent: Element, at: Pt, call: string, look: ChipLook): SVGGElement {
      const g = put('g', {}, parent);
      const fill = look === 'stuck' ? colors.itemComparing
        : look === 'busy' ? colors.primary
        : look === 'back' ? colors.accent
        : colors.bg;
      const ink = look === 'stuck' || look === 'back' ? colors.stateInk
        : look === 'busy' ? colors.textInverse
        : colors.danger;
      const box = put('rect', { x: at.x, y: at.y, width: CHIP_W, height: CHIP_H, rx: 4, fill }, g);
      if (look === 'away') {
        box.setAttribute('stroke', colors.danger);
        box.setAttribute('stroke-width', '1.2');
        box.setAttribute('stroke-dasharray', '3 2');
      }
      words(g, at.x + CHIP_W / 2, at.y + CHIP_H / 2 + parseFloat(fontSizes.xs) * 0.35, call, {
        size: fontSizes.xs, fill: ink, anchor: 'middle', mono: true,
      });
      chips.set(call, g);
      return g;
    }

    function svcName(id: string): string {
      switch (id) {
        case 'a':
          return t('label.svc.a', 'Reviews');
        case 'b':
          return t('label.svc.b', 'Checkout');
        default:
          throw new Error(`isolate-the-flood-stage: 서비스 ${id} 의 표시 이름이 없다`);
      }
    }

    function caption(scene: IsolateTheFloodScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Threads are split into one bay per service.');
      const a = svcName(step.say.stalled);
      const b = svcName(step.say.other);
      switch (step.say.kind) {
        case 'fill':
          return t('caption.fill', '{a} never answers: each call to it keeps its thread.', { a });
        case 'full':
          return t('caption.full', 'The {a} bay is full: the next call to {a} bounces off.', { a });
        case 'reject':
          return t('caption.reject', 'No free thread for {a} calls. {b} calls still find one.', { a, b });
        case 'flow':
          return t('caption.flow', '{b} keeps turning: one call returns, the next takes its thread.', { b });
        case 'last':
          return t('caption.last', 'The last {b} call returns. The {a} bay is still full.', { a, b });
      }
    }

    // ── 정적 그리기 — 장면 하나의 화면 전체 ─────────────────────────────────
    function drawStatic(scene: IsolateTheFloodScene): void {
      svg.textContent = '';
      chips = new Map();
      links = new Map();
      const n = scene.bays.length;

      if (scene.tick !== null) {
        words(svg, LEFT, TICK_Y, t('label.tick', 'Tick {tick}', { tick: scene.tick }), {
          fill: colors.textMuted, mono: true,
        });
      }
      words(svg, LEFT, CAPTION_Y, caption(scene), { size: fontSizes.md, weight: '600' });

      const total = scene.bays.reduce((s, b) => s + b.size, 0);
      words(svg, (poolX + poolR) / 2, POOL_TITLE_Y, t('label.pool', 'Thread pool: {n}', { n: total }), {
        fill: colors.textMuted, anchor: 'middle',
      });
      const lastBottom = laneTop(n - 1, n) + laneH(n);
      put('rect', {
        x: poolX, y: TOP - 6, width: poolR - poolX, height: lastBottom + 6 - (TOP - 6), rx: 8,
        fill: 'none', stroke: colors.border, 'stroke-width': 1,
      }, svg);

      const lineLayer = put('g', {}, svg);
      const chipLayer = put('g', {}, svg);

      scene.bays.forEach((bay, i) => {
        const top = laneTop(i, n);
        const lh = laneH(n);
        const sh = slotH(bay.size, n);
        const row = scene.hold[i];
        const away = scene.away[i];
        const back = scene.back[i];
        if (!row || !away || !back) throw new Error(`isolate-the-flood-stage: 칸 ${bay.id} 의 자취가 없다`);
        const used = row.filter((c) => c !== null).length;
        const full = used === bay.size;
        const name = svcName(bay.id);

        // 칸막이 벽 — 칸 사이
        if (i > 0) {
          const y = top - WALL_GAP / 2;
          put('line', {
            x1: poolX - 4, y1: y, x2: poolR + 4, y2: y,
            stroke: colors.text, 'stroke-width': 4,
          }, svg);
        }

        // 칸
        put('rect', {
          x: poolX + 6, y: top, width: poolR - poolX - 12, height: lh, rx: 6,
          fill: 'none', stroke: full ? colors.danger : colors.border, 'stroke-width': full ? 2 : 1.2,
        }, svg);
        words(svg, poolX + 14, top + 16, t('label.bay', 'Bay for {svc}', { svc: name }), { fill: colors.textMuted });
        words(svg, poolR - 14, top + 16, t('label.use', '{used} / {size}', { used, size: bay.size }), {
          fill: full ? colors.danger : colors.textMuted, anchor: 'end', mono: true, weight: full ? '700' : '400',
        });

        // 서비스
        const sy = slotY(i, 0, bay.size, n);
        const sHeight = bay.size * sh + (bay.size - 1) * SLOT_GAP;
        const svcMid = sy + sHeight / 2;
        const svcBox = put('rect', {
          x: servX, y: sy, width: servW, height: sHeight, rx: 6,
          fill: colors.bg, stroke: bay.stalled ? colors.danger : colors.text, 'stroke-width': 1.5,
        }, svg);
        if (bay.stalled) svcBox.setAttribute('stroke-dasharray', '5 3');
        words(svg, servX + servW / 2, svcMid - 4, name, { size: fontSizes.md, weight: '600', anchor: 'middle' });
        words(svg, servX + servW / 2, svcMid + smPx + 2,
          bay.stalled ? t('label.stalled', 'Stalled') : t('label.up', 'Up'),
          { fill: bay.stalled ? colors.danger : colors.textMuted, anchor: 'middle' });

        // 스레드 자리 · 붙든 호출 · 서비스로 이어진 선
        row.forEach((call, j) => {
          const y = slotY(i, j, bay.size, n);
          put('rect', {
            x: slotX, y, width: slotW, height: sh, rx: 4,
            fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1,
          }, svg);
          if (call === null) return;
          const link = put('line', {
            x1: slotX + slotW, y1: y + sh / 2, x2: servX, y2: svcMid,
            stroke: bay.stalled ? colors.itemComparing : colors.primary,
            'stroke-width': bay.stalled ? 2 : 1.5,
          }, lineLayer);
          links.set(call, link);
          chip(chipLayer, inSlot(i, j, bay.size, n), call, bay.stalled ? 'stuck' : 'busy');
        });

        // 호출하는 쪽 — 머리 · 자리 없음 줄 · 돌아옴 줄
        words(svg, LEFT, top + 14, t('label.callsTo', 'Calls to {svc}', { svc: name }), { fill: colors.textMuted });
        words(svg, LEFT, trayLabelY(i, n, 0), t('label.away', 'No free thread: {n}', { n: away.length }), {
          fill: away.length > 0 ? colors.danger : colors.textMuted,
        });
        away.forEach((call, k) => chip(chipLayer, tray(i, n, 0, k, away.length), call, 'away'));
        words(svg, LEFT, trayLabelY(i, n, 1), t('label.back', 'Returned: {n}', { n: back.length }), {
          fill: colors.textMuted,
        });
        back.forEach((call, k) => chip(chipLayer, tray(i, n, 1, k, back.length), call, 'back'));
      });

      // 선과 칩은 칸 · 자리 위에 얹는다
      svg.appendChild(lineLayer);
      svg.appendChild(chipLayer);
    }

    // ── 운동 ──────────────────────────────────────────────────────────
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const beat = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            beat();
          }, 16);
          timers.add(id);
        };
        beat();
      });
    }

    function place(g: SVGGElement, from: Pt, to: Pt, u: number): void {
      const at = lerp(from, to, u);
      g.setAttribute('transform', `translate(${r2(at.x - to.x)} ${r2(at.y - to.y)})`);
    }

    function handle(call: string): SVGGElement {
      const g = chips.get(call);
      if (!g) throw new Error(`isolate-the-flood-stage: 호출 ${call} 의 칩이 화면에 없다`);
      return g;
    }

    async function move(next: IsolateTheFloodScene, mine: number): Promise<void> {
      const step = next.step;
      if (step === null) return;
      const n = next.bays.length;
      const bayAt = (id: string): number => {
        const i = next.bays.findIndex((b) => b.id === id);
        if (i === -1) throw new Error(`isolate-the-flood-stage: 칸 ${id} 가 장면에 없다`);
        return i;
      };
      const sizeOf = (i: number): number => (next.bays[i] as { size: number }).size;

      // 돌아오는 호출: 스레드 자리 → 돌아옴 줄
      const leaving = step.returned.map((r) => {
        const i = bayAt(r.bay);
        const back = next.back[i] as string[];
        const k = back.indexOf(r.call);
        if (k === -1) throw new Error(`isolate-the-flood-stage: ${r.call} 가 돌아옴 줄에 없다`);
        return { g: handle(r.call), from: inSlot(i, r.slot, sizeOf(i), n), to: tray(i, n, 1, k, back.length) };
      });

      // 도착하는 호출: 입구 → 스레드 자리, 또는 입구 → 칸 문턱 → 자리 없음 줄
      const coming = step.arrivals.map((a) => {
        const i = bayAt(a.bay);
        const size = sizeOf(i);
        const g = handle(a.call);
        if (a.outcome === 'held') {
          if (a.slot === null) throw new Error(`isolate-the-flood-stage: ${a.call} 의 자리가 없다`);
          const link = links.get(a.call);
          if (!link) throw new Error(`isolate-the-flood-stage: ${a.call} 의 선이 화면에 없다`);
          return { g, link, from: entry(i, size, n), stop: null, to: inSlot(i, a.slot, size, n) };
        }
        const away = next.away[i] as string[];
        const k = away.indexOf(a.call);
        if (k === -1) throw new Error(`isolate-the-flood-stage: ${a.call} 가 자리 없음 줄에 없다`);
        return { g, link: null, from: entry(i, size, n), stop: door(i, size, n), to: tray(i, n, 0, k, away.length) };
      });

      for (const c of coming) {
        c.g.setAttribute('visibility', 'hidden');
        c.link?.setAttribute('visibility', 'hidden');
      }
      for (const l of leaving) place(l.g, l.from, l.to, 0);

      if (leaving.length > 0) {
        await tween(RETURN_MS, mine, (p) => {
          const u = ease(p);
          for (const l of leaving) place(l.g, l.from, l.to, u);
        });
        if (mine !== gen || destroyed) return;
      }

      if (coming.length > 0) {
        const total = (coming.length - 1) * STAGGER_MS + ARRIVE_MS;
        await tween(total, mine, (p) => {
          const ms = p * total;
          coming.forEach((c, idx) => {
            const local = Math.max(0, Math.min(1, (ms - idx * STAGGER_MS) / ARRIVE_MS));
            if (local <= 0) return;
            c.g.removeAttribute('visibility');
            if (c.stop === null) {
              place(c.g, c.from, c.to, ease(local));
              if (local >= 1) c.link?.removeAttribute('visibility');
            } else if (local < 0.55) {
              const at = lerp(c.from, c.stop, ease(local / 0.55));
              place(c.g, at, c.to, 0);
            } else {
              place(c.g, c.stop, c.to, ease((local - 0.55) / 0.45));
            }
          });
        });
      }
    }

    return {
      async render(next: IsolateTheFloodScene, _prev: IsolateTheFloodScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await move(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
  },
};
