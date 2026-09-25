/**
 * aging 무대 — 세로축이 순위다. 줄에서 기다리는 것은 자기 순위의 칸에 서고, 기다린 틱이
 * 눈금을 채우다 ageEvery 칸이 차면 한 칸 **위로 올라간다.** 가로는 줄 선 차례 — 같은 칸에서는
 * 왼쪽이 먼저 섰다. 고름은 가장 높은 칸의 가장 왼쪽을 왼편의 CPU 로 옮긴다.
 *
 * 한 걸음의 운동 (그 걸음에 일어난 것만):
 *   틱이 흐름 → 끝남 → 도착 → 순위가 오름 → 고름
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
import type { AgingScene, AgingSceneEntry } from './scene.js';

const H = 380;
const SVG = 'http://www.w3.org/2000/svg';

/** 단계별 운동 길이 (ms): 틱이 흐름 · 끝남 · 도착 · 오름 · 고름 */
const PHASE_MS = [240, 240, 240, 450, 340] as const;
const FRAME_MS = 16;

type Tok = {
  id: string;
  x: number;
  y: number;
  rank: number;
  notches: number;
  inCpu: boolean;
  opacity: number;
};
type Trail = { id: string; fromRank: number };
type Pose = {
  toks: Tok[];
  left: number | null;
  cpuBurst: number;
  done: string[];
  trails: Trail[];
};

type Geo = {
  pad: number;
  leftW: number;
  cpuX: number;
  cpuY: number;
  cpuH: number;
  tokW: number;
  tokH: number;
  ladderX: number;
  slotX: number;
  slotW: number;
  top: number;
  rungH: number;
  capTop: number;
  doneTop: number;
};

const round = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** 글자 폭 어림 — 넓은 글자(한글 · 한자권)는 한 칸, 나머지는 0.6 칸 */
function estWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? px : px * 0.6;
  return w;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const n = document.createElementNS(SVG, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.appendChild(n);
  return n;
}

function text(
  parent: Element,
  s: string,
  x: number,
  y: number,
  opts: { size: string; fill: string; anchor?: string; weight?: number; family?: string },
): SVGElement {
  const n = el(
    'text',
    {
      x: round(x),
      y: round(y),
      fill: opts.fill,
      'font-size': opts.size,
      'font-family': opts.family ?? fonts.body,
      'text-anchor': opts.anchor ?? 'start',
      'font-weight': opts.weight ?? 400,
    },
    parent,
  );
  n.textContent = s;
  return n;
}

