import React, { useState } from 'react';
import { CircleDot, Eye, EyeOff, LogIn, AlertCircle, ChevronDown, Shield, Code, UserCheck } from 'lucide-react';
import { useStore } from '../store/useStore';

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'developer': return 'Разработчик';
    case 'admin': return 'Администратор';
    case 'user': return 'Пользователь';
    default: return role;
  }
};

const LoginPage: React.FC = () => {
  const { login, users } = useStore();
  const activeUsers = users.filter((u) => u.isActive);
  const [selectedUserId, setSelectedUserId] = useState(activeUsers[0]?.id || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedUser = activeUsers.find((u) => u.id === selectedUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUserId || !password.trim()) {
      setError('Выберите пользователя и введите пароль');
      return;
    }

    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 300));

    const user = activeUsers.find((u) => u.id === selectedUserId);
    if (!user) {
      setError('Пользователь не найден');
      setIsLoading(false);
      return;
    }

    const success = login(user.username, password);
    if (!success) {
      setError('Неверный пароль');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-container">
        <div className="login-card">
          {/* Логотип */}
          <div className="login-logo">
            <div className="login-logo-icon">
              <CircleDot size={48} />
            </div>
            <h1 className="login-title">Biliardo</h1>
            <p className="login-subtitle">Система управления бильярдным клубом</p>
          </div>

          {/* Форма */}
          <form className="login-form" onSubmit={handleSubmit}>
            {error && (
              <div className="login-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label className="login-label">Пользователь</label>
              <div className="login-select-wrapper">
                <select
                  className="login-input login-select"
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    setError('');
                  }}
                >
                  {activeUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} — {getRoleLabel(user.role)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="login-select-icon" />
              </div>
              {selectedUser && (
                <div className="login-user-preview">
                  <div className={`login-preview-role role-${selectedUser.role === 'developer' ? 'dev' : selectedUser.role}`}>
                    {selectedUser.role === 'developer' ? <Code size={12} /> : selectedUser.role === 'admin' ? <Shield size={12} /> : <UserCheck size={12} />}
                    <span>{getRoleLabel(selectedUser.role)}</span>
                  </div>
                  <span className="login-preview-login">@{selectedUser.username}</span>
                </div>
              )}
            </div>

            <div className="login-field">
              <label className="login-label">Пароль</label>
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="login-spinner" />
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Войти</span>
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <span>© 2026 Biliardo — Automation for Billiard Club</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
