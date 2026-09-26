/**
 * 서비스 디스커버리 무대.
 *
 * 위 줄에 인스턴스 넷과 게이트웨이, 그 아래 등록부. 등록부는 인스턴스마다 한 칸을 두고
 * 칸 안에서 **조용함 막대**(지금 − 마지막으로 들은 틱)가 자라다 소식이 닿으면 0 으로
 * 되감긴다. 칸들을 가로지르는 **만료 선**에 막대가 닿으면 그 칸이 명단에서 빠진다.
 *
 * 운동
 *   - 손잡이(init): 만료 선이 새 높이로 옮겨 가고 막대들이 0 으로 내려온다
 *   - 걸음(tick): 하트비트 소식이 인스턴스에서 등록부 칸으로 떨어진다 — 잃은 것은
 *     길 가운데서 사라진다. 막대가 자라거나 되감기고, 선에 닿은 칸은 비워진다.
 *     게이트웨이의 요청 둘이 위쪽 길을 따라 고른 인스턴스로 간다.
 *
 * 무대는 셈하지 않는다 — 조용함 · 명단 · 고른 곳 · 죽은 곳 여부는 모두 payload 로 받는다.
 * 첫 그림은 init 이 짓는다(멱등 — 같은 인스턴스면 요소를 다시 만들지 않고 옮긴다).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type ServiceDiscoveryInitView = {
  expiry: number;
  service: string;
  instances: { id: string; addr: string }[];
  scaleMax: number;
  lastTick: number;
};

export type ServiceDiscoveryTickView = {
  tick: number;
  expiry: number;
  stopped: string | null;
  beats: { instance: string; lost: boolean; rejoined: boolean }[];
  drops: { instance: string; alive: boolean }[];
  picks: { instance: string; dead: boolean }[];
  quiet: number[];
  listed: boolean[];
  alive: boolean[];
};

export type ServiceDiscoveryStage = {
  init(view: ServiceDiscoveryInitView, durationMs: number): void;
  tick(view: ServiceDiscoveryTickView, durationMs: number): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 408;

// 자리
const LANE_Y = 16;
const BOX_TOP = 32;
const BOX_H = 56;
const BOX_W = 104;
const COL_X0 = 110;
const COL_GAP = 120;
const GATE_X = 580;
const GATE_W = 120;
const PANEL_X = 40;
const PANEL_W = 500;
const PANEL_TOP = 132;
const PANEL_BOTTOM = 376;
const SLOT_TOP = 178;
const SLOT_HALF = 40;
const BASE_Y = 342;
const SLOT_BOTTOM = 348;
const BAR_HALF = 18;
const CAPTION_Y = 398;

type Row = {
  id: string;
  cx: number;
  box: SVGRectElement;
  state: SVGTextElement;
  slot: SVGRectElement;
  bar: SVGRectElement;
  quietText: SVGTextElement;
  status: SVGTextElement;
  dot: SVGCircleElement;
  lostMark: SVGTextElement;
  deadMark: SVGTextElement;
  /** 지금 그려진 막대 높이 (틱 단위) — 운동의 기억 */
  shown: number;
};

type Built = {
  root: SVGGElement;
  rows: Row[];
  unit: number;
  expiryLine: SVGLineElement;
  expiryText: SVGTextElement;
  tickText: SVGTextElement;
  caption: SVGTextElement;
  requests: SVGGElement;
  /** 지금 그려진 만료 선 (틱 단위) */
  expiryShown: number;
};

