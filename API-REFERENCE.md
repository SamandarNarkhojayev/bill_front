# 🔧 API Reference

## Arduino Service API

### Connection Methods

```typescript
// Get available serial ports
listPorts(): Promise<SerialPort[]>

// Connect to Arduino
connect(portPath: string): Promise<{success: boolean}>

// Disconnect from Arduino
disconnect(): Promise<{success: boolean}>

// Check connection status
isConnected(): Promise<boolean>
```

### Control Methods

```typescript
// Set relay state (relay: 1-4, state: true/false)
setRelay(relayNumber: number, state: boolean): Promise<{success: boolean}>

// Request status of all relays
getStatus(): Promise<{success: boolean}>

// Get current relay states
getRelayStates(): Promise<boolean[]>
```

### Event Subscription

```typescript
// Relay state changed
onRelayChanged(callback: (data: {relay: number, state: boolean}) => void): void

// All relays status update  
onStatusUpdate(callback: (states: boolean[]) => void): void

// Physical button pressed on Arduino
onButtonPressed(callback: (data: {relay: number, state: boolean}) => void): void

// Messages from Arduino
onMessage(callback: (message: string) => void): void

// Error events
onError(callback: (error: string) => void): void

// Arduino disconnected
onDisconnected(callback: () => void): void

// Unsubscribe from events
removeAllListeners(channel: string): void
```

## TypeScript Interfaces

```typescript
interface SerialPort {
  path: string;           // Port path (/dev/cu.usbmodem1201)
  manufacturer?: string;  // Device manufacturer
  serialNumber?: string;  // Serial number
  pnpId?: string;        // PnP identifier
  locationId?: string;   // Location ID
  vendorId?: string;     // Vendor ID
  productId?: string;    // Product ID
}

interface RelayChangeEvent {
  relay: number;    // Relay number (1-4)
  state: boolean;   // State (true=ON, false=OFF)
}

interface ButtonPressEvent {
  relay: number;    // Button/relay number (1-4)
  state: boolean;   // New state after button press
}
```

## Serial Protocol

### Commands (PC → Arduino)

| Command | Description | Arduino Response |
|---------|-------------|------------------|
| `RELAY1_ON` | Turn relay 1 ON | `OK RELAY1 ON` |
| `RELAY1_OFF` | Turn relay 1 OFF | `OK RELAY1 OFF` |
| `RELAY2_ON` | Turn relay 2 ON | `OK RELAY2 ON` |
| `RELAY2_OFF` | Turn relay 2 OFF | `OK RELAY2 OFF` |
| `RELAY3_ON` | Turn relay 3 ON | `OK RELAY3 ON` |
| `RELAY3_OFF` | Turn relay 3 OFF | `OK RELAY3 OFF` |
| `RELAY4_ON` | Turn relay 4 ON | `OK RELAY4 ON` |
| `RELAY4_OFF` | Turn relay 4 OFF | `OK RELAY4 OFF` |
| `STATUS` | Get all relays status | `STATUS: R1=ON R2=OFF R3=OFF R4=ON` |

### Messages (Arduino → PC)

| Type | Format | Description |
|------|--------|-------------|
| Ready | `✅ ESP32-C3 4-Relay USB Control Ready` | Arduino initialized |
| Help | `Use commands: RELAY1_ON / RELAY1_OFF ...` | Available commands |
| Config | `ACTIVE_LOW=false (HIGH = ON)` | Relay configuration |
| Confirmation | `OK RELAY1 ON` | Command executed |
| Button | `🔘 BUTTON RELAY1 ON` | Physical button pressed |
| Status | `STATUS: R1=ON R2=OFF R3=OFF R4=ON` | Current relay states |
| Error | `❌ UNKNOWN COMMAND: xyz` | Unknown command |

## Usage Examples

### Basic Connection
```typescript
// List available ports
const ports = await window.electronAPI.arduino.listPorts();
console.log('Available ports:', ports);

// Connect to first available port
if (ports.length > 0) {
  await window.electronAPI.arduino.connect(ports[0].path);
  console.log('Connected!');
}
```

### Control Relays
```typescript
// Turn on relay 1
await window.electronAPI.arduino.setRelay(1, true);

// Turn off relay 2  
await window.electronAPI.arduino.setRelay(2, false);

// Get current states
const states = await window.electronAPI.arduino.getRelayStates();
console.log('Relay states:', states); // [true, false, false, false]
```

### Event Handling
```typescript
// Listen for relay changes
window.electronAPI.arduino.onRelayChanged((data) => {
  console.log(`Relay ${data.relay} is now ${data.state ? 'ON' : 'OFF'}`);
});

// Listen for button presses
window.electronAPI.arduino.onButtonPressed((data) => {
  console.log(`Button ${data.relay} pressed, relay is now ${data.state ? 'ON' : 'OFF'}`);
});

// Listen for Arduino messages
window.electronAPI.arduino.onMessage((message) => {
  console.log('Arduino says:', message);
});
```

### Error Handling
```typescript
try {
  await window.electronAPI.arduino.connect('/dev/cu.usbmodem1201');
} catch (error) {
  console.error('Connection failed:', error);
}

// Listen for errors
window.electronAPI.arduino.onError((error) => {
  console.error('Arduino error:', error);
});
```

## Connection Parameters

- **Baud Rate**: 115200
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: None
- **Flow Control**: None
- **Line Ending**: `\n` (LF)

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `Port not found` | Arduino not detected | Check USB connection |
| `Access denied` | Port already in use | Close other applications |
| `Connection timeout` | Arduino not responding | Check firmware |
| `Invalid relay number` | Relay number not 1-4 | Use valid relay number |