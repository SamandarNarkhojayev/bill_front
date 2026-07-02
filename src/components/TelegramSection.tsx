/**
 * UI-секция «Telegram-бот» (Настройки).
 *
 * Бот не только шлёт уведомления, но и показывает данные по кнопкам прямо в чате
 * (Сегодня / Столы / Смена / Остатки / Последние сессии) — приложение держит
 * long-polling и отвечает на нажатия. Всё бессерверно (telegram.ts).
 *
 * Настройка в 3 шага:
 *  1. Токен бота от @BotFather.
 *  2. Задать КОД доступа. Сотрудник отправляет боту «/start <код>» — только с верным
 *     кодом чат получает доступ. Можно подключить несколько чатов.
 *  3. Проверить связь.
 */
import React, { useEffect, useState } from 'react';
import {
  Send, Bot, CheckCircle2, AlertCircle, Loader2, Power, Activity,
  ShieldCheck, Save, KeyRound, ExternalLink,
} from 'lucide-react';
import telegram, { type TelegramStatus, type TelegramConfig, type TelegramEvent } from '../utils/telegram';
import { showConfirm } from './confirmController';

const EVENT_LABELS: { key: TelegramEvent; emoji: string; label: string; hint: string }[] = [
  { key: 'shiftClose', emoji: '🧾', label: 'Отчёт при закрытии смены', hint: 'Сводка: оператор, выручка, сессии' },
  { key: 'tableLoad', emoji: '🎱', label: 'Загрузка столов', hint: 'Стол занят / освобождён + общая загрузка' },
  { key: 'sessionEnd', emoji: '⏹', label: 'Конец сессии стола', hint: 'Длительность и сумма по каждой сессии' },
  { key: 'dailySummary', emoji: '📊', label: 'Ежедневный итог', hint: 'Автоотчёт за день в заданное время' },
  { key: 'lowStock', emoji: '⚠️', label: 'Низкий остаток', hint: 'Когда товар бара заканчивается' },
];

const relTime = (ts: number | null): string => {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'только что';
  if (diff < 60) return `${diff} сек назад`;
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  return new Date(ts).toLocaleTimeString();
};

