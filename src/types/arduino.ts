// Типы для Arduino API
export interface SerialPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
  product?: string;
  friendlyName?: string;
}

export interface RelayChangeEvent {
  relay: number; // 1-4
  state: boolean;
}

export interface ButtonPressEvent {
  relay: number; // 1-4
  state: boolean;
}

export interface RelayInfoItem {
  number: number;
  pin: number;
  state: boolean;
}

export interface RelayInfo {
  count: number;
  relays: RelayInfoItem[];
}

export interface ArduinoAPI {
  listPorts(): Promise<SerialPort[]>;
  listAllPorts(): Promise<SerialPort[]>;
  savePort(portPath: string | null): Promise<{ success: boolean }>;
  getSavedPort(): Promise<string | null>;
  reconnect(): Promise<{ success: boolean; connected: boolean }>;
  connect(portPath: string): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  setRelay(relayNumber: number, state: boolean): Promise<{ success: boolean }>;
  getStatus(): Promise<{ success: boolean }>;
  isConnected(): Promise<boolean>;
  getRelayStates(): Promise<boolean[]>;
  getInfo(): Promise<RelayInfo>;
  
  // События
  onRelayChanged(callback: (data: RelayChangeEvent) => void): void;
  onStatusUpdate(callback: (states: boolean[]) => void): void;
  onButtonPressed(callback: (data: ButtonPressEvent) => void): void;
  onMessage(callback: (message: string) => void): void;
  onInfo(callback: (info: RelayInfo) => void): void;
  onError(callback: (error: string) => void): void;
  onDisconnected(callback: () => void): void;
  removeAllListeners(channel: string): void;
}

// Типы для Printer API
export interface PrinterInfo {
  name: string;
  displayName: string;
  description?: string;
  status: number;
  isDefault: boolean;
}

export interface PrinterAPI {
  printReceipt(receiptHTML: string, widthMm?: number, silent?: boolean): Promise<{ success: boolean }>;
  getPrinters(): Promise<PrinterInfo[]>;
}

export interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported';
  message: string;
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
}

export interface UpdaterAPI {
  getState(): Promise<UpdaterState>;
  checkForUpdates(): Promise<{ success: boolean; reason?: string }>;
  downloadUpdate(): Promise<{ success: boolean }>;
  installUpdate(): Promise<{ success: boolean }>;
  onStatus(callback: (state: UpdaterState) => void): void;
  removeAllListeners(): void;
}

declare global {
  interface Window {
    electronAPI?: {
      arduino?: ArduinoAPI;
      printer?: PrinterAPI;
      updater?: UpdaterAPI;
      store?: {
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        remove: (key: string) => Promise<void>;
        flush: () => Promise<{ success: boolean }>;
      };
    };
  }
}

export {};;