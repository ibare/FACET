/**
 * CPU 스케줄 정책 stage — CPU 한 줄의 토막 차례와 프로세스마다의 대기 막대.
 *
 * 운동 (손잡이를 돌리면 옮겨 가는 것):
 *   - 판이 시작하면 앞 판의 CPU 토막들이 틱 칸으로 갈라져 한 줄 위(앞 판 줄)로 올라가 흐리게 남는다.
 *     새 판의 토막은 CPU 줄에 걸음마다 이어 붙어 자란다. 판 끝 걸음에서 앞 판 줄의 칸들이 새 판에서
 *     **같은 프로세스의 같은 번째 틱**이 선 자리로 미끄러져 내려와 겹친다 — 같은 판이면 곧장 내려앉는다.
 *     일감이 바뀐 판에서는 이름이 같아도 다른 프로세스라 옮기지 않고 걷는다 (대기의 점선도 두지 않는다).
 *   - 대기 막대: 판이 시작하면 앞 판의 길이가 점선 테두리로 남고, 막대는 걸음 1 에서 앞 판의 길이로부터
 *     그 걸음의 값으로 곧장 줄어든 뒤 걸음마다 자란다.
 *     판 끝에 점선이 앞 판의 길이에서 새 길이로 줄거나 늘어 막대에 겹친다.
 *   - 오른쪽 줄 패널: 프로세스 표가 줄 → CPU → 끝난 차례로 옮겨 다닌다. 밀려남은 CPU 에서 줄 끝으로,
 *     MLFQ 의 몫 다 씀은 한 층 아래 줄로 내려앉는다 (MLFQ 판에만 층 셋이 보인다).
 * 운동 길이는 projector 가 재생 속도로 셈해 건넨다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageProc = { id: string; arrive: number; burst: number };

export type StageRound = {
  policy: string;
  workload: string;
  procs: StageProc[];
  quanta: number[];
  mlfq: boolean;
};

export type StageEvent = {
  kind: 'finish' | 'arrive' | 'demote' | 'preempt' | 'dispatch';
  proc: number;
  fromLevel: number;
  toLevel: number;
  left: number;
  by: number;
  byLeft: number;
};

export type StageStep = {
  last: boolean;
  from: number;
  to: number;
  events: StageEvent[];
  run: { proc: number; from: number; to: number } | null;
  queue: number[];
  levels: number[];
  running: number;
  done: number[];
  waits: number[];
  totalWait: number;
};

/** projector 가 보는 stage 의 표면 */
export type SchedulingPolicyStage = {
  beginRound(round: StageRound, ms: number): void;
  showStep(step: StageStep, ms: number): Promise<void>;
  clear(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 820;
const BASE_H = 420;
const X0 = 104;
const AXIS_W = 432;
const GHOST_Y = 38;
const GHOST_H = 14;
const CPU_Y = 60;
const CPU_H = 30;
const AXIS_Y = 108;
const ROW_TOP = 140;
const ROW_H = 30;
const BAR_H = 14;
const PANEL_X = 568;
const PANEL_W = 240;
const CHIP_H = 24;
const LANE_TOP = 156;
const LANE_GAP = 50;
const DONE_TOP = 312;
const MAX_ROWS_DEFAULT = 7;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 글자 크기만큼, 나머지는 0.6 배 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    w += c >= 0x1100 ? px : px * 0.6;
  }
  return w;
}

/** 두 자리 소수 — 정수 합을 들고 반올림한다: (합 × 200 + n) // (2n) 을 100 으로 갈라 적는다 */
function avg2(sum: number, n: number): string {
  if (n <= 0) throw new Error('scheduling-policy-stage: 프로세스 수가 0 이다');
  const hundredths = Math.floor((sum * 200 + n) / (2 * n));
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return `${whole}.${frac < 10 ? '0' : ''}${frac}`;
}

type Preview = { workloads: { id: string; procs: StageProc[] }[]; policies: string[]; quanta: number[]; policy: number; workload: number };

/**
 * initialData 를 읽는다. 없으면 null(빈 틀로 마운트 — 전수 검사가 config 만 주고 붙인다).
 * **있는데 모양이 틀리면 던진다** — 기본값으로 지나치지 않는다.
 */
