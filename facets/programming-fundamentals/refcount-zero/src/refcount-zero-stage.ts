/**
 * 참조 계수 stage — 객체에 붙은 수가 오르내리다 0 에서 거둬진다.
 *
 * 가리키는 이름 하나가 객체 안의 알 하나다. 이름이 객체를 잡으면 화살이 뻗고 그 끝의 알이 객체 안으로
 * 들어가 수가 오른다. 놓으면 알이 화살을 타고 제 칸으로 물러나고 화살이 거둬지며 수가 내린다. 남은 알들은
 * 빈자리를 메우며 옮겨 앉는다. 수가 0 이 된 줄 뒤의 치움 걸음에서 객체가 아래로 가라앉으며 사라진다.
 *
 * 화면은 늘 `draw(scene, 진행)` 하나로 세운다. 진행이 null 이면 그 장면의 끝 모습이다.
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
import type { Obj } from './algorithm.js';
import type { RefcountZeroScene } from './scene.js';

const H = 270;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;

const PAD = 16;
const TOP = 52;
const CAPTION_Y = H - 16;
const BODY_BOTTOM = H - 40;

/** 칸 · 객체 자리 — 캔버스 폭에서 역산한다. */
const CODE_X = PAD;
const SLOT_X = Math.round(W * 0.42);
const SLOT_W = Math.round(W * 0.19);
const HEAP_X = Math.round(W * 0.72);
const HEAP_W = W - PAD - HEAP_X;

const SM = parseFloat(fontSizes.sm);

const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
};
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));
const ease = (v: number): number => v * v * (3 - 2 * v);
const lerp = (a: number, b: number, v: number): number => a + (b - a) * v;

type Pt = { x: number; y: number };

function isScene(v: unknown): v is RefcountZeroScene {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as { lines?: unknown }).lines) &&
    Array.isArray((v as { slots?: unknown }).slots)
  );
}

