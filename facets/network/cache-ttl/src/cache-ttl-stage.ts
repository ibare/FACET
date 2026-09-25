/**
 * cache-ttl 무대 — 들고 있는 답이 시각을 따라 닳는다.
 *
 * 가로는 모형의 시각(초)이다. 세 줄이 같은 시간축을 나눠 쓴다.
 *   권한 서버 — 원본 주소가 지금까지 어떻게 이어져 왔는가 (바뀌면 색이 갈린다)
 *   리졸버    — 들고 있는 답. 넣은 시각부터 만료 시각까지의 막대이고, 지금 선이
 *               지나간 쪽은 옅게, 남은 쪽은 짙게. 지금 선이 나아가면 남은 쪽이 닳는다.
 *               0 에 닿으면 막대가 아래 버림 줄로 떨어진다
 *   질문      — 질문이 온 시각에 준 답의 점. 색이 곧 주소다
 * 주소마다 색이 하나라 원본 줄과 준 답의 색이 다르면 옛 답이 나간 것이다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { CacheTtlHeld, CacheTtlScene } from './scene.js';

const H = 326;
const SVG = 'http://www.w3.org/2000/svg';

/** 지금 선이 옮겨 가는 시간 · 사건 고유의 운동 시간 (ms) */
const CURSOR_MS = 450;
const EVENT_MS = 450;

/** fetch 운동의 마디 — 답이 내려오고, 막대가 자라고, 질문으로 간다 */
const FETCH_DOWN = 0.35;
const FETCH_GROW = 0.65;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (k: number): number => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const r1 = (v: number): number => {
  const n = Math.round(v * 10) / 10;
  return n === 0 ? 0 : n;
};

