/**
 * raft-stage — 시간 축 위로 돌아오는 응답과 그 위를 옮겨 가는 과반 문턱선.
 *
 * - 윗줄: 노드 S1 … S7. S1 은 0 ms 자리, 팔로워는 제 왕복 ms 자리에 선다 (응답의 ms 가 자리)
 * - 두 레인: 선출(RequestVote) · 쓰기(AppendEntries). 응답 하나가 노드에서 레인의 시간 축으로 내려와 박히고,
 *   왼쪽 세는 칸이 한 칸 오른다. 레인의 시각 커서가 그 응답의 ms 로 옮겨 간다
 * - 과반 문턱선: 과반째 응답이 서는 자리(ms)를 세로로 긋는다. 노드 수를 돌리면 옆으로 옮겨 가고,
 *   그 자리의 노드가 멈춰 있으면 끊긴 선(점선 · 위험 색)이 된다
 *
 * 무대는 셈하지 않는다 — 과반 · 문턱 자리 · 문턱 노드가 살았는지 · 개수는 모두 payload 로 받는다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 440;
/** 0 ms 의 가로 자리와 ms 당 픽셀 */
const X0 = 160;
const MS_PX = 4.3;
const NODE_Y = 46;
const NODE_R = 17;
const LOG_Y = 90;
const LANE_TOP = { vote: 132, copy: 236 } as const;
const LANE_BASE = { vote: 206, copy: 310 } as const;
const DOT_R = 7;
const CELL = 12;
const CELL_GAP = 2;
const MAX_NODES = 7;
const CAPTION_Y = 372;
const SUMMARY_Y = 402;

export type Lane = 'vote' | 'copy';

export type RoundView = {
  n: number;
  nodes: string[];
  down: string[];
  stopped: number;
  majority: number;
  tolerance: number;
  term: number;
  rtt: number[];
  thresholdMs: number;
  thresholdNode: string;
  thresholdAlive: boolean;
  command: string;
};
export type CandidateView = { node: string; term: number; votes: number; n: number; requested: string[] };
export type ResponseView = {
  lane: Lane;
  from: string;
  ms: number;
  count: number;
  n: number;
  majority: number;
  reached: boolean;
  leader: string;
  term: number;
};
export type OverflowView = { lane: Lane; from: string[]; ms: number[]; count: number; n: number };
export type WriteView = { node: string; command: string; index: number; term: number; count: number; n: number };
export type ShortView = { votes: number; n: number; majority: number };
export type DoneView = {
  leader: string;
  electMs: number;
  commitMs: number;
  count: number;
  n: number;
  missing: string[];
};

/** projector 가 부르는 무대의 표면 */
export type RaftStage = {
  round(p: RoundView, dur: number): void;
  noCandidate(p: { votes: number; n: number }, dur: number): void;
  candidate(p: CandidateView, dur: number): void;
  response(p: ResponseView, dur: number): void;
  overflow(p: OverflowView, dur: number): void;
  noMajority(p: ShortView, dur: number): void;
  write(p: WriteView, dur: number): void;
  done(p: DoneView, dur: number): void;
};

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const xOf = (ms: number) => X0 + ms * MS_PX;

/** 옮김 — 지금 자리에서 목표 자리로 dur 동안 */
function moveTo(g: SVGGElement, x: number, y: number, dur: number): void {
  g.style.transition = `transform ${Math.max(0, Math.round(dur))}ms ease-in-out, opacity ${Math.max(0, Math.round(dur))}ms ease-in-out`;
  g.style.transform = `translate(${x}px, ${y}px)`;
}

/** 자리 잡기 — 옮김 없이 놓는다 */
function placeAt(g: SVGGElement, x: number, y: number): void {
  g.style.transition = 'none';
  g.style.transform = `translate(${x}px, ${y}px)`;
  void g.getBoundingClientRect();
}

type NodeSlot = {
  g: SVGGElement;
  circle: SVGCircleElement;
  name: SVGTextElement;
  role: SVGTextElement;
  slash: SVGLineElement;
  logRect: SVGRectElement;
  logText: SVGTextElement;
  x: number;
};

