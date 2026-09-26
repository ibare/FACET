/**
 * token-bucket stage — 통에 토큰이 쌓이고, 몰려온 요청이 쌓인 토큰을 한꺼번에 들고 나간다.
 *
 * 왼쪽 위 채움 대롱에서 1 초마다 토큰이 통으로 떨어진다. 가득이면 테두리를 넘어 곁에 버려진다.
 * 요청은 위쪽 길을 따라 문으로 온다 — 통을 거치지 않는다. 지나가는 요청마다 통에서 토큰 하나가
 * 올라와 붙고, 짝이 되어 오른쪽 "초마다 지나간 수" 칸의 그 초 기둥에 쌓인다. 토큰이 없는
 * 요청은 왼쪽 아래 거절 칸으로 떨어진다.
 *
 * 화면은 늘 장면 하나에서 전체를 다시 세운다. 운동은 그 걸음의 기록(`step.rec`)에서 출발값을
 * 얻고, 아직 끝 자리에 못 온 것만 움직여 그린다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { TokenBucketScene, TokenBucketSecond } from './scene.js';

const H = 380;
const W = PIECE_CANVAS_W;
const PAD = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리
const CLOCK_Y = 26;
const LANE_Y = 72;
const BK_TOP = 146;
const BK_BOT = 266;
const STRIP_TITLE_Y = 132;
const STRIP_TOP = 156;
const CAPTION_Y1 = H - 42;
const CAPTION_Y2 = H - 18;

// 가로 자리 — 캔버스 폭에서 역산
const GATE_X = Math.round(W * 0.34);
const BK_W = 60;
const SX0 = Math.round(W * 0.58);
const SX1 = W - PAD;

// 크기 상한
const RQ_MAX = 20;
const SQ_MAX = 18;
const TOKEN_R_MAX = 12;

// 운동 길이 (ms)
const FILL_MS = 450;
const SPILL_MS = 650;
const ARRIVE_MS = 300;
const MEET_MS = 300;
const GO_MS = 400;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 꺾은선 위의 자리 — 길이에 비례해 나눈다 */
function along(points: Pt[], p: number): Pt {
  const first = points[0];
  if (first === undefined) throw new Error('token-bucket stage: 빈 경로');
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) throw new Error('token-bucket stage: 경로가 끊겼다');
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  if (total === 0) return { x: first.x, y: first.y };
  let want = total * Math.min(1, Math.max(0, p));
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = lens[i - 1];
    if (a === undefined || b === undefined || len === undefined) throw new Error('token-bucket stage: 경로가 끊겼다');
    if (want <= len || i === points.length - 1) {
      const q = len === 0 ? 1 : Math.min(1, want / len);
      return { x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q) };
    }
    want -= len;
  }
  return { x: first.x, y: first.y };
}

/** 한 걸음의 운동 시간표 */
type Plan = {
  fillEnd: number;
  arriveEnd: number;
  meetEnd: number;
  goEnd: number;
};

function planOf(rec: TokenBucketSecond): Plan {
  const fillMs = rec.overflowed > 0 ? SPILL_MS : rec.added > 0 ? FILL_MS : 0;
  const req = rec.arrived > 0;
  const fillEnd = fillMs;
  const arriveEnd = fillEnd + (req ? ARRIVE_MS : 0);
  const meetEnd = arriveEnd + (req ? MEET_MS : 0);
  const goEnd = meetEnd + (req ? GO_MS : 0);
  return { fillEnd, arriveEnd, meetEnd, goEnd };
}

function phase(clock: number | null, start: number, end: number): number {
  if (clock === null) return 1;
  if (end <= start) return clock >= end ? 1 : 0;
  return ease((clock - start) / (end - start));
}

