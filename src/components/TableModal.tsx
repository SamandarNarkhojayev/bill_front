import React, { useState } from 'react';
import { X, Plus, Minus, ShoppingCart, Coffee, Wine, Sandwich, Wind, Beer, Package, Tag, CircleDot } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { BarMenuItem } from '../types';

const iconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Coffee, Wine, Sandwich, Wind, Beer, Package, Tag, CircleDot,
};
const getIconComponent = (iconName: string) => iconMap[iconName] || Package;

const TableModal: React.FC = () => {
  const { activeModal, modalData, closeModal, barMenu, barCategories, addBarOrderToTable, tables, settings } =
    useStore();
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [activeCategory, setActiveCategory] = useState<string>('all');

  if (activeModal !== 'bar-order' || !modalData) return null;

  const tableId = modalData.tableId as number;
  const table = tables.find((t) => t.id === tableId);
  if (!table) return null;

  const sortedCategories = [...barCategories].sort((a, b) => a.sortOrder - b.sortOrder);

  const filteredMenu =
    activeCategory === 'all'
      ? barMenu.filter((i) => i.available)
      : barMenu.filter((i) => i.available && i.categoryId === activeCategory);

  const addToCart = (item: BarMenuItem) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.set(item.id, (next.get(item.id) || 0) + 1);
      return next;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const qty = next.get(itemId) || 0;
      if (qty <= 1) next.delete(itemId);
      else next.set(itemId, qty - 1);
      return next;
    });
  };

  const cartTotal = Array.from(cart.entries()).reduce((sum, [id, qty]) => {
    const item = barMenu.find((i) => i.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const cartCount = Array.from(cart.values()).reduce((sum, qty) => sum + qty, 0);

  const handleSubmit = () => {
    cart.forEach((qty, itemId) => {
      const item = barMenu.find((i) => i.id === itemId);
      if (item) {
        addBarOrderToTable(tableId, item, qty);
      }
    });
    setCart(new Map());
    closeModal();
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-bar">
          <h2 className="modal-title">
            <ShoppingCart size={20} className="text-amber-400" />
            Бар — {table.name}
          </h2>
          <button onClick={closeModal} className="modal-close">
            <X size={20} />
          </button>
        </div>

        {/* Категории */}
        <div className="bar-categories">
          <button
            onClick={() => setActiveCategory('all')}
            className={`bar-category-btn ${activeCategory === 'all' ? 'active' : ''}`}
          >
            <span>Все</span>
          </button>
          {sortedCategories.map((cat) => {
            const IconComp = getIconComponent(cat.icon);
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`bar-category-btn ${activeCategory === cat.id ? 'active' : ''}`}
                style={activeCategory === cat.id ? { background: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` } : {}}
              >
                <IconComp size={14} />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>

        {/* Меню */}
        <div className="bar-menu-grid">
          {filteredMenu.map((item) => {
            const inCart = cart.get(item.id) || 0;
            const cat = barCategories.find((c) => c.id === item.categoryId);
            const IconComp = cat ? getIconComponent(cat.icon) : Package;
            const isOutOfStock = item.stock === 0;
            return (
              <div
                key={item.id}
                className={`bar-menu-item ${inCart > 0 ? 'in-cart' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
              >
                <div className="bar-menu-item-icon" style={{ background: cat ? `${cat.color}15` : undefined }}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} />
                  ) : (
                    <IconComp size={30} style={{ color: cat?.color || '#94a3b8' }} />
                  )}
                </div>
                <div className="bar-menu-item-info">
                  <span className="bar-menu-item-name">{item.name}</span>
                  <span className="bar-menu-item-price">
                    {item.price} {settings.currency}
                  </span>
                </div>
                <div className="bar-menu-item-actions">
                  {inCart > 0 && (
                    <>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="bar-qty-btn minus"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="bar-qty">{inCart}</span>
                    </>
                  )}
                  <button
                    onClick={() => addToCart(item)}
                    className="bar-qty-btn plus"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Корзина и подтверждение */}
        {cartCount > 0 && (
          <div className="bar-cart-footer">
            <div className="bar-cart-info">
              <span className="bar-cart-count">{cartCount} позиций</span>
              <span className="bar-cart-total">
                {cartTotal} {settings.currency}
              </span>
            </div>
            <button onClick={handleSubmit} className="btn btn-amber">
              <ShoppingCart size={16} />
              Добавить к счёту
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableModal;