export const cacheTtlStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const xsPx = parseFloat(fontSizes.xs);
    const monoW = xsPx * 0.62;

    // 세로 자리 — 캔버스 세로에서 나눈다
    const Y = {
      now: 14,
      originLabel: 40,
      strip: 48,
      stripH: 20,
      resolverLabel: 94,
      bar: 102,
      barH: 28,
      lane: 138,
      laneH: 8,
      queryLabel: 168,
      dot: 186,
      tag: 206,
      tag2: 220,
      axis: 248,
      tick: 263,
      cap1: H - 30,
      cap2: H - 10,
    };
    const plotL = Math.round(W * 0.07);
    const plotR = W - plotL;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function node(parent: Element, tag: string, attrs: Record<string, string | number>): SVGElement {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      content: string,
      o: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number },
    ): void {
      const e = node(parent, 'text', {
        x: r1(x),
        y: r1(y),
        'font-family': o.mono === true ? fonts.mono : fonts.body,
        'font-size': o.size ?? fontSizes.xs,
        fill: o.fill ?? c.text,
        'text-anchor': o.anchor ?? 'start',
      });
      if (o.weight !== undefined) e.setAttribute('font-weight', String(o.weight));
      e.textContent = content;
    }

    function draw(s: CacheTtlScene, tau: number, p: number): void {
      svg.textContent = '';
      const palette = categorical(s.addrs.length);
      const colorOf = (addr: string): string => {
        const i = s.addrs.indexOf(addr);
        const col = palette[i];
        if (col === undefined) throw new Error(`cache-ttl stage: 모르는 주소 ${addr}`);
        return col;
      };
      const x = (sec: number): number => plotL + (Math.min(sec, s.horizon) / s.horizon) * (plotR - plotL);
      const moving = s.step !== null && p < 1;
      const kind = s.step?.kind;
      const root = node(svg, 'g', {});

      // ── 시간축
      node(root, 'line', { x1: plotL, y1: Y.axis, x2: plotR, y2: Y.axis, stroke: c.border, 'stroke-width': 1 });
      const tickStep = [5, 10, 20, 30, 60, 120, 300].find((v) => s.horizon / v <= 8) ?? s.horizon;
      for (let sec = 0; sec <= s.horizon; sec += tickStep) {
        node(root, 'line', { x1: r1(x(sec)), y1: Y.axis, x2: r1(x(sec)), y2: Y.axis + 4, stroke: c.border });
        write(root, x(sec), Y.tick, t('label.sec', '{n}s', { n: sec }), { fill: c.textMuted, anchor: 'middle' });
      }

      // ── 권한 서버 줄
      write(root, plotL + 6, Y.originLabel, t('label.origin', 'Origin server'), { fill: c.textMuted });
      write(root, plotR, Y.originLabel, s.record, { anchor: 'end', mono: true, fill: c.textMuted });
      write(root, plotR - s.record.length * monoW - 8, Y.originLabel, s.name, { anchor: 'end', mono: true });
      let current = s.origin[0];
      for (let i = 0; i < s.origin.length; i += 1) {
        const seg = s.origin[i];
        if (seg === undefined || seg.t > tau) continue;
        current = seg;
        const next = s.origin[i + 1];
        const end = next !== undefined && next.t <= tau ? next.t : tau;
        const w = x(end) - x(seg.t);
        if (w <= 0) continue;
        node(root, 'rect', {
          x: r1(x(seg.t)), y: Y.strip, width: r1(w), height: Y.stripH,
          fill: colorOf(seg.addr), 'fill-opacity': 0.35,
        });
        const isLive = next === undefined || next.t > tau;
        if (!isLive && w >= seg.addr.length * monoW + 8) {
          write(root, x(seg.t) + 4, Y.strip + Y.stripH / 2 + xsPx * 0.35, seg.addr, { mono: true });
        }
      }
      if (current !== undefined) {
        const dropIn = kind === 'change' && moving && current === s.origin[s.origin.length - 1] ? (1 - ease(p)) * -16 : 0;
        write(root, x(tau) + 6, Y.strip + Y.stripH / 2 + xsPx * 0.35 + dropIn, current.addr, {
          mono: true, fill: colorOf(current.addr), weight: 600,
        });
      }

      // ── 리졸버 줄
      write(root, plotL + 6, Y.resolverLabel, t('label.resolver', 'Resolver'), { fill: c.textMuted });
      write(root, plotR, Y.resolverLabel, t('label.ttl', 'TTL: {n}s', { n: s.ttl }), { anchor: 'end', fill: c.textMuted });

      const lastDropped = s.dropped[s.dropped.length - 1];
      s.dropped.forEach((d) => {
        if (moving && kind === 'expire' && d === lastDropped) return;
        node(root, 'rect', {
          x: r1(x(d.from)), y: Y.lane, width: r1(x(d.expiry) - x(d.from)), height: Y.laneH,
          fill: 'none', stroke: colorOf(d.addr), 'stroke-dasharray': '4 3', rx: 2,
        });
      });

      const liveBar = (h: CacheTtlHeld, grow: number, label: string | null): void => {
        const col = colorOf(h.addr);
        const cut = Math.max(h.from, Math.min(tau, h.expiry));
        const x0 = x(h.from);
        const xc = x(cut);
        const xe = xc + (x(h.expiry) - xc) * grow;
        if (xc > x0) {
          node(root, 'rect', { x: r1(x0), y: Y.bar, width: r1(xc - x0), height: Y.barH, fill: col, 'fill-opacity': 0.28 });
        }
        if (xe > xc) {
          node(root, 'rect', { x: r1(xc), y: Y.bar, width: r1(xe - xc), height: Y.barH, fill: col });
        }
        if (label !== null && xe - xc >= label.length * monoW + 10) {
          write(root, xe - 5, Y.bar + Y.barH / 2 + xsPx * 0.35, label, { anchor: 'end', fill: c.textInverse, weight: 600 });
        }
        if (grow > 0) {
          write(root, xe + 6, Y.bar + Y.barH / 2 + xsPx * 0.35, h.addr, { mono: true, fill: col, weight: 600 });
        }
      };

      if (s.held !== null) {
        const grow = moving && kind === 'fetch' ? clamp01((p - FETCH_DOWN) / (FETCH_GROW - FETCH_DOWN)) : 1;
        if (grow > 0) {
          const left = moving ? Math.round(s.held.expiry - tau) : s.remaining;
          liveBar(s.held, ease(grow), left === null ? null : t('label.sec', '{n}s', { n: left }));
        }
      }
      if (moving && kind === 'expire' && lastDropped !== undefined) {
        if (p <= 0) {
          liveBar(lastDropped, 1, t('label.sec', '{n}s', { n: Math.round(lastDropped.expiry - tau) }));
        } else {
          const e = ease(p);
          node(root, 'rect', {
            x: r1(x(lastDropped.from)),
            y: r1(Y.bar + (Y.lane - Y.bar) * e),
            width: r1(x(lastDropped.expiry) - x(lastDropped.from)),
            height: r1(Y.barH + (Y.laneH - Y.barH) * e),
            fill: colorOf(lastDropped.addr), 'fill-opacity': 0.28, rx: r1(2 * e),
          });
        }
      }

      // ── 질문 줄
      const answers = moving && (kind === 'fetch' || kind === 'hit') ? s.answers.slice(0, -1) : s.answers;
      write(root, plotL + 6, Y.queryLabel, t('label.queries', 'Queries'), { fill: c.textMuted });
      write(
        root, plotR, Y.queryLabel,
        t('label.tally', 'Hits: {h} · Asked origin: {m} · Outdated: {o}', {
          h: answers.filter((a) => a.kind === 'hit').length,
          m: answers.filter((a) => a.kind === 'fetch').length,
          o: answers.filter((a) => a.stale).length,
        }),
        { anchor: 'end', fill: c.textMuted },
      );
      node(root, 'line', { x1: plotL, y1: Y.dot, x2: plotR, y2: Y.dot, stroke: c.border, 'stroke-dasharray': '2 4' });
      for (const a of answers) {
        const ax = x(a.t);
        if (a.stale) node(root, 'circle', { cx: r1(ax), cy: Y.dot, r: 10, fill: 'none', stroke: c.danger, 'stroke-width': 2 });
        node(root, 'circle', { cx: r1(ax), cy: Y.dot, r: 6, fill: colorOf(a.addr) });
        const tag = a.kind === 'fetch'
          ? t('tag.fetch', 'asked origin')
          : t('tag.hit', 'hit · {n}s', { n: a.remaining });
        write(root, ax, Y.tag, tag, { anchor: 'middle', fill: c.textMuted });
        if (a.stale) write(root, ax, Y.tag2, t('tag.stale', 'outdated'), { anchor: 'middle', fill: c.danger, weight: 600 });
      }

      // ── 답이 오가는 알갱이
      if (moving && p > 0 && s.held !== null && (kind === 'fetch' || kind === 'hit')) {
        const col = colorOf(s.held.addr);
        const bx = x(s.now);
        const barMid = Y.bar + Y.barH / 2;
        let cy: number | null = null;
        if (kind === 'fetch') {
          if (p < FETCH_DOWN) cy = Y.strip + Y.stripH / 2 + (barMid - Y.strip - Y.stripH / 2) * ease(p / FETCH_DOWN);
          else if (p >= FETCH_GROW) cy = barMid + (Y.dot - barMid) * ease((p - FETCH_GROW) / (1 - FETCH_GROW));
        } else {
          cy = barMid + (Y.dot - barMid) * ease(p);
        }
        if (cy !== null) {
          node(root, 'circle', { cx: r1(bx), cy: r1(cy), r: 5, fill: col, stroke: c.bg, 'stroke-width': 1.5 });
        }
      }

      // ── 지금 선
      const nx = r1(x(tau));
      node(root, 'line', { x1: nx, y1: Y.now + 6, x2: nx, y2: Y.dot, stroke: c.text, 'stroke-width': 1.5 });
      node(root, 'line', { x1: nx, y1: Y.axis - 5, x2: nx, y2: Y.axis + 5, stroke: c.text, 'stroke-width': 1.5 });
      write(root, nx, Y.now, t('label.now', 't = {t}s', { t: Math.round(tau) }), { anchor: 'middle', weight: 600 });

      // ── 캡션 — 지금 일어나는 일만
      const [l1, l2] = caption(s);
      write(root, plotL, Y.cap1, l1, { size: fontSizes.sm, weight: 600 });
      write(root, plotL, Y.cap2, l2, { size: fontSizes.sm, fill: c.textMuted });
    }

    function caption(s: CacheTtlScene): [string, string] {
      const step = s.step;
      if (step === null) {
        return [t('caption.start', 'Nothing held yet.'), t('caption.startNote', 'Name: {name} · TTL: {ttl}s', { name: s.name, ttl: s.ttl })];
      }
      if (step.kind === 'fetch' || step.kind === 'hit') {
        const a = s.answers[s.answers.length - 1];
        if (a === undefined) throw new Error('cache-ttl stage: 준 답이 없다');
        if (a.kind === 'fetch') {
          return [
            t('caption.fetch', 'At {t}s: nothing held — ask the origin server.', { t: a.t }),
            t('caption.fetchNote', 'Answer: {addr} · expires at {expiry}s', { addr: a.addr, expiry: a.t + a.remaining }),
          ];
        }
        return [
          t('caption.hit', 'At {t}s: answer from what is held.', { t: a.t }),
          a.stale
            ? t('caption.hitStaleNote', 'Answer: {addr} · TTL left: {left}s · origin now: {origin}', {
                addr: a.addr, left: a.remaining, origin: a.origin,
              })
            : t('caption.hitNote', 'Answer: {addr} · TTL left: {left}s', { addr: a.addr, left: a.remaining }),
        ];
      }
      if (step.kind === 'change') {
        const o = s.origin[s.origin.length - 1];
        if (o === undefined) throw new Error('cache-ttl stage: 원본 주소가 없다');
        return [
          t('caption.change', 'At {t}s: the origin server switches to {addr}.', { t: o.t, addr: o.addr }),
          s.held !== null && s.remaining !== null
            ? t('caption.changeNote', 'Resolver holds: {held} · TTL left: {left}s', { held: s.held.addr, left: s.remaining })
            : t('caption.changeEmptyNote', 'Resolver holds: nothing'),
        ];
      }
      const d = s.dropped[s.dropped.length - 1];
      if (d === undefined) throw new Error('cache-ttl stage: 버린 답이 없다');
      return [
        t('caption.expire', 'At {t}s: TTL left reaches 0.', { t: d.expiry }),
        t('caption.expireNote', 'Dropped: {addr}', { addr: d.addr }),
      ];
    }

    function drawStatic(s: CacheTtlScene): void {
      draw(s, s.now, 1);
    }

    /** 한 시계로 흘린다. 끝나거나 거둬지면 풀린다. */
    function run(mine: number, total: number, frame: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        frame(0);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Math.min(total, now - start);
          frame(ms);
          if (ms >= total) {
            finish();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    return {
      async render(next: CacheTtlScene, prev: CacheTtlScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || prev === null || step === null) {
          drawStatic(next);
          return;
        }
        const move = next.now !== step.from ? CURSOR_MS : 0;
        await run(mine, move + EVENT_MS, (ms) => {
          const tau = move > 0 && ms < move ? step.from + (next.now - step.from) * ease(ms / move) : next.now;
          const p = ms < move ? 0 : clamp01((ms - move) / EVENT_MS);
          draw(next, tau, p);
        });
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
