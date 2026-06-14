/**
 * UI-секция облачной синхронизации (biliardo.kz).
 * Владелец вводит телефон CLUB-аккаунта + API-пароль (задаётся на biliardo.kz
 * в Настройках профиля → «API-пароль для desktop-приложения»).
 * После логина приложение каждые 30с отправляет snapshot и завершённые сессии,
 * а также держит WS-канал для управления столами из веб-кабинета.
 *
 * Приложение всегда работает с продакшен-доменом biliardo.kz — без ручной настройки URL.
 */
import React, { useEffect, useState } from 'react';
import {
  Cloud, CloudOff, LogIn, LogOut, RefreshCw, AlertCircle, CheckCircle2,
  ShieldCheck, Globe, Radio, Clock, Loader2,
} from 'lucide-react';
import cloudSync from '../utils/cloudSync';

interface Status {
  loggedIn: boolean;
  clubName: string | null;
  lastSyncAt: number | null;
  lastError: string | null;
  pendingSessions: number;
  wsConnected: boolean;
}

const formatPhone = (value: string, prevValue = '') => {
  let digits = value.replace(/\D/g, '');
  const prev = prevValue.replace(/\D/g, '');
  if (value.length < prevValue.length && digits.length === prev.length) {
    digits = digits.slice(0, -1);
  }
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  digits = digits.slice(0, 11);
  const local = digits.slice(1);
  let f = '+7';
  if (local.length > 0) f += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) f += ')';
  if (local.length > 3) f += ` ${local.slice(3, 6)}`;
  if (local.length > 6) f += `-${local.slice(6, 8)}`;
  if (local.length > 8) f += `-${local.slice(8, 10)}`;
  return f;
};

const normalizePhone = (formatted: string): string => {
  let digits = formatted.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  return '+' + digits;
};

const relTime = (ts: number | null): string => {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'только что';
  if (diff < 60) return `${diff} сек назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  return new Date(ts).toLocaleTimeString();
};

const CloudSyncSection: React.FC = () => {
  const [status, setStatus] = useState<Status>(cloudSync.getStatus());
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = cloudSync.subscribe((s) => setStatus(s));
    return unsub;
  }, []);

  // Тикер раз в 10 сек чтобы lastSyncAt обновлялся в UI
  useEffect(() => {
    const id = setInterval(() => setStatus(cloudSync.getStatus()), 10_000);
    return () => clearInterval(id);
  }, []);

  const handleLogin = async () => {
    if (!phone || password.length < 8) return;
    setSubmitting(true);
    const res = await cloudSync.login(normalizePhone(phone), password);
    setSubmitting(false);
    if (res.ok) {
      setPhone('');
      setPassword('');
      cloudSync.startAutoSync();
    }
  };

  const handleLogout = () => {
    if (confirm('Отключить облачную синхронизацию? Данные продолжат сохраняться локально.')) {
      cloudSync.logout();
    }
  };

  const handleManualSync = async () => {
    setSubmitting(true);
    await cloudSync.syncNow();
    setSubmitting(false);
  };

  const connected = status.loggedIn;

  return (
    <div className="settings-section settings-section-full cloud-sync">
      <div className="cloud-sync-head">
        <h3 className="settings-section-title" style={{ margin: 0 }}>
          {connected ? <Cloud size={18} /> : <CloudOff size={18} />}
          Облачная синхронизация
        </h3>
        <span className={`cloud-pill ${connected ? 'on' : 'off'}`}>
          <span className="cloud-pill-dot" />
          {connected ? 'Подключено' : 'Не подключено'}
        </span>
      </div>

      <div className="settings-fields" style={{ marginTop: 14 }}>
        {connected ? (
          <>
            {/* Карточка статуса подключения */}
            <div className="cloud-card cloud-card-ok">
              <div className="cloud-card-icon"><CheckCircle2 size={22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cloud-card-title">
                  {status.clubName ?? 'Клуб подключён'}
                </div>
                <div className="cloud-stat-grid">
                  <div className="cloud-stat">
                    <Clock size={14} />
                    <span>Синхронизация: <strong>{relTime(status.lastSyncAt)}</strong></span>
                  </div>
                  <div className="cloud-stat">
                    <Radio size={14} style={{ color: status.wsConnected ? '#22c55e' : '#fbbf24' }} />
                    <span>
                      Канал управления:{' '}
                      <strong style={{ color: status.wsConnected ? '#86efac' : '#fbbf24' }}>
                        {status.wsConnected ? 'онлайн' : 'переподключение…'}
                      </strong>
                    </span>
                  </div>
                </div>
                {status.pendingSessions > 0 && (
                  <div className="cloud-note cloud-note-warn">
                    В очереди {status.pendingSessions} сессий — отправятся при следующей синхронизации
                  </div>
                )}
                {status.lastError && (
                  <div className="cloud-note cloud-note-err">Ошибка: {status.lastError}</div>
                )}
              </div>
            </div>

            <div className="cloud-actions">
              <button onClick={handleManualSync} disabled={submitting} className="btn btn-primary">
                <RefreshCw size={15} className={submitting ? 'animate-spin' : ''} />
                Синхронизировать сейчас
              </button>
              <button onClick={handleLogout} className="btn btn-ghost cloud-btn-danger">
                <LogOut size={15} />
                Отключить
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Объяснение */}
            <div className="cloud-card cloud-card-info">
              <div className="cloud-card-icon"><AlertCircle size={22} /></div>
              <div style={{ flex: 1 }}>
                <div className="cloud-card-title">Подключите клуб к личному кабинету</div>
                <p className="cloud-card-text">
                  Столы, выручка и смены станут видны в веб-кабинете владельца на biliardo.kz,
                  а столами можно будет управлять удалённо. Зарегистрируйте CLUB-аккаунт на сайте
                  и задайте «API-пароль для desktop-приложения» в профиле.
                </p>
                {status.lastError && (
                  <div className="cloud-note cloud-note-err">{status.lastError}</div>
                )}
              </div>
            </div>

            {/* Форма входа */}
            <div className="cloud-form">
              <label className="cloud-field">
                <span className="cloud-field-label">Телефон CLUB-аккаунта</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value, phone))}
                  placeholder="+7 (___) ___-__-__"
                  className="form-input"
                />
              </label>
              <label className="cloud-field">
                <span className="cloud-field-label">API-пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                  placeholder="Минимум 8 символов"
                  className="form-input"
                  autoComplete="off"
                />
              </label>
              <button
                onClick={handleLogin}
                disabled={submitting || !phone || password.length < 8}
                className="btn btn-primary cloud-submit"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
                {submitting ? 'Подключение…' : 'Подключить'}
              </button>
            </div>
          </>
        )}

        {/* Подвал: сервер и безопасность */}
        <div className="cloud-footer">
          <span className="cloud-footer-item"><Globe size={13} /> Сервер: biliardo.kz</span>
          <span className="cloud-footer-item"><ShieldCheck size={13} /> Защищённое соединение</span>
        </div>
      </div>
    </div>
  );
};

export default CloudSyncSection;
