/**
 * 복제 지연의 무대 — 가로는 시각(ms), 세로는 노드의 줄.
 *
 * 리더 줄을 가운데 두고 팔로워를 위아래로 갈라, 리더에서 출발한 새 값이 팔로워마다
 * 다른 기울기로 내려앉게 한다 (늦게 닿는 값일수록 완만하다). 시각은 세로 막대가
 * 오른쪽으로 흐르며 나르고, 막대 위 표가 그 순간 각 노드가 가진 값이다.
 * 맨 아래 줄은 클라이언트 — 쓰기의 ok 와 읽기의 답이 그리로 내려온다.
 *
 * 걸음의 운동
 *   흐름  앞 시각 → 이번 시각으로 막대가 나아간다 (날아가는 값도 함께 나아간다)
 *   오감  쓰기 · 읽기는 클라이언트에서 노드로 올라갔다가 답을 들고 내려온다
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
import type { LagRead, ReplicationLagScene } from './scene.js';

const H = 380;
const NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const LEFT_MAX = 120;
const RIGHT_PAD = 34;
const CAP_Y = 26;
const SUB_Y = 48;
const AXIS_Y = 92;
const LANE_TOP = 138;
const LANE_BOTTOM = 282;
const CLIENT_Y = 336;
const TAG_H = 20;
const CHIP_R = 9;

const FLOW_MS = 700;
const HIT_MS = 600;

type Cur = { phase: 'flow' | 'hit'; p: number } | null;

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

/** 눈금 간격 — 축에 여덟 칸 이하가 되도록 */
function tickStep(endMs: number): number {
  for (const s of [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) {
    if (endMs / s <= 8) return s;
  }
  return Math.ceil(endMs / 8);
}

export const replicationLagStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const monoPx = parseFloat(fontSizes.sm);

    const leftW = Math.min(LEFT_MAX, W * 0.2);
    const x0 = leftW + 14;
    const x1 = W - RIGHT_PAD;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(
      parent: Element,
      tag: string,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function kv(key: string, value: number): string {
      return t('label.kv', '{key}={value}', { key, value });
    }

    function tagWidth(s: string): number {
      return s.length * monoPx * 0.62 + 12;
    }

    /** 리더를 가운데, 팔로워를 위아래로 가른 줄 차례 */
    function laneYs(scene: ReplicationLagScene): Map<string, number> {
      const followers = scene.nodes.filter((n) => n.role === 'follower').map((n) => n.id);
      const above = followers.slice(0, Math.ceil(followers.length / 2));
      const below = followers.slice(above.length);
      const order = [...above, scene.leader, ...below];
      const ys = new Map<string, number>();
      order.forEach((id, i) => {
        const y =
          order.length === 1
            ? (LANE_TOP + LANE_BOTTOM) / 2
            : lerp(LANE_TOP, LANE_BOTTOM, i / (order.length - 1));
        ys.set(id, y);
      });
      return ys;
    }

    function laneY(ys: Map<string, number>, id: string): number {
      const y = ys.get(id);
      if (y === undefined) throw new Error(`replication-lag stage: 노드 ${id} 의 줄이 없다`);
      return y;
    }

    function xOf(scene: ReplicationLagScene, ms: number): number {
      const end = scene.endMs;
      if (end === null || end <= 0) return x0;
      return lerp(x0, x1, ms / end);
    }

    function caption(scene: ReplicationLagScene): { main: string; sub: string | null } {
      const step = scene.step;
      const leaderNode = scene.nodes.find((n) => n.id === scene.leader);
      if (step === null) {
        if (leaderNode === undefined) throw new Error(`replication-lag stage: 리더 ${scene.leader} 가 노드에 없다`);
        const value = leaderNode.initial;
        return {
          main: t('caption.start', 'Before the write, every node holds {key}={value}', { key: scene.key, value }),
          sub: null,
        };
      }
      if (step.kind === 'write') {
        return {
          main: t('caption.write', '{at} ms · write {key}={value} lands on leader {node}', {
            at: step.at,
            key: scene.key,
            value: step.value,
            node: step.node,
          }),
          sub: t('sub.write', 'ok at once · nodes already at {key}={fresh}: {n} / {total}', {
            key: scene.key,
            fresh: step.value,
            n: step.caughtUp,
            total: step.total,
          }),
        };
      }
      if (step.kind === 'apply') {
        return {
          main: t('caption.apply', '{at} ms · the new value reaches {node}: {key}={value}', {
            at: step.at,
            node: step.node,
            key: scene.key,
            value: step.value,
          }),
          sub: t('sub.apply', 'Lag: {lag} ms', { lag: step.lag }),
        };
      }
      const r = step.read;
      const main = t('caption.read', '{at} ms · read {key} at {node} → {key}={value}', {
        at: r.at,
        key: scene.key,
        node: r.node,
        value: r.value,
      });
      const vars = { key: scene.key, fresh: r.leaderValue, n: r.caughtUp, total: r.total };
      return {
        main,
        sub: r.stale
          ? t('sub.readStale', 'Old value · nodes already at {key}={fresh}: {n} / {total}', vars)
          : t('sub.readFresh', 'New value · nodes already at {key}={fresh}: {n} / {total}', vars),
      };
    }

    /** 노드가 tau 에 가진 값의 이력 — [시작, 끝, 값] */
    function history(
      scene: ReplicationLagScene,
      id: string,
      tau: number,
      hideWrite: boolean,
    ): { from: number; to: number; value: number; changed: boolean }[] {
      const node = scene.nodes.find((n) => n.id === id);
      if (node === undefined) throw new Error(`replication-lag stage: 노드 ${id} 를 모른다`);
      const segs: { from: number; to: number; value: number; changed: boolean }[] = [];
      let from = 0;
      let value = node.initial;
      for (const c of scene.changes) {
        if (c.node !== id || c.at > tau) continue;
        if (hideWrite && scene.step !== null && scene.step.kind === 'write' && c === scene.changes[scene.changes.length - 1]) {
          continue;
        }
        if (c.at > from) segs.push({ from, to: c.at, value, changed: value !== node.initial });
        from = c.at;
        value = c.value;
      }
      segs.push({ from, to: tau, value, changed: value !== node.initial });
      return segs;
    }

    function drawTag(g: Element, x: number, y: number, text: string, fresh: boolean): void {
      const w = tagWidth(text);
      el(g, 'rect', {
        x: x - w / 2,
        y: y - TAG_H / 2,
        width: w,
        height: TAG_H,
        rx: 4,
        fill: fresh ? colors.accent : colors.bg,
        stroke: fresh ? colors.accent : colors.textMuted,
        'stroke-width': 1.2,
      });
      el(
        g,
        'text',
        {
          x,
          y: y + monoPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: fresh ? colors.stateInk : colors.text,
        },
        text,
      );
    }

    function drawAnswer(g: Element, x: number, y: number, scene: ReplicationLagScene, r: LagRead, label: boolean): void {
      const text = kv(scene.key, r.value);
      const w = tagWidth(text);
      el(g, 'rect', {
        x: x - w / 2,
        y: y - TAG_H / 2,
        width: w,
        height: TAG_H,
        rx: 4,
        fill: r.stale ? colors.bg : colors.accent,
        stroke: r.stale ? colors.danger : colors.accent,
        'stroke-width': 1.6,
      });
      el(
        g,
        'text',
        {
          x,
          y: y + monoPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: r.stale ? colors.danger : colors.stateInk,
        },
        text,
      );
      if (!label) return;
      el(
        g,
        'text',
        {
          x,
          y: y + TAG_H / 2 + 13,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': r.stale ? 600 : 400,
          fill: r.stale ? colors.danger : colors.textMuted,
        },
        r.stale ? t('label.stale', 'old value') : t('label.fresh', 'new value'),
      );
    }

    /**
     * 한 장면을 시각 tau 에서 그린다. cur 가 null 이면 끝 자리(정적 그리기),
     * 아니면 이번 걸음이 흐르는 도중이다.
     */
    function paint(scene: ReplicationLagScene, tau: number, cur: Cur): void {
      svg.textContent = '';
      const g = svg;
      const ys = laneYs(scene);
      const step = scene.step;
      const leaderY = laneY(ys, scene.leader);
      const inHit = cur !== null && cur.phase === 'hit';
      const hitP = inHit ? cur.p : 1;

      // 이번 걸음의 쓰기 · 읽기는 오감이 끝나기 전엔 결과를 내놓지 않는다
      const writePending =
        step !== null && step.kind === 'write' && cur !== null && !(inHit && hitP >= 0.5);
      const written = scene.written && !writePending;
      const pendingRead = step !== null && step.kind === 'read' && cur !== null ? step.read : null;

      // 캡션
      const cap = caption(scene);
      el(
        g,
        'text',
        { x: PAD, y: CAP_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: colors.text },
        cap.main,
      );
      if (cap.sub !== null) {
        el(
          g,
          'text',
          { x: PAD, y: SUB_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
          cap.sub,
        );
      }

      // 시간 축과 눈금
      el(g, 'text', {
        x: PAD,
        y: AXIS_Y + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }, t('label.time', 'time (ms)'));
      el(g, 'line', { x1: x0, y1: AXIS_Y, x2: x1, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 1 });
      if (scene.endMs !== null && scene.endMs > 0) {
        const s = tickStep(scene.endMs);
        for (let ms = 0; ms <= scene.endMs; ms += s) {
          const x = xOf(scene, ms);
          el(g, 'line', { x1: x, y1: AXIS_Y, x2: x, y2: CLIENT_Y + 10, stroke: colors.border, 'stroke-width': 0.6, 'stroke-dasharray': '2 4' });
          el(g, 'text', {
            x,
            y: AXIS_Y + 15,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }, String(ms));
        }
      }

      // 노드 줄 — 이름 · 역할 · 지나온 값의 띠
      for (const n of scene.nodes) {
        const y = laneY(ys, n.id);
        el(g, 'text', {
          x: PAD,
          y: y - 1,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        }, n.id);
        el(g, 'text', {
          x: PAD,
          y: y + 14,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, n.role === 'leader' ? t('label.leader', 'leader') : t('label.follower', 'follower'));
        el(g, 'line', { x1: x0, y1: y, x2: x1, y2: y, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '4 4' });
        for (const seg of history(scene, n.id, tau, writePending)) {
          const a = xOf(scene, seg.from);
          const b = xOf(scene, seg.to);
          if (b - a < 0.5) continue;
          el(g, 'rect', {
            x: a,
            y: y - 5,
            width: b - a,
            height: 10,
            fill: seg.changed ? colors.accent : colors.bgSubtle,
            stroke: seg.changed ? colors.accent : colors.textMuted,
            'stroke-width': 0.8,
          });
        }
      }

      // 날아가는 새 값의 자취 — 리더에서 출발해 팔로워마다 제 시각에 내려앉는다
      const flying: { x: number; y: number }[] = [];
      if (written && scene.writeAt !== null && scene.newValue !== null) {
        const ox = xOf(scene, scene.writeAt);
        for (const a of scene.arrivals) {
          const ty = laneY(ys, a.node);
          const tx = xOf(scene, a.at);
          if (tau >= a.at) {
            el(g, 'line', { x1: ox, y1: leaderY, x2: tx, y2: ty, stroke: colors.textMuted, 'stroke-width': 1.4 });
            el(g, 'circle', { cx: tx, cy: ty, r: 3, fill: colors.text });
          } else if (tau > scene.writeAt) {
            const q = (tau - scene.writeAt) / (a.at - scene.writeAt);
            const cx = xOf(scene, tau);
            const cy = lerp(leaderY, ty, q);
            el(g, 'line', { x1: ox, y1: leaderY, x2: cx, y2: cy, stroke: colors.textMuted, 'stroke-width': 1.4, 'stroke-dasharray': '5 3' });
            flying.push({ x: cx, y: cy });
          }
        }
      }

      // 클라이언트 줄의 이음 (쓰기 · 읽기가 오간 길)
      el(g, 'text', {
        x: PAD,
        y: CLIENT_Y + 4,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      }, t('label.client', 'client'));
      const doneReads = scene.reads.filter((r) => r !== pendingRead);
      const pathTo = (x: number, y: number): void => {
        el(g, 'line', {
          x1: x,
          y1: CLIENT_Y - TAG_H / 2,
          x2: x,
          y2: y + (y < CLIENT_Y ? TAG_H / 2 : -TAG_H / 2),
          stroke: colors.text,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      };
      if (scene.written && scene.writeAt !== null) pathTo(xOf(scene, scene.writeAt), leaderY);
      for (const r of scene.reads) pathTo(xOf(scene, r.at), laneY(ys, r.node));

      // 흐르는 시각
      const px = xOf(scene, tau);
      el(g, 'line', { x1: px, y1: AXIS_Y - 8, x2: px, y2: CLIENT_Y + 12, stroke: colors.text, 'stroke-width': 1.6 });
      const nowText = t('label.now', '{ms} ms', { ms: Math.round(tau) });
      const nw = tagWidth(nowText);
      el(g, 'rect', { x: px - nw / 2, y: AXIS_Y - 28, width: nw, height: 18, rx: 9, fill: colors.primary });
      el(g, 'text', {
        x: px,
        y: AXIS_Y - 15,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.textInverse,
      }, nowText);

      // 막대 곁의 표 — 그 순간 각 노드가 가진 값
      for (const n of scene.nodes) {
        const segs = history(scene, n.id, tau, writePending);
        const last = segs[segs.length - 1];
        if (last === undefined) continue;
        // 막대 왼쪽에 붙인다 — 막대 위를 지나는 날아가는 값과 겹치지 않게
        const text = kv(scene.key, last.value);
        drawTag(g, px - 5 - tagWidth(text) / 2, laneY(ys, n.id), text, last.changed);
      }

      // 날아가는 값 — 표 위에 얹어 닿는 순간이 보이게
      if (scene.newValue !== null) {
        for (const f of flying) {
          el(g, 'circle', { cx: f.x, cy: f.y, r: CHIP_R, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 });
          el(g, 'text', {
            x: f.x,
            y: f.y + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill: colors.stateInk,
          }, String(scene.newValue));
        }
      }

      // 클라이언트 줄 — 쓰기의 ok, 읽기의 답
      if (scene.written && scene.writeAt !== null && scene.newValue !== null) {
        const wx = xOf(scene, scene.writeAt);
        const text = kv(scene.key, scene.newValue);
        if (writePending || (inHit && step !== null && step.kind === 'write')) {
          // 오감: 쓰기가 올라가고(앞 반) ok 가 내려온다(뒤 반)
          if (hitP < 0.5 || cur === null || cur.phase === 'flow') {
            const q = cur !== null && cur.phase === 'hit' ? ease(hitP * 2) : 0;
            drawTag(g, wx, lerp(CLIENT_Y, leaderY, q), text, true);
          } else {
            const q = ease((hitP - 0.5) * 2);
            const oy = lerp(leaderY, CLIENT_Y, q);
            drawOk(g, wx, oy);
          }
        } else {
          drawTag(g, wx, CLIENT_Y, text, true);
          el(g, 'text', {
            x: wx,
            y: CLIENT_Y + TAG_H / 2 + 13,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            'font-weight': 600,
            fill: colors.text,
          }, t('label.ok', 'ok'));
        }
      }
      for (const r of doneReads) drawAnswer(g, xOf(scene, r.at), CLIENT_Y, scene, r, true);
      if (pendingRead !== null && inHit) {
        const rx = xOf(scene, pendingRead.at);
        const ly = laneY(ys, pendingRead.node);
        if (hitP < 0.5) {
          const q = ease(hitP * 2);
          el(g, 'circle', { cx: rx, cy: lerp(CLIENT_Y, ly, q), r: 5, fill: colors.text });
        } else {
          const q = ease((hitP - 0.5) * 2);
          drawAnswer(g, rx, lerp(ly, CLIENT_Y, q), scene, pendingRead, false);
        }
      }

      // 옛 값 읽기의 수
      if (doneReads.length > 0) {
        const staleN = doneReads.filter((r) => r.stale).length;
        el(g, 'text', {
          x: PAD,
          y: CLIENT_Y + 24,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }, t('label.tally', 'old values read'));
        el(g, 'text', {
          x: PAD,
          y: CLIENT_Y + 38,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: staleN > 0 ? colors.danger : colors.text,
        }, t('label.ratio', '{n} / {m}', { n: staleN, m: doneReads.length }));
      }
    }

    function drawOk(g: Element, x: number, y: number): void {
      const text = t('label.ok', 'ok');
      const w = tagWidth(text);
      el(g, 'rect', { x: x - w / 2, y: y - TAG_H / 2, width: w, height: TAG_H, rx: 10, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.2 });
      el(g, 'text', {
        x,
        y: y + monoPx * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        fill: colors.text,
      }, text);
    }

    function drawStatic(scene: ReplicationLagScene): void {
      paint(scene, scene.now, null);
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
          if (done) return;
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
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: ReplicationLagScene, _prev: ReplicationLagScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step === null) {
          drawStatic(next);
          return;
        }
        if (step.from < step.at) {
          await tween(mine, FLOW_MS, (p) => paint(next, lerp(step.from, step.at, p), { phase: 'flow', p }));
          if (destroyed || mine !== gen) return;
        }
        if (step.kind !== 'apply') {
          await tween(mine, HIT_MS, (p) => paint(next, step.at, { phase: 'hit', p }));
          if (destroyed || mine !== gen) return;
        }
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
