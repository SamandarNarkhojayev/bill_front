import React, { useState, useEffect } from 'react';
import { X, MapPin, Phone } from 'lucide-react';

const AdBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
    }
  }, [isVisible]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
    }, 300);
    // Показать баннер снова через 2 минуты
    setTimeout(() => {
      setIsVisible(true);
    }, 2 * 60 * 1000); // 120000 мс = 2 минуты
  };

  if (!isVisible) return null;

  return (
    <div className={`ad-banner ${isAnimating ? 'ad-banner-visible' : ''}`}>
      <div className="ad-banner-glow"></div>
      <div className="ad-banner-content">
        <div className="ad-banner-icon">🎱</div>
        <div className="ad-banner-text">
          <div className="ad-banner-label">Реклама</div>
          <div className="ad-banner-message">
            <span className="ad-banner-title">ВСЁ ДЛЯ БИЛЬЯРДА В ШЫМКЕНТЕ</span>
            <div className="ad-banner-details">
              <span className="ad-banner-detail">
                <MapPin size={13} />
                Дулати 162
              </span>
              <span className="ad-banner-divider">•</span>
              <span className="ad-banner-detail">
                <Phone size={13} />
                8 702 480 90 70
              </span>
            </div>
            <span className="ad-banner-subtitle">Оборудование • Ремонт столов • Кии • Автоматизация</span>
          </div>
        </div>
        <button 
          onClick={handleClose}
          className="ad-banner-close"
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default AdBanner;
