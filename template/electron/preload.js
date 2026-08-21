/**
 * Memory Profiler Preload Script
 *
 * Exposes a minimal, read-only IPC bridge to the renderer so the
 * memory-profiler component can receive enable signals and metrics
 * without gaining access to Node or Electron APIs.
 *
 * contextIsolation is enabled, so the renderer sees only the objects
 * explicitly exposed here on window.electronProfiler.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronProfiler', {
  /**
   * Register a callback invoked when the main process enables the profiler.
   *
   * @param {() => void} callback
   */
  onEnabled: (callback) => ipcRenderer.on('profiler-enabled', () => callback()),

  /**
   * Register a callback invoked on each metrics tick from the main process.
   *
   * @param {(metrics: object) => void} callback
   */
  onMetrics: (callback) => ipcRenderer.on('profiler-metrics', (_event, metrics) => callback(metrics)),
});