export const refcountZeroStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const root = params.canvas;
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function add(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      body?: string,
    ): SVGElement {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      if (body !== undefined) node.textContent = body;
      parent.appendChild(node);
      return node;
    }

    // ── 자리 셈 ──────────────────────────────────────────────

    function slotPitch(n: number): number {
      return Math.min(54, (BODY_BOTTOM - TOP) / Math.max(1, n));
    }
    function slotTop(i: number, n: number): number {
      return TOP + i * slotPitch(n);
    }
    function slotH(n: number): number {
      return Math.min(36, slotPitch(n) - 10);
    }
    /** 화살이 떠나는 자리 — 칸 오른쪽 안쪽의 점. */
    function slotDot(i: number, n: number): Pt {
      return { x: SLOT_X + SLOT_W - 14, y: slotTop(i, n) + slotH(n) / 2 };
    }

    function boxH(count: number): number {
      return Math.min(150, (BODY_BOTTOM - TOP - 12 * (count - 1)) / Math.max(1, count));
    }
    function boxTop(j: number, count: number): number {
      return TOP + j * (boxH(count) + 12);
    }
    /** 화살이 닿는 자리 — 객체 왼쪽 변, 칸 차례대로 조금씩 어긋나게. */
    function boxEntry(j: number, count: number, slotIndex: number, slots: number): Pt {
      const h = boxH(count);
      const top = boxTop(j, count);
      const band = h * 0.5;
      const y = top + h * 0.25 + (slots <= 1 ? band / 2 : (band * slotIndex) / (slots - 1));
      return { x: HEAP_X, y };
    }
    function pipR(): number {
      return Math.min(12, (HEAP_W - 24) / 8);
    }
    function pipAt(j: number, count: number, k: number): Pt {
      const rr = pipR();
      return { x: HEAP_X + 14 + rr + k * (rr * 2 + 8), y: boxTop(j, count) + boxH(count) * 0.45 };
    }

    // ── 그리기 ───────────────────────────────────────────────

    function drawCode(s: RefcountZeroScene): void {
      const lh = Math.min(26, (BODY_BOTTOM - TOP) / Math.max(1, s.lines.length));
      const current = s.step.k === 'line' ? s.step.line : -1;
      const indentW = SM * 0.6 * 4;
      s.lines.forEach((ln, i) => {
        const y = TOP + i * lh;
        if (i === current) {
          add(root, 'rect', {
            x: CODE_X,
            y,
            width: SLOT_X - 48 - CODE_X,
            height: lh - 4,
            rx: 4,
            fill: colors.bgSubtle,
          });
          add(root, 'rect', { x: CODE_X, y, width: 4, height: lh - 4, rx: 2, fill: colors.itemActive });
        }
        add(
          root,
          'text',
          {
            x: CODE_X + 14 + ln.indent * indentW,
            y: y + (lh - 4) / 2,
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: current < 0 || i === current ? colors.text : colors.textMuted,
          },
          ln.text,
        );
      });
    }

    function drawSlots(s: RefcountZeroScene): void {
      const n = s.slots.length;
      add(
        root,
        'text',
        {
          x: SLOT_X,
          y: TOP - 16,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        tr('label.stack', 'Stack'),
      );
      s.slots.forEach((slot, i) => {
        const y = slotTop(i, n);
        const h = slotH(n);
        add(root, 'rect', {
          x: SLOT_X,
          y,
          width: SLOT_W,
          height: h,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        add(root, 'line', {
          x1: SLOT_X + 30,
          y1: y,
          x2: SLOT_X + 30,
          y2: y + h,
          stroke: colors.border,
        });
        add(
          root,
          'text',
          {
            x: SLOT_X + 15,
            y: y + h / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: colors.text,
          },
          slot.name,
        );
        add(
          root,
          'text',
          {
            x: SLOT_X - 6,
            y: y + h / 2,
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          String(slot.addr),
        );
        const v = s.vals[i];
        if (v && v.k === 'null') {
          add(
            root,
            'text',
            {
              x: SLOT_X + 30 + (SLOT_W - 30) / 2,
              y: y + h / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: colors.textMuted,
            },
            'null',
          );
        } else if (v && v.k === 'num') {
          add(
            root,
            'text',
            {
              x: SLOT_X + 30 + (SLOT_W - 30) / 2,
              y: y + h / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: colors.text,
            },
            String(v.n),
          );
        }
      });
      add(
        root,
        'text',
        {
          x: HEAP_X,
          y: TOP - 16,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        tr('label.heap', 'Heap'),
      );
    }

    /** 화살 — 떠나는 점에서 끝점까지. `reach` 는 끝점까지 뻗은 몫. */
    function drawArrow(from: Pt, to: Pt, reach: number): Pt {
      const tip = { x: lerp(from.x, to.x, reach), y: lerp(from.y, to.y, reach) };
      add(root, 'circle', { cx: from.x, cy: from.y, r: 3.5, fill: colors.textMuted });
      if (reach <= 0) return tip;
      add(root, 'line', {
        x1: from.x,
        y1: from.y,
        x2: tip.x,
        y2: tip.y,
        stroke: colors.textMuted,
        'stroke-width': 1.5,
      });
      if (reach >= 1) {
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const a = 7;
        const p1 = { x: to.x - a * Math.cos(ang - 0.45), y: to.y - a * Math.sin(ang - 0.45) };
        const p2 = { x: to.x - a * Math.cos(ang + 0.45), y: to.y - a * Math.sin(ang + 0.45) };
        add(root, 'polygon', {
          points: `${r1(to.x)},${r1(to.y)} ${r1(p1.x)},${r1(p1.y)} ${r1(p2.x)},${r1(p2.y)}`,
          fill: colors.textMuted,
        });
      }
      return tip;
    }

    function drawPip(at: Pt, holder: string, scale = 1): void {
      const rr = pipR() * scale;
      if (rr <= 0.5) return;
      add(root, 'circle', { cx: at.x, cy: at.y, r: rr, fill: colors.primary });
      add(
        root,
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textInverse,
        },
        holder,
      );
    }

    /** 객체 상자 — 머리의 이름, 알이 앉는 줄, 아래의 수. 알은 따로 그린다. */
    function drawBox(
      o: Obj,
      j: number,
      count: number,
      shown: number,
      look: { dy?: number; scale?: number; opacity?: number } = {},
    ): void {
      const h = boxH(count);
      const top = boxTop(j, count);
      const g = add(root, 'g', {});
      const scale = look.scale ?? 1;
      const dy = look.dy ?? 0;
      if (scale !== 1 || dy !== 0) {
        const cx = HEAP_X + HEAP_W / 2;
        const cy = top + h / 2;
        g.setAttribute(
          'transform',
          `translate(${r1(cx)} ${r1(cy + dy)}) scale(${r1(scale * 100) / 100}) translate(${r1(-cx)} ${r1(-cy)})`,
        );
      }
      if (look.opacity !== undefined) g.setAttribute('opacity', String(r1(look.opacity * 100) / 100));
      const zero = shown === 0;
      add(g, 'rect', {
        x: HEAP_X,
        y: top,
        width: HEAP_W,
        height: h,
        rx: 6,
        fill: colors.bg,
        stroke: zero ? colors.danger : colors.border,
        'stroke-width': zero ? 2 : 1,
      });
      add(
        g,
        'text',
        {
          x: HEAP_X + 12,
          y: top + 16,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        },
        o.name,
      );
      add(
        g,
        'text',
        {
          x: HEAP_X + 12,
          y: top + h - 18,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        tr('label.count', 'count'),
      );
      add(
        g,
        'text',
        {
          x: HEAP_X + HEAP_W - 14,
          y: top + h - 20,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          fill: zero ? colors.danger : colors.text,
        },
        String(shown),
      );
    }

    function caption(s: RefcountZeroScene): string {
      const st = s.step;
      if (st.k === 'start') return tr('caption.start', 'No line has run yet.');
      if (st.k === 'sweep') {
        return tr('caption.sweep', 'Count of {obj}: {n}. Reclaimed: {obj}.', {
          obj: st.obj.name,
          n: st.obj.count,
        });
      }
      const countOf = (name: string): number => s.objects.find((o) => o.name === name)?.count ?? 0;
      if (st.now.k === 'ref') {
        const obj = st.now.obj;
        if (st.created === obj) {
          return tr('caption.create', 'New object {obj}. {name} → {obj}. Count of {obj}: {n}', {
            obj,
            name: st.name,
            n: countOf(obj),
          });
        }
        return tr('caption.grab', '{name} → {obj}. Count of {obj}: {n}', {
          obj,
          name: st.name,
          n: countOf(obj),
        });
      }
      if (st.was && st.was.k === 'ref') {
        return tr('caption.release', '{name} lets go of {obj}. Count of {obj}: {n}', {
          obj: st.was.obj,
          name: st.name,
          n: countOf(st.was.obj),
        });
      }
      return '';
    }

    /**
     * 장면 하나를 통째로 세운다. `p` 가 null 이면 끝 모습, 수이면 이번 걸음의 운동이 그만큼 온 모습.
     */
    function draw(s: RefcountZeroScene, p: number | null): void {
      root.textContent = '';
      add(root, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      drawCode(s);
      drawSlots(s);

      const n = s.slots.length;
      const st = s.step;
      const moving = p !== null;
      const objs = s.objects;
      const count = Math.max(1, objs.length);
      const slotOf = (name: string): number => s.slots.findIndex((x) => x.name === name);

      // 이번 걸음이 무엇을 흘리는가
      const grab =
        moving && st.k === 'line' && st.now.k === 'ref' && !(st.was && st.was.k === 'ref' && st.was.obj === st.now.obj)
          ? { name: st.name, obj: st.now.obj, created: st.created === st.now.obj }
          : null;
      const release =
        moving && st.k === 'line' && st.was && st.was.k === 'ref' && !(st.now.k === 'ref' && st.now.obj === st.was.obj)
          ? { name: st.name, obj: st.was.obj }
          : null;
      const before: Obj[] = st.k === 'line' ? st.before : [];

      // 잡는 운동의 마디 — 만들면 상자가 먼저 선다
      const g0 = grab && grab.created ? 0.3 : 0;
      const g1 = grab && grab.created ? 0.72 : 0.6;
      // 놓는 운동의 마디 — 알이 상자를 떠나는 때
      const r0 = 0.4;

      objs.forEach((o, j) => {
        const pv = p ?? 1;
        let shown = o.count;
        const was = before.find((b) => b.name === o.name);
        if (grab && grab.obj === o.name && pv < 1) shown = was ? was.count : 0;
        if (release && release.obj === o.name && pv < r0) shown = was ? was.count : shown;
        if (grab && grab.obj === o.name && release && release.obj === o.name) shown = o.count;

        const look =
          grab && grab.created && grab.obj === o.name
            ? { scale: lerp(0.4, 1, ease(span(pv, 0, g0))), opacity: span(pv, 0, g0) }
            : {};
        drawBox(o, j, count, shown, look);

        // 알 — 남은 이름들은 놓은 자리를 메우며 옮겨 앉는다
        o.holders.forEach((h, k) => {
          if (grab && grab.obj === o.name && grab.name === h && pv < 1) return;
          let at = pipAt(j, count, k);
          if (release && release.obj === o.name && was) {
            const kb = was.holders.indexOf(h);
            if (kb >= 0 && kb !== k) {
              const from = pipAt(j, count, kb);
              at = { x: lerp(from.x, at.x, ease(span(pv, r0, 1))), y: at.y };
            }
          }
          drawPip(at, h);
        });
      });

      // 화살 — 칸에 든 가리킴마다 하나
      s.slots.forEach((slot, i) => {
        const v = s.vals[i];
        if (!v || v.k !== 'ref') return;
        const j = objs.findIndex((o) => o.name === v.obj);
        if (j < 0) return;
        const from = slotDot(i, n);
        const to = boxEntry(j, count, i, n);
        if (grab && grab.name === slot.name && p !== null) {
          const reach = ease(span(p, g0, g1));
          const tip = drawArrow(from, to, reach);
          if (p < 1) {
            // 알은 화살 끝을 타고 오다가 상자 안 제자리로 들어간다
            const o = objs[j];
            const k = o.holders.indexOf(slot.name);
            const seat = pipAt(j, count, k < 0 ? 0 : k);
            const inward = ease(span(p, g1, 1));
            drawPip({ x: lerp(tip.x, seat.x, inward), y: lerp(tip.y, seat.y, inward) }, slot.name);
          }
          return;
        }
        drawArrow(from, to, 1);
      });

      // 놓는 운동 — 알이 상자를 떠나 화살을 타고 칸으로 물러나고, 화살이 따라 거둬진다
      if (release && p !== null && p < 1) {
        const i = slotOf(release.name);
        const was = before.find((b) => b.name === release.obj);
        const j = objs.findIndex((o) => o.name === release.obj);
        if (i >= 0 && was && j >= 0) {
          const from = slotDot(i, n);
          const to = boxEntry(j, count, i, n);
          const kb = Math.max(0, was.holders.indexOf(release.name));
          const seat = pipAt(j, count, kb);
          if (p < r0) {
            drawArrow(from, to, 1);
            const out = ease(span(p, 0, r0));
            drawPip({ x: lerp(seat.x, to.x, out), y: lerp(seat.y, to.y, out) }, release.name);
          } else {
            const back = ease(span(p, r0, 1));
            const tip = drawArrow(from, to, 1 - back);
            drawPip(tip, release.name, 1 - 0.6 * back);
          }
        }
      }

      // 치움 — 수가 0 이던 객체가 아래로 가라앉으며 사라진다
      if (st.k === 'sweep' && p !== null && p < 1) {
        const v = ease(p);
        const j = objs.length;
        drawBox(st.obj, j, Math.max(1, objs.length + 1), st.obj.count, {
          dy: 70 * v,
          scale: 1 - 0.6 * v,
          opacity: 1 - v,
        });
      }

      const text = caption(s);
      if (text) {
        add(
          root,
          'text',
          {
            x: PAD,
            y: CAPTION_Y,
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: colors.text,
          },
          text,
        );
      }
    }

    // ── 흘리기 ───────────────────────────────────────────────

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function flow(s: RefcountZeroScene, mine: number): Promise<void> {
      const frames = Math.max(1, Math.round(MOTION_MS / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return;
        draw(s, f / frames);
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      draw(s, null);
    }

    return {
      render(next: unknown, prev: unknown, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!isScene(next)) {
          root.textContent = '';
          return;
        }
        draw(next, null);
        if (!opts.animate || !isScene(prev) || next.step.k === 'start') return;
        draw(next, 0);
        return flow(next, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
