import { openDB } from 'idb';
import { emptyWorkspace, importWorkspace, type Workspace } from './model';
const db = () =>
  openDB('todo-desktop-v2', 1, {
    upgrade(d) {
      d.createObjectStore('state');
      d.createObjectStore('snapshots', { autoIncrement: true });
    },
  });
export async function readWorkspace() {
  const d = await db();
  const raw = await d.get('state', 'workspace');
  return raw ? importWorkspace(raw) : emptyWorkspace();
}
export async function saveWorkspace(w: Workspace) {
  const d = await db();
  await d.put('state', structuredClone(w), 'workspace');
}
export async function snapshot(w: Workspace) {
  const d = await db();
  await d.add('snapshots', { at: Date.now(), data: structuredClone(w) });
}
export async function snapshots() {
  const d = await db();
  const values = await d.getAll('snapshots');
  return values.reverse() as { at: number; data: Workspace }[];
}
export async function replaceWorkspace(w: Workspace, current: Workspace) {
  const d = await db();
  const tx = d.transaction(['state', 'snapshots'], 'readwrite');
  await tx.objectStore('snapshots').add({ at: Date.now(), data: structuredClone(current) });
  await tx.objectStore('state').put(structuredClone(w), 'workspace');
  await tx.done;
}
export function downloadWorkspace(w: Workspace, auto = false) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download =
    'todo_v2_' +
    (auto ? 'auto_' : 'backup_') +
    new Date().toISOString().replace(/[:.]/g, '-') +
    '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
