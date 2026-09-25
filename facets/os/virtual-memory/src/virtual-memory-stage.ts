/**
 * virtual-memory stage — 틱 띠 둘(CPU · 디스크) · 프레임 열둘과 디스크 자리 · 이용률 곡선.
 *
 * 운동
 *   - 틱 띠: 새 판이 시작하면 앞 판의 칸은 흐려진 채 남고, 걸음이 그 틱을 밟을 때 같은 칸이 새 판의 모습으로 바뀐다.
 *     CPU 칸은 아래 끝(디스크 줄 쪽)을 축으로 줄어들어 폴트 표지로 내려앉거나 다시 차오르고, 디스크 칸은 위 끝을 축으로
 *     아래로 메워지거나 빈다. 칸마다 틱 차례대로 시작해 걸음 창이 훑는 것처럼 보인다
 *   - 프레임: 올라온 페이지는 디스크 자리에서 제 프레임으로 올라와 앉고, 밀려난 페이지는 디스크 자리로 내려간다
 *   - 곡선: 작업 집합이 바뀌면 점들이 새 값으로 오르내리고, 지금 판의 표지가 옆 점으로 미끄러진다.
 *     지금 판의 점은 걸음마다 지금까지의 이용률로 자란다
 * 운동 길이는 projector 가 부를 때마다 속도에서 셈해 넘긴다 (ms).
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { StageChunk, StageRunStart, VirtualMemoryStage } from './projector.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 470;

const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);

/** 가로 자리 — 왼쪽 이름 칸 뒤로 띠 · 프레임이 같은 폭을 쓴다. */
const LEFT = MD * 6;
const RIGHT = W - SM;
const SPAN = RIGHT - LEFT;

/** 세로 자리 — 모두 글자 크기에서 잡는다. */
const CAPTION_Y = MD * 1.3;
const LANE_H = MD * 2;
const CPU_Y = CAPTION_Y + MD;
const DISK_Y = CPU_Y + LANE_H + 2;
const AXIS_Y = DISK_Y + LANE_H + XS * 1.3;
const LEGEND_Y = AXIS_Y + XS * 1.9;
const FRAME_NO_Y = LEGEND_Y + SM * 2.6;
const FRAME_Y = FRAME_NO_Y + XS * 0.6;
const FRAME_H = MD * 2.4;
const PARK_Y = FRAME_Y + FRAME_H + SM * 1.4;
const PARK_H = FRAME_H;
const CURVE_TITLE_Y = PARK_Y + PARK_H + MD * 2.2;
const PLOT_TOP = CURVE_TITLE_Y + MD * 1.4;
const PLOT_BOTTOM = H - SM * 4;
const PLOT_X0 = LEFT + SM * 2;
const PLOT_X1 = LEFT + SPAN * 0.62;
const ROW1_Y = PLOT_BOTTOM + SM * 1.5;
const ROW2_Y = ROW1_Y + SM * 1.4;

/** 폴트 칸의 남은 높이 몫 — 줄어든 칸이 디스크 줄 쪽 끝에 붙어 남는다. */
const FAULT_SCALE = 0.3;
/** 한 걸음 안에서 칸 · 페이지가 출발을 나눠 갖는 몫과 저마다 움직이는 몫. */
const LEAD = 0.55;
const MOVE = 0.45;

