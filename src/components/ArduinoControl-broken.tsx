import React, { useState, useEffect, useCallback } from 'react';
import type { SerialPort, RelayChangeEvent, ButtonPressEvent } from '../types/arduino';

interface RelayControlProps {
  relayNumber: number;
  state: boolean;
  onToggle: (relay: number, state: boolean) => void;
  disabled?: boolean;
}

const RelayControl: React.FC<RelayControlProps> = ({ relayNumber, state, onToggle, disabled }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg shadow border">
      <div className="flex items-center space-x-3">
        <div className={`w-4 h-4 rounded-full ${state ? 'bg-green-500' : 'bg-gray-300'}`}></div>
        <span className="font-medium text-gray-900">Реле {relayNumber}</span>
        <span className={`text-sm px-2 py-1 rounded ${state ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
          {state ? 'ВКЛ' : 'ВЫКЛ'}
        </span>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={() => onToggle(relayNumber, true)}
          disabled={disabled || state}
          className={`px-3 py-1 rounded text-sm font-medium ${
            state 
              ? 'bg-green-500 text-white cursor-default' 
              : 'bg-gray-200 text-gray-700 hover:bg-green-500 hover:text-white disabled:opacity-50'
          }`}
        >
          ВКЛ
        </button>
        <button
          onClick={() => onToggle(relayNumber, false)}
          disabled={disabled || !state}
          className={`px-3 py-1 rounded text-sm font-medium ${
            !state 
              ? 'bg-red-500 text-white cursor-default' 
              : 'bg-gray-200 text-gray-700 hover:bg-red-500 hover:text-white disabled:opacity-50'
          }`}
        >
          ВЫКЛ
        </button>
      </div>
    </div>
  );
};

const ArduinoControl: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [availablePorts, setAvailablePorts] = useState<SerialPort[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [relayStates, setRelayStates] = useState<boolean[]>([false, false, false, false]);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  // Добавить сообщение в лог
  const addMessage = (message: string) => {
    setMessages(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Загрузить список портов
  const loadPorts = useCallback(async () => {
    try {
      if (window.electronAPI?.arduino) {
        const ports = await window.electronAPI.arduino.listPorts();
        setAvailablePorts(ports);
        if (ports.length > 0 && !selectedPort) {
          setSelectedPort(ports[0].path);
        }
      }
    } catch (error) {
      setError(`Ошибка загрузки портов: ${error}`);
    }
  }, [selectedPort]);

  // Подключиться к Arduino
  const connectToArduino = async () => {
    if (!selectedPort) {
      setError('Выберите порт для подключения');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      await window.electronAPI.arduino.connect(selectedPort);
      setIsConnected(true);
      addMessage(`Подключено к ${selectedPort}`);
      
      // Запросить текущий статус
      setTimeout(async () => {
        await window.electronAPI.arduino.getStatus();
      }, 1000);
    } catch (error) {
      setError(`Ошибка подключения: ${error}`);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // Отключиться от Arduino
  const disconnectFromArduino = async () => {
    try {
      await window.electronAPI.arduino.disconnect();
      setIsConnected(false);
      addMessage('Отключено от Arduino');
    } catch (error) {
      setError(`Ошибка отключения: ${error}`);
    }
  };

  // Управление реле
  const handleRelayToggle = async (relayNumber: number, state: boolean) => {
    try {
      await window.electronAPI.arduino.setRelay(relayNumber, state);
    } catch (error) {
      setError(`Ошибка управления реле ${relayNumber}: ${error}`);
    }
  };

  // Подписка на события Arduino
  useEffect(() => {
    if (!window.electronAPI?.arduino) return;

    const arduino = window.electronAPI.arduino;

    // Изменение состояния реле
    arduino.onRelayChanged((data: RelayChangeEvent) => {
      setRelayStates(prev => {
        const newStates = [...prev];
        newStates[data.relay - 1] = data.state;
        return newStates;
      });
      addMessage(`Реле ${data.relay} ${data.state ? 'включено' : 'выключено'}`);
    });

    // Обновление статуса
    arduino.onStatusUpdate((states: boolean[]) => {
      setRelayStates(states);
      addMessage('Статус обновлен');
    });

    // Нажатие кнопки на Arduino
    arduino.onButtonPressed((data: ButtonPressEvent) => {
      addMessage(`🔘 Кнопка ${data.relay} нажата (${data.state ? 'ВКЛ' : 'ВЫКЛ'})`);
    });

    // Сообщения от Arduino
    arduino.onMessage((message: string) => {
      addMessage(`Arduino: ${message}`);
    });

    // Ошибки
    arduino.onError((error: string) => {
      setError(error);
      addMessage(`❌ ${error}`);
    });

    // Отключение
    arduino.onDisconnected(() => {
      setIsConnected(false);
      addMessage('🔌 Arduino отключено');
    });

    return () => {
      arduino.removeAllListeners('relay-changed');
      arduino.removeAllListeners('status-update');
      arduino.removeAllListeners('button-pressed');
      arduino.removeAllListeners('message');
      arduino.removeAllListeners('error');
      arduino.removeAllListeners('disconnected');
    };
  }, []);

  // Загрузить порты при монтировании
  useEffect(() => {
    loadPorts();
  }, [loadPorts]);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 text-center">Управление Arduino ESP32-C3</h1>

      
      {/* Подключение */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Подключение</h2>
        
        <div className="flex items-center space-x-4 mb-4">
          <select
            value={selectedPort}
            onChange={(e) => setSelectedPort(e.target.value)}
            disabled={isConnected || isConnecting}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Выберите порт...</option>
            {availablePorts.map(port => (
              <option key={port.path} value={port.path}>
                {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''} 
                {port.serialNumber ? ` [${port.serialNumber}]` : ''}
              </option>
            ))}
          </select>
          
          <button
            onClick={loadPorts}
            disabled={isConnecting}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
          >
            🔄
          </button>
          
          {!isConnected ? (
            <button
              onClick={connectToArduino}
              disabled={!selectedPort || isConnecting}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {isConnecting ? 'Подключение...' : 'Подключить'}
            </button>
          ) : (
            <button
              onClick={disconnectFromArduino}
              className="px-6 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Отключить
            </button>
          )}
        </div>
          </select>

          
          <button
            onClick={loadPorts}
            disabled={isConnecting}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
          >
            🔄
          </button>
          
          {!isConnected ? (
            <button
              onClick={connectToArduino}
              disabled={!selectedPort || isConnecting}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {isConnecting ? 'Подключение...' : 'Подключить'}
            </button>
          ) : (
            <button
              onClick={disconnectFromArduino}
              className="px-6 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Отключить
            </button>
          )}
        </div>
        
        <div className={`text-sm p-3 rounded ${isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
          Статус: {isConnected ? 'Подключено' : 'Не подключено'}
        </div>
      </div>


      {/* Управление реле */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Управление реле</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {relayStates.map((state, index) => (
            <RelayControl
              key={index}
              relayNumber={index + 1}
              state={state}
              onToggle={handleRelayToggle}
              disabled={!isConnected}
            />
          ))}
        </div>
      </div>

      {/* Лог сообщений */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Лог сообщений</h2>
        
        <div className="bg-gray-900 text-green-400 p-4 rounded-md h-40 overflow-y-auto font-mono text-sm">
          {messages.length === 0 ? (
            <div className="text-gray-500">Нет сообщений...</div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className="mb-1">{message}</div>
            ))
          )}
        </div>
      </div>

      {/* Ошибки */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="text-red-700 hover:text-red-900"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArduinoControl;