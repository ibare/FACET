import type { IR } from '@ffacet/core';

/**
 * No IR for this facet, on purpose.
 *
 * The claim on screen is CPU utilization, and utilization only comes out of a tick-by-tick simulation that runs the
 * ready queue, the disk queue, the I/O timers and a global LRU together. Writing that as IR would make the code panel
 * show the simulation harness rather than how an operating system pages. Putting only the fault count into IR would
 * give an answer different from the utilization the stage shows, so the facet has no code panel at all.
 */
export const virtualMemoryIRs: IR[] = [];
