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

export interface ArduinoAPI {
  listPorts(): Promise<SerialPort[]>;
  connect(portPath: string): Promise<{ success: boolean }>;
  disconnect(): Promise<{ success: boolean }>;
  setRelay(relayNumber: number, state: boolean): Promise<{ success: boolean }>;
  getStatus(): Promise<{ success: boolean }>;
  isConnected(): Promise<boolean>;
  getRelayStates(): Promise<boolean[]>;
  
  // События
  onRelayChanged(callback: (data: RelayChangeEvent) => void): void;
  onStatusUpdate(callback: (states: boolean[]) => void): void;
  onButtonPressed(callback: (data: ButtonPressEvent) => void): void;
  onMessage(callback: (message: string) => void): void;
  onError(callback: (error: string) => void): void;
  onDisconnected(callback: () => void): void;
  removeAllListeners(channel: string): void;
}

declare global {
  interface Window {
    electronAPI: {
      arduino: ArduinoAPI;
    };
  }
}

export {};