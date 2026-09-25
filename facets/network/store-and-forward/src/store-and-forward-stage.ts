/**
 * store-and-forward 무대.
 *
 * 세 곳(보내는 쪽 · 보내는 서버 · 받는 서버)이 가로 띠 셋이고 가로축이 시각(분)이다.
 * 메일은 지금 맡은 곳의 띠 위에서 시각을 따라 흘러가며 뒤에 "맡은 구간" 막대를 남긴다 — 머문다.
 * 넘길 때는 사본이 다음 띠로 건너가고, 거기서 응답이 돌아온 뒤에야 앞 띠의 메일이 사라진다 — 넘어간다.
 * 받는 서버가 닫혀 있으면 건너가던 사본이 띠 가장자리에서 튕겨 대기열로 돌아온다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Place, StoreAndForwardScene } from './scene.js';

const H = 310;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const LABEL_COL = 172;
const LANES_TOP = 70;
const LANE_GAP = 8;
const LANE_H = 62;
const BAR_H = 12;
const ENV_W = 26;
const ENV_H = 18;
const LIFT = 16;

const SWEEP_MS = 450;
const CROSS_MS = 450;
const REPLY_MS = 320;
const DROP_MS = 220;
const BOUNCE_MS = 300;
const LIFT_MS = 320;

const LANES: readonly Place[] = ['sender', 'relay', 'mx'];

interface Env {
  t: number;
  y: number;
  scale: number;
}

interface Pose {
  now: number;
  envs: Env[];
  reply: { t: number; y: number } | null;
  cutDrop: number;
}

function laneIndex(p: Place): number {
  return LANES.indexOf(p);
}
function laneTop(p: Place): number {
  return LANES_TOP + laneIndex(p) * (LANE_H + LANE_GAP);
}
function laneMid(p: Place): number {
  return laneTop(p) + LANE_H / 2;
}
const LANES_BOTTOM = LANES_TOP + LANES.length * LANE_H + (LANES.length - 1) * LANE_GAP;

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function restingPose(s: StoreAndForwardScene): Pose {
  const lift = s.opened && s.holder === 'mx' ? LIFT : 0;
  return {
    now: s.now,
    envs: [{ t: s.now, y: laneMid(s.holder) - lift, scale: 1 }],
    reply: null,
    cutDrop: 0,
  };
}

export const storeAndForwardStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    const plotX0 = PAD + LABEL_COL + ENV_W / 2 + 8;
    const plotX1 = PIECE_CANVAS_W - PAD - ENV_W / 2;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(SVG_NS, tag) as SVGElement;
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: string; fill?: string; mono?: boolean; weight?: string; anchor?: string } = {},
    ): SVGElement {
      const e = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? fontSizes.sm,
          fill: o.fill ?? c.text,
          'text-anchor': o.anchor ?? 'start',
        },
        parent,
      );
      if (o.weight) e.setAttribute('font-weight', o.weight);
      e.textContent = s;
      return e;
    }

    function drawStatic(s: StoreAndForwardScene, pose: Pose): void {
      svg.textContent = '';
      const b = s.base;
      const span = b.horizon > 0 ? b.horizon : 1;
      const xOf = (m: number): number => plotX0 + (Math.min(Math.max(m, 0), span) / span) * (plotX1 - plotX0);
      const now = pose.now;

      // 캡션 — 이번 걸음에 일어난 일
      let main = '';
      let detail = '';
      const st = s.step;
      switch (st.kind) {
        case 'ready':
          main = t('caption.ready', 'The mail is written and waiting at the sender.');
          break;
        case 'submit':
          main = t('caption.submit', 'Submitted to the sending server — {code}.', { code: b.reply });
          break;
        case 'fail':
          main = t('caption.fail', 'Attempt {n}: connection failed. The mail stays in the queue.', { n: st.n });
          detail = t('detail.next', 'Next attempt: minute {m}', { m: st.next });
          break;
        case 'leave':
          main = t('caption.leave', 'The sender goes offline.');
          break;
        case 'deliver':
          main = t('caption.deliver', 'Attempt {n}: {code}. Only now is the queue copy deleted.', {
            n: st.n,
            code: b.reply,
          });
          detail = t('detail.dwell', 'Time in queue: {m} min', { m: st.dwell });
          break;
        case 'open':
          main = t('caption.open', 'The recipient opens the mailbox.');
          detail = t('detail.open', 'Mails in mailbox: {n} · Sender offline for: {m} min', {
            n: st.mails,
            m: st.offlineFor,
          });
          break;
      }
      label(svg, PAD, 22, main, { size: fontSizes.md, weight: '600' });
      if (detail) label(svg, PAD, 42, detail, { fill: c.textMuted });

      // 띠 셋 — 왼쪽은 역할(문안) · 주소(자료) · 지금 상태
      const senderGone = s.senderLeftAt !== null && s.senderLeftAt <= now;
      const mxClosed = b.mxClosedFrom <= now && now < b.mxClosedUntil;
      for (const p of LANES) {
        const top = laneTop(p);
        const mid = laneMid(p);
        el('rect', { x: PAD, y: top, width: PIECE_CANVAS_W - 2 * PAD, height: LANE_H, rx: 6, fill: c.bgSubtle }, svg);
        const dim = p === 'sender' && senderGone;
        const role =
          p === 'sender'
            ? t('role.sender', 'Sender')
            : p === 'relay'
              ? t('role.relay', 'Sending server')
              : t('role.mx', 'Receiving server');
        const host = p === 'sender' ? b.sender : p === 'relay' ? b.relay : b.mx;
        label(svg, PAD + 10, mid - 8, role, { fill: dim ? c.textMuted : c.text, weight: '600' });
        label(svg, PAD + 10, mid + 8, host, { size: fontSizes.xs, fill: c.textMuted, mono: true });
        if (p === 'sender' && senderGone) {
          label(svg, PAD + 10, mid + 22, t('state.offline', 'Offline'), { size: fontSizes.xs, fill: c.textMuted });
        }
        if (p === 'mx' && mxClosed) {
          label(svg, PAD + 10, mid + 22, t('state.closed', 'Refusing connections'), {
            size: fontSizes.xs,
            fill: c.danger,
          });
        }
      }

      // 받는 서버가 닫혀 있던 구간 (지금까지)
      const closedEnd = Math.min(b.mxClosedUntil, now);
      if (closedEnd > b.mxClosedFrom) {
        el(
          'rect',
          {
            x: r1(xOf(b.mxClosedFrom)),
            y: laneTop('mx') + 3,
            width: r1(xOf(closedEnd) - xOf(b.mxClosedFrom)),
            height: LANE_H - 6,
            fill: c.danger,
            opacity: 0.14,
          },
          svg,
        );
      }

      // 보내는 쪽이 망에 붙어 있던 선, 떠난 자리의 끊김
      const sy = laneMid('sender');
      const onlineEnd = s.senderLeftAt !== null ? Math.min(s.senderLeftAt, now) : now;
      const onlineFrom = s.custody[0].from;
      if (onlineEnd > onlineFrom) {
        el(
          'line',
          {
            x1: r1(xOf(onlineFrom)),
            y1: sy,
            x2: r1(xOf(onlineEnd)),
            y2: sy,
            stroke: c.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          svg,
        );
      }
      if (senderGone && s.senderLeftAt !== null) {
        const cx = xOf(s.senderLeftAt);
        const cy = sy + pose.cutDrop;
        const g = el('g', { stroke: c.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
        el('line', { x1: r1(cx - 5), y1: r1(cy - 5), x2: r1(cx + 5), y2: r1(cy + 5) }, g);
        el('line', { x1: r1(cx - 5), y1: r1(cy + 5), x2: r1(cx + 5), y2: r1(cy - 5) }, g);
      }

      // 맡은 구간 막대 — 지금 시각까지
      for (const cu of s.custody) {
        if (cu.from > now) continue;
        const end = Math.min(cu.to ?? now, now);
        const x0 = xOf(cu.from);
        const x1 = xOf(end);
        const my = laneMid(cu.place);
        if (x1 - x0 > 0.5) {
          el(
            'rect',
            { x: r1(x0), y: r1(my - BAR_H / 2), width: r1(x1 - x0), height: BAR_H, rx: 3, fill: c.primary, opacity: 0.85 },
            svg,
          );
        }
        if (cu.place !== 'sender') {
          const tx = el(
            'text',
            {
              x: r1(x0 + 6),
              y: r1(my - BAR_H / 2 - 12),
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            svg,
          );
          const a = document.createElementNS(SVG_NS, 'tspan');
          a.textContent = cu.place === 'relay' ? t('label.queue', 'Queue') : t('label.mailbox', 'Mailbox');
          tx.appendChild(a);
          if (cu.place === 'mx') {
            const m = document.createElementNS(SVG_NS, 'tspan');
            m.setAttribute('dx', '6');
            m.setAttribute('font-family', fonts.mono);
            m.textContent = b.mailbox;
            tx.appendChild(m);
          }
        }
      }

      // 넘김 · 시도의 자국
      for (const l of s.links) {
        if (l.t > now) continue;
        const x = r1(xOf(l.t));
        const y1 = laneMid(l.from) + BAR_H / 2 + 2;
        if (l.ok) {
          el(
            'line',
            { x1: x, y1, x2: x, y2: laneMid(l.to) - BAR_H / 2 - 2, stroke: c.success, 'stroke-width': 2 },
            svg,
          );
        } else {
          const y2 = laneTop(l.to) - 2;
          el(
            'line',
            { x1: x, y1, x2: x, y2, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' },
            svg,
          );
          const g = el('g', { stroke: c.danger, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
          el('line', { x1: x - 4, y1: y2 + 2, x2: x + 4, y2: y2 + 10 }, g);
          el('line', { x1: x - 4, y1: y2 + 10, x2: x + 4, y2: y2 + 2 }, g);
        }
      }

      // 시간 축과 지금 시각
      const axisY = LANES_BOTTOM + 8;
      el('line', { x1: r1(xOf(0)), y1: axisY, x2: r1(xOf(span)), y2: axisY, stroke: c.border, 'stroke-width': 1 }, svg);
      const tick = span <= 40 ? 5 : 10;
      for (let m = 0; m <= span; m += tick) {
        const x = r1(xOf(m));
        el('line', { x1: x, y1: axisY, x2: x, y2: axisY + 4, stroke: c.border }, svg);
        label(svg, x, axisY + 6 + xsPx, String(m), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
      }
      label(svg, PAD + 10, axisY + 6 + xsPx, t('axis.unit', 'min'), { size: fontSizes.xs, fill: c.textMuted });
      const cx = r1(xOf(now));
      el(
        'line',
        { x1: cx, y1: LANES_TOP - 4, x2: cx, y2: axisY, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3' },
        svg,
      );
      const nowAnchor = cx > plotX1 - 30 ? 'end' : cx < plotX0 + 30 ? 'start' : 'middle';
      label(svg, cx, LANES_TOP - 8, t('axis.now', 'Minute {m}', { m: Math.round(now) }), {
        size: fontSizes.xs,
        fill: c.text,
        anchor: nowAnchor,
        weight: '600',
      });

      // 메일
      for (const e of pose.envs) {
        if (e.scale <= 0.01) continue;
        const ex = xOf(e.t);
        const g = el(
          'g',
          { transform: `translate(${r1(ex)} ${r1(e.y)}) scale(${r1(e.scale * 100) / 100})` },
          svg,
        );
        el(
          'rect',
          { x: -ENV_W / 2, y: -ENV_H / 2, width: ENV_W, height: ENV_H, rx: 2, fill: c.accent, stroke: c.text, 'stroke-width': 1.2 },
          g,
        );
        el(
          'polyline',
          {
            points: `${-ENV_W / 2},${-ENV_H / 2} 0,2 ${ENV_W / 2},${-ENV_H / 2}`,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 1.2,
          },
          g,
        );
      }

      // 돌아오는 응답
      if (pose.reply) {
        const rx = xOf(pose.reply.t) + ENV_W / 2 + 6;
        const w = b.reply.length * smPx * 0.62 + 10;
        const g = el('g', { transform: `translate(${r1(rx)} ${r1(pose.reply.y)})` }, svg);
        el('rect', { x: 0, y: -10, width: r1(w), height: 20, rx: 4, fill: c.bg, stroke: c.success, 'stroke-width': 1.5 }, g);
        label(g, 5, smPx / 2 - 2, b.reply, { mono: true, fill: c.success });
      }
    }

    function wait(ms: number, mine: number): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        }, ms);
        timers.add(id);
      });
    }

    /** ms 동안 k 를 0 → 1 로 흘리며 frame(k) 를 부른다. 도중에 밀려나면 false */
    async function tween(ms: number, mine: number, frame: (k: number) => void): Promise<boolean> {
      const FRAME = 16;
      const steps = Math.max(1, Math.round(ms / FRAME));
      for (let i = 1; i <= steps; i += 1) {
        if (!(await wait(FRAME, mine))) return false;
        frame(ease(i / steps));
      }
      return true;
    }

    async function hand(
      s: StoreAndForwardScene,
      from: Place,
      to: Place,
      mine: number,
    ): Promise<boolean> {
      const tNow = s.now;
      const base: Pose = { now: tNow, envs: [], reply: null, cutDrop: 0 };
      const orig: Env = { t: tNow, y: laneMid(from), scale: 1 };
      // 사본이 다음 곳으로 건너간다 — 앞 곳의 메일은 그대로 있다
      drawStatic(s, { ...base, envs: [orig, { t: tNow, y: laneMid(from), scale: 1 }] });
      if (
        !(await tween(CROSS_MS, mine, (k) =>
          drawStatic(s, { ...base, envs: [orig, { t: tNow, y: mix(laneMid(from), laneMid(to), k), scale: 1 }] }),
        ))
      )
        return false;
      // 받았다는 응답이 앞 곳으로 돌아온다
      const arrived: Env = { t: tNow, y: laneMid(to), scale: 1 };
      if (
        !(await tween(REPLY_MS, mine, (k) =>
          drawStatic(s, { ...base, envs: [orig, arrived], reply: { t: tNow, y: mix(laneMid(to), laneMid(from), k) } }),
        ))
      )
        return false;
      // 그제야 앞 곳의 메일이 지워진다
      return tween(DROP_MS, mine, (k) =>
        drawStatic(s, {
          ...base,
          envs: [{ ...orig, scale: 1 - k }, arrived],
          reply: { t: tNow, y: laneMid(from) },
        }),
      );
    }

    async function play(next: StoreAndForwardScene, mine: number): Promise<void> {
      const st = next.step;
      if (st.kind === 'ready') return;
      const rest = restingPose(next);
      // 시각이 흐른다 — 메일은 맡은 곳의 띠를 따라 흐르며 막대를 늘린다
      if (st.was < next.now) {
        const holderDuring: Place = st.kind === 'submit' || st.kind === 'deliver' ? st.from : next.holder;
        const ok = await tween(SWEEP_MS, mine, (k) => {
          const m = mix(st.was, next.now, k);
          drawStatic(next, {
            now: m,
            envs: [{ t: m, y: laneMid(holderDuring), scale: 1 }],
            reply: null,
            cutDrop: st.kind === 'leave' ? -18 : 0,
          });
        });
        if (!ok) return;
      }
      switch (st.kind) {
        case 'submit':
        case 'deliver':
          await hand(next, st.from, st.to, mine);
          return;
        case 'fail': {
          // 사본이 받는 서버 띠의 가장자리까지 갔다가 튕겨 돌아온다
          const y0 = laneMid(next.holder);
          const yWall = laneTop('mx') - ENV_H / 2 - 3;
          const at = next.now;
          const ok = await tween(BOUNCE_MS, mine, (k) =>
            drawStatic(next, { ...rest, envs: [rest.envs[0], { t: at, y: mix(y0, yWall, k), scale: 1 }] }),
          );
          if (!ok) return;
          await tween(BOUNCE_MS, mine, (k) =>
            drawStatic(next, { ...rest, envs: [rest.envs[0], { t: at, y: mix(yWall, y0, k), scale: 1 }] }),
          );
          return;
        }
        case 'leave':
          // 끊김 표시가 위에서 떨어져 선을 끊는다
          await tween(DROP_MS + 100, mine, (k) => drawStatic(next, { ...rest, cutDrop: mix(-18, 0, k) }));
          return;
        case 'open': {
          const y0 = laneMid(next.holder);
          await tween(LIFT_MS, mine, (k) =>
            drawStatic(next, { ...rest, envs: [{ t: next.now, y: y0 - LIFT * k, scale: 1 }] }),
          );
          return;
        }
      }
    }

    return {
      async render(next: StoreAndForwardScene, prev: StoreAndForwardScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null) {
          drawStatic(next, restingPose(next));
          return;
        }
        await play(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next, restingPose(next));
      },
      destroy() {
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
