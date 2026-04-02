import React from 'react';
import { AlertTriangle, Download, X, RefreshCw, CheckCircle } from 'lucide-react';
import type { UpdaterState } from '../types/arduino';

interface UpdateModalProps {
  updater: UpdaterState;
  onConfirm: () => void;
  onCancel: () => void;
  onRestart: () => void;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ updater, onConfirm, onCancel, onRestart }) => {
  const isDownloading = updater.status === 'downloading';
  const isDownloaded = updater.status === 'downloaded';
  const isInstalling = updater.status === 'installing' || updater.status === 'installed';

  return (
    <div className="modal-overlay">
      <div className="update-modal">
        <button className="modal-close-btn" onClick={onCancel} disabled={isDownloading || isInstalling}>
          <X size={20} />
        </button>

        <div className="update-modal-icon">
          {isDownloaded ? (
            <CheckCircle size={48} className="text-green-500" />
          ) : isInstalling ? (
            <RefreshCw size={48} className="text-blue-500 animate-spin" />
          ) : (
            <AlertTriangle size={48} />
          )}
        </div>

        <h2 className="update-modal-title">
          {isDownloaded ? 'Обновление готово' :
           isInstalling ? 'Установка обновления' :
           'Доступно обновление'}
        </h2>
        
        <div className="update-modal-version">
          Версия: <strong>v{updater.availableVersion}</strong>
        </div>

        {isDownloading && (
          <div className="update-progress">
            <div className="update-progress-bar">
              <div 
                className="update-progress-fill" 
                style={{ width: `${updater.percent || 0}%` }}
              />
            </div>
            <div className="update-progress-text">
              Скачивание... {updater.percent || 0}%
            </div>
          </div>
        )}

        {isInstalling && (
          <div className="update-installing">
            <div className="update-installing-spinner">
              <RefreshCw size={24} className="animate-spin" />
            </div>
            <div className="update-installing-text">
              Установка обновления...
            </div>
          </div>
        )}

        {!isDownloading && !isInstalling && (
          <div className="update-modal-warning">
            <div className="update-modal-warning-title">
              ⚠️ Внимание!
            </div>
            <ul className="update-modal-warning-list">
              <li>Приложение будет временно недоступно</li>
              <li>Все активные сессии будут сохранены</li>
              <li>Процесс обновления займёт 10-30 секунд</li>
              <li>После установки приложение автоматически перезапустится</li>
            </ul>
          </div>
        )}

        {isDownloaded && (
          <p className="update-modal-description">
            Обновление скачано. Нажмите "Перезагрузить" для установки.
          </p>
        )}

        <div className="update-modal-actions">
          {!isDownloading && !isInstalling && !isDownloaded && (
            <>
              <button onClick={onCancel} className="btn btn-ghost">
                Отменить
              </button>
              <button onClick={onConfirm} className="btn btn-primary">
                <Download size={16} />
                Начать обновление
              </button>
            </>
          )}
          
          {isDownloaded && (
            <button onClick={onRestart} className="btn btn-primary">
              <RefreshCw size={16} />
              Перезагрузить
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
