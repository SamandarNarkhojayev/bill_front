/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ElectronStoreAPI {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

interface ElectronAPI {
  arduino?: {
    listPorts: () => Promise<any[]>;
    listAllPorts: () => Promise<any[]>;
    savePort: (portPath: string) => Promise<void>;
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
    printReceipt: (receiptHTML: string, widthMm?: number, silent?: boolean) => Promise<any>;
    getPrinters: () => Promise<any[]>;
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
