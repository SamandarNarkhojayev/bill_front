/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ElectronStoreAPI {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  flush: () => Promise<{ success: boolean }>;
}

interface ElectronAppAPI {
  onBeforeClose: (callback: () => void) => (() => void) | void;
  confirmCloseReady: () => Promise<{ success: boolean }>;
}

interface BackupEntry {
  type: 'rotation' | 'daily' | 'emergency';
  name: string;
  path: string;
  date: string;
  size: number;
  valid: boolean;
}

interface ElectronBackupAPI {
  list: () => Promise<BackupEntry[]>;
  restore: (backupPath: string) => Promise<{ success: boolean; error?: string }>;
  exportData: () => Promise<{ success: boolean; path?: string; error?: string }>;
  importData: () => Promise<{ success: boolean; error?: string }>;
  createNow: () => Promise<{ success: boolean; error?: string }>;
  getStoragePaths: () => Promise<{ storagePath: string; backupDir: string; dailyDir: string; userData: string }>;
}

interface ElectronAPI {
  arduino?: {
    listPorts: () => Promise<any[]>;
    listAllPorts: () => Promise<any[]>;
    savePort: (portPath: string | null) => Promise<void>;
    getSavedPort: () => Promise<string | null>;
    reconnect: () => Promise<any>;
    connect: (portPath: string) => Promise<any>;
    disconnect: () => Promise<void>;
    setRelay: (relayNumber: number, state: boolean) => Promise<void>;
    getStatus: () => Promise<any>;
    isConnected: () => Promise<boolean>;
    getRelayStates: () => Promise<any>;
    getInfo: () => Promise<any>;
    onRelayChanged: (callback: (data: any) => void) => void;
    onStatusUpdate: (callback: (states: any) => void) => void;
    onButtonPressed: (callback: (data: any) => void) => void;
    onMessage: (callback: (message: string) => void) => void;
    onInfo: (callback: (info: any) => void) => void;
    onError: (callback: (error: string) => void) => void;
    onDisconnected: (callback: () => void) => void;
    removeAllListeners: (channel: string) => void;
  };
  printer?: {
    printReceipt: (receiptHTML: string, widthMm?: number, silent?: boolean, deviceName?: string) => Promise<any>;
    getPrinters: () => Promise<Array<{ name: string; displayName?: string; description?: string; isDefault?: boolean; status?: number }>>;
  };
  bracket?: {
    open: (payload: unknown) => Promise<{ success: boolean }>;
    getData: () => Promise<any>;
    push: (payload: unknown) => Promise<{ success: boolean }>;
    toggleFullscreen: () => Promise<{ success: boolean }>;
    onData: (callback: (payload: any) => void) => void;
    removeDataListener: () => void;
  };
  updater?: {
    getState: () => Promise<any>;
    checkForUpdates: () => Promise<any>;
    downloadUpdate: () => Promise<any>;
    installUpdate: () => Promise<void>;
    onStatus: (callback: (payload: any) => void) => void;
    removeAllListeners: () => void;
  };
  store?: ElectronStoreAPI;
  app?: ElectronAppAPI;
  backup?: ElectronBackupAPI;
}

// Этот файл — ambient script (без import/export), поэтому augment делаем
// напрямую через top-level `interface Window` (без `declare global`, который
// валиден только в модулях). Это единственный источник типа window.electronAPI.
interface Window {
  electronAPI?: ElectronAPI;
}