function readPreview(initialData: Record<string, unknown> | undefined): Preview | null {
  if (initialData === undefined || initialData.workloads === undefined) return null;
  const bad = (what: string): never => {
    throw new Error(`scheduling-policy-stage: initialData 의 ${what} 모양이 틀렸다`);
  };
  const wls = initialData.workloads;
  if (!Array.isArray(wls) || wls.length === 0) return bad('workloads');
  const workloads = wls.map((wl) => {
    if (typeof wl !== 'object' || wl === null) return bad('workloads[]');
    const { id, procs } = wl as { id?: unknown; procs?: unknown };
    if (typeof id !== 'string' || !Array.isArray(procs) || procs.length === 0) return bad('workloads[]');
    return {
      id,
      procs: procs.map((p) => {
        const o = (typeof p === 'object' && p !== null ? p : bad('procs[]')) as Record<string, unknown>;
        if (typeof o.id !== 'string' || typeof o.arrive !== 'number' || typeof o.burst !== 'number') return bad('procs[]');
        return { id: o.id, arrive: o.arrive, burst: o.burst };
      }),
    };
  });
  const policies = initialData.policies;
  if (!Array.isArray(policies) || !policies.every((x) => typeof x === 'string')) return bad('policies');
  const quanta = initialData.mlfqQuanta;
  if (!Array.isArray(quanta) || !quanta.every((x) => typeof x === 'number')) return bad('mlfqQuanta');
  const { policy, workload } = initialData;
  if (typeof policy !== 'number' || policies[policy] === undefined) return bad('policy');
  if (typeof workload !== 'number' || workloads[workload] === undefined) return bad('workload');
  return { workloads, policies: policies as string[], quanta: quanta as number[], policy, workload };
}

/** 축 끝 — CPU 가 쉬지 않는 모형이라 일감마다 (가장 이른 도착 + 길이 합) 의 가장 큰 값 */
function axisEndOf(pv: Preview): number {
  let end = 0;
  for (const wl of pv.workloads) {
    const first = Math.min(...wl.procs.map((p) => p.arrive));
    end = Math.max(end, first + wl.procs.reduce((s, p) => s + p.burst, 0));
  }
  return end;
}

type Chip = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; w: number; x: number; y: number; o: number };
type Run = { proc: number; from: number; to: number; rect: SVGRectElement; label: SVGTextElement; w: number };
type GhostCell = { id: string; ordinal: number; rect: SVGRectElement; x: number; y: number; o: number };
type Row = {
  g: SVGGElement;
  swatch: SVGRectElement;
  name: SVGTextElement;
  sub: SVGTextElement;
  ghost: SVGRectElement;
  bar: SVGRectElement;
  num: SVGTextElement;
  barW: number;
  ghostW: number;
};
type PrevRound = { policy: string; workload: string; workloadId: string; totalWait: number; n: number; waitsById: Map<string, number> };

