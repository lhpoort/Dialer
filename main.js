const { app, BrowserWindow, clipboard } = require('electron')
app.commandLine.appendSwitch('ignore-certificate-errors', true)
const windowStateKeeper = require("electron-window-state");
const path = require('path');
const url = require('url');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {
  let mainWindowState = windowStateKeeper({
    x: 20,
    y: 20,
    defaultWidth: 300,
    defaultHeight: 700
  });
  // Create the browser window.
  win = new BrowserWindow({
    useContentSize: true,
    menu: null,
    webPreferences: { plugins: true, devTools: true, enableRemoteModule: true, nodeIntegration: true },
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    isMaximized: mainWindowState.isMaximized,
    isFullScreen: mainWindowState.isFullScreen,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'CSS/Components/icons/png/128x128.png')
  });
  win.setMenu(null);
  mainWindowState.manage(win);
  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  //win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
app.on('browser-window-focus', () => {
  const sSelection = clipboard.readText('selection');
  if (/^\+?[0-9\+\(\)\-\s]+$/.test(sSelection)) {
    win.webContents.send('callMe', sSelection);
  }
});