import { useState } from 'react'
import ArduinoControl from './components/ArduinoControl'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<'arduino' | 'billiard'>('arduino')

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Навигация */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Billiard Control System</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveTab('arduino')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'arduino'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:text-blue-500'
                }`}
              >
                Arduino
              </button>
              <button
                onClick={() => setActiveTab('billiard')}
                className={`px-4 py-2 rounded-md font-medium ${
                  activeTab === 'billiard'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 hover:text-blue-500'
                }`}
              >
                Бильярд
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Основной контент */}
      <main className="py-6">
        {activeTab === 'arduino' && <ArduinoControl />}
        {activeTab === 'billiard' && (
          <div className="max-w-4xl mx-auto p-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Бильярд</h2>
            <p className="text-gray-600">Функции управления бильярдом будут добавлены здесь</p>
            <div className="mt-8 p-8 bg-white rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Возможные функции:</h3>
              <ul className="text-left space-y-2">
                <li>• Управление освещением стола</li>
                <li>• Счетчик очков</li>
                <li>• Таймер игры</li>
                <li>• Выбор режима игры</li>
                <li>• Статистика игр</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