const TelegramSection: React.FC = () => {
  const [status, setStatus] = useState<TelegramStatus>(telegram.getStatus());
  const [config, setConfigState] = useState<TelegramConfig>(telegram.getConfig());
  // Токен НЕ префиллим в поле (защита: не держим секрет в DOM). Если он уже
  // сохранён — показываем статус и кнопку «Изменить».
  const [token, setToken] = useState('');
  const [editingToken, setEditingToken] = useState(!telegram.getConfig().botToken);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const unsub = telegram.subscribe((s) => {
      setStatus(s);
      setConfigState(telegram.getConfig());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setStatus(telegram.getStatus()), 5_000);
    return () => clearInterval(id);
  }, []);

  const patch = (p: Partial<TelegramConfig>) => setConfigState(telegram.setConfig(p));
  const patchEvent = (key: TelegramEvent, value: boolean) =>
    setConfigState(telegram.setConfig({ events: { ...config.events, [key]: value } }));

  const handleSaveToken = () => {
    patch({ botToken: token.trim() });
    setTokenSaved(true);
    setFeedback(null);
    setEditingToken(false);
    setToken(''); // не держим секрет в state после сохранения
    setTimeout(() => setTokenSaved(false), 1500);
  };

  const handleCheckToken = async () => {
    const t = token.trim();
    if (!t) return;
    patch({ botToken: t });
    setCheckingToken(true);
    setFeedback(null);
    const res = await telegram.checkToken(t);
    setCheckingToken(false);
    setFeedback(res.ok ? { type: 'ok', text: `Токен рабочий: @${res.username}` } : { type: 'err', text: res.error });
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    const res = await telegram.sendTestMessage();
    setTesting(false);
    setFeedback(res.ok ? { type: 'ok', text: 'Тестовое сообщение отправлено ✓' } : { type: 'err', text: res.error || 'Не удалось отправить' });
  };

  const enabled = config.enabled;
  const configured = status.configured;
  const hasToken = status.hasToken;

  // Главный статус-чип
  const pill = enabled && configured && status.polling
    ? { cls: 'on', text: 'Бот активен' }
    : enabled && hasToken
      ? { cls: 'wait', text: 'Ожидание входа по коду' }
      : configured
        ? { cls: 'off', text: 'Выключен' }
        : { cls: 'off', text: 'Не настроен' };

  const botLink = status.botUsername ? `https://t.me/${status.botUsername}` : null;

  return (
    <div className="settings-section settings-section-full tg-section">
      {/* Hero */}
      <div className="tg-hero">
        <div className="tg-hero-icon"><Bot size={26} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="tg-hero-title">Telegram-бот</h3>
          <p className="tg-hero-sub">Уведомления и просмотр данных по кнопкам прямо в Telegram</p>
        </div>
        <span className={`tg-pill ${pill.cls}`}>
          <span className="tg-pill-dot" />
          {pill.text}
        </span>
      </div>

      {/* Мастер-переключатель */}
      <div className="tg-master">
        <div className="tg-master-l">
          <Power size={18} className={enabled ? 'tg-ic-on' : 'tg-ic-off'} />
          <div>
            <div className="tg-master-title">{enabled ? 'Бот включён' : 'Бот выключен'}</div>
            <div className="tg-master-sub">Главный переключатель Telegram-канала</div>
          </div>
        </div>
        <button onClick={() => patch({ enabled: !enabled })} className={`toggle ${enabled ? 'on' : 'off'}`}>
          <div className="toggle-dot" />
        </button>
      </div>

      {/* ШАГ 1 — Токен */}
      <div className="tg-step">
        <div className="tg-step-badge">1</div>
        <div className="tg-step-body">
          <div className="tg-step-title"><KeyRound size={15} /> Токен бота</div>
          {!editingToken && status.hasToken ? (
            <>
              <p className="tg-step-text">Токен сохранён и не отображается из соображений безопасности.</p>
              <div className="tg-btn-row">
                <span className="tg-chip-ok">
                  <CheckCircle2 size={13} /> Токен сохранён{status.botUsername ? ` · @${status.botUsername}` : ''}
                </span>
                <button onClick={() => { setEditingToken(true); setToken(''); }} className="btn btn-ghost">
                  Изменить
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="tg-step-text">
                Откройте <b>@BotFather</b> в Telegram → <code>/newbot</code> → скопируйте токен и вставьте сюда.
              </p>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAH..."
                className="form-input"
                autoComplete="off"
              />
              <div className="tg-btn-row">
                <button onClick={handleSaveToken} disabled={!token.trim()} className="btn btn-primary">
                  <Save size={15} />{tokenSaved ? 'Сохранено ✓' : 'Сохранить'}
                </button>
                <button onClick={handleCheckToken} disabled={checkingToken || !token.trim()} className="btn btn-ghost">
                  {checkingToken ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Проверить
                </button>
                {status.hasToken && (
                  <button onClick={() => { setEditingToken(false); setToken(''); }} className="btn btn-ghost">Отмена</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ШАГ 2 — Код доступа и подключение чатов */}
      <div className="tg-step">
        <div className={`tg-step-badge ${configured ? 'done' : ''}`}>{configured ? '✓' : '2'}</div>
        <div className="tg-step-body">
          <div className="tg-step-title"><KeyRound size={15} /> Код доступа и подключение</div>
          <p className="tg-step-text">
            Задайте <b>код доступа</b>. Сотрудник открывает бота и отправляет
            <code> /start КОД</code> — только с верным кодом чат получит доступ.
            Можно подключить несколько человек; все они видят кнопки и получают уведомления.
          </p>

          <label className="tg-param" style={{ display: 'block', marginBottom: 10 }}>
            <span className="tg-param-label">Код доступа</span>
            <input
              type="text"
              value={config.accessCode}
              onChange={(e) => patch({ accessCode: e.target.value.trim() })}
              placeholder="например, 4821"
              className="form-input"
              autoComplete="off"
            />
          </label>
          {!config.accessCode && (
            <div className="cloud-note cloud-note-err" style={{ marginBottom: 10 }}>
              <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Код не задан — новые чаты не смогут подключиться.
            </div>
          )}

          <div className="tg-btn-row">
            {botLink && (
              <a href={botLink} target="_blank" rel="noreferrer" className="btn btn-primary">
                <ExternalLink size={15} />Открыть бота
              </a>
            )}
          </div>

          {status.authorizedChats.length > 0 ? (
            <div className="tg-btn-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {status.authorizedChats.map((c) => (
                <span key={c.id} className="tg-chip-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} /> {c.title || c.id}
                  <button
                    onClick={async () => {
                      const ok = await showConfirm({ title: 'Убрать доступ', message: `Убрать доступ у «${c.title || c.id}»?`, confirmText: 'Убрать', danger: true });
                      if (ok) telegram.removeAuthorizedChat(c.id);
                    }}
                    title="Убрать доступ"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 15, lineHeight: 1, padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={async () => {
                  const ok = await showConfirm({ title: 'Отвязать все чаты', message: 'Отвязать ВСЕ чаты? Доступ придётся получать заново по коду.', confirmText: 'Отвязать все', danger: true });
                  if (ok) telegram.unlinkChat();
                }}
                className="btn btn-ghost"
              >
                Отвязать все
              </button>
            </div>
          ) : (
            <span className="tg-chip-wait" style={{ marginTop: 8 }}>
              {enabled && hasToken ? <Activity size={13} className="animate-pulse" /> : <AlertCircle size={13} />}
              {enabled && hasToken ? 'Жду «/start КОД» от сотрудника…' : 'Сначала включите бота и сохраните токен'}
            </span>
          )}
        </div>
      </div>

      {/* ШАГ 3 — Проверка */}
      <div className="tg-step">
        <div className="tg-step-badge">3</div>
        <div className="tg-step-body">
          <div className="tg-step-title"><Send size={15} /> Проверить связь</div>
          <p className="tg-step-text">Отправим тестовое сообщение во все подключённые чаты.</p>
          <div className="tg-btn-row">
            <button onClick={handleTest} disabled={testing || !configured} className="btn btn-ghost">
              {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Отправить тест
            </button>
          </div>
        </div>
      </div>

      {/* Фидбек */}
      {feedback && (
        <div className={`cloud-note ${feedback.type === 'ok' ? 'cloud-note-ok' : 'cloud-note-err'}`}>
          {feedback.type === 'ok'
            ? <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            : <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
          {feedback.text}
        </div>
      )}
      {!feedback && status.lastError && status.lastError !== 'disabled' && status.lastError !== 'not configured' && (
        <div className="cloud-note cloud-note-err">Ошибка: {status.lastError}</div>
      )}

      {/* События */}
      <div className="tg-events">
        <div className="tg-block-title">Уведомления о событиях</div>
        {EVENT_LABELS.map((ev) => (
          <div className="tg-event-row" key={ev.key}>
            <div className="tg-event-l">
              <span className="tg-event-emoji">{ev.emoji}</span>
              <div>
                <div className="tg-event-label">{ev.label}</div>
                <div className="tg-event-hint">{ev.hint}</div>
              </div>
            </div>
            <button
              onClick={() => patchEvent(ev.key, !config.events[ev.key])}
              className={`toggle ${config.events[ev.key] ? 'on' : 'off'}`}
            >
              <div className="toggle-dot" />
            </button>
          </div>
        ))}
      </div>

      {/* Параметры */}
      {(config.events.dailySummary || config.events.lowStock) && (
        <div className="tg-params">
          {config.events.dailySummary && (
            <label className="tg-param">
              <span className="tg-param-label">Время ежедневного итога</span>
              <input
                type="time"
                value={config.dailySummaryTime}
                onChange={(e) => patch({ dailySummaryTime: e.target.value })}
                className="form-input"
              />
            </label>
          )}
          {config.events.lowStock && (
            <label className="tg-param">
              <span className="tg-param-label">Порог низкого остатка</span>
              <input
                type="number"
                min={0}
                value={config.lowStockThreshold}
                onChange={(e) => patch({ lowStockThreshold: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                className="form-input"
              />
            </label>
          )}
        </div>
      )}

      {/* Подвал */}
      <div className="tg-footer">
        <span className="tg-footer-item">
          <Activity size={13} style={{ color: status.polling ? '#22c55e' : '#64748b' }} />
          {status.polling ? 'Бот слушает кнопки' : 'Бот не слушает'}
        </span>
        {configured && <span className="tg-footer-item"><Send size={13} /> Отправлено: {relTime(status.lastSentAt)}</span>}
        <span className="tg-footer-item"><ShieldCheck size={13} /> Прямое соединение с Telegram</span>
      </div>
    </div>
  );
};

export default TelegramSection;
