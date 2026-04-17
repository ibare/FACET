export const CIRCUIT_STYLE_ID = 'facet-lens-circuit-styles';

const CSS = `
.facet-circuit { display: flex; flex-direction: column; gap: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.facet-circuit__stage { background: #f6f7fb; border-radius: 12px; padding: 12px; }
.facet-circuit__svg { display: block; width: 100%; height: auto; }
.facet-circuit__body-slot { height: 100%; box-sizing: border-box; padding: 28px 18px 18px; color: #2b2f44; }
.facet-body-bars { display: flex; flex-direction: column; gap: 8px; align-items: stretch; height: 100%; }
.facet-body-phase { font-size: 11px; font-family: ui-monospace, Menlo, Monaco, monospace; color: #534AB7; letter-spacing: 0.04em; }
.facet-body-svg { width: 100%; height: 150px; }
.facet-body-bar-label { font-size: 9px; fill: #6b6f80; font-family: ui-monospace, Menlo, Monaco, monospace; }
.facet-body-metrics { font-size: 11px; color: #6b6f80; font-family: ui-monospace, Menlo, Monaco, monospace; }
.facet-circuit__controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; }
.facet-circuit__controls button { height: 30px; padding: 0 12px; font-size: 12px; border: 1px solid #d5d8e3; border-radius: 6px; background: #ffffff; cursor: pointer; color: #2b2f44; }
.facet-circuit__controls button:hover { background: #f1f3f9; }
.facet-circuit__controls button[data-active="true"] { background: #eceffb; border-color: #9aa3c4; font-weight: 500; }
.facet-circuit__controls .facet-group { display: flex; align-items: center; gap: 6px; padding-left: 10px; border-left: 1px solid #d5d8e3; margin-left: 4px; }
.facet-circuit__controls .facet-group:first-child { padding-left: 0; border-left: none; margin-left: 0; }
.facet-circuit__controls label { color: #6b6f80; }
.facet-circuit__controls input[type="range"] { width: 90px; }
`;

export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CIRCUIT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CIRCUIT_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