type LaneParts = {
  title: SVGTextElement;
  count: SVGTextElement;
  cells: SVGRectElement[];
  cellMark: SVGLineElement;
  dots: SVGGElement;
  cursor: SVGGElement;
  mark: SVGTextElement;
  ticks: SVGGElement;
};

export const raftStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);

    const text = (attrs: Attrs, parent: Element, size: string = fontSizes.sm): SVGTextElement =>
      el('text', { 'font-family': fonts.body, 'font-size': size, fill: c.text, ...attrs }, parent);

    // ── 왼쪽 머리: term · 리더
    const termText = text({ x: 14, y: 40, 'font-weight': 600 }, root, fontSizes.md);
    const leaderText = text({ x: 14, y: 60, fill: c.textMuted }, root);

    // ── 레인
    const lanes = {} as Record<Lane, LaneParts>;
    for (const lane of ['vote', 'copy'] as const) {
      const top = LANE_TOP[lane];
      const base = LANE_BASE[lane];
      el('rect', { x: 8, y: top - 8, width: W - 16, height: base - top + 30, rx: 6, fill: c.bgSubtle }, root);
      const title = text({ x: 16, y: top + 10, 'font-weight': 600 }, root);
      const count = text({ x: 16, y: top + 32 }, root, fontSizes.md);
      const cellsG = el('g', {}, root);
      const cells: SVGRectElement[] = [];
      for (let i = 0; i < MAX_NODES; i++) {
        cells.push(
          el(
            'rect',
            {
              x: 16 + i * (CELL + CELL_GAP),
              y: top + 42,
              width: CELL,
              height: CELL,
              rx: 2,
              fill: c.bg,
              stroke: c.border,
              opacity: 0,
            },
            cellsG,
          ),
        );
      }
      const cellMark = el('line', { x1: 0, x2: 0, y1: top + 38, y2: top + 58, stroke: c.accent, 'stroke-width': 3 }, cellsG);
      cellMark.style.transition = 'transform 400ms ease-in-out';
      cellMark.style.opacity = '0';
      // 시간 축
      el('line', { x1: X0, x2: W - 20, y1: base, y2: base, stroke: c.border, 'stroke-width': 1.5 }, root);
      const ticks = el('g', {}, root);
      const cursor = el('g', {}, root);
      el('line', { x1: 0, x2: 0, y1: top - 4, y2: base + 4, stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 3' }, cursor);
      placeAt(cursor, X0, 0);
      const dots = el('g', {}, root);
      const mark = text({ x: 0, y: top + 6, 'font-weight': 600, fill: c.success }, root);
      lanes[lane] = { title, count, cells, cellMark, dots, cursor, mark, ticks };
    }
    lanes.vote.title.textContent = t('label.voteLane', 'Election · RequestVote');
    lanes.copy.title.textContent = t('label.copyLane', 'Write · AppendEntries');

    // ── 과반 문턱선 (두 레인을 가로지른다)
    const threshold = el('g', {}, root);
    const thresholdLine = el(
      'line',
      { x1: 0, x2: 0, y1: NODE_Y - NODE_R - 6, y2: LANE_BASE.copy + 10, stroke: c.accent, 'stroke-width': 3 },
      threshold,
    );
    const thresholdLabel = text({ x: 0, y: LANE_BASE.copy + 36, 'text-anchor': 'middle', 'font-weight': 600 }, threshold);
    threshold.style.opacity = '0';
    placeAt(threshold, X0, 0);

    // ── 노드 줄 (가장 큰 사다리 값 일곱 자리를 처음부터 잡는다)
    const nodeLayer = el('g', {}, root);
    const slots: NodeSlot[] = [];
    for (let i = 0; i < MAX_NODES; i++) {
      const g = el('g', {}, nodeLayer);
      const circle = el('circle', { cx: 0, cy: NODE_Y, r: NODE_R, fill: c.itemDefault, stroke: c.border, 'stroke-width': 1.5 }, g);
      const name = text({ x: 0, y: NODE_Y + 4, 'text-anchor': 'middle', 'font-weight': 600 }, g);
      const slash = el(
        'line',
        { x1: -NODE_R, y1: NODE_Y + NODE_R, x2: NODE_R, y2: NODE_Y - NODE_R, stroke: c.danger, 'stroke-width': 2, opacity: 0 },
        g,
      );
      const role = text({ x: 0, y: NODE_Y + NODE_R + 14, 'text-anchor': 'middle', fill: c.textMuted }, g, fontSizes.xs);
      const logRect = el('rect', { x: -32, y: LOG_Y, width: 64, height: 20, rx: 3, fill: c.bg, stroke: c.border, 'stroke-dasharray': '3 2' }, g);
      const logText = el(
        'text',
        { x: 0, y: LOG_Y + 14, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text },
        g,
      );
      g.style.opacity = '0';
      placeAt(g, X0, 0);
      slots.push({ g, circle, name, role, slash, logRect, logText, x: X0 });
    }

    // ── 캡션
    const caption = text({ x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'font-weight': 600 }, root, fontSizes.md);
    const summary = text({ x: W / 2, y: SUMMARY_Y, 'text-anchor': 'middle', fill: c.textMuted }, root);

    // ── 판 상태 (그림의 그림자 — 셈이 아니다)
    let lanesTerm = 0;
    let lanesCommand = '';
    let roundNodes: string[] = [];
    let downSet = new Set<string>();

    const slotOf = (id: string): NodeSlot => {
      const i = roundNodes.indexOf(id);
      const s = slots[i];
      if (i < 0 || !s) throw new Error(`raft-stage: 모르는 노드 ${id}`);
      return s;
    };

    /** 세는 칸의 색 — 이미 찬 칸은 제 색을 지키고 새로 찬 칸만 color 로 */
    const cellFill: Record<Lane, string[]> = { vote: [], copy: [] };
    const fillCells = (lane: Lane, count: number, n: number, color: string) => {
      const parts = lanes[lane];
      const fills = cellFill[lane];
      while (fills.length > count) fills.pop();
      while (fills.length < count) fills.push(color);
      parts.cells.forEach((cell, i) => {
        cell.style.transition = 'fill 300ms ease-in-out, opacity 300ms ease-in-out';
        cell.setAttribute('opacity', i < n ? '1' : '0');
        cell.style.opacity = i < n ? '1' : '0';
        const f = fills[i];
        cell.setAttribute('fill', f === undefined ? c.bg : f);
      });
    };

    /** 응답 점 하나 — 노드 자리에서 레인의 시간 축으로 내려온다 */
    const dropDot = (lane: Lane, fromX: number, ms: number, color: string, dur: number) => {
      const g = el('g', {}, lanes[lane].dots);
      el('circle', { cx: 0, cy: 0, r: DOT_R, fill: color, stroke: c.bg, 'stroke-width': 1.5 }, g);
      g.setAttribute('data-x', String(xOf(ms)));
      placeAt(g, fromX, NODE_Y);
      moveTo(g, xOf(ms), LANE_BASE[lane] - DOT_R - 2, dur);
    };

    const moveCursor = (lane: Lane, ms: number, dur: number) => moveTo(lanes[lane].cursor, xOf(ms), 0, dur);

    const setRole = (id: string, key: 'candidate' | 'leader' | 'follower' | 'stopped') => {
      const s = slotOf(id);
      if (key === 'candidate') s.role.textContent = t('role.candidate', 'candidate');
      else if (key === 'leader') s.role.textContent = t('role.leader', 'leader');
      else if (key === 'follower') s.role.textContent = t('role.follower', 'follower');
      else s.role.textContent = t('role.stopped', 'stopped');
    };

    const fillLog = (id: string, term: number, command: string) => {
      const s = slotOf(id);
      s.logText.textContent = `(${term}, ${command})`;
      s.logRect.setAttribute('stroke-dasharray', '');
      s.logRect.setAttribute('fill', c.bgSubtle);
      s.logRect.setAttribute('stroke', c.primary);
    };

    const instance: RaftStage & ViewInstance = {
      round(p, dur) {
        if (p.nodes.length !== p.n) throw new Error('raft-stage: 노드 목록 길이가 n 과 다르다');
        if (p.rtt.length !== p.n - 1) throw new Error('raft-stage: 왕복 ms 길이가 n − 1 과 다르다');
        roundNodes = p.nodes;
        downSet = new Set(p.down);

        // 앞 판의 응답 점은 제 노드로 되돌아 올라간다
        for (const lane of ['vote', 'copy'] as const) {
          const parts = lanes[lane];
          const old = Array.from(parts.dots.children) as SVGGElement[];
          for (const g of old) {
            const xs = g.getAttribute('data-x');
            if (xs === null) throw new Error('raft-stage: 응답 점의 자리가 없다');
            const x = Number(xs);
            moveTo(g, x, NODE_Y, dur);
            g.style.opacity = '0';
          }
          later(dur + 20, () => old.forEach((g) => g.remove()));
          moveCursor(lane, 0, dur);
          parts.mark.textContent = '';
          parts.count.textContent = lane === 'vote' ? t('label.votes', 'Votes {count} / {n}', { count: 0, n: p.n }) : t('label.copies', 'Copies {count} / {n}', { count: 0, n: p.n });
          fillCells(lane, 0, p.n, c.bg);
          const markX = 16 + p.majority * (CELL + CELL_GAP) - CELL_GAP / 2 - 1;
          parts.cellMark.style.transition = `transform ${Math.round(dur)}ms ease-in-out`;
          parts.cellMark.style.transform = `translate(${markX}px, 0px)`;
          parts.cellMark.style.opacity = '1';
          // 눈금 — 이 판의 노드 자리
          parts.ticks.textContent = '';
          const tickMs = [0, ...p.rtt];
          for (const ms of tickMs) {
            el('line', { x1: xOf(ms), x2: xOf(ms), y1: LANE_BASE[lane] - 4, y2: LANE_BASE[lane] + 4, stroke: c.border }, parts.ticks);
            text(
              { x: xOf(ms), y: LANE_BASE[lane] + 17, 'text-anchor': 'middle', fill: c.textMuted },
              parts.ticks,
              fontSizes.xs,
            ).textContent = t('label.ms', '{ms} ms', { ms });
          }
        }

        // 노드 — 있는 자리에 서고, 멈춘 것은 꺼진다
        slots.forEach((s, i) => {
          const id = p.nodes[i];
          if (id === undefined) {
            s.g.style.transition = `opacity ${Math.round(dur)}ms ease-in-out`;
            s.g.style.opacity = '0';
            return;
          }
          const ms = i === 0 ? 0 : p.rtt[i - 1];
          if (ms === undefined) throw new Error(`raft-stage: ${id} 의 왕복 ms 가 없다`);
          const x = xOf(ms);
          if (s.g.style.opacity === '0') placeAt(s.g, x, 0);
          moveTo(s.g, x, 0, dur);
          s.g.style.opacity = '1';
          s.x = x;
          s.name.textContent = id;
          const down = downSet.has(id);
          s.circle.style.transition = `fill ${Math.round(dur)}ms ease-in-out`;
          s.circle.setAttribute('fill', down ? c.bgSubtle : c.itemDefault);
          s.circle.setAttribute('stroke', down ? c.textMuted : c.border);
          s.name.setAttribute('fill', down ? c.textMuted : c.text);
          s.slash.setAttribute('opacity', down ? '1' : '0');
          s.role.textContent = down ? t('role.stopped', 'stopped') : t('role.follower', 'follower');
          s.logText.textContent = '';
          s.logRect.setAttribute('stroke-dasharray', '3 2');
          s.logRect.setAttribute('fill', c.bg);
          s.logRect.setAttribute('stroke', c.border);
        });

        // 과반 문턱선 — 과반째 응답의 자리로 옮겨 간다
        threshold.style.opacity = '1';
        moveTo(threshold, xOf(p.thresholdMs), 0, dur);
        threshold.style.transition += `, opacity ${Math.round(dur)}ms`;
        thresholdLine.setAttribute('stroke', p.thresholdAlive ? c.accent : c.danger);
        thresholdLine.setAttribute('stroke-dasharray', p.thresholdAlive ? '' : '6 4');
        thresholdLabel.setAttribute('fill', p.thresholdAlive ? c.text : c.danger);
        thresholdLabel.textContent = p.thresholdAlive
          ? t('label.threshold', 'Majority {majority} · {node}', { majority: p.majority, node: p.thresholdNode })
          : t('label.thresholdBroken', 'Majority {majority} · {node} stopped', { majority: p.majority, node: p.thresholdNode });

        termText.textContent = t('label.term', 'term {term}', { term: p.term });
        leaderText.textContent = t('label.noLeader', 'No leader');
        caption.textContent =
          p.down.length > 0
            ? t('caption.start', '{n} nodes, stopped: {down} — no leader, term {term}', {
                n: p.n,
                down: p.down.join(' · '),
                term: p.term,
              })
            : t('caption.startNone', '{n} nodes, none stopped — no leader, term {term}', { n: p.n, term: p.term });
        summary.textContent = t('label.summary', 'Nodes {n} · majority {majority} · survives {tolerance} stopped · stopped now {stopped}', {
          n: p.n,
          majority: p.majority,
          tolerance: p.tolerance,
          stopped: p.stopped,
        });
      },

      noCandidate(p) {
        lanes.vote.count.textContent = t('label.votes', 'Votes {count} / {n}', { count: p.votes, n: p.n });
        lanes.vote.mark.setAttribute('fill', c.danger);
        lanes.vote.mark.setAttribute('x', String(xOf(0) + 12));
        lanes.vote.mark.textContent = t('label.cut', 'No majority');
        lanes.copy.mark.setAttribute('fill', c.danger);
        lanes.copy.mark.setAttribute('x', String(xOf(0) + 12));
        lanes.copy.mark.textContent = t('label.noWrite', 'No write');
        caption.textContent = t('caption.noCandidate', 'No node to wake — votes {votes} / {n} · no leader · no write', {
          votes: p.votes,
          n: p.n,
        });
      },

      candidate(p, dur) {
        const s = slotOf(p.node);
        setRole(p.node, 'candidate');
        s.circle.setAttribute('fill', c.itemComparing);
        termText.textContent = t('label.term', 'term {term}', { term: p.term });
        dropDot('vote', s.x, 0, c.itemComparing, dur);
        fillCells('vote', p.votes, p.n, c.itemComparing);
        lanes.vote.count.textContent = t('label.votes', 'Votes {count} / {n}', { count: p.votes, n: p.n });
        caption.textContent = t('caption.candidate', '{node} is candidate, term {term} — votes {votes} / {n}, RequestVote sent to {sent}', {
          node: p.node,
          term: p.term,
          votes: p.votes,
          n: p.n,
          sent: p.requested.join(' · '),
        });
      },

      response(p, dur) {
        const s = slotOf(p.from);
        const color = p.reached ? c.success : c.itemComparing;
        dropDot(p.lane, s.x, p.ms, color, dur);
        moveCursor(p.lane, p.ms, dur);
        fillCells(p.lane, p.count, p.n, color);
        const parts = lanes[p.lane];
        if (p.lane === 'vote') {
          parts.count.textContent = t('label.votes', 'Votes {count} / {n}', { count: p.count, n: p.n });
        } else {
          parts.count.textContent = t('label.copies', 'Copies {count} / {n}', { count: p.count, n: p.n });
          fillLog(p.from, p.term, lanesCommand);
        }
        if (!p.reached) {
          caption.textContent =
            p.lane === 'vote'
              ? t('caption.vote', '{ms} ms: vote from {from} — votes {count} / {n}', { ms: p.ms, from: p.from, count: p.count, n: p.n })
              : t('caption.copy', '{ms} ms: {from} acknowledges the copy — copies {count} / {n}', {
                  ms: p.ms,
                  from: p.from,
                  count: p.count,
                  n: p.n,
                });
          return;
        }
        parts.mark.setAttribute('fill', c.success);
        parts.mark.setAttribute('x', String(xOf(p.ms) + 10));
        thresholdLine.setAttribute('stroke', c.success);
        if (p.lane === 'vote') {
          setRole(p.leader, 'leader');
          slotOf(p.leader).circle.setAttribute('fill', c.itemActive);
          leaderText.textContent = t('label.leaderIs', 'Leader {node}', { node: p.leader });
          parts.mark.textContent = t('label.elected', 'Leader · {ms} ms', { ms: p.ms });
          caption.textContent = t('caption.voteMajority', '{ms} ms: vote from {from} — votes {count} / {n}, majority {majority} reached · leader {leader}', {
            ms: p.ms,
            from: p.from,
            count: p.count,
            n: p.n,
            majority: p.majority,
            leader: p.leader,
          });
        } else {
          parts.mark.textContent = t('label.committed', 'Committed · {ms} ms', { ms: p.ms });
          caption.textContent = t('caption.copyMajority', '{ms} ms: {from} acknowledges the copy — copies {count} / {n}, majority {majority} reached · committed', {
            ms: p.ms,
            from: p.from,
            count: p.count,
            n: p.n,
            majority: p.majority,
          });
        }
      },

      overflow(p, dur) {
        if (p.from.length !== p.ms.length) throw new Error('raft-stage: 넘치는 응답의 노드와 ms 길이가 다르다');
        p.from.forEach((id, k) => {
          const ms = p.ms[k];
          if (ms === undefined) throw new Error('raft-stage: 넘치는 응답의 ms 가 없다');
          dropDot(p.lane, slotOf(id).x, ms, c.itemSorted, dur);
          if (p.lane === 'copy') fillLog(id, lanesTerm, lanesCommand);
        });
        const lastMs = p.ms[p.ms.length - 1];
        if (lastMs === undefined) throw new Error('raft-stage: 넘치는 응답이 비었다');
        moveCursor(p.lane, lastMs, dur);
        fillCells(p.lane, p.count, p.n, c.itemSorted);
        const from = p.from.join(' · ');
        if (p.lane === 'vote') {
          lanes.vote.count.textContent = t('label.votes', 'Votes {count} / {n}', { count: p.count, n: p.n });
          caption.textContent = t('caption.voteOverflow', 'Votes after the majority: {from} — votes {count} / {n}', { from, count: p.count, n: p.n });
        } else {
          lanes.copy.count.textContent = t('label.copies', 'Copies {count} / {n}', { count: p.count, n: p.n });
          caption.textContent = t('caption.copyOverflow', 'Replies after the majority: {from} — copies {count} / {n}', { from, count: p.count, n: p.n });
        }
      },

      noMajority(p) {
        thresholdLine.setAttribute('stroke', c.danger);
        lanes.vote.mark.setAttribute('fill', c.danger);
        lanes.vote.mark.setAttribute('x', String(xOf(0) + 12));
        lanes.vote.mark.textContent = t('label.cut', 'No majority');
        lanes.copy.mark.setAttribute('fill', c.danger);
        lanes.copy.mark.setAttribute('x', String(xOf(0) + 12));
        lanes.copy.mark.textContent = t('label.noWrite', 'No write');
        caption.textContent = t('caption.noMajority', 'Votes {votes} / {n} — short of majority {majority} · no leader · no write', {
          votes: p.votes,
          n: p.n,
          majority: p.majority,
        });
      },

      write(p, dur) {
        const s = slotOf(p.node);
        lanesTerm = p.term;
        lanesCommand = p.command;
        fillLog(p.node, p.term, p.command);
        thresholdLine.setAttribute('stroke', c.accent);
        dropDot('copy', s.x, 0, c.itemComparing, dur);
        moveCursor('copy', 0, dur);
        fillCells('copy', p.count, p.n, c.itemComparing);
        lanes.copy.count.textContent = t('label.copies', 'Copies {count} / {n}', { count: p.count, n: p.n });
        caption.textContent = t('caption.write', 'Write {command} → {node} log slot {index} (term {term}) — copies {count} / {n}', {
          command: p.command,
          node: p.node,
          index: p.index,
          term: p.term,
          count: p.count,
          n: p.n,
        });
      },

      done(p) {
        const vars = { leader: p.leader, elect: p.electMs, commit: p.commitMs, count: p.count, n: p.n };
        caption.textContent =
          p.missing.length > 0
            ? t('caption.doneMissing', 'Done — leader {leader} · elected {elect} ms · committed {commit} ms · copies {count} / {n} · no copy: {missing}', {
                ...vars,
                missing: p.missing.join(' · '),
              })
            : t('caption.done', 'Done — leader {leader} · elected {elect} ms · committed {commit} ms · copies {count} / {n}', vars);
      },

      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
    void container;
    return instance;
  },
};
