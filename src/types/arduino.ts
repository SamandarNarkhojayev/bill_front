// Типы для Arduino API
export interface SerialPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
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
  printReceipt(receiptHTML: string): Promise<{ success: boolean }>;
  getPrinters(): Promise<PrinterInfo[]>;
}

declare global {
  interface Window {
    electronAPI?: {
      arduino?: ArduinoAPI;
      printer?: PrinterAPI;
    };
  }
}

export {};;