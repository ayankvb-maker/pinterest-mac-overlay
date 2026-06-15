const { app, BrowserWindow, screen, ipcMain } = require("electron");

let overlayWindow;
let dotWindow;
let collapseButton;
let lastBounds;
let isCollapsed = false;
let dragOffset = null;
let isQuitting = false;

function applyMacOverlayBehavior(win) {
  if (process.platform !== "darwin") return;
  if (!win || win.isDestroyed()) return;

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver", 1);
}

function positionCollapseButton() {
  if (!collapseButton || collapseButton.isDestroyed()) return;
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const bounds = overlayWindow.getBounds();

  collapseButton.setSize(20, 20);

  collapseButton.setPosition(
    bounds.x + bounds.width + 5,
    bounds.y + 10
  );
}

function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!dotWindow || dotWindow.isDestroyed()) return;

  const [x, y] = dotWindow.getPosition();

  dotWindow.hide();

  overlayWindow.setBounds({
    x,
    y,
    width: lastBounds.width,
    height: lastBounds.height
  });

  overlayWindow.show();
  overlayWindow.focus();

  positionCollapseButton();
  collapseButton.show();

  isCollapsed = false;
}

function showDot() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!dotWindow || dotWindow.isDestroyed()) return;

  const bounds = overlayWindow.getBounds();

  lastBounds = bounds;

  const display = screen.getDisplayMatching(bounds);

  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

  const clampedX = Math.min(
    Math.max(bounds.x, dx),
    dx + dw - 25
  );

  const clampedY = Math.min(
    Math.max(bounds.y, dy),
    dy + dh - 25
  );

  dotWindow.setPosition(clampedX, clampedY);

  collapseButton.hide();
  overlayWindow.hide();

  dotWindow.show();

  isCollapsed = true;
}

function closeEverything() {
  if (isQuitting) return;
  isQuitting = true;

  for (const win of [collapseButton, dotWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }

  app.quit();
}

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 500,
    height: 700,
    frame: false,
    resizable: true,
    alwaysOnTop: true
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  applyMacOverlayBehavior(overlayWindow);

  lastBounds = overlayWindow.getBounds();

  overlayWindow.on("resize", () => {
    if (!isCollapsed) {
      lastBounds = overlayWindow.getBounds();
    }
    positionCollapseButton();
  });

  overlayWindow.on("move", () => {
    if (!isCollapsed) {
      lastBounds = overlayWindow.getBounds();
    }
    positionCollapseButton();
  });

  // Closing the overlay window closes the whole app, including the dot
  overlayWindow.on("close", () => {
    closeEverything();
  });

  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    const popup = new BrowserWindow({
      width: 500,
      height: 700,
      autoHideMenuBar: true
    });

    popup.loadURL(url);

    return {
      action: "deny"
    };
  });

  overlayWindow.loadURL("https://www.pinterest.com");
}

function createCollapseButton() {
  collapseButton = new BrowserWindow({
    width: 20,
    height: 20,
    minWidth: 20,
    maxWidth: 20,
    minHeight: 20,
    maxHeight: 20,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  collapseButton.setAlwaysOnTop(true, "screen-saver");
  applyMacOverlayBehavior(collapseButton);

  collapseButton.loadURL(
    "data:text/html," +
      encodeURIComponent(`
<!DOCTYPE html>
<html>
<body style="
  margin:0;
  width:20px;
  height:20px;
  overflow:hidden;
">
<div id="dot" style="
  width:20px;
  height:20px;
  background:red;
  border-radius:50%;
  cursor:pointer;
">
</div>

<script>
const { ipcRenderer } = require('electron');

document.getElementById('dot').addEventListener('click', () => {
  ipcRenderer.send('collapse-overlay');
});
</script>
</body>
</html>
`)
  );

  collapseButton.hide();
}

function createDot() {
  dotWindow = new BrowserWindow({
    width: 25,
    height: 25,
    frame: false,
    movable: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  dotWindow.setAlwaysOnTop(true, "screen-saver");
  applyMacOverlayBehavior(dotWindow);

  dotWindow.loadURL(
    "data:text/html," +
      encodeURIComponent(`
<!DOCTYPE html>
<html>
<body style="
  margin:0;
  width:100vw;
  height:100vh;
  background:red;
  border-radius:50%;
  overflow:hidden;
  cursor:pointer;
  user-select:none;
  -webkit-app-region: drag;
">
<div
  id="clickCatcher"
  style="
    position:absolute;
    top:0;
    left:0;
    right:0;
    bottom:0;
    -webkit-app-region:no-drag;
  ">
</div>

<script>
const { ipcRenderer } = require('electron');

let downX;
let downY;
let dragged = false;

const el = document.getElementById('clickCatcher');

el.addEventListener('mousedown', (e) => {
  dragged = false;
  downX = e.screenX;
  downY = e.screenY;
  ipcRenderer.send('dot-drag-start');
});

el.addEventListener('mousemove', (e) => {
  if (downX === undefined) return;

  if (
    Math.abs(e.screenX - downX) > 3 ||
    Math.abs(e.screenY - downY) > 3
  ) {
    dragged = true;
  }

  if (e.buttons === 1) {
    ipcRenderer.send(
      'dot-drag-move',
      e.screenX,
      e.screenY
    );
  }
});

window.addEventListener('mouseup', () => {
  if (!dragged && downX !== undefined) {
    ipcRenderer.send('dot-clicked');
  }

  downX = undefined;
  downY = undefined;

  ipcRenderer.send('dot-drag-end');
});
</script>
</body>
</html>
`)
  );

  dotWindow.hide();
}

ipcMain.on("dot-drag-start", () => {
  const [winX, winY] = dotWindow.getPosition();
  const cursor = screen.getCursorScreenPoint();

  dragOffset = {
    dx: cursor.x - winX,
    dy: cursor.y - winY
  };
});

ipcMain.on("dot-drag-move", (event, screenX, screenY) => {
  if (!dragOffset) return;

  dotWindow.setPosition(
    screenX - dragOffset.dx,
    screenY - dragOffset.dy
  );
});

ipcMain.on("dot-drag-end", () => {
  dragOffset = null;
});

ipcMain.on("dot-clicked", () => {
  showOverlay();
});

ipcMain.on("collapse-overlay", () => {
  showDot();
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.hide();
  }

  createOverlay();
  createDot();
  createCollapseButton();

  positionCollapseButton();
  collapseButton.show();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
});