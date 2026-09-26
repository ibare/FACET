/**
 * send-to-idlest 무대 — 빈자리로 간다.
 *
 * 요청은 왼쪽 도착 차례에서 들어와 로드 밸런서를 지나 서버 줄로 가고, 끝난 연결은 줄의
 * 오른쪽으로 빠져나간다. 틱마다 두 운동이 한 시계에 흐른다 — 끝난 연결이 먼저 빠져나가
 * 줄이 당겨지고(빈자리), 이어서 새 요청이 열린 수가 가장 적은 줄의 끝으로 날아든다.
 * 줄 앞의 동그라미는 지금 열린 연결 수(배정 뒤), 고를 때 본 수는 캡션이 말하고 고른 줄은 강조한다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import type { IdlestConn, IdlestRow, SendToIdlestScene } from './scene';

const H = 290;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 — 빠짐 뒤 도착. 한 시계로 흐른다 */
const LEAVE_MS = 250;
const ARRIVE_MS = 350;

type Pt = { x: number; y: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

export const sendToIdlestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    // 서버 표시 이름 — 리터럴 키 표
    const serverNames: Record<string, string> = {
      s1: t('label.s1', 'Server 1'),
      s2: t('label.s2', 'Server 2'),
      s3: t('label.s3', 'Server 3'),
    };
    const nameOf = (s: string): string => {
      const name = serverNames[s];
      if (name === undefined) throw new Error(`send-to-idlest stage: 표시 이름이 없는 서버 '${s}'`);
      return name;
    };

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    /** 정적 그리기가 매번 새로 짓는 움직일 요소 — 키 → 그룹과 끝 자리 */
    const handles = new Map<string, { g: SVGGElement; at: Pt }>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      s: string,
      o: { size?: string; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number; mono?: boolean },
      parent: Element = svg,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.size ?? fontSizes.sm,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'central',
          fill: o.fill ?? colors.text,
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    // ── 자리 셈 ─────────────────────────────────────────────
    function geometry(scene: SendToIdlestScene, slots: number) {
      const n = scene.servers.length;
      const rowTop = 132;
      const rowBottom = H - 10;
      const pitch = Math.min(52, (rowBottom - rowTop) / n);
      const chipH = Math.min(32, pitch - 12);
      const rowY = (i: number): number => rowTop + pitch * (i + 0.5);
      const nameX = 112;
      const badgeX = 196;
      const chipX0 = 226;
      const chipX1 = 432;
      const gap = 8;
      const chipW = Math.min(92, (chipX1 - chipX0 - gap * (slots - 1)) / slots);
      const slotAt = (i: number, k: number): Pt => ({ x: chipX0 + chipW / 2 + k * (chipW + gap), y: rowY(i) });
      const exitX = 492;
      const ghostW = Math.min(chipW, 70);
      const ghostAt = (i: number, j: number): Pt => ({ x: exitX + j * 12, y: rowY(i) });
      const balancer: Pt = { x: 44, y: (rowY(0) + rowY(n - 1)) / 2 };

      const total = scene.queue.length + scene.tick;
      const qx0 = 112;
      const qGap = 8;
      const qW = Math.min(46, (W - 16 - qx0 - qGap * (total - 1)) / total);
      const queueY = 76;
      const queueAt = (k: number): Pt => ({ x: qx0 + qW / 2 + k * (qW + qGap), y: queueY });
      return { rowY, chipH, chipW, slotAt, ghostW, ghostAt, balancer, qW, queueAt, queueY, nameX, badgeX, exitX };
    }

    type ChipStyle = 'conn' | 'new' | 'ghost' | 'queue';

    function chip(key: string, at: Pt, w: number, h: number, text: string, style: ChipStyle): void {
      const g = el('g', { transform: `translate(${r2(at.x)} ${r2(at.y)})` });
      const fill = style === 'new' ? colors.accent : style === 'ghost' ? 'none' : style === 'queue' ? colors.bg : colors.bgSubtle;
      const stroke = style === 'new' ? colors.accent : style === 'ghost' ? colors.textMuted : colors.border;
      const attrs: Record<string, string | number> = {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: 4,
        fill,
        stroke,
        'stroke-width': 1.2,
      };
      if (style === 'ghost') attrs['stroke-dasharray'] = '4 3';
      el('rect', attrs, g);
      if (text !== '') {
        const ink = style === 'new' ? colors.stateInk : style === 'ghost' ? colors.textMuted : colors.text;
        label(0, 0, text, { size: fontSizes.xs, anchor: 'middle', fill: ink, mono: true }, g);
      }
      handles.set(key, { g, at });
    }

    function place(key: string, p: Pt): void {
      const h = handles.get(key);
      if (h === undefined) throw new Error(`send-to-idlest stage: 움직일 요소 '${key}' 가 없다`);
      h.g.setAttribute('transform', `translate(${r2(p.x)} ${r2(p.y)})`);
    }

    function endAt(key: string): Pt {
      const h = handles.get(key);
      if (h === undefined) throw new Error(`send-to-idlest stage: 움직일 요소 '${key}' 가 없다`);
      return h.at;
    }

    function connText(c: IdlestConn): string {
      return c.request ?? '';
    }

    // ── 정적 그리기 — 그 장면의 화면 전체 ─────────────────────
    function drawStatic(scene: SendToIdlestScene): void {
      svg.textContent = '';
      handles.clear();
      const { rows, slots, got } = scene;
      if (rows === null || slots === null || got === null) return;
      const gm = geometry(scene, slots);
      const step = scene.step;

      // 캡션 — 지금 일어나는 일
      label(W - 16, 22, t('label.tick', 'Tick {tick}', { tick: scene.tick }), {
        size: fontSizes.md,
        anchor: 'end',
        weight: 600,
      });
      if (step === null) {
        const n = rows.reduce((a, r) => a + r.conns.length, 0);
        label(16, 22, t('caption.start', 'Already open: {n}', { n }), { size: fontSizes.md, weight: 600 });
      } else {
        const first = step.left[0];
        const leftLine =
          step.left.length === 0
            ? t('caption.leftNone', 'Nothing finished this tick', {})
            : step.left.length === 1 && first !== undefined
              ? t('caption.leftOne', 'Finished and left: {server}', { server: nameOf(first.server) })
              : t('caption.leftMany', 'Finished and left: {n}', { n: step.left.length });
        label(16, 22, leftLine, { size: fontSizes.md, fill: colors.textMuted });
        const reading = step.readings.find((r) => r.server === step.to);
        if (reading === undefined) throw new Error(`send-to-idlest stage: 고른 서버 '${step.to}' 의 열린 수가 없다`);
        label(
          16,
          44,
          t('caption.pick', 'Fewest open: {n} · {request} → {server}', {
            n: reading.open,
            request: step.request,
            server: nameOf(step.to),
          }),
          { size: fontSizes.md, weight: 600 },
        );
      }

      // 도착 차례
      label(16, gm.queueY, t('label.queue', 'Arriving'), { size: fontSizes.xs, fill: colors.textMuted });
      scene.queue.forEach((id, k) => chip(`queue:${id}`, gm.queueAt(k), gm.qW, 24, id, 'queue'));

      // 머리줄
      const headY = 114;
      label(16, headY, t('label.balancer', 'Load balancer'), { size: fontSizes.xs, fill: colors.textMuted });
      label(gm.badgeX, headY, t('label.open', 'Open'), { size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted });
      label(gm.exitX, headY, t('label.left', 'Left'), { size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted });
      label(W - 16, headY, t('label.got', 'Received'), { size: fontSizes.xs, anchor: 'end', fill: colors.textMuted });

      // 로드 밸런서와 줄로 가는 길
      const br = 15;
      rows.forEach((row, i) => {
        const chosen = step !== null && step.to === row.server;
        el('line', {
          x1: gm.balancer.x + br,
          y1: gm.balancer.y,
          x2: gm.nameX - 8,
          y2: gm.rowY(i),
          stroke: chosen ? colors.accent : colors.border,
          'stroke-width': chosen ? 2.5 : 1,
        });
      });
      el('circle', { cx: gm.balancer.x, cy: gm.balancer.y, r: br, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 });

      // 서버 줄
      rows.forEach((row, i) => {
        const y = gm.rowY(i);
        const chosen = step !== null && step.to === row.server;
        label(gm.nameX, y, nameOf(row.server), { size: fontSizes.sm, weight: chosen ? 600 : 400 });

        // 동그라미는 화면에 놓인 연결 수(배정 뒤). 고를 때 본 값은 캡션만 말한다
        const open = row.conns.length;
        el('circle', {
          cx: gm.badgeX,
          cy: y,
          r: smPx + 1,
          fill: chosen ? colors.accent : colors.bg,
          stroke: chosen ? colors.accent : colors.border,
          'stroke-width': 1.2,
        });
        label(gm.badgeX, y, String(open), {
          size: fontSizes.sm,
          anchor: 'middle',
          weight: 600,
          fill: chosen ? colors.stateInk : colors.text,
        });

        // 빠져나간 연결 — 이번 걸음의 것만, 줄 오른쪽 바깥에
        if (step !== null) {
          step.left
            .filter((l) => l.server === row.server)
            .forEach((l, j) => chip(`ghost:${l.conn.id}`, gm.ghostAt(i, j), gm.ghostW, gm.chipH, connText(l.conn), 'ghost'));
        }

        row.conns.forEach((c, k) => {
          const isNew = step !== null && step.request === c.id;
          chip(`conn:${c.id}`, gm.slotAt(i, k), gm.chipW, gm.chipH, connText(c), isNew ? 'new' : 'conn');
        });

        const g = got.find((x) => x.server === row.server);
        if (g === undefined) throw new Error(`send-to-idlest stage: '${row.server}' 의 받은 수가 없다`);
        label(W - 16, y, String(g.n), { size: fontSizes.md, anchor: 'end', weight: chosen ? 600 : 400 });
      });
    }

    // ── 운동 ────────────────────────────────────────────────
    function clock(total: number, mine: number, frame: (ms: number) => void): Promise<void> {
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
        frame(0);
        const tickFn = (): void => {
          timers.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Date.now() - start;
          frame(Math.min(ms, total));
          if (ms >= total) {
            finish();
            return;
          }
          id = setTimeout(tickFn, 16);
          timers.add(id);
        };
        let id = setTimeout(tickFn, 16);
        timers.add(id);
      });
    }

    async function animateStep(next: SendToIdlestScene, mine: number): Promise<void> {
      const step = next.step;
      const rows = next.rows;
      const slots = next.slots;
      if (step === null || rows === null || slots === null) {
        throw new Error('send-to-idlest stage: 운동할 걸음이 없다');
      }
      const gm = geometry(next, slots);
      const rowIndex = (s: string): number => {
        const i = next.servers.indexOf(s);
        if (i < 0) throw new Error(`send-to-idlest stage: 서버 목록에 없는 '${s}'`);
        return i;
      };
      const beforeRow = (s: string): IdlestRow =>
        step.before.find((r) => r.server === s) ??
        (() => {
          throw new Error(`send-to-idlest stage: 앞 줄에 없는 서버 '${s}'`);
        })();
      const beforeSlot = (s: string, id: string): Pt => {
        const k = beforeRow(s).conns.findIndex((c) => c.id === id);
        if (k < 0) throw new Error(`send-to-idlest stage: '${s}' 앞 줄에 없는 연결 '${id}'`);
        return gm.slotAt(rowIndex(s), k);
      };

      // 빠짐 — 끝난 연결이 줄 밖으로, 남은 것은 당겨진다
      const leaving = step.left.map((l) => ({ key: `ghost:${l.conn.id}`, from: beforeSlot(l.server, l.conn.id) }));
      const shifting: { key: string; from: Pt }[] = [];
      for (const row of rows) {
        for (const c of row.conns) {
          if (c.id === step.request) continue;
          shifting.push({ key: `conn:${c.id}`, from: beforeSlot(row.server, c.id) });
        }
      }
      // 도착 — 차례 맨 앞에서 로드 밸런서를 지나 고른 줄의 끝으로
      const arriveKey = `conn:${step.request}`;
      const arriveFrom = gm.queueAt(0);
      const arriveTo = endAt(arriveKey);
      const queued = next.queue.map((id, k) => ({ key: `queue:${id}`, from: gm.queueAt(k + 1) }));

      const leaveMs = leaving.length > 0 ? LEAVE_MS : 0;
      const total = leaveMs + ARRIVE_MS;
      await clock(total, mine, (ms) => {
        if (destroyed || mine !== gen) return;
        const pa = leaveMs === 0 ? 1 : ease(ms / leaveMs);
        const pb = ease((ms - leaveMs) / ARRIVE_MS);
        for (const m of leaving) place(m.key, lerp(m.from, endAt(m.key), pa));
        for (const m of shifting) place(m.key, lerp(m.from, endAt(m.key), pa));
        for (const m of queued) place(m.key, lerp(m.from, endAt(m.key), pb));
        // 두 토막 길 — 앞 4 할은 로드 밸런서까지, 나머지는 줄까지
        const via = gm.balancer;
        const p =
          pb < 0.4 ? lerp(arriveFrom, via, pb / 0.4) : lerp(via, arriveTo, (pb - 0.4) / 0.6);
        place(arriveKey, p);
      });
    }

    return {
      async render(next: SendToIdlestScene, prev: SendToIdlestScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || destroyed) return;
        // 앞 틱에서 한 틱 나아간 걸음만 흘린다 — prev 는 고르는 데만 쓴다
        if (next.step === null || prev === null || prev.tick !== next.step.tick - 1) return;
        await animateStep(next, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
