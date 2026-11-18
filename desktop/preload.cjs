// What the game's page may ask of the desktop app (main.cjs), and nothing more: a newer version (updates.cjs;
// web/src/ui/updates.ts) - what it is, taking it up, the player told of it, and after an update what is new; and the
// window's full screen, for the touch pad's button (web/src/ui/fullScreen.ts). The page stays sandboxed and isolated.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('u3native', {
  updates: {
    offer: () => ipcRenderer.invoke('update-offer'),
    apply: () => ipcRenderer.invoke('update-apply'),
    told: () => ipcRenderer.invoke('update-told'),
    /** Told each time it changes. Returns nothing (ipcRenderer.on's own return must never reach the page). */
    onChange: (listener) => {
      ipcRenderer.on('update-offer-changed', (_event, offer) => listener(offer));
    },
    /** The first start of a newer version ({ version, from }, or null), the player told of it, and a release's notes. */
    news: () => ipcRenderer.invoke('update-news'),
    newsSeen: () => ipcRenderer.invoke('update-news-seen'),
    notes: (version) => ipcRenderer.invoke('update-notes', version),
  },
  fullScreen: {
    /** Whether the window is full screen; made so first if `on` is given. */
    set: (on) => ipcRenderer.invoke('full-screen', on),
    get: () => ipcRenderer.invoke('full-screen'),
    /** Told each time the window goes full screen or leaves it, by any means. Returns nothing: ipcRenderer.on's own
     * return is ipcRenderer, which must never reach the page. */
    onChange: (listener) => {
      ipcRenderer.on('full-screen-changed', (_event, on) => listener(on === true));
    },
  },
});

// Quitting while the Flatpak's update comes down (main.cjs holdForUpdate): said over the game until it is done.
ipcRenderer.on('update-finishing', () => {
  const note = document.createElement('div');
  note.textContent = 'Finishing the update…';
  note.setAttribute('role', 'status');
  Object.assign(note.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    font: '24px sans-serif',
    zIndex: '2147483647',
  });
  document.body.appendChild(note);
});
