/** What UpdateAvailable says: the commits running, deployed and on the remote. */
export interface Available {
  'running-commit'?: string;
  'local-commit'?: string;
  'remote-commit'?: string;
}
/** Why an update failed (reason). */
export type Why = 'approve' | 'denied' | 'permissions' | 'other';
/** A monitor as watch() uses it (the tests give their own). */
export interface UpdateMonitor {
  onAvailable: (fn: (info?: Available) => void) => void;
  onProgress: (fn: (p: { status: number; error?: string; error_message?: string }) => void) => void;
  update: () => Promise<unknown>;
  close?: () => Promise<unknown>;
}
export interface PortalConnection {
  createMonitor: () => Promise<UpdateMonitor>;
  spawnLatest: () => Promise<unknown>;
}
export function connect(o?: { dbus?: unknown }): Promise<PortalConnection | null>;
export function watch(o: {
  portal: PortalConnection;
  newer: boolean;
  approve?: boolean;
  installed: () => void;
  allowed?: () => void;
  failed: (message: string, why: Why) => void;
  busy?: (busy: boolean) => void;
}): Promise<UpdateMonitor>;
export function reason(name?: string, message?: string): Why;
export const STATUS: { running: 0; empty: 1; done: 2; error: 3 };