export const schedulingPolicyStageView: CanvasView = {
  canvas: { width: W, height: BASE_H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const inkOnColor = getColors('light').text;
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    const preview = readPreview(params.initialData);
    const maxRows = preview ? Math.max(...preview.workloads.map((w) => w.procs.length)) : MAX_ROWS_DEFAULT;
    const height = Math.max(BASE_H, ROW_TOP + maxRows * ROW_H + 70);
    if (height !== BASE_H) svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    let axisEnd: number | null = preview ? axisEndOf(preview) : null;
    let unit = axisEnd ? Math.min(24, AXIS_W / axisEnd) : 24;

    // ── 움직임 (rAF 한 고리) ───────────────────────────────────────
    type Anim = { from: number; to: number; start: number; dur: number; apply: (v: number) => void };
    const values = new Map<string, number>();
    const anims = new Map<string, Anim>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let frame = 0;
    let destroyed = false;
    const canAnimate = (): boolean => typeof requestAnimationFrame === 'function' && !isInstant() && !destroyed;

    const loop = (): void => {
      frame = 0;
      const now = performance.now();
      for (const [key, a] of anims) {
        const p = a.dur <= 0 ? 1 : Math.min(1, (now - a.start) / a.dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const v = a.from + (a.to - a.from) * e;
        values.set(key, v);
        a.apply(v);
        if (p >= 1) anims.delete(key);
      }
      if (anims.size > 0 && !destroyed) frame = requestAnimationFrame(loop);
    };
    const finishAll = (): void => {
      for (const [key, a] of anims) {
        values.set(key, a.to);
        a.apply(a.to);
      }
      anims.clear();
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
    };
    /** key 의 값을 to 로 옮긴다. 같은 key 의 앞 움직임은 지금 값에서 이어받는다. */
    const tween = (key: string, to: number, ms: number, apply: (v: number) => void): void => {
      const from = values.get(key);
      if (from === undefined || ms <= 0 || !canAnimate() || from === to) {
        anims.delete(key);
        values.set(key, to);
        apply(to);
        return;
      }
      anims.set(key, { from, to, start: performance.now(), dur: ms, apply });
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const place = (key: string, v: number): void => {
      values.set(key, v);
    };
    const settle = (ms: number): Promise<void> => {
      if (ms <= 0 || !canAnimate()) {
        finishAll();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          clearTimeout(timer);
          timers.delete(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          finishAll();
          wake();
        }, ms + 20);
        timers.add(timer);
        waiters.add(wake);
      });
    };
    params.onScrubStart?.(() => {
      finishAll();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    // ── 뼈대 ──────────────────────────────────────────────────────
    const root = el('g', { 'font-family': fonts.body });
    svg.appendChild(root);
    const title = el('text', { x: 0, y: 18, 'font-size': fontSizes.lg, 'font-weight': 600, fill: pal.text });
    const tickCaption = el('text', {
      x: X0 + AXIS_W,
      y: 18,
      'font-size': fontSizes.sm,
      fill: pal.textMuted,
      'text-anchor': 'end',
    });
    root.append(title, tickCaption);

    // 앞 판 줄의 이름 — 줄 오른쪽 끝, 줄 패널 자리 위에 둔다 (왼쪽 이름 칸에는 들어가지 않는다)
    const ghostLabel = el('text', {
      x: PANEL_X,
      y: GHOST_Y + GHOST_H - 3,
      'font-size': fontSizes.xs,
      fill: pal.textMuted,
    });
    const cpuLabel = el('text', {
      x: X0 - 8,
      y: CPU_Y + CPU_H / 2 + 4,
      'font-size': fontSizes.sm,
      'font-weight': 600,
      fill: pal.text,
      'text-anchor': 'end',
    });
    cpuLabel.textContent = t('label.cpu', 'CPU');
    const ghostTrack = el('rect', { x: X0, y: GHOST_Y, width: AXIS_W, height: GHOST_H, fill: pal.bgSubtle, stroke: pal.border });
    const cpuTrack = el('rect', { x: X0, y: CPU_Y, width: AXIS_W, height: CPU_H, fill: pal.bgSubtle, stroke: pal.border });
    const grid = el('g', {});
    const axis = el('g', { 'font-size': fontSizes.xs, fill: pal.textMuted, 'text-anchor': 'middle' });
    root.append(ghostTrack, cpuTrack, grid, axis, ghostLabel, cpuLabel);

    const drawAxis = (): void => {
      grid.replaceChildren();
      axis.replaceChildren();
      if (!axisEnd) return;
      ghostTrack.setAttribute('width', String(axisEnd * unit));
      cpuTrack.setAttribute('width', String(axisEnd * unit));
      for (let k = 0; k <= axisEnd; k += 1) {
        const x = X0 + k * unit;
        grid.appendChild(el('line', { x1: x, x2: x, y1: CPU_Y, y2: CPU_Y + CPU_H, stroke: pal.border, 'stroke-width': 0.5 }));
        const num = el('text', { x, y: AXIS_Y });
        num.textContent = String(k);
        axis.appendChild(num);
      }
    };
    drawAxis();

    const ghostLayer = el('g', {});
    const runLayer = el('g', {});
    const markLayer = el('g', {});
    root.append(runLayer, ghostLayer, markLayer);
    const cursor = el('line', {
      x1: X0,
      x2: X0,
      y1: GHOST_Y - 6,
      y2: CPU_Y + CPU_H + 6,
      stroke: pal.accent,
      'stroke-width': 2,
      opacity: 0,
    });
    root.appendChild(cursor);
    const moveCursor = (tick: number, ms: number): void => {
      cursor.setAttribute('opacity', '1');
      tween('cursor', X0 + tick * unit, ms, (x) => {
        cursor.setAttribute('x1', String(x));
        cursor.setAttribute('x2', String(x));
      });
    };

    const waitedHead = el('text', { x: X0, y: ROW_TOP - 10, 'font-size': fontSizes.sm, fill: pal.textMuted });
    waitedHead.textContent = t('label.waited', 'Ticks waited');
    root.appendChild(waitedHead);
    const rowLayer = el('g', {});
    root.appendChild(rowLayer);

    // 줄 패널
    const queueHead = el('text', { x: PANEL_X, y: ROW_TOP - 8, 'font-size': fontSizes.sm, fill: pal.textMuted });
    queueHead.textContent = t('label.queue', 'Ready queue');
    const cpuSlot = el('rect', {
      x: PANEL_X,
      y: CPU_Y,
      width: 96,
      height: CPU_H,
      rx: 4,
      fill: pal.bgSubtle,
      stroke: pal.text,
    });
    const laneLayer = el('g', {});
    const doneHead = el('text', { x: PANEL_X, y: DONE_TOP - 6, 'font-size': fontSizes.xs, fill: pal.textMuted });
    doneHead.textContent = t('label.done', 'Finished, in order');
    const doneTrack = el('rect', {
      x: PANEL_X,
      y: DONE_TOP - 2,
      width: PANEL_W,
      height: CHIP_H + 4,
      fill: pal.bgSubtle,
      stroke: pal.border,
    });
    const chipLayer = el('g', {});
    root.append(queueHead, cpuSlot, laneLayer, doneTrack, doneHead, chipLayer);

    const eventCaption = el('text', { x: 0, y: height - 40, 'font-size': fontSizes.md, fill: pal.text });
    const averageCaption = el('text', { x: 0, y: height - 14, 'font-size': fontSizes.md, 'font-weight': 600, fill: pal.text });
    const previousCaption = el('text', { x: 260, y: height - 14, 'font-size': fontSizes.md, fill: pal.textMuted });
    root.append(eventCaption, averageCaption, previousCaption);

    // ── 판의 상태 ─────────────────────────────────────────────────
    let round: StageRound | null = null;
    let colors: readonly string[] = [];
    let rows: Row[] = [];
    let chips: Chip[] = [];
    let runs: Run[] = [];
    let ghosts: GhostCell[] = [];
    let ghostSeq = 0;
    let lastWaits: number[] = [];
    let finished = false;
    let prev: PrevRound | null = null;
    let current: PrevRound | null = null;

    const nameOf = (id: string): string => {
      if (id === 'big') return t('label.big', 'Big job');
      if (id === 'long') return t('label.long', 'Long job');
      if (/^s\d+$/.test(id)) return id.toUpperCase();
      throw new Error(`scheduling-policy-stage: 모르는 프로세스 식별자 '${id}'`);
    };
    const workloadName = (id: string): string => {
      if (id === 'big-first') return t('label.bigFirst', 'Big first');
      if (id === 'steady-shorts') return t('label.steadyShorts', 'Steady shorts');
      throw new Error(`scheduling-policy-stage: 모르는 일감 식별자 '${id}'`);
    };
    const procAt = (i: number): StageProc => {
      const p = round?.procs[i];
      if (!p) throw new Error(`scheduling-policy-stage: 프로세스 번호 ${i} 가 판에 없다`);
      return p;
    };
    const colorOf = (i: number): string => {
      const c = colors[i];
      if (!c) throw new Error(`scheduling-policy-stage: 프로세스 번호 ${i} 의 색이 없다`);
      return c;
    };

    const setRowBar = (i: number, w: number, ms: number): void => {
      const row = rows[i];
      tween(`bar:${i}`, w, ms, (x) => {
        row.barW = x;
        row.bar.setAttribute('width', String(Math.max(0, x)));
        row.num.setAttribute('x', String(X0 + Math.max(x, row.ghostW) + 6));
      });
    };
    const setRowGhost = (i: number, w: number, ms: number): void => {
      const row = rows[i];
      tween(`ghostbar:${i}`, w, ms, (x) => {
        row.ghostW = x;
        row.ghost.setAttribute('width', String(Math.max(0, x)));
        row.ghost.setAttribute('opacity', x > 0.5 ? '1' : '0');
        row.num.setAttribute('x', String(X0 + Math.max(x, row.barW) + 6));
      });
    };

    const buildRows = (procs: StageProc[]): void => {
      const keep = rows.length === procs.length;
      if (!keep) {
        rowLayer.replaceChildren();
        rows = [];
        for (let i = 0; i < procs.length; i += 1) {
          const y = ROW_TOP + i * ROW_H;
          const g = el('g', {});
          const swatch = el('rect', { x: 0, y: y + 3, width: 8, height: BAR_H, rx: 2 });
          const name = el('text', {
            x: X0 - 8,
            y: y + BAR_H,
            'font-size': fontSizes.sm,
            fill: pal.text,
            'text-anchor': 'end',
          });
          const sub = el('text', {
            x: X0 + AXIS_W,
            y: y + BAR_H,
            'font-size': fontSizes.xs,
            fill: pal.textMuted,
            'text-anchor': 'end',
          });
          const ghost = el('rect', {
            x: X0,
            y: y + 2,
            width: 0,
            height: BAR_H + 2,
            fill: 'none',
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
            opacity: 0,
          });
          const bar = el('rect', { x: X0, y: y + 3, width: 0, height: BAR_H, rx: 2 });
          const num = el('text', { x: X0 + 6, y: y + BAR_H, 'font-size': fontSizes.sm, fill: pal.text });
          num.textContent = '0';
          g.append(swatch, name, sub, ghost, bar, num);
          rowLayer.appendChild(g);
          rows.push({ g, swatch, name, sub, ghost, bar, num, barW: 0, ghostW: 0 });
          place(`bar:${i}`, 0);
          place(`ghostbar:${i}`, 0);
        }
      }
      procs.forEach((p, i) => {
        const row = rows[i];
        const c = colorOf(i);
        row.swatch.setAttribute('fill', c);
        row.bar.setAttribute('fill', c);
        row.ghost.setAttribute('stroke', c);
        row.name.textContent = nameOf(p.id);
        row.sub.textContent = t('label.proc', 'Arrive: {a} · Length: {b}', { a: p.arrive, b: p.burst });
      });
    };

    const buildLanes = (r: StageRound): void => {
      laneLayer.replaceChildren();
      const lanes = r.mlfq ? r.quanta.length : 1;
      for (let l = 0; l < lanes; l += 1) {
        const y = LANE_TOP + l * LANE_GAP;
        laneLayer.appendChild(
          el('rect', { x: PANEL_X, y: y - 2, width: PANEL_W, height: CHIP_H + 4, fill: pal.bgSubtle, stroke: pal.border }),
        );
        if (r.mlfq) {
          const lab = el('text', { x: PANEL_X, y: y - 6, 'font-size': fontSizes.xs, fill: pal.textMuted });
          lab.textContent = t('label.level', 'Level {n} · quantum {q}', { n: l + 1, q: r.quanta[l] });
          laneLayer.appendChild(lab);
        }
      }
    };

    const buildChips = (procs: StageProc[]): void => {
      chipLayer.replaceChildren();
      chips = procs.map((p, i) => {
        const text = nameOf(p.id);
        const w = Math.max(28, Math.min(90, textWidth(text, smPx) + 12));
        const g = el('g', { opacity: 0 });
        const rect = el('rect', { x: 0, y: 0, width: w, height: CHIP_H, rx: 4, fill: colorOf(i) });
        const label = el('text', {
          x: w / 2,
          y: CHIP_H / 2 + 4,
          'font-size': fontSizes.sm,
          fill: inkOnColor,
          'text-anchor': 'middle',
        });
        label.textContent = text;
        g.append(rect, label);
        chipLayer.appendChild(g);
        const x = PANEL_X + PANEL_W - w;
        const y = LANE_TOP;
        g.setAttribute('transform', `translate(${x},${y})`);
        for (const k of ['x', 'y', 'o']) values.delete(`chip:${i}:${k}`);
        place(`chip:${i}:x`, x);
        place(`chip:${i}:y`, y);
        place(`chip:${i}:o`, 0);
        return { g, rect, label, w, x, y, o: 0 };
      });
    };

    const moveChip = (i: number, x: number, y: number, o: number, ms: number): void => {
      const chip = chips[i];
      if (!chip) throw new Error(`scheduling-policy-stage: 표 ${i} 가 없다`);
      const apply = (): void => chip.g.setAttribute('transform', `translate(${chip.x},${chip.y})`);
      tween(`chip:${i}:x`, x, ms, (v) => {
        chip.x = v;
        apply();
      });
      tween(`chip:${i}:y`, y, ms, (v) => {
        chip.y = v;
        apply();
      });
      tween(`chip:${i}:o`, o, ms, (v) => {
        chip.o = v;
        chip.g.setAttribute('opacity', String(v));
      });
    };

    /** 표들을 한 줄에 늘어놓을 x — 넘치면 간격을 좁힌다 */
    const rowXs = (idx: number[]): number[] => {
      const gap = 4;
      const total = idx.reduce((s, i) => s + chips[i].w + gap, 0);
      const scale = total > PANEL_W - 4 ? (PANEL_W - 4) / total : 1;
      const xs: number[] = [];
      let x = PANEL_X + 2;
      for (const i of idx) {
        xs.push(x);
        x += (chips[i].w + gap) * scale;
      }
      return xs;
    };

    const layoutChips = (step: StageStep, ms: number): void => {
      if (!round) throw new Error('scheduling-policy-stage: 판이 시작하지 않았다');
      const r = round;
      const seen = new Set<number>();
      if (step.running >= 0) {
        moveChip(step.running, PANEL_X + (96 - chips[step.running].w) / 2, CPU_Y + (CPU_H - CHIP_H) / 2, 1, ms);
        seen.add(step.running);
      }
      const lanes = r.mlfq ? r.quanta.length : 1;
      for (let l = 0; l < lanes; l += 1) {
        const inLane = step.queue.filter((i) => (r.mlfq ? step.levels[i] === l : true));
        const xs = rowXs(inLane);
        inLane.forEach((i, k) => {
          moveChip(i, xs[k], LANE_TOP + l * LANE_GAP, 1, ms);
          seen.add(i);
        });
      }
      const dxs = rowXs(step.done);
      step.done.forEach((i, k) => {
        moveChip(i, dxs[k], DONE_TOP, 1, ms);
        seen.add(i);
      });
      for (let i = 0; i < chips.length; i += 1) {
        if (!seen.has(i)) moveChip(i, PANEL_X + PANEL_W - chips[i].w, LANE_TOP, 0, ms);
      }
    };

    const runLabel = (run: Run): void => {
      const text = nameOf(procAt(run.proc).id);
      const fits = textWidth(text, xsPx) + 6 <= run.w;
      run.label.textContent = fits ? text : '';
      run.label.setAttribute('x', String(X0 + run.from * unit + run.w / 2));
    };

    const growRun = (run: { proc: number; from: number; to: number }, ms: number): void => {
      const lastRun = runs[runs.length - 1];
      if (lastRun && lastRun.proc === run.proc && lastRun.to === run.from) {
        lastRun.to = run.to;
        const key = `run:${runs.length - 1}`;
        tween(key, (lastRun.to - lastRun.from) * unit, ms, (w) => {
          lastRun.w = w;
          lastRun.rect.setAttribute('width', String(w));
          runLabel(lastRun);
        });
        return;
      }
      const rect = el('rect', {
        x: X0 + run.from * unit,
        y: CPU_Y,
        width: 0,
        height: CPU_H,
        fill: colorOf(run.proc),
        stroke: pal.bg,
        'stroke-width': 1,
      });
      const label = el('text', {
        x: X0 + run.from * unit,
        y: CPU_Y + CPU_H / 2 + 4,
        'font-size': fontSizes.xs,
        fill: inkOnColor,
        'text-anchor': 'middle',
      });
      runLayer.append(rect, label);
      const made: Run = { proc: run.proc, from: run.from, to: run.to, rect, label, w: 0 };
      runs.push(made);
      const key = `run:${runs.length - 1}`;
      values.delete(key);
      place(key, 0);
      tween(key, (run.to - run.from) * unit, ms, (w) => {
        made.w = w;
        rect.setAttribute('width', String(w));
        runLabel(made);
      });
    };

    const markPreempt = (tick: number): void => {
      const x = X0 + tick * unit;
      markLayer.appendChild(
        el('line', { x1: x, x2: x, y1: CPU_Y - 4, y2: CPU_Y + CPU_H + 4, stroke: pal.danger, 'stroke-width': 2.5 }),
      );
    };

    /** 이번 판의 프로세스마다 돈 틱 자리 (id → 틱 목록) */
    const tickSlots = (): Map<string, number[]> => {
      const slots = new Map<string, number[]>();
      for (const run of runs) {
        const id = procAt(run.proc).id;
        const list = slots.get(id) ?? [];
        for (let k = run.from; k < run.to; k += 1) list.push(k);
        slots.set(id, list);
      }
      return slots;
    };

    const moveGhost = (cell: GhostCell, x: number, y: number, o: number, ms: number): void => {
      const key = `ghost:${cell.ordinal}:${cell.id}:${cell.rect.dataset.n ?? ''}`;
      const apply = (): void => {
        cell.rect.setAttribute('x', String(cell.x));
        cell.rect.setAttribute('y', String(cell.y));
        cell.rect.setAttribute('opacity', String(cell.o));
      };
      tween(`${key}:x`, x, ms, (v) => {
        cell.x = v;
        apply();
      });
      tween(`${key}:y`, y, ms, (v) => {
        cell.y = v;
        apply();
      });
      tween(`${key}:o`, o, ms, (v) => {
        cell.o = v;
        apply();
      });
    };

    const captionFor = (step: StageStep): string => {
      const parts: string[] = [];
      const arrived: string[] = [];
      const flushArrived = (): void => {
        if (arrived.length === 0) return;
        parts.push(t('caption.arrive', 'Arrived: {names}', { names: arrived.join(', ') }));
        arrived.length = 0;
      };
      for (const ev of step.events) {
        const name = nameOf(procAt(ev.proc).id);
        if (ev.kind === 'arrive') {
          arrived.push(name);
          continue;
        }
        flushArrived();
        if (ev.kind === 'finish') parts.push(t('caption.finish', 'Done: {name}', { name }));
        else if (ev.kind === 'dispatch') parts.push(t('caption.dispatch', 'On CPU: {name}', { name }));
        else if (ev.kind === 'preempt') {
          parts.push(
            t('caption.preempt', 'Preempted: {name} ({left} left) · by {by} ({byLeft} left)', {
              name,
              left: ev.left,
              by: nameOf(procAt(ev.by).id),
              byLeft: ev.byLeft,
            }),
          );
        } else if (ev.fromLevel === ev.toLevel) {
          parts.push(
            t('caption.demoteStay', 'Quantum used: {name} · stays on level {level}', { name, level: ev.toLevel + 1 }),
          );
        } else {
          parts.push(
            t('caption.demote', 'Quantum used: {name} · level {from} → {to}', {
              name,
              from: ev.fromLevel + 1,
              to: ev.toLevel + 1,
            }),
          );
        }
      }
      flushArrived();
      return parts.join(' / ');
    };

    const stage: SchedulingPolicyStage & ViewInstance = {
      beginRound(r: StageRound, ms: number): void {
        if (r.procs.length === 0) throw new Error('scheduling-policy-stage: 프로세스가 없다');
        // 앞 판의 CPU 토막을 틱 칸으로 갈라 앞 판 줄로 올린다
        for (const g of ghosts) g.rect.remove();
        ghosts = [];
        if (finished && round) {
          for (const run of runs) {
            const id = procAt(run.proc).id;
            const color = colorOf(run.proc);
            const before = ghosts.filter((g) => g.id === id).length;
            for (let k = run.from; k < run.to; k += 1) {
              ghostSeq += 1;
              const rect = el('rect', {
                x: X0 + k * unit,
                y: CPU_Y,
                width: unit,
                height: CPU_H,
                fill: color,
                stroke: pal.bg,
                'stroke-width': 1,
                opacity: 1,
              });
              rect.dataset.n = String(ghostSeq);
              ghostLayer.appendChild(rect);
              const cell: GhostCell = { id, ordinal: before + (k - run.from), rect, x: X0 + k * unit, y: CPU_Y, o: 1 };
              const key = `ghost:${cell.ordinal}:${cell.id}:${ghostSeq}`;
              place(`${key}:x`, cell.x);
              place(`${key}:y`, cell.y);
              place(`${key}:o`, 1);
              ghosts.push(cell);
              place(`${key}:h`, CPU_H);
              tween(`${key}:h`, GHOST_H, ms, (h) => rect.setAttribute('height', String(h)));
              moveGhost(cell, cell.x, GHOST_Y, 0.45, ms);
            }
          }
        }
        runLayer.replaceChildren();
        markLayer.replaceChildren();
        runs = [];
        if (finished && current) prev = current;
        finished = false;

        const sameProcs =
          round !== null &&
          round.procs.length === r.procs.length &&
          round.procs.every((p, i) => p.id === r.procs[i].id);
        round = r;
        colors = categorical(Math.max(MAX_ROWS_DEFAULT, r.procs.length), 'vivid');
        if (!axisEnd) {
          axisEnd = r.procs.reduce((s, p) => s + p.burst, Math.min(...r.procs.map((p) => p.arrive)));
          unit = Math.min(24, AXIS_W / axisEnd);
          drawAxis();
        }
        buildRows(r.procs);
        buildLanes(r);
        if (!sameProcs) buildChips(r.procs);
        else layoutChips({ last: false, from: 0, to: 0, events: [], run: null, queue: [], levels: [], running: -1, done: [], waits: [], totalWait: 0 }, ms);

        // 대기 막대 — 앞 판의 길이는 점선으로 남는다. 막대는 여기서 0 으로 보내지 않는다:
        // 걸음 1 이 곧바로 덮으므로, 앞 판의 길이에서 걸음 1 의 값으로 한 번에 줄어드는 것이 그 운동이다
        r.procs.forEach((p, i) => {
          // 일감이 바뀌면 같은 이름이라도 다른 프로세스다 — 앞 판의 대기를 견주지 않는다
          const before = prev?.workloadId === r.workload ? prev.waitsById.get(p.id) : undefined;
          setRowGhost(i, before === undefined ? 0 : before * unit, ms);
        });
        lastWaits = r.procs.map(() => 0);
        current = null;

        ghostLabel.textContent = prev ? t('label.previousRow', 'Previous: {policy} · {workload}', { policy: prev.policy, workload: prev.workload }) : '';
        title.textContent = t('caption.round', '{policy} · {workload}', { policy: r.policy, workload: workloadName(r.workload) });
        tickCaption.textContent = '';
        eventCaption.textContent = '';
        averageCaption.textContent = '';
        previousCaption.textContent = '';
        cursor.setAttribute('opacity', '0');
        place('cursor', X0);
      },

      async showStep(step: StageStep, ms: number): Promise<void> {
        if (!round) throw new Error('scheduling-policy-stage: 판이 시작하지 않았다');
        const r = round;
        if (step.waits.length !== r.procs.length) throw new Error('scheduling-policy-stage: 대기 수가 프로세스 수와 다르다');
        tickCaption.textContent =
          step.from === step.to
            ? t('caption.at', 'Tick {tick}', { tick: step.from })
            : t('caption.span', 'Tick {from} → {to}', { from: step.from, to: step.to });
        eventCaption.textContent = captionFor(step);
        for (const ev of step.events) if (ev.kind === 'preempt') markPreempt(step.from);
        if (step.run) growRun(step.run, ms);
        moveCursor(step.to, ms);
        layoutChips(step, ms);
        step.waits.forEach((w, i) => {
          setRowBar(i, w * unit, ms);
          rows[i].num.textContent = String(w);
        });
        lastWaits = step.waits.slice();

        if (step.last) {
          finished = true;
          const waitsById = new Map<string, number>();
          r.procs.forEach((p, i) => waitsById.set(p.id, lastWaits[i]));
          current = { policy: r.policy, workload: workloadName(r.workload), workloadId: r.workload, totalWait: step.totalWait, n: r.procs.length, waitsById };
          averageCaption.textContent = t('caption.average', 'Average wait: {avg}', { avg: avg2(step.totalWait, r.procs.length) });
          previousCaption.textContent = prev
            ? t('caption.previousAverage', 'Previous ({policy} · {workload}): {avg}', { policy: prev.policy, workload: prev.workload, avg: avg2(prev.totalWait, prev.n) })
            : '';
          // 앞 판의 칸이 새 판에서 같은 프로세스의 같은 번째 틱 자리로 내려앉는다
          const slots = tickSlots();
          for (const cell of ghosts) {
            const k = prev?.workloadId === r.workload ? slots.get(cell.id)?.[cell.ordinal] : undefined;
            if (k === undefined) {
              moveGhost(cell, cell.x, cell.y, 0, ms);
            } else {
              moveGhost(cell, X0 + k * unit, CPU_Y + (CPU_H - GHOST_H) / 2, 0.55, ms);
            }
          }
          // 대기의 점선이 앞 판의 길이에서 새 길이로
          r.procs.forEach((p, i) => {
            if (prev?.workloadId === r.workload && prev.waitsById.has(p.id)) setRowGhost(i, lastWaits[i] * unit, ms);
          });
        }
        await settle(ms);
      },

      clear(): void {
        finishAll();
        for (const g of ghosts) g.rect.remove();
        ghosts = [];
        runLayer.replaceChildren();
        markLayer.replaceChildren();
        runs = [];
        prev = null;
        current = null;
        finished = false;
        rows.forEach((row, i) => {
          values.set(`bar:${i}`, 0);
          values.set(`ghostbar:${i}`, 0);
          row.barW = 0;
          row.ghostW = 0;
          row.bar.setAttribute('width', '0');
          row.ghost.setAttribute('width', '0');
          row.ghost.setAttribute('opacity', '0');
          row.num.setAttribute('x', String(X0 + 6));
          row.num.textContent = '0';
        });
        chips.forEach((chip, i) => {
          chip.o = 0;
          values.set(`chip:${i}:o`, 0);
          chip.g.setAttribute('opacity', '0');
        });
        ghostLabel.textContent = '';
        tickCaption.textContent = '';
        eventCaption.textContent = '';
        averageCaption.textContent = '';
        previousCaption.textContent = '';
        cursor.setAttribute('opacity', '0');
      },

      destroy(): void {
        destroyed = true;
        anims.clear();
        if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
        frame = 0;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
    // 걸음 0 — 첫 판의 프로세스 목록과 빈 CPU 줄 · 빈 줄 패널을 마운트 때 그린다
    if (preview) {
      const wl = preview.workloads[preview.workload];
      const policyName = preview.policies[preview.policy];
      round = {
        policy: policyName.toUpperCase(),
        workload: wl.id,
        procs: wl.procs,
        quanta: preview.quanta,
        mlfq: policyName === 'mlfq',
      };
      colors = categorical(Math.max(MAX_ROWS_DEFAULT, wl.procs.length), 'vivid');
      buildRows(wl.procs);
      buildLanes(round);
      buildChips(wl.procs);
      title.textContent = t('caption.round', '{policy} · {workload}', { policy: round.policy, workload: workloadName(wl.id) });
    }
    return stage;
  },
};