type Cell = { cpu: SVGRectElement; disk: SVGRectElement };
type Chip = { g: SVGGElement };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export const virtualMemoryStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const procColors = categorical(5, 'vivid');
    const procColor = (i: number): string => {
      const col = procColors[i];
      if (col === undefined) throw new Error(`virtual-memory stage: 프로세스 색인 ${i} 에 색이 없다`);
      return col;
    };

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const doomed = new Set<SVGGElement>();
    let destroyed = false;

    const root = el('g', {});
    svg.appendChild(root);

    // ── 캡션
    const caption = el('text', { x: 0, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': MD, fill: c.text });
    root.appendChild(caption);

    // ── 틱 띠 바탕
    const laneLabel = (y: number, text: string): void => {
      const e = el('text', { x: LEFT - SM * 0.6, y: y + LANE_H / 2 + SM * 0.35, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': SM, fill: c.textMuted });
      e.textContent = text;
      root.appendChild(e);
    };
    laneLabel(CPU_Y, t('label.cpu', 'CPU'));
    laneLabel(DISK_Y, t('label.disk', 'Disk'));
    root.appendChild(el('rect', { x: LEFT, y: CPU_Y, width: SPAN, height: LANE_H, fill: c.bgSubtle }));
    root.appendChild(el('rect', { x: LEFT, y: DISK_Y, width: SPAN, height: LANE_H, fill: c.bgSubtle }));
    const windowRect = el('rect', { x: 0, y: CPU_Y - 3, width: 0, height: DISK_Y + LANE_H - CPU_Y + 6, fill: 'none', stroke: c.primary, 'stroke-width': 1.5, rx: 3 });
    windowRect.style.opacity = '0';
    const cellLayer = el('g', {});
    root.appendChild(cellLayer);
    root.appendChild(windowRect);
    const axisLayer = el('g', {});
    root.appendChild(axisLayer);
    const legendLayer = el('g', {});
    root.appendChild(legendLayer);

    // ── 프레임 · 디스크 자리
    const framesLabel = el('text', { x: LEFT - SM * 0.6, y: FRAME_Y + FRAME_H / 2 + SM * 0.35, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': SM, fill: c.textMuted });
    framesLabel.textContent = t('label.frames', 'Frames');
    root.appendChild(framesLabel);
    const parkLabel = el('text', { x: LEFT - SM * 0.6, y: PARK_Y + PARK_H / 2 + SM * 0.35, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': SM, fill: c.textMuted });
    parkLabel.textContent = t('label.disk', 'Disk');
    root.appendChild(parkLabel);
    root.appendChild(el('rect', { x: LEFT, y: PARK_Y, width: SPAN, height: PARK_H, fill: c.bgSubtle, rx: 4 }));
    const frameLayer = el('g', {});
    root.appendChild(frameLayer);
    const chipLayer = el('g', {});
    root.appendChild(chipLayer);

    // ── 곡선
    const curveTitle = el('text', { x: LEFT, y: CURVE_TITLE_Y, 'font-family': fonts.body, 'font-size': SM, fill: c.textMuted });
    curveTitle.textContent = t('label.curve', 'CPU use (%)');
    root.appendChild(curveTitle);
    const plotY = (pct: number): number => PLOT_BOTTOM - ((PLOT_BOTTOM - PLOT_TOP) * pct) / 100;
    for (const g of [0, 25, 50, 75, 100]) {
      root.appendChild(el('line', { x1: PLOT_X0, x2: PLOT_X1, y1: plotY(g), y2: plotY(g), stroke: c.border, 'stroke-width': 1 }));
      const lab = el('text', { x: PLOT_X0 - SM * 0.5, y: plotY(g) + XS * 0.35, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': XS, fill: c.textMuted });
      lab.textContent = String(g);
      root.appendChild(lab);
    }
    const rowLabel = (y: number, text: string): void => {
      const e = el('text', { x: PLOT_X1 + SM * 1.5, y, 'font-family': fonts.body, 'font-size': XS, fill: c.textMuted });
      e.textContent = text;
      root.appendChild(e);
    };
    rowLabel(ROW1_Y, t('label.procAxis', 'Processes'));
    rowLabel(ROW2_Y, t('label.sumAxis', 'Working set total'));
    const curveLayer = el('g', {});
    root.appendChild(curveLayer);
    const line = el('polyline', { points: '', fill: 'none', stroke: c.primary, 'stroke-width': 2 });
    curveLayer.appendChild(line);
    const marker = el('circle', { cx: 0, cy: 0, r: 9, fill: 'none', stroke: c.accent, 'stroke-width': 2.5 });
    marker.style.opacity = '0';
    curveLayer.appendChild(marker);

    // ── 상태
    let cells: Cell[] = [];
    let ticks = 0;
    let chunkTicks = 0;
    let frameCount = 0;
    let frameX: number[] = [];
    let frameW = 0;
    let resident: (Chip | null)[] = [];
    let ladder: number[] = [];
    let dots: { dot: SVGCircleElement; value: SVGTextElement; row1: SVGTextElement; row2: SVGTextElement }[] = [];
    let shownVals: number[] = [];
    let shownMarker = -1;
    let targetVals: number[] = [];
    let targetMarker = -1;
    let currentIdx = -1;

    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    const setMotion = (e: SVGElement, dur: number, delay: number): void => {
      if (isInstant() || dur <= 0) {
        e.style.transition = 'none';
        return;
      }
      e.style.transition = `transform ${dur}ms ease-in-out ${delay}ms, fill ${dur}ms ease-in-out ${delay}ms, opacity ${dur}ms ease-in-out ${delay}ms`;
    };

    const buildStrips = (): void => {
      cellLayer.textContent = '';
      axisLayer.textContent = '';
      cells = [];
      const w = SPAN / ticks;
      for (let k = 0; k < ticks; k += 1) {
        const x = LEFT + k * w;
        const cpu = el('rect', { x: x + 0.3, y: CPU_Y, width: Math.max(0.5, w - 0.6), height: LANE_H, fill: c.itemDefault });
        cpu.style.transformBox = 'fill-box';
        cpu.style.transformOrigin = '50% 100%';
        cpu.style.transform = 'scaleY(0)';
        const disk = el('rect', { x: x + 0.3, y: DISK_Y, width: Math.max(0.5, w - 0.6), height: LANE_H, fill: c.itemDefault });
        disk.style.transformBox = 'fill-box';
        disk.style.transformOrigin = '50% 0%';
        disk.style.transform = 'scaleY(0)';
        cellLayer.appendChild(cpu);
        cellLayer.appendChild(disk);
        cells.push({ cpu, disk });
      }
      for (let k = 0; k <= ticks; k += chunkTicks) {
        const lab = el('text', { x: LEFT + k * w, y: AXIS_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': XS, fill: c.textMuted });
        lab.textContent = String(k);
        axisLayer.appendChild(lab);
      }
      const tickLab = el('text', { x: LEFT - SM * 0.6, y: AXIS_Y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': XS, fill: c.textMuted });
      tickLab.textContent = t('label.tick', 'Tick');
      axisLayer.appendChild(tickLab);
    };

    const buildFrames = (): void => {
      frameLayer.textContent = '';
      for (const ch of resident) ch?.g.remove();
      const gap = SM * 0.5;
      frameW = (SPAN - gap * (frameCount - 1)) / frameCount;
      frameX = [];
      resident = new Array<Chip | null>(frameCount).fill(null);
      for (let f = 0; f < frameCount; f += 1) {
        const x = LEFT + f * (frameW + gap);
        frameX.push(x);
        frameLayer.appendChild(el('rect', { x, y: FRAME_Y, width: frameW, height: FRAME_H, fill: 'none', stroke: c.border, 'stroke-width': 1, rx: 4 }));
        const no = el('text', { x: x + frameW / 2, y: FRAME_NO_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': XS, fill: c.textMuted });
        no.textContent = String(f);
        frameLayer.appendChild(no);
      }
    };

    const buildLegend = (names: string[]): void => {
      legendLayer.textContent = '';
      let x = LEFT;
      const sw = SM * 0.9;
      const item = (fill: string, text: string): void => {
        legendLayer.appendChild(el('rect', { x, y: LEGEND_Y - sw + 1, width: sw, height: sw, fill, stroke: c.border, 'stroke-width': 1, rx: 2 }));
        const lab = el('text', { x: x + sw + SM * 0.4, y: LEGEND_Y, 'font-family': fonts.body, 'font-size': XS, fill: c.text });
        lab.textContent = text;
        legendLayer.appendChild(lab);
        x += sw + SM * 0.4 + text.length * XS * 0.62 + SM * 1.4;
      };
      names.forEach((nm, i) => item(procColor(i), nm.toUpperCase()));
      item(c.danger, t('label.fault', 'Fault'));
      item(c.bgSubtle, t('label.idle', 'Idle'));
    };

    const pctText = (v: number): string => t('label.pct', '{pct}%', { pct: v });

    const buildCurve = (sums: number[], frameTotal: number): void => {
      for (const d of dots) {
        d.dot.remove();
        d.value.remove();
        d.row1.remove();
        d.row2.remove();
      }
      dots = [];
      ladder.forEach((n, i) => {
        const x = dotX(i);
        const dot = el('circle', { cx: x, cy: PLOT_BOTTOM, r: 4.5, fill: c.primary });
        const value = el('text', { x, y: PLOT_BOTTOM, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': XS, fill: c.text });
        const row1 = el('text', { x, y: ROW1_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': SM, fill: c.text });
        row1.textContent = String(n);
        const row2 = el('text', { x, y: ROW2_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': XS, fill: c.textMuted });
        curveLayer.appendChild(dot);
        curveLayer.appendChild(value);
        curveLayer.appendChild(row1);
        curveLayer.appendChild(row2);
        dots.push({ dot, value, row1, row2 });
      });
      updateSums(sums, frameTotal);
    };

    const updateSums = (sums: number[], frameTotal: number): void => {
      sums.forEach((s, i) => {
        const d = dots[i];
        if (!d) throw new Error(`virtual-memory stage: 곡선 점 ${i} 이 없다`);
        d.row2.textContent = String(s);
        d.row2.setAttribute('fill', s > frameTotal ? c.danger : c.textMuted);
      });
    };

    const dotX = (i: number): number => {
      if (ladder.length < 2) return (PLOT_X0 + PLOT_X1) / 2;
      const pad = SM * 1.5;
      return PLOT_X0 + pad + ((PLOT_X1 - PLOT_X0 - pad * 2) * i) / (ladder.length - 1);
    };

    const drawCurve = (vals: number[], mark: number): void => {
      const pts: string[] = [];
      vals.forEach((v, i) => {
        const d = dots[i];
        if (!d) throw new Error(`virtual-memory stage: 곡선 점 ${i} 이 없다`);
        const x = dotX(i);
        const y = plotY(v);
        d.dot.setAttribute('cy', String(y));
        d.value.setAttribute('y', String(y - SM * 0.8));
        d.value.textContent = pctText(Math.round(v));
        pts.push(`${x},${y}`);
      });
      line.setAttribute('points', pts.join(' '));
      if (mark >= 0) {
        const idx = Math.round(mark);
        const v = vals[idx];
        if (v === undefined) throw new Error(`virtual-memory stage: 표지 자리 ${idx} 에 값이 없다`);
        const lo = Math.floor(mark);
        const hi = Math.min(vals.length - 1, lo + 1);
        const fr = mark - lo;
        const vy = (vals[lo] ?? v) * (1 - fr) + (vals[hi] ?? v) * fr;
        marker.setAttribute('cx', String(dotX(lo) * (1 - fr) + dotX(hi) * fr));
        marker.setAttribute('cy', String(plotY(vy)));
        marker.style.opacity = '1';
      }
    };

    /** 곡선은 점 좌표를 속성으로 쥐므로 rAF 로 옮긴다. 되짚기 · 속도 0 이면 곧장 끝 모습. */
    const tweenCurve = (dur: number): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      const fromVals = shownVals.length === targetVals.length ? shownVals.slice() : targetVals.map(() => 0);
      const fromMark = shownMarker >= 0 ? shownMarker : targetMarker;
      const toVals = targetVals.slice();
      const toMark = targetMarker;
      const finish = (): void => {
        shownVals = toVals;
        shownMarker = toMark;
        drawCurve(shownVals, shownMarker);
      };
      if (isInstant() || dur <= 0 || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      const start = performance.now();
      const stepFrame = (now: number): void => {
        if (destroyed) return;
        const k = Math.min(1, (now - start) / dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        shownVals = fromVals.map((v, i) => v + ((toVals[i] ?? v) - v) * e);
        shownMarker = fromMark + (toMark - fromMark) * e;
        drawCurve(shownVals, shownMarker);
        if (k < 1) {
          const id = requestAnimationFrame(stepFrame);
          frames.add(id);
        } else {
          finish();
        }
      };
      const id = requestAnimationFrame(stepFrame);
      frames.add(id);
    };

    const makeChip = (proc: number, page: number, name: string): Chip => {
      const g = el('g', {});
      const pad = 3;
      g.appendChild(el('rect', { x: pad, y: pad, width: frameW - pad * 2, height: FRAME_H - pad * 2, fill: procColor(proc), rx: 3 }));
      const text = el('text', { x: frameW / 2, y: FRAME_H / 2 + SM * 0.35, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': SM, fill: c.textInverse });
      text.textContent = `${name.toUpperCase()}·${String.fromCharCode(97 + page)}`;
      g.appendChild(text);
      chipLayer.appendChild(g);
      return { g };
    };

    const place = (g: SVGGElement, x: number, y: number): void => {
      g.style.transform = `translate(${x}px, ${y}px)`;
    };

    const dropToDisk = (chip: Chip, frame: number, dur: number, delay: number): void => {
      const x = frameX[frame];
      if (x === undefined) throw new Error(`virtual-memory stage: 프레임 ${frame} 자리가 없다`);
      setMotion(chip.g, dur, delay);
      place(chip.g, x, PARK_Y);
      chip.g.style.opacity = '0';
      if (isInstant() || dur <= 0) {
        chip.g.remove();
        return;
      }
      doomed.add(chip.g);
      later(() => {
        doomed.delete(chip.g);
        chip.g.remove();
      }, delay + dur + 20);
    };

    let names: string[] = [];

    const view: VirtualMemoryStage & ViewInstance = {
      startRun(p: StageRunStart) {
        caption.textContent = p.caption;
        names = p.processes;
        if (p.ticks !== ticks || p.chunkTicks !== chunkTicks) {
          ticks = p.ticks;
          chunkTicks = p.chunkTicks;
          buildStrips();
        }
        if (p.frames !== frameCount) {
          frameCount = p.frames;
          buildFrames();
        }
        buildLegend(p.processes);
        // 앞 판의 칸은 흐린 채 남는다 — 새 판의 걸음이 그 틱을 밟을 때 옮겨 간다
        for (const cell of cells) {
          setMotion(cell.cpu, p.ms, 0);
          setMotion(cell.disk, p.ms, 0);
          cell.cpu.style.opacity = '0.28';
          cell.disk.style.opacity = '0.28';
        }
        windowRect.style.opacity = '0';
        // 프레임을 비운다 — 페이지들이 디스크 자리로 내려간다
        resident.forEach((chip, f) => {
          if (chip) dropToDisk(chip, f, p.ms, 0);
        });
        resident = new Array<Chip | null>(frameCount).fill(null);
        // 곡선
        const ladderChanged = p.ladder.length !== ladder.length || p.ladder.some((v, i) => v !== ladder[i]);
        const sums = p.ladder.map((n) => n * p.workingSet);
        if (ladderChanged) {
          ladder = p.ladder.slice();
          buildCurve(sums, p.frames);
          shownVals = [];
          shownMarker = -1;
        } else {
          updateSums(sums, p.frames);
        }
        currentIdx = ladder.indexOf(p.procCount);
        if (currentIdx < 0) throw new Error(`virtual-memory stage: 프로세스 수 ${p.procCount} 이 곡선 사다리에 없다`);
        if (p.curve.length !== ladder.length) throw new Error('virtual-memory stage: 곡선 값 수가 사다리와 다르다');
        targetVals = p.curve.slice();
        targetVals[currentIdx] = 0;
        targetMarker = currentIdx;
        dots.forEach((d, i) => d.dot.setAttribute('fill', i === currentIdx ? c.accent : c.primary));
        tweenCurve(p.ms);
      },

      playChunk(p: StageChunk) {
        caption.textContent = p.caption;
        const span = p.to - p.from;
        if (p.cpu.length !== span || p.disk.length !== span) throw new Error('virtual-memory stage: 걸음의 틱 수가 칸 수와 다르다');
        const w = SPAN / ticks;
        setMotion(windowRect, p.ms * 0.5, 0);
        windowRect.setAttribute('x', String(LEFT + p.from * w - 1.5));
        windowRect.setAttribute('width', String(span * w + 3));
        windowRect.style.opacity = '1';
        const dur = p.ms * MOVE;
        const stagger = (tick: number): number => ((tick - p.from) / span) * p.ms * LEAD;
        for (let k = 0; k < span; k += 1) {
          const cell = cells[p.from + k];
          const ct = p.cpu[k];
          const dp = p.disk[k];
          if (!cell || !ct || dp === undefined) throw new Error(`virtual-memory stage: 틱 ${p.from + k} 칸이 없다`);
          const delay = stagger(p.from + k);
          setMotion(cell.cpu, dur, delay);
          setMotion(cell.disk, dur, delay);
          cell.cpu.style.opacity = '1';
          cell.disk.style.opacity = '1';
          if (ct.kind === 'run') {
            cell.cpu.style.fill = procColor(ct.proc);
            cell.cpu.style.transform = 'scaleY(1)';
          } else if (ct.kind === 'fault') {
            cell.cpu.style.fill = c.danger;
            cell.cpu.style.transform = `scaleY(${FAULT_SCALE})`;
          } else {
            cell.cpu.style.transform = 'scaleY(0)';
          }
          if (dp >= 0) {
            cell.disk.style.fill = procColor(dp);
            cell.disk.style.transform = 'scaleY(1)';
          } else {
            cell.disk.style.transform = 'scaleY(0)';
          }
        }
        for (const l of p.loads) {
          const x = frameX[l.frame];
          if (x === undefined) throw new Error(`virtual-memory stage: 프레임 ${l.frame} 자리가 없다`);
          const delay = stagger(l.tick);
          const old = resident[l.frame];
          if (l.evictedProc >= 0) {
            if (!old) throw new Error(`virtual-memory stage: 프레임 ${l.frame} 에서 밀어낼 페이지가 없다`);
            dropToDisk(old, l.frame, dur, delay);
          } else if (old) {
            throw new Error(`virtual-memory stage: 빈 줄 알았던 프레임 ${l.frame} 에 페이지가 있다`);
          }
          const name = names[l.proc];
          if (name === undefined) throw new Error(`virtual-memory stage: 프로세스 ${l.proc} 의 이름이 없다`);
          const chip = makeChip(l.proc, l.page, name);
          chip.g.style.transition = 'none';
          place(chip.g, x, PARK_Y);
          chip.g.style.opacity = '0.4';
          void chip.g.getBoundingClientRect();
          setMotion(chip.g, dur, delay);
          place(chip.g, x, FRAME_Y);
          chip.g.style.opacity = '1';
          resident[l.frame] = chip;
        }
        if (currentIdx >= 0) {
          targetVals = targetVals.slice();
          targetVals[currentIdx] = p.usePct;
          tweenCurve(p.ms);
        }
      },

      clear() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const g of doomed) g.remove();
        doomed.clear();
        for (const chip of resident) chip?.g.remove();
        resident = new Array<Chip | null>(frameCount).fill(null);
        for (const cell of cells) {
          cell.cpu.style.transition = 'none';
          cell.disk.style.transition = 'none';
          cell.cpu.style.transform = 'scaleY(0)';
          cell.disk.style.transform = 'scaleY(0)';
        }
        windowRect.style.opacity = '0';
      },

      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };

    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const g of doomed) g.remove();
      doomed.clear();
      shownVals = targetVals.slice();
      shownMarker = targetMarker;
      if (dots.length === shownVals.length && shownVals.length > 0) drawCurve(shownVals, shownMarker);
    });

    void container;
    return view;
  },
};