export const serviceDiscoveryStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    let built: Built | null = null;
    let frame: number | null = null;
    let running: ((p: number) => void) | null = null;
    let destroyed = false;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    };

    /** 돌던 운동을 끝 그림으로 세우고 프레임을 끊는다. */
    const settle = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = running;
      running = null;
      if (f) f(1);
    };

    const animate = (durationMs: number, draw: (p: number) => void): void => {
      settle();
      if (destroyed || isInstant() || durationMs <= 0) {
        draw(1);
        return;
      }
      running = draw;
      const start = performance.now();
      const step = (now: number): void => {
        if (running !== draw) return;
        const p = Math.min(1, (now - start) / durationMs);
        draw(p);
        if (p >= 1) {
          running = null;
          frame = null;
          return;
        }
        frame = requestAnimationFrame(step);
      };
      draw(0);
      frame = requestAnimationFrame(step);
    };

    params.onScrubStart?.(() => settle());

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    /** [a, b] 구간 안의 진행률 */
    const span = (p: number, a: number, b: number): number => Math.max(0, Math.min(1, (p - a) / (b - a)));
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    const rowOf = (b: Built, id: string): Row => {
      const row = b.rows.find((r) => r.id === id);
      if (!row) throw new Error(`service-discovery-stage: 인스턴스 ${id} 가 무대에 없다`);
      return row;
    };
    const need = (): Built => {
      if (!built) throw new Error('service-discovery-stage: init 전에 tick 이 왔다');
      return built;
    };

    const setBar = (b: Built, row: Row, height: number, danger: boolean): void => {
      const h = Math.max(0, height) * b.unit;
      row.bar.setAttribute('y', String(BASE_Y - h));
      row.bar.setAttribute('height', String(h));
      row.bar.setAttribute('fill', danger ? c.danger : c.primary);
    };
    const setQuietText = (row: Row, b: Built, value: number | null): void => {
      if (value === null) {
        row.quietText.textContent = '';
        return;
      }
      row.quietText.textContent = String(value);
      row.quietText.setAttribute('y', String(BASE_Y - value * b.unit - 6));
    };
    const setListed = (row: Row, listed: boolean): void => {
      row.slot.setAttribute('stroke', listed ? c.border : c.textMuted);
      row.slot.setAttribute('stroke-dasharray', listed ? 'none' : '4 4');
      row.slot.setAttribute('fill', listed ? c.bgSubtle : 'none');
    };
    const setAlive = (row: Row, alive: boolean): void => {
      row.box.setAttribute('stroke', alive ? c.text : c.danger);
      row.box.setAttribute('stroke-dasharray', alive ? 'none' : '5 4');
      row.state.textContent = alive ? t('label.up', 'up') : t('label.stopped', 'stopped');
      row.state.setAttribute('fill', alive ? c.textMuted : c.danger);
    };
    const expiryY = (b: Built, value: number): number => BASE_Y - value * b.unit;
    const placeExpiry = (b: Built, value: number, label: number): void => {
      const y = expiryY(b, value);
      b.expiryLine.setAttribute('y1', String(y));
      b.expiryLine.setAttribute('y2', String(y));
      b.expiryText.setAttribute('y', String(y + smPx / 3));
      b.expiryText.textContent = t('label.expiryLine', 'expiry line: {n}', { n: label });
      b.expiryShown = value;
    };

    const build = (view: ServiceDiscoveryInitView): Built => {
      const root = el('g', {}, svg);
      const unit = (BASE_Y - SLOT_TOP - 8) / view.scaleMax;

      // 요청 길 (위쪽)
      el('line', { x1: COL_X0 - 40, y1: LANE_Y, x2: GATE_X + GATE_W / 2, y2: LANE_Y, stroke: c.border, 'stroke-width': 1 }, root);

      // 게이트웨이
      el('rect', { x: GATE_X, y: BOX_TOP, width: GATE_W, height: BOX_H, rx: 6, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 }, root);
      el(
        'text',
        { x: GATE_X + GATE_W / 2, y: BOX_TOP + 24, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: c.text },
        root,
        t('label.gateway', 'Gateway'),
      );
      el(
        'text',
        { x: GATE_X + GATE_W / 2, y: BOX_TOP + 42, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        view.service,
      );
      // 게이트웨이가 등록부의 명단을 본다
      const gx = GATE_X + GATE_W / 2;
      el('path', { d: `M ${gx} ${BOX_TOP + BOX_H} L ${gx} ${PANEL_TOP + 18} L ${PANEL_X + PANEL_W} ${PANEL_TOP + 18}`, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3' }, root);
      el(
        'text',
        { x: gx + 6, y: PANEL_TOP + 6, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        t('label.roster', 'roster'),
      );

      // 등록부
      el('rect', { x: PANEL_X, y: PANEL_TOP, width: PANEL_W, height: PANEL_BOTTOM - PANEL_TOP, rx: 8, fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, root);
      el(
        'text',
        { x: PANEL_X + 12, y: PANEL_TOP + 22, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: c.text },
        root,
        `${t('label.registry', 'Registry')} · ${view.service}`,
      );
      el(
        'text',
        { x: PANEL_X + PANEL_W / 2 + 40, y: PANEL_TOP + 22, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
        root,
        t('label.quiet', 'bar = ticks of silence'),
      );
      const tickText = el(
        'text',
        { x: PANEL_X + PANEL_W - 12, y: PANEL_TOP + 22, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text },
        root,
      );

      const rows: Row[] = view.instances.map((inst, i) => {
        const cx = COL_X0 + i * COL_GAP;
        const box = el('rect', { x: cx - BOX_W / 2, y: BOX_TOP, width: BOX_W, height: BOX_H, rx: 6, fill: c.bg, 'stroke-width': 1.5 }, root);
        el(
          'text',
          { x: cx - BOX_W / 2 + 10, y: BOX_TOP + 22, 'font-family': fonts.mono, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.text },
          root,
          inst.id,
        );
        const state = el(
          'text',
          { x: cx + BOX_W / 2 - 8, y: BOX_TOP + 21, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs },
          root,
        );
        el(
          'text',
          { x: cx, y: BOX_TOP + 44, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted },
          root,
          inst.addr,
        );
        const deadMark = el(
          'text',
          { x: cx + BOX_W / 2 - 6, y: BOX_TOP - 2, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 700, fill: c.danger },
          root,
        );
        // 소식 길
        el('line', { x1: cx, y1: BOX_TOP + BOX_H, x2: cx, y2: SLOT_TOP, stroke: c.border, 'stroke-dasharray': '2 4' }, root);
        const lostMark = el(
          'text',
          { x: cx + 10, y: (BOX_TOP + BOX_H + PANEL_TOP) / 2 + 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.danger },
          root,
        );
        const slot = el('rect', { x: cx - SLOT_HALF, y: SLOT_TOP, width: SLOT_HALF * 2, height: SLOT_BOTTOM - SLOT_TOP, rx: 4, 'stroke-width': 1 }, root);
        const bar = el('rect', { x: cx - BAR_HALF, y: BASE_Y, width: BAR_HALF * 2, height: 0, rx: 2 }, root);
        const quietText = el(
          'text',
          { x: cx, y: BASE_Y - 6, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text },
          root,
        );
        const status = el(
          'text',
          { x: cx, y: SLOT_BOTTOM + 18, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm },
          root,
        );
        const dot = el('circle', { cx, cy: BOX_TOP + BOX_H, r: 5, fill: c.primary, opacity: 0 }, root);
        return { id: inst.id, cx, box, state, slot, bar, quietText, status, dot, lostMark, deadMark, shown: 0 };
      });

      const expiryLine = el(
        'line',
        { x1: PANEL_X + 14, x2: PANEL_X + PANEL_W - 14, stroke: c.danger, 'stroke-width': 2, 'stroke-dasharray': '8 4' },
        root,
      );
      const expiryText = el(
        'text',
        { x: PANEL_X + PANEL_W + 8, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.danger },
        root,
      );
      const requests = el('g', {}, root);
      const caption = el(
        'text',
        { x: PANEL_X, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text },
        root,
      );
      const b: Built = { root, rows, unit, expiryLine, expiryText, tickText, caption, requests, expiryShown: view.expiry };
      placeExpiry(b, view.expiry, view.expiry);
      return b;
    };

    const sameInstances = (b: Built, view: ServiceDiscoveryInitView): boolean =>
      b.rows.length === view.instances.length && b.rows.every((r, i) => r.id === view.instances[i]!.id);

    /** 걸음마다의 결론(표지 · 요청 자국 · 잃음 글자)을 걷는다. */
    const clearMarks = (b: Built): void => {
      while (b.requests.firstChild) b.requests.removeChild(b.requests.firstChild);
      for (const r of b.rows) {
        r.lostMark.textContent = '';
        r.deadMark.textContent = '';
        r.dot.setAttribute('opacity', '0');
      }
    };

    const reset = (): void => {
      settle();
      if (built) built.root.remove();
      built = null;
    };

    const init = (view: ServiceDiscoveryInitView, durationMs: number): void => {
      settle();
      if (built && !sameInstances(built, view)) reset();
      if (!built) built = build(view);
      const b = built;
      clearMarks(b);
      for (const r of b.rows) {
        setAlive(r, true);
        setListed(r, true);
        r.status.textContent = '';
        setQuietText(r, b, null);
      }
      b.tickText.textContent = t('label.tick', 'tick {tick}', { tick: 0 });
      b.caption.textContent = t('caption.start', 'Tick 0: {count} instances registered · expiry {n} ticks', {
        count: view.instances.length,
        n: view.expiry,
      });
      b.expiryText.textContent = t('label.expiryLine', 'expiry line: {n}', { n: view.expiry });
      // 운동: 만료 선이 새 자리로 옮겨 가고 막대들이 0 으로 내려온다
      const fromExpiry = b.expiryShown;
      const fromBars = b.rows.map((r) => r.shown);
      animate(durationMs, (p) => {
        const e = ease(p);
        placeExpiry(b, lerp(fromExpiry, view.expiry, e), view.expiry);
        b.rows.forEach((r, i) => {
          r.shown = lerp(fromBars[i]!, 0, e);
          setBar(b, r, r.shown, false);
        });
        if (p >= 1) {
          b.rows.forEach((r) => setQuietText(r, b, 0));
        }
      });
    };

    /** 게이트웨이 → 위쪽 길 → 고른 인스턴스. 같은 틱의 요청 둘은 옆으로 비껴 간다. */
    const requestPoints = (row: Row, k: number): [number, number][] => {
      const off = (k - 0.5) * 12;
      const gx = GATE_X + GATE_W / 2 + off;
      const x = row.cx + off;
      return [
        [gx, BOX_TOP],
        [gx, LANE_Y],
        [x, LANE_Y],
        [x, BOX_TOP],
      ];
    };
    const pointAlong = (pts: [number, number][], p: number): [number, number] => {
      const segs = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i]![0], q[1] - pts[i]![1]));
      let left = segs.reduce((a, x) => a + x, 0) * p;
      for (let i = 0; i < segs.length; i += 1) {
        const len = segs[i]!;
        if (left <= len || i === segs.length - 1) {
          const f = len === 0 ? 1 : Math.min(1, left / len);
          const a = pts[i]!;
          const z = pts[i + 1]!;
          return [lerp(a[0], z[0], f), lerp(a[1], z[1], f)];
        }
        left -= len;
      }
      throw new Error('service-discovery-stage: 요청 길이 비었다');
    };

    const tick = (view: ServiceDiscoveryTickView, durationMs: number): void => {
      settle();
      const b = need();
      if (view.quiet.length !== b.rows.length || view.listed.length !== b.rows.length || view.alive.length !== b.rows.length) {
        throw new Error('service-discovery-stage: 인스턴스 수와 payload 배열 길이가 다르다');
      }
      clearMarks(b);
      b.tickText.textContent = t('label.tick', 'tick {tick}', { tick: view.tick });

      // 멈춤은 걸음 머리에 곧바로
      b.rows.forEach((r, i) => setAlive(r, view.alive[i]!));

      const dropped = new Set(view.drops.map((d) => rowOf(b, d.instance).id));
      const beatOf = new Map(view.beats.map((x) => [rowOf(b, x.instance).id, x]));
      const from = b.rows.map((r) => r.shown);
      const to = b.rows.map((r, i) => (view.listed[i] || dropped.has(r.id) ? view.quiet[i]! : 0));

      // 상태 글자
      b.rows.forEach((r, i) => {
        const beat = beatOf.get(r.id);
        if (dropped.has(r.id)) r.status.textContent = t('label.dropped', 'dropped');
        else if (beat?.rejoined) r.status.textContent = t('label.rejoined', 'back');
        else if (!view.listed[i]) r.status.textContent = t('label.dropped', 'dropped');
        else r.status.textContent = '';
        r.status.setAttribute('fill', dropped.has(r.id) || !view.listed[i] ? c.danger : c.text);
        setQuietText(r, b, null);
      });

      // 요청 자국
      const picks = view.picks.map((pk, k) => {
        const row = rowOf(b, pk.instance);
        const pts = requestPoints(row, k);
        const path = el(
          'polyline',
          { points: pts.map((q) => q.join(',')).join(' '), fill: 'none', stroke: pk.dead ? c.danger : c.accent, 'stroke-width': 2, opacity: 0 },
          b.requests,
        );
        const dot = el('circle', { r: 5, fill: pk.dead ? c.danger : c.accent, opacity: 0 }, b.requests);
        return { pk, row, path, dot, k, pts };
      });

      const DOT_FROM = BOX_TOP + BOX_H;
      const DOT_MID = (DOT_FROM + PANEL_TOP) / 2; // 등록부에 닿기 전, 길 가운데

      animate(durationMs, (p) => {
        // ── 소식: 0 → 0.4
        const pb = span(p, 0, 0.4);
        for (const r of b.rows) {
          const beat = beatOf.get(r.id);
          if (!beat || p >= 1) {
            r.dot.setAttribute('opacity', '0');
            continue;
          }
          if (beat.lost) {
            const q = Math.min(1, pb * 2); // 길 가운데까지 가서
            r.dot.setAttribute('cy', String(lerp(DOT_FROM, DOT_MID, q)));
            r.dot.setAttribute('r', String(pb < 0.5 ? 5 : lerp(5, 0, (pb - 0.5) * 2)));
            r.dot.setAttribute('fill', c.danger);
            r.dot.setAttribute('opacity', pb >= 1 ? '0' : '1');
            if (pb >= 0.5) r.lostMark.textContent = t('label.lost', 'lost');
          } else {
            r.dot.setAttribute('cy', String(lerp(DOT_FROM, SLOT_TOP, pb)));
            r.dot.setAttribute('r', '5');
            r.dot.setAttribute('fill', c.primary);
            r.dot.setAttribute('opacity', pb >= 1 ? '0' : '1');
          }
        }
        if (p >= 1) {
          for (const r of b.rows) {
            const beat = beatOf.get(r.id);
            if (beat?.lost) r.lostMark.textContent = t('label.lost', 'lost');
          }
        }
        // ── 막대: 자라거나 되감긴다 0.2 → 0.55, 선에 닿은 칸은 0.55 → 0.7 에 비워진다
        const pq = ease(span(p, 0.2, 0.55));
        const pd = ease(span(p, 0.6, 0.75));
        b.rows.forEach((r, i) => {
          const isDrop = dropped.has(r.id);
          let h = lerp(from[i]!, to[i]!, pq);
          if (isDrop) h = lerp(to[i]!, 0, pd);
          r.shown = h;
          setBar(b, r, h, isDrop);
          if (isDrop) setListed(r, pd < 1);
          else setListed(r, view.listed[i]!);
        });
        // ── 요청: 0.55 → 1
        for (const q of picks) {
          const a = 0.55 + q.k * 0.08;
          const pr = span(p, a, Math.min(1, a + 0.37));
          q.path.setAttribute('opacity', pr > 0 ? '0.55' : '0');
          if (pr > 0 && pr < 1) {
            const [x, y] = pointAlong(q.pts, pr);
            q.dot.setAttribute('cx', String(x));
            q.dot.setAttribute('cy', String(y));
            q.dot.setAttribute('opacity', '1');
          } else {
            q.dot.setAttribute('opacity', '0');
          }
          if (pr >= 1 && q.pk.dead) q.row.deadMark.textContent = '✗';
        }
        if (p >= 1) {
          b.rows.forEach((r, i) => {
            if (view.listed[i]) setQuietText(r, b, view.quiet[i]!);
          });
        }
      });

      b.caption.textContent = caption(view);
    };

    const caption = (view: ServiceDiscoveryTickView): string => {
      const parts: string[] = [];
      if (view.stopped !== null) parts.push(t('caption.stop', 'stops sending: {id}', { id: view.stopped }));
      const heard = view.beats.filter((x) => !x.lost).map((x) => x.instance);
      const lost = view.beats.filter((x) => x.lost).map((x) => x.instance);
      const back = view.beats.filter((x) => x.rejoined).map((x) => x.instance);
      if (heard.length > 0) parts.push(t('caption.heard', 'heartbeats in: {ids}', { ids: heard.join(' ') }));
      if (lost.length > 0) parts.push(t('caption.lost', 'lost on the way: {ids}', { ids: lost.join(' ') }));
      if (back.length > 0) parts.push(t('caption.back', 'back on the list: {ids}', { ids: back.join(' ') }));
      const liveDrops = view.drops.filter((d) => d.alive).map((d) => d.instance);
      const deadDrops = view.drops.filter((d) => !d.alive).map((d) => d.instance);
      if (liveDrops.length > 0) parts.push(t('caption.dropLive', 'dropped while alive: {ids}', { ids: liveDrops.join(' ') }));
      if (deadDrops.length > 0) parts.push(t('caption.dropDead', 'dropped after stopping: {ids}', { ids: deadDrops.join(' ') }));
      const sent = view.picks.map((pk) => (pk.dead ? `${pk.instance}✗` : pk.instance)).join(' ');
      parts.push(t('caption.requests', 'requests → {ids}', { ids: sent }));
      return parts.join(' · ');
    };

    return {
      init,
      tick,
      reset,
      destroy(): void {
        destroyed = true;
        settle();
        if (built) built.root.remove();
        built = null;
      },
    };
  },
};
