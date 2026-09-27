/**
 * brdf projector — algorithm 이벤트를 무대 메서드와 캡션으로 옮긴다.
 * payload 는 typeof 가드로 읽고, 없거나 모양이 어긋나면 던진다 (C6 · C9).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { BrdfStage, BrdfTick } from './brdf-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`brdf projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string, what: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`brdf projector: ${what}.${k} 가 수가 아니다`);
  return v;
}
function ticks(v: unknown, what: string): BrdfTick[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`brdf projector: ${what} 가 눈금 목록이 아니다`);
  return v.map((x, i) => {
    const o = obj(x, `${what}[${i}]`);
    if (typeof o.label !== 'string') throw new Error(`brdf projector: ${what}[${i}].label 이 글이 아니다`);
    return { label: o.label, frac: num(o, 'frac', `${what}[${i}]`) };
  });
}

export const brdfProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as BrdfStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) throw new Error('brdf projector: stage 블록이 없다');
  let motionMs: number | null = null;
  let incoming: number | null = null;
  const dur = (): number => {
    if (motionMs === null) throw new Error('brdf projector: 판 머리(init) 전에 운동이 왔다');
    const speed = runtime?.getSpeed() ?? 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          if (typeof p.phase !== 'string') throw new Error('brdf projector: phase 이름이 없다');
          code?.highlightPhase(p.phase);
          return;
        }
        case 'init': {
          const p = obj(event.payload, 'init');
          const model = p.model;
          if (model !== 'phong' && model !== 'pbr') throw new Error(`brdf projector: 모르는 모형 ${String(model)}`);
          const axis = obj(p.axis, 'init.axis');
          motionMs = num(p, 'motionMs', 'init');
          incoming = num(axis, 'incoming', 'init.axis');
          const n = num(p, 'n', 'init');
          code?.highlightPhase(null);
          stage.showInit(
            {
              model,
              n,
              alpha: num(p, 'alpha', 'init'),
              roughness: num(p, 'roughness', 'init'),
              peakTicks: ticks(axis.peakTicks, 'init.axis.peakTicks'),
              totalTicks: ticks(axis.totalTicks, 'init.axis.totalTicks'),
              incomingFrac: num(axis, 'incomingFrac', 'init.axis'),
            },
            dur(),
          );
          const modelName = model === 'phong' ? t('label.phong', 'Phong') : t('label.pbr', 'PBR');
          stage.setCaption(
            t('caption.init', '{model}, gloss n = {n}. Light arrives along the normal. Irradiance: {incoming}.', {
              model: modelName,
              n,
              incoming,
            }),
          );
          return;
        }
        case 'peak': {
          const p = obj(event.payload, 'peak');
          stage.showPeak({ peak: num(p, 'peak', 'peak'), peakFrac: num(p, 'peakFrac', 'peak') }, dur());
          stage.setCaption(t('caption.peak', 'Toward the mirror direction (θ = 0°) the reflection is strongest: the peak.'));
          return;
        }
        case 'lobe': {
          const p = obj(event.payload, 'lobe');
          if (!Array.isArray(p.samples) || p.samples.length === 0) throw new Error('brdf projector: lobe.samples 가 없다');
          const samples = p.samples.map((s, i) => {
            const o = obj(s, `lobe.samples[${i}]`);
            return { deg: num(o, 'deg', `lobe.samples[${i}]`), shape: num(o, 'shape', `lobe.samples[${i}]`) };
          });
          stage.showLobe(
            { samples, halfWidthDeg: num(p, 'halfWidthDeg', 'lobe'), halfLevel: num(p, 'halfLevel', 'lobe') },
            dur(),
          );
          stage.setCaption(
            t('caption.lobe', 'The whole lobe, scaled to its own peak. The two ribs mark where it falls to half.'),
          );
          return;
        }
        case 'integrate': {
          const p = obj(event.payload, 'integrate');
          if (typeof p.exceeds !== 'boolean') throw new Error('brdf projector: integrate.exceeds 가 참거짓이 아니다');
          if (incoming === null) throw new Error('brdf projector: 판 머리(init) 전에 총량이 왔다');
          const inc = num(p, 'incoming', 'integrate');
          if (inc !== incoming) throw new Error(`brdf projector: 총량의 들어온 빛 ${inc} 이 판 머리의 ${incoming} 와 다르다`);
          stage.showIntegrate(
            {
              total: num(p, 'total', 'integrate'),
              totalFrac: num(p, 'totalFrac', 'integrate'),
              incomingFrac: num(p, 'incomingFrac', 'integrate'),
              exceeds: p.exceeds,
            },
            dur(),
          );
          stage.setCaption(
            p.exceeds
              ? t('caption.over', 'Summed over the hemisphere, more light leaves than arrived. Incoming: {incoming}.', {
                  incoming: inc,
                })
              : t('caption.under', 'Summed over the hemisphere, less light leaves than arrived. Incoming: {incoming}.', {
                  incoming: inc,
                }),
          );
          return;
        }
        default:
          throw new Error(`brdf projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      incoming = null;
      stage.reset();
      code?.highlightPhase(null);
    },
  };
};