export const agingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const labels: Record<string, () => string> = {
      report: () => t('label.report', 'Month-end report'),
    };
    const nameOf = (id: string): string => {
      const f = labels[id];
      return f === undefined ? id.toUpperCase() : f();
    };

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function geometry(s: AgingScene): Geo {
      const pad = 16;
      const leftW = Math.round(W * 0.25);
      const capTop = H - 62;
      const top = 58;
      const levels = Math.max(1, s.high - s.low + 1);
      const rungH = (capTop - 12 - top) / levels;
      const ladderX = pad + leftW + 18;
      const slotX = ladderX + 34;
      const cols = Math.max(1, s.cols);
      const slotW = (W - pad - slotX) / cols;
      const tokW = Math.min(150, slotW - 10, leftW - 16);
      const tokH = Math.min(56, rungH - 8);
      const cpuY = top;
      const cpuH = 26 + tokH + 22;
      return {
        pad,
        leftW,
        cpuX: pad,
        cpuY,
        cpuH,
        tokW,
        tokH,
        ladderX,
        slotX,
        slotW,
        top,
        rungH,
        capTop,
        doneTop: cpuY + cpuH + 26,
      };
    }

    const rungMid = (s: AgingScene, g: Geo, rank: number): number => g.top + (s.high - rank + 0.5) * g.rungH;
    const slotPos = (s: AgingScene, g: Geo, col: number, rank: number): { x: number; y: number } => ({
      x: g.slotX + col * g.slotW + (g.slotW - g.tokW) / 2,
      y: rungMid(s, g, rank) - g.tokH / 2,
    });
    const cpuPos = (g: Geo): { x: number; y: number } => ({
      x: g.cpuX + (g.leftW - g.tokW) / 2,
      y: g.cpuY + 24,
    });
    const doneY = (g: Geo, i: number, n: number): number => {
      const room = g.capTop - 10 - (g.doneTop + 8);
      const step = Math.min(18, room / Math.max(1, n));
      return g.doneTop + 8 + step * (i + 1) - 4;
    };
    const burstOf = (s: AgingScene, id: string): number => {
      const b = s.bursts.find((x) => x.id === id);
      if (b === undefined) throw new Error(`aging 무대: 모르는 식별자 ${id}`);
      return b.burst;
    };
    const notchOf = (s: AgingScene, waited: number): number => waited % s.ageEvery;
    const fillOf = (s: AgingScene, waited: number): number => {
      const m = waited % s.ageEvery;
      return m === 0 && waited > 0 ? s.ageEvery : m;
    };

    function queueToks(s: AgingScene, g: Geo, q: AgingSceneEntry[], notch: (e: AgingSceneEntry) => number): Tok[] {
      return q.map((e, i) => ({ id: e.id, ...slotPos(s, g, i, e.rank), rank: e.rank, notches: notch(e), inCpu: false, opacity: 1 }));
    }

    /** 걸음의 끝 화면 — 정본 */
    function finalPose(s: AgingScene, g: Geo): Pose {
      const toks = queueToks(s, g, s.queue, (e) => notchOf(s, e.waited));
      if (s.cpu !== null) toks.push({ id: s.cpu.id, ...cpuPos(g), rank: s.cpu.rank, notches: 0, inCpu: true, opacity: 1 });
      const inQueue = new Set(s.queue.map((e) => e.id));
      const trails =
        s.step !== null && s.step.kind === 'tick'
          ? s.step.rose.filter((r) => inQueue.has(r.id)).map((r) => ({ id: r.id, fromRank: r.from }))
          : [];
      return {
        toks,
        left: s.cpu === null ? null : s.cpu.left,
        cpuBurst: s.cpu === null ? 0 : burstOf(s, s.cpu.id),
        done: [...s.done],
        trails,
      };
    }

    /** 걸음 안의 자세들: P0 앞 경계 → 틱이 흐름 → 끝남 → 도착 → 오름 → 고름(= 정본) */
    function poses(s: AgingScene, g: Geo): Pose[] | null {
      const st = s.step;
      if (st === null || st.kind !== 'tick') return null;
      const doneBefore = st.finished === null ? [...s.done] : s.done.slice(0, -1);
      const wc = st.wasCpu;
      const cpuTok = (): Tok[] =>
        wc === null ? [] : [{ id: wc.id, ...cpuPos(g), rank: wc.rank, notches: 0, inCpu: true, opacity: 1 }];
      const p0: Pose = {
        toks: [...queueToks(s, g, st.was, (e) => notchOf(s, e.waited)), ...cpuTok()],
        left: wc === null ? null : wc.left,
        cpuBurst: wc === null ? 0 : burstOf(s, wc.id),
        done: doneBefore,
        trails: [],
      };
      const passed = st.wasTick !== null && s.tick !== null && s.tick > st.wasTick;
      const p1: Pose = passed
        ? {
            ...p0,
            toks: [...queueToks(s, g, st.was, (e) => fillOf(s, e.waited + 1)), ...cpuTok()],
            left: wc === null ? null : wc.left - 1,
          }
        : p0;
      const p2: Pose =
        st.finished === null || wc === null
          ? p1
          : {
              toks: [
                ...p1.toks.filter((x) => !x.inCpu),
                { id: wc.id, x: g.cpuX + 8, y: doneY(g, s.done.length - 1, s.done.length) - g.tokH / 2, rank: wc.rank, notches: 0, inCpu: true, opacity: 0 },
              ],
              left: null,
              cpuBurst: 0,
              done: [...s.done],
              trails: [],
            };
      const wasIds = new Set(st.was.map((e) => e.id));
      const arrivedToks = st.before
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => !wasIds.has(e.id))
        .map(({ e, i }) => ({ id: e.id, ...slotPos(s, g, i, e.rank), rank: e.rank, notches: notchOf(s, e.waited), inCpu: false, opacity: 1 }));
      const p2Live = p2.toks.filter((x) => x.opacity > 0);
      const p3: Pose = arrivedToks.length === 0 ? { ...p2, toks: p2Live } : { ...p2, toks: [...p2Live, ...arrivedToks] };
      const cpuKeep = p3.toks.filter((x) => x.inCpu);
      const p4: Pose = {
        ...p3,
        toks: [...queueToks(s, g, st.before, (e) => notchOf(s, e.waited)), ...cpuKeep],
        trails: st.rose.map((r) => ({ id: r.id, fromRank: r.from })),
      };
      const p5 = finalPose(s, g);
      return [p0, p1, p2, p3, p4, p5];
    }

    function tween(p: number, a: Pose, b: Pose, phase: number): Pose {
      const e = ease(p);
      const byA = new Map(a.toks.map((x) => [x.id, x]));
      const toks: Tok[] = [];
      for (const tb of b.toks) {
        const ta = byA.get(tb.id);
        if (ta === undefined) {
          // 도착 — 오른쪽 바깥에서 들어온다
          toks.push({ ...tb, x: lerp(W + 8, tb.x, e), opacity: e });
          continue;
        }
        toks.push({
          ...tb,
          x: lerp(ta.x, tb.x, e),
          y: lerp(ta.y, tb.y, e),
          opacity: lerp(ta.opacity, tb.opacity, e),
          rank: p < 0.5 ? ta.rank : tb.rank,
          notches: phase === 3 ? (p < 1 ? ta.notches : tb.notches) : p < 0.5 ? ta.notches : tb.notches,
          inCpu: p < 0.5 ? ta.inCpu : tb.inCpu,
        });
      }
      return {
        toks,
        left: p < 0.5 ? a.left : b.left,
        cpuBurst: p < 0.5 ? a.cpuBurst : b.cpuBurst,
        done: p < 0.5 ? a.done : b.done,
        trails: phase === 3 ? (p < 0.5 ? a.trails : b.trails) : b.trails.length > 0 && p >= 0.5 ? b.trails : a.trails,
      };
    }

    function captionLines(s: AgingScene): string[] {
      const st = s.step;
      if (st === null) return [];
      if (st.kind === 'open') return [t('caption.open', 'In the queue: {n} · the CPU is free', { n: st.count })];
      const lines: string[] = [];
      if (st.finished !== null && st.finished.id === s.focus) {
        lines.push(
          t('caption.finish', 'Finished: {name} · started at tick {start} · ticks waited: {wait}', {
            name: nameOf(st.finished.id),
            start: st.finished.start,
            wait: st.finished.waited,
          }),
        );
      }
      for (const r of st.rose) {
        lines.push(
          t('caption.rise', 'Rank up: {name} {from} → {to} · ticks waited: {wait}', {
            name: nameOf(r.id),
            from: r.from,
            to: r.to,
            wait: r.waited,
          }),
        );
      }
      if (st.pick !== null) {
        const other = st.pick.tied[0];
        lines.push(
          other === undefined
            ? t('caption.pick', 'Picked: {name} · rank {rank}', { name: nameOf(st.pick.id), rank: st.pick.rank })
            : t('caption.pickTie', 'Picked: {name} · rank {rank} — same rank as {other}, but joined the queue first', {
                name: nameOf(st.pick.id),
                rank: st.pick.rank,
                other: nameOf(other),
              }),
        );
      }
      if (lines.length === 0) {
        for (const id of st.arrived) {
          const e = st.before.find((x) => x.id === id);
          if (e === undefined) throw new Error(`aging 무대: 도착한 ${id} 가 줄에 없다`);
          lines.push(t('caption.arrive', 'Arrived: {name} · rank {rank}', { name: nameOf(id), rank: e.rank }));
        }
      }
      if (lines.length === 0) {
        lines.push(
          s.cpu === null
            ? t('caption.idle', 'The CPU is idle')
            : t('caption.run', 'Running: {name} · ticks left: {n}', { name: nameOf(s.cpu.id), n: s.cpu.left }),
        );
      }
      return lines;
    }

    function drawToken(root: Element, s: AgingScene, g: Geo, k: Tok): void {
      const focus = k.id === s.focus;
      const fill = focus ? c.accent : c.itemDefault;
      const ink = focus ? c.stateInk : c.text;
      const grp = el('g', { transform: `translate(${round(k.x)} ${round(k.y)})` }, root);
      if (k.opacity < 1) grp.setAttribute('opacity', String(round(k.opacity)));
      el('rect', { x: 0, y: 0, width: round(g.tokW), height: round(g.tokH), rx: 6, fill, stroke: focus ? c.accent : c.border, 'stroke-width': 1.5 }, grp);
      const name = nameOf(k.id);
      const room = g.tokW - 16;
      const base = parseFloat(fontSizes.sm);
      const px = Math.max(8, Math.min(base, (base * room) / Math.max(1, estWidth(name, base))));
      text(grp, name, 8, 17, { size: `${round(px)}px`, fill: ink, weight: 600 });
      text(grp, String(k.rank), g.tokW - 9, g.tokH - 9, { size: fontSizes.xl, fill: ink, anchor: 'end', weight: 700, family: fonts.mono });
      if (!k.inCpu) {
        const nw = 10;
        for (let i = 0; i < s.ageEvery; i += 1) {
          el(
            'rect',
            {
              x: 8 + i * (nw + 3),
              y: round(g.tokH - 15),
              width: nw,
              height: 6,
              rx: 1.5,
              fill: i < k.notches ? ink : 'none',
              stroke: ink,
              'stroke-width': 1,
              'stroke-opacity': 0.6,
            },
            grp,
          );
        }
      }
    }

    function drawPose(s: AgingScene, pose: Pose): void {
      svg.textContent = '';
      const g = geometry(s);
      const root = el('g', {}, svg);

      // 머리: 틱 · 축 이름
      if (s.tick !== null) {
        text(root, t('label.tick', 'Tick {tick}', { tick: s.tick }), g.pad, 30, { size: fontSizes.xl, fill: c.text, weight: 700 });
      }
      text(root, t('label.rank', 'Rank'), g.ladderX + 14, g.top - 12, { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle' });
      text(root, t('label.queue', 'Queue order →'), g.slotX, g.top - 12, { size: fontSizes.xs, fill: c.textMuted });

      // 순위의 칸
      for (let r = s.high; r >= s.low; r -= 1) {
        const y0 = g.top + (s.high - r) * g.rungH;
        if ((s.high - r) % 2 === 0) {
          el('rect', { x: round(g.ladderX), y: round(y0), width: round(W - g.pad - g.ladderX), height: round(g.rungH), fill: c.bgSubtle }, root);
        }
        text(root, String(r), g.ladderX + 14, rungMid(s, g, r) + 5, { size: fontSizes.lg, fill: c.textMuted, anchor: 'middle', family: fonts.mono, weight: 600 });
      }

      // CPU 자리
      el('rect', { x: g.cpuX, y: g.cpuY, width: g.leftW, height: round(g.cpuH), rx: 8, fill: 'none', stroke: c.primary, 'stroke-width': 2 }, root);
      text(root, t('label.cpu', 'CPU'), g.cpuX + 10, g.cpuY + 17, { size: fontSizes.sm, fill: c.text, weight: 700 });
      if (pose.left !== null && pose.cpuBurst > 0) {
        const r = 4;
        const gap = 12;
        const x0 = g.cpuX + g.leftW / 2 - ((pose.cpuBurst - 1) * gap) / 2;
        const y = g.cpuY + 24 + g.tokH + 11;
        for (let i = 0; i < pose.cpuBurst; i += 1) {
          el('circle', { cx: round(x0 + i * gap), cy: round(y), r, fill: i < pose.left ? c.primary : 'none', stroke: c.primary, 'stroke-width': 1 }, root);
        }
      }

      // 끝난 것
      text(root, t('label.done', 'Finished'), g.pad, g.doneTop, { size: fontSizes.xs, fill: c.textMuted });
      pose.done.forEach((id, i) => {
        text(root, nameOf(id), g.pad + 8, doneY(g, i, Math.max(pose.done.length, s.done.length)), {
          size: fontSizes.sm,
          fill: id === s.focus ? c.text : c.textMuted,
          weight: id === s.focus ? 700 : 400,
        });
      });

      // 오른 자취 — 떠나온 칸에서 지금 칸까지
      const byId = new Map(pose.toks.map((k) => [k.id, k]));
      for (const tr of pose.trails) {
        const k = byId.get(tr.id);
        if (k === undefined || k.inCpu) continue;
        const cx = k.x + g.tokW / 2;
        const yFrom = rungMid(s, g, tr.fromRank);
        const yTo = k.y + g.tokH;
        if (yFrom - yTo < 4) continue;
        el('line', { x1: round(cx), y1: round(yFrom), x2: round(cx), y2: round(yTo + 6), stroke: c.risingMarker, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, root);
        el('path', { d: `M ${round(cx - 5)} ${round(yTo + 8)} L ${round(cx)} ${round(yTo + 2)} L ${round(cx + 5)} ${round(yTo + 8)} Z`, fill: c.risingMarker }, root);
      }

      for (const k of pose.toks) drawToken(root, s, g, k);

      // 캡션
      const lines = captionLines(s);
      const lh = Math.min(19, (H - g.capTop - 8) / Math.max(1, lines.length));
      lines.forEach((line, i) => {
        text(root, line, g.pad, g.capTop + 16 + i * lh, { size: fontSizes.md, fill: c.text, weight: i === 0 ? 600 : 400 });
      });
    }

    function sleepFrame(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 자세 비교 — 토큰 차례가 아니라 id 로 맞춰 본다 (차례만 다른 자세를 헛 단계로 보지 않게) */
    function poseKey(p: Pose): string {
      const toks = [...p.toks].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
      return JSON.stringify({ ...p, toks });
    }

    async function play(s: AgingScene, list: Pose[], mine: number): Promise<void> {
      for (let i = 0; i + 1 < list.length; i += 1) {
        const a = list[i];
        const b = list[i + 1];
        if (a === undefined || b === undefined) continue;
        if (poseKey(a) === poseKey(b)) continue;
        const ms = PHASE_MS[i] ?? 300;
        const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
        for (let f = 1; f <= frames; f += 1) {
          if (mine !== gen || destroyed) return;
          drawPose(s, tween(f / frames, a, b, i));
          await sleepFrame(FRAME_MS);
        }
        if (mine !== gen || destroyed) return;
      }
    }

    return {
      async render(next: AgingScene, prev: AgingScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const g = geometry(next);
        const fin = finalPose(next, g);
        if (!opts.animate || prev === null) {
          drawPose(next, fin);
          return;
        }
        const list = poses(next, g);
        if (list === null) {
          drawPose(next, fin);
          return;
        }
        const first = list[0];
        if (first !== undefined) drawPose(next, first);
        await play(next, list, mine);
        if (mine !== gen || destroyed) return;
        drawPose(next, fin);
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
