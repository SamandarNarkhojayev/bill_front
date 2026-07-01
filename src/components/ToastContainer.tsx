import React from 'react';
import { CheckCircle, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useShallow } from 'zustand/react/shallow';

const iconMap = {
  success: <CheckCircle size={18} />,
  info: <Info size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <XCircle size={18} />,
};

const ToastContainer: React.FC = () => {
  // Всегда смонтирован — подписываемся только на тосты, а не на весь стор.
  const { toasts, removeToast } = useStore(
    useShallow((s) => ({ toasts: s.toasts, removeToast: s.removeToast }))
  );

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{iconMap[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => removeToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