export const tokenBucketStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; anchor?: 'start' | 'middle' | 'end'; fill?: string; weight?: number; mono?: boolean } = {},
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? colors.text,
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = str;
    }

    // ---- 크기: 바탕에서 역산 ----
    function sizes(scene: TokenBucketScene): {
      slot: number;
      tokenR: number;
      colW: number;
      sq: number;
      pitch: number;
    } {
      const cap = scene.base.capacity;
      const slot = Math.min(32, (BK_BOT - BK_TOP - 8) / cap);
      const tokenR = Math.min(TOKEN_R_MAX, slot * 0.4);
      const colW = (SX1 - SX0) / (scene.base.lastSec + 1);
      // 한 초에 지나갈 수 있는 가장 많은 수는 용량 — 기둥 높이의 상한
      const sq = Math.max(4, Math.min(SQ_MAX, colW - 8, (BK_BOT - STRIP_TOP) / cap - 3));
      return { slot, tokenR, colW, sq, pitch: sq + 3 };
    }

    function slotPt(j: number, slot: number): Pt {
      return { x: GATE_X, y: BK_BOT - 4 - slot * (j + 0.5) };
    }

    function colX(sec: number, colW: number): number {
      return SX0 + colW * (sec + 0.5);
    }

    function stackPt(sec: number, k: number, colW: number, pitch: number): Pt {
      return { x: colX(sec, colW), y: BK_BOT - pitch * (k + 0.5) };
    }

    function binPt(k: number, rq: number): Pt {
      const perRow = Math.max(1, Math.floor((GATE_X - BK_W / 2 - 24 - PAD) / (rq + 6)));
      const row = Math.floor(k / perRow);
      const col = k % perRow;
      return { x: PAD + rq / 2 + col * (rq + 6), y: BK_BOT - rq / 2 - row * (rq + 6) };
    }

    function pilePt(k: number, tokenR: number): Pt {
      const x0 = GATE_X + BK_W / 2 + 8 + tokenR;
      const perRow = Math.max(1, Math.floor((SX0 - 14 - x0 + tokenR) / (tokenR * 2 + 2)));
      const row = Math.floor(k / perRow);
      const col = k % perRow;
      return { x: x0 + col * (tokenR * 2 + 2), y: BK_BOT - tokenR - row * (tokenR * 2 + 2) };
    }

    function waitX(i: number, arrived: number, rq: number): number {
      const front = GATE_X - rq / 2 - 8;
      const room = front - PAD - rq / 2;
      const gap = Math.min(rq + 8, room / Math.max(1, arrived - 1));
      return front - i * gap;
    }

    function meetX(j: number, passed: number, rq: number): number {
      const front = GATE_X + rq / 2 + 8;
      const room = SX0 - 20 - front;
      const gap = Math.min(rq + 8, room / Math.max(1, passed - 1));
      return front + j * gap;
    }

    // ---- 부품 ----
    function drawToken(parent: Element, p: Pt, r: number, muted: boolean): void {
      el(
        'circle',
        {
          cx: p.x,
          cy: p.y,
          r,
          fill: colors.accent,
          stroke: muted ? colors.textMuted : colors.stateInk,
          'stroke-width': 1.5,
          ...(muted ? { 'fill-opacity': 0.35, 'stroke-dasharray': '2 2' } : {}),
        },
        parent,
      );
    }

    function drawRequest(parent: Element, p: Pt, size: number, tokenR: number | null): void {
      el(
        'rect',
        {
          x: p.x - size / 2,
          y: p.y - size / 2,
          width: size,
          height: size,
          rx: 3,
          fill: colors.itemDefault,
          stroke: colors.text,
          'stroke-width': 1.5,
        },
        parent,
      );
      if (tokenR !== null) drawToken(parent, p, tokenR, false);
    }

    function drawRejected(parent: Element, p: Pt, size: number, fresh: boolean): void {
      const g = el('g', fresh ? {} : { opacity: 0.5 }, parent);
      el(
        'rect',
        {
          x: p.x - size / 2,
          y: p.y - size / 2,
          width: size,
          height: size,
          rx: 3,
          fill: colors.bg,
          stroke: colors.danger,
          'stroke-width': 1.5,
        },
        g,
      );
      const d = size * 0.28;
      el('path', {
        d: `M${r1(p.x - d)} ${r1(p.y - d)}L${r1(p.x + d)} ${r1(p.y + d)}M${r1(p.x + d)} ${r1(p.y - d)}L${r1(p.x - d)} ${r1(p.y + d)}`,
        stroke: colors.danger,
        'stroke-width': 1.5,
        fill: 'none',
      }, g);
    }

    // ---- 한 장 ----
    /** clock 이 null 이면 멈춘 화면(정본). 수이면 그 걸음 운동의 그 시각 */
    function draw(scene: TokenBucketScene, clock: number | null): void {
      svg.textContent = '';
      const { slot, tokenR, colW, sq, pitch } = sizes(scene);
      const rq = Math.min(RQ_MAX, sq + 2);
      const pairR = rq * 0.3;
      const cap = scene.base.capacity;
      const now = scene.now;
      const rec = scene.step !== null && scene.step.kind === 'tick' ? scene.step.rec : null;
      const plan = rec === null ? null : planOf(rec);
      const m = clock !== null && rec !== null && plan !== null ? { clock, rec, plan } : null;

      const pFill = m !== null ? phase(m.clock, 0, m.plan.fillEnd) : 1;
      const pArrive = m !== null ? phase(m.clock, m.plan.fillEnd, m.plan.arriveEnd) : 1;
      const pMeet = m !== null ? phase(m.clock, m.plan.arriveEnd, m.plan.meetEnd) : 1;
      const pGo = m !== null ? phase(m.clock, m.plan.meetEnd, m.plan.goEnd) : 1;
      const fillDone = m === null || m.clock >= m.plan.fillEnd;
      const meetStarted = m === null || m.clock >= m.plan.arriveEnd;
      const goDone = m === null || m.clock >= m.plan.goEnd;

      // 시계
      if (now !== null) {
        write(svg, PAD, CLOCK_Y, t('label.time', 'Time: {sec} s', { sec: now.sec }), {
          size: fontSizes.md,
          weight: 600,
        });
      }

      // 요청 길과 문
      write(svg, PAD, LANE_Y - rq / 2 - 10, t('label.requests', 'Requests'), { fill: colors.textMuted });
      el('line', { x1: PAD, y1: LANE_Y + rq / 2 + 4, x2: SX1, y2: LANE_Y + rq / 2 + 4, stroke: colors.border, 'stroke-width': 1 }, svg);
      el(
        'line',
        { x1: GATE_X, y1: LANE_Y - rq / 2 - 8, x2: GATE_X, y2: LANE_Y + rq / 2 + 8, stroke: colors.text, 'stroke-width': 3, 'stroke-linecap': 'round' },
        svg,
      );

      // 채움 대롱
      const spoutL = GATE_X - BK_W / 2 - 64;
      const spoutR = GATE_X - BK_W / 2 - 14;
      const spoutY = BK_TOP - 20;
      write(svg, spoutL, spoutY - 14, t('label.refill', 'Refill: {n} per second', { n: scene.base.refillPerSecond }), {
        fill: colors.textMuted,
      });
      el('rect', { x: spoutL, y: spoutY - 5, width: spoutR - spoutL, height: 10, rx: 2, fill: colors.bgSubtle, stroke: colors.border }, svg);
      const spoutMouth: Pt = { x: spoutR, y: spoutY };
      const aboveMouth: Pt = { x: GATE_X, y: BK_TOP - tokenR - 4 };

      // 통
      el(
        'rect',
        { x: GATE_X - BK_W / 2, y: BK_TOP, width: BK_W, height: BK_BOT - BK_TOP, fill: colors.bgSubtle, stroke: 'none' },
        svg,
      );
      el(
        'path',
        {
          d: `M${r1(GATE_X - BK_W / 2)} ${BK_TOP}L${r1(GATE_X - BK_W / 2)} ${BK_BOT}L${r1(GATE_X + BK_W / 2)} ${BK_BOT}L${r1(GATE_X + BK_W / 2)} ${BK_TOP}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        },
        svg,
      );
      // 용량 눈금 — 칸마다 옅은 선
      for (let j = 1; j < cap; j += 1) {
        const y = BK_BOT - 4 - slot * j;
        el('line', { x1: GATE_X - BK_W / 2 + 3, y1: y, x2: GATE_X - BK_W / 2 + 9, y2: y, stroke: colors.border, 'stroke-width': 1 }, svg);
      }

      // 통 안의 토큰 (쉬는 것)
      let resting = now === null ? 0 : now.tokens;
      if (m !== null) {
        if (!fillDone) resting = m.rec.from;
        else if (!meetStarted) resting = m.rec.before;
        else resting = m.rec.after;
      }
      for (let j = 0; j < resting; j += 1) drawToken(svg, slotPt(j, slot), tokenR, false);

      if (now !== null) {
        write(svg, GATE_X, BK_BOT + 18, t('label.tokens', 'Tokens: {n} / {cap}', { n: now.tokens, cap }), {
          anchor: 'middle',
          weight: 600,
        });
      }

      // 넘쳐 버린 토큰 더미
      const spilledShown = now === null ? 0 : now.spilledTotal - (m !== null && !fillDone ? m.rec.overflowed : 0);
      for (let k = 0; k < spilledShown; k += 1) drawToken(svg, pilePt(k, tokenR), tokenR, true);
      if (now !== null) {
        write(svg, GATE_X + BK_W / 2 + 8, BK_BOT + 36, t('label.spilled', 'Spilled: {n}', { n: now.spilledTotal }), {
          fill: colors.textMuted,
        });
      }

      // 거절 칸
      const rejectedNow = rec === null ? 0 : rec.rejected;
      const rejectedShown = now === null ? 0 : now.rejectedTotal - (goDone ? 0 : rejectedNow);
      for (let k = 0; k < rejectedShown; k += 1) {
        const fresh = rec !== null && k >= rejectedShown - rejectedNow && goDone;
        drawRejected(svg, binPt(k, rq), rq, fresh);
      }
      if (now !== null) {
        write(svg, PAD, BK_BOT + 18, t('label.rejected', 'Rejected: {n}', { n: now.rejectedTotal }), { fill: colors.danger });
      }

      // 초마다 지나간 수 — 기둥
      write(svg, SX0, STRIP_TITLE_Y, t('label.passedPerSec', 'Passed per second'), { fill: colors.textMuted });
      const rateY = BK_BOT - scene.base.refillPerSecond * pitch;
      el('line', { x1: SX1 - 18, y1: STRIP_TITLE_Y - 4, x2: SX1, y2: STRIP_TITLE_Y - 4, stroke: colors.textMuted, 'stroke-dasharray': '3 3' }, svg);
      write(svg, SX1 - 22, STRIP_TITLE_Y, t('label.rate', 'Refill rate'), { anchor: 'end', fill: colors.textMuted, size: fontSizes.xs });
      if (now !== null) {
        const band = colX(now.sec, colW) - colW / 2;
        el('rect', { x: band + 1, y: STRIP_TOP - 16, width: colW - 2, height: BK_BOT - STRIP_TOP + 38, fill: colors.bgSubtle, rx: 3 }, svg);
      }
      el('line', { x1: SX0, y1: BK_BOT, x2: SX1, y2: BK_BOT, stroke: colors.border, 'stroke-width': 1 }, svg);
      for (let sec = 0; sec <= scene.base.lastSec; sec += 1) {
        write(svg, colX(sec, colW), BK_BOT + 16, String(sec), { anchor: 'middle', fill: colors.textMuted, size: fontSizes.xs });
      }
      if (now !== null) {
        for (const s of now.seconds) {
          const shown = rec !== null && s.sec === rec.sec && !goDone ? 0 : s.passed;
          for (let k = 0; k < shown; k += 1) drawRequest(svg, stackPt(s.sec, k, colW, pitch), sq, sq * 0.3);
          if (shown > 0) {
            write(svg, colX(s.sec, colW), BK_BOT - shown * pitch - 5, String(shown), {
              anchor: 'middle',
              weight: 600,
              size: fontSizes.sm,
            });
          }
        }
      }
      el('line', { x1: SX0, y1: rateY, x2: SX1, y2: rateY, stroke: colors.textMuted, 'stroke-dasharray': '3 3', 'stroke-width': 1 }, svg);

      // ---- 운동 중인 것 ----
      if (m !== null) {
        const { rec: mr, plan: mp, clock: mc } = m;
        // 채움: 대롱 → 통 입구 → 칸
        for (let a = 0; a < mr.added; a += 1) {
          if (fillDone) break;
          const to = slotPt(mr.from + a, slot);
          drawToken(svg, along([spoutMouth, aboveMouth, to], pFill), tokenR, false);
        }
        // 넘침: 대롱 → 통 입구 → 오른쪽 테두리 → 더미
        for (let o = 0; o < mr.overflowed; o += 1) {
          if (fillDone) break;
          const rim: Pt = { x: GATE_X + BK_W / 2 + tokenR * 0.6, y: BK_TOP - tokenR - 2 };
          const to = pilePt(spilledShown + o, tokenR);
          drawToken(svg, along([spoutMouth, aboveMouth, rim, to], pFill), tokenR, pFill > 0.75);
        }

        if (mr.arrived > 0 && fillDone) {
          const shift = waitX(0, mr.arrived, rq) + rq;
          for (let i = 0; i < mr.arrived; i += 1) {
            const wx = waitX(i, mr.arrived, rq);
            const passes = i < mr.passed;
            if (mc < mp.arriveEnd) {
              // 들어섬: 왼쪽 끝에서 한 줄로
              drawRequest(svg, { x: wx - shift * (1 - pArrive), y: LANE_Y }, rq, null);
            } else if (mc < mp.meetEnd) {
              if (passes) {
                const mx = meetX(i, mr.passed, rq);
                drawRequest(svg, { x: lerp(wx, mx, pMeet), y: LANE_Y }, rq, null);
                // 토큰이 통에서 올라와 요청을 맞는다
                const from = slotPt(mr.before - 1 - i, slot);
                const tp = along([from, aboveMouth, { x: mx, y: LANE_Y }], pMeet);
                drawToken(svg, tp, lerp(tokenR, pairR, pMeet), false);
              } else {
                drawRequest(svg, { x: wx, y: LANE_Y }, rq, null);
              }
            } else if (!goDone) {
              if (passes) {
                const mx = meetX(i, mr.passed, rq);
                const to = stackPt(mr.sec, i, colW, pitch);
                const p = along([{ x: mx, y: LANE_Y }, { x: to.x, y: LANE_Y }, to], pGo);
                const size = lerp(rq, sq, pGo);
                drawRequest(svg, p, size, lerp(pairR, sq * 0.3, pGo));
              } else {
                const k = rejectedShown + (i - mr.passed);
                const to = binPt(k, rq);
                const gatePt: Pt = { x: GATE_X - rq / 2 - 4, y: LANE_Y };
                drawRejected(svg, along([{ x: wx, y: LANE_Y }, gatePt, to], pGo), rq, true);
              }
            }
          }
        }
      }

      // 캡션
      if (now !== null && scene.step !== null) {
        if (scene.step.kind === 'start') {
          write(svg, PAD, CAPTION_Y1, t('caption.start', 'Time 0. Tokens in the bucket: {n}.', { n: now.tokens }), {
            size: fontSizes.md,
          });
        } else {
          const r = scene.step.rec;
          if (r.overflowed > 0 && r.added === 0) {
            write(svg, PAD, CAPTION_Y1, t('caption.spill', 'The bucket is full. Tokens spilled: {k}.', { k: r.overflowed }), {
              size: fontSizes.md,
            });
          } else if (r.overflowed > 0) {
            write(
              svg,
              PAD,
              CAPTION_Y1,
              t('caption.fillSpill', 'Refill: +{k}. The bucket is full. Tokens spilled: {s}.', { k: r.added, s: r.overflowed }),
              { size: fontSizes.md },
            );
          } else if (r.arrived > 0) {
            write(svg, PAD, CAPTION_Y1, t('caption.fillOnly', 'Refill: +{k}.', { k: r.added }), { size: fontSizes.md });
          } else {
            write(svg, PAD, CAPTION_Y1, t('caption.fill', 'Refill: +{k}. Tokens in the bucket: {n}.', { k: r.added, n: r.after }), {
              size: fontSizes.md,
            });
          }
          if (r.arrived > 0) {
            write(
              svg,
              PAD,
              CAPTION_Y2,
              t('caption.requests', 'Requests: {n} · Passed: {p} · Rejected: {r} · Tokens left: {m}.', {
                n: r.arrived,
                p: r.passed,
                r: r.rejected,
                m: r.after,
              }),
              { size: fontSizes.md, weight: 600 },
            );
          } else {
            write(svg, PAD, CAPTION_Y2, t('caption.idle', 'No requests this second.'), { size: fontSizes.md, fill: colors.textMuted });
          }
        }
      }
    }

    function play(scene: TokenBucketScene, total: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (): void => {
          if (mine !== gen || destroyed) {
            wake();
            return;
          }
          const clock = performance.now() - start;
          if (clock >= total) {
            wake();
            return;
          }
          draw(scene, clock);
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, FRAME_MS);
          timers.add(id);
        };
        frame();
      });
    }

    return {
      async render(next: TokenBucketScene, _prev: TokenBucketScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const rec = next.step !== null && next.step.kind === 'tick' ? next.step.rec : null;
        const total = rec === null ? 0 : planOf(rec).goEnd;
        if (!opts.animate || total === 0) {
          draw(next, null);
          return;
        }
        await play(next, total, mine);
        if (mine !== gen || destroyed) return;
        draw(next, null);
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
