const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const { URL } = require('url')

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeSettings(next) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(next, null, 2), 'utf8')
}

function normalizeAppUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('Uygulama adresi boş bırakılamaz.')
  const u = new URL(raw)
  if (u.protocol !== 'https:') throw new Error('Adres https:// ile başlamalıdır.')
  return u.origin + (u.pathname === '/' ? '/' : u.pathname.replace(/\/+$/, ''))
}

function isAllowedNavigation(target, configuredUrl) {
  try {
    const targetUrl = new URL(target)
    const configured = new URL(configuredUrl)
    return targetUrl.origin === configured.origin
  } catch {
    return false
  }
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f5f9',
    icon: path.join(__dirname, 'assets', 'sutek.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const settings = readSettings()
    if (settings.appUrl && isAllowedNavigation(url, settings.appUrl)) {
      mainWindow.loadURL(url)
    } else {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const settings = readSettings()
    if (!settings.appUrl || !isAllowedNavigation(url, settings.appUrl)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  loadConfiguredOrSetup()
}

function loadConfiguredOrSetup() {
  const settings = readSettings()
  if (settings.appUrl) {
    mainWindow.loadURL(settings.appUrl).catch(() => {
      mainWindow.loadFile('setup.html', { query: { error: '1', current: settings.appUrl } })
    })
  } else {
    mainWindow.loadFile('setup.html')
  }
}

ipcMain.handle('settings:get', () => readSettings())

ipcMain.handle('settings:saveUrl', (_event, value) => {
  const appUrl = normalizeAppUrl(value)
  writeSettings({ ...readSettings(), appUrl })
  setImmediate(() => mainWindow.loadURL(appUrl))
  return { ok: true, appUrl }
})

ipcMain.handle('settings:reset', () => {
  try { fs.unlinkSync(SETTINGS_FILE()) } catch {}
  setImmediate(() => mainWindow.loadFile('setup.html'))
  return { ok: true }
})

ipcMain.handle('app:reload', () => {
  loadConfiguredOrSetup()
  return { ok: true }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
