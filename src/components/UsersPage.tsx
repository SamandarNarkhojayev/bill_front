import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  UserCheck,
  Shield,
  Code,
  Trash2,
  Edit3,
  X,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Clock,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { UserRole } from '../types';

const UsersPage: React.FC = () => {
  const { users, currentUser, addUser, updateUser, removeUser, changeUserPassword, shiftHistory } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  // Форма добавления
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('admin');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [addError, setAddError] = useState('');

  // Форма смены пароля
  const [newPass, setNewPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);

  // Редактирование
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('admin');

  const handleAddUser = () => {
    setAddError('');
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setAddError('Заполните все поля');
      return;
    }
    if (newPassword.length < 4) {
      setAddError('Пароль минимум 4 символа');
      return;
    }
    const success = addUser(newUsername.trim(), newPassword, newDisplayName.trim(), newRole);
    if (!success) {
      setAddError('Пользователь с таким логином уже существует');
      return;
    }
    setNewUsername('');
    setNewPassword('');
    setNewDisplayName('');
    setNewRole('admin');
    setShowAddModal(false);
  };

  const handleStartEdit = (user: typeof users[0]) => {
    setEditingUser(user.id);
    setEditDisplayName(user.displayName);
    setEditRole(user.role);
  };

  const handleSaveEdit = (id: string) => {
    updateUser(id, { displayName: editDisplayName.trim(), role: editRole });
    setEditingUser(null);
  };

  const handleChangePassword = (id: string) => {
    if (newPass.length < 4) return;
    changeUserPassword(id, newPass);
    setNewPass('');
    setShowPasswordModal(null);
  };

  const handleRemoveUser = (id: string, name: string) => {
    if (id === currentUser?.id) return;
    if (window.confirm(`Удалить пользователя "${name}"?`)) {
      removeUser(id);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'developer': return <Code size={14} />;
      case 'admin': return <Shield size={14} />;
      case 'user': return <UserCheck size={14} />;
      default: return <UserCheck size={14} />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'developer': return 'Разработчик';
      case 'admin': return 'Админ';
      case 'user': return 'Пользователь';
      default: return role;
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (ts: number) => {
    return new Date(ts).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: number, end: number) => {
    const diff = Math.floor((end - start) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}ч ${m}м`;
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Users size={24} className="text-violet-400" />
          <h2 className="page-title">Пользователи</h2>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <UserPlus size={16} />
            <span>Добавить</span>
          </button>
        </div>
      </div>

      {/* Список пользователей */}
      <div className="users-grid">
        {users.map((user) => (
          <div
            key={user.id}
            className={`user-card ${!user.isActive ? 'user-disabled' : ''} ${user.id === currentUser?.id ? 'user-current' : ''}`}
          >
            <div className="user-card-header">
              <div className="user-card-avatar">
                {getRoleIcon(user.role)}
              </div>
              <div className="user-card-info">
                {editingUser === user.id ? (
                  <input
                    className="user-edit-input"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <span className="user-card-name">{user.displayName}</span>
                )}
                <span className="user-card-login">@{user.username}</span>
              </div>
              {user.id === currentUser?.id && (
                <span className="user-you-badge">Вы</span>
              )}
            </div>

            <div className="user-card-details">
              <div className="user-card-detail">
                <span className="user-detail-label">Роль</span>
                {editingUser === user.id ? (
                  <select
                    className="user-edit-select"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as UserRole)}
                  >
                    <option value="admin">Админ</option>
                    <option value="user">Пользователь</option>
                    <option value="developer">Разработчик</option>
                  </select>
                ) : (
                  <span className={`user-role-badge role-${user.role}`}>
                    {getRoleIcon(user.role)}
                    {getRoleLabel(user.role)}
                  </span>
                )}
              </div>
              <div className="user-card-detail">
                <span className="user-detail-label">Создан</span>
                <span className="user-detail-value">{formatDate(user.createdAt)}</span>
              </div>
              <div className="user-card-detail">
                <span className="user-detail-label">Статус</span>
                <span className={`user-status ${user.isActive ? 'active' : 'inactive'}`}>
                  {user.isActive ? 'Активен' : 'Заблокирован'}
                </span>
              </div>
            </div>

            <div className="user-card-actions">
              {editingUser === user.id ? (
                <>
                  <button className="btn-icon btn-success-icon" onClick={() => handleSaveEdit(user.id)} title="Сохранить">
                    <Check size={16} />
                  </button>
                  <button className="btn-icon btn-cancel-icon" onClick={() => setEditingUser(null)} title="Отмена">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-icon" onClick={() => handleStartEdit(user)} title="Редактировать">
                    <Edit3 size={16} />
                  </button>
                  <button className="btn-icon" onClick={() => setShowPasswordModal(user.id)} title="Сменить пароль">
                    <KeyRound size={16} />
                  </button>
                  {user.id !== currentUser?.id && (
                    <button
                      className="btn-icon btn-danger-icon"
                      onClick={() => handleRemoveUser(user.id, user.displayName)}
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* История смен */}
      {shiftHistory.length > 0 && (
        <div className="users-shift-history">
          <h3 className="users-section-title">
            <Clock size={18} />
            <span>История смен</span>
          </h3>
          <div className="shift-history-list">
            {shiftHistory.slice(0, 20).map((shift) => (
              <div key={shift.id} className="shift-history-item">
                <span className="shift-history-user">{shift.userName}</span>
                <span className="shift-history-date">
                  {formatDateTime(shift.startTime)}
                  {shift.endTime && ` — ${formatDateTime(shift.endTime)}`}
                </span>
                <span className="shift-history-duration">
                  {shift.endTime ? formatDuration(shift.startTime, shift.endTime) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно: добавить пользователя */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Новый пользователь</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              {addError && <div className="login-error"><span>{addError}</span></div>}

              <div className="login-field">
                <label className="login-label">Имя</label>
                <input
                  className="login-input"
                  placeholder="Отображаемое имя"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="login-field">
                <label className="login-label">Логин</label>
                <input
                  className="login-input"
                  placeholder="Латиница, без пробелов"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>
              <div className="login-field">
                <label className="login-label">Пароль</label>
                <div className="login-password-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Минимум 4 символа"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div className="login-field">
                <label className="login-label">Роль</label>
                <select className="login-input" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                  <option value="admin">Администратор</option>
                  <option value="user">Пользователь</option>
                  <option value="developer">Разработчик</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleAddUser}>
                <UserPlus size={16} />
                <span>Добавить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно: смена пароля */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Сменить пароль</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="login-field">
                <label className="login-label">Новый пароль</label>
                <div className="login-password-wrapper">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    className="login-input"
                    placeholder="Минимум 4 символа"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowNewPass(!showNewPass)}
                    tabIndex={-1}
                  >
                    {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPasswordModal(null)}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => handleChangePassword(showPasswordModal)}
                disabled={newPass.length < 4}
              >
                <Check size={16} />
                <span>Сохранить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
