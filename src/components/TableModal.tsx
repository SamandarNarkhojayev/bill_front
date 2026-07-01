import React, { useMemo, useRef, useState } from 'react';
import { X, Plus, Minus, ShoppingCart, Coffee, Wine, Sandwich, Wind, Beer, Package, Tag, CircleDot, Search, LayoutGrid, UtensilsCrossed } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useT } from '../i18n';
import type { BarMenuItem } from '../types';
import { printKitchenTicket } from '../utils/receipt';
import { getItemDepartment } from '../utils/department';

const iconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Coffee, Wine, Sandwich, Wind, Beer, Package, Tag, CircleDot,
};
const getIconComponent = (iconName: string) => iconMap[iconName] || Package;

const TableModal: React.FC = () => {
  const { activeModal, modalData, closeModal, barMenu, barCategories, addBarOrderToTable, tables, settings, addToast } =
    useStore();
  const { t } = useT();
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  // Защита от двойного клика по «Добавить к счёту» (ref обновляется синхронно).
  const submittingRef = useRef(false);
  // 'all' | 'dept:bar' | 'dept:kitchen' | <categoryId>
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const sortedCategories = useMemo(
    () => [...barCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [barCategories]
  );

  const filteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    return barMenu.filter((i) => {
      if (!i.available) return false;
      if (activeCategory === 'dept:bar' && getItemDepartment(i, barCategories) !== 'bar') return false;
      else if (activeCategory === 'dept:kitchen' && getItemDepartment(i, barCategories) !== 'kitchen') return false;
      else if (activeCategory !== 'all' && !activeCategory.startsWith('dept:') && i.categoryId !== activeCategory)
        return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [barMenu, barCategories, activeCategory, query]);

  if (activeModal !== 'bar-order' || !modalData) return null;

  const tableId = modalData.tableId as number;
  const table = tables.find((t) => t.id === tableId);
  if (!table) return null;

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
    if (submittingRef.current) return;
    if (cart.size === 0) return;
    submittingRef.current = true;
    // Заказ блюд — на кухонный принтер (xprinter)
    if (settings.autoPrintKitchenTicket) {
      const kitchenItems: { name: string; quantity: number }[] = [];
      cart.forEach((qty, itemId) => {
        const item = barMenu.find((i) => i.id === itemId);
        if (item && getItemDepartment(item, barCategories) === 'kitchen') {
          kitchenItems.push({ name: item.name, quantity: qty });
        }
      });
      if (kitchenItems.length > 0) {
        void printKitchenTicket({
          clubName: settings.clubName,
          tableName: table.name,
          cashierName: settings.receiptCashierName,
          items: kitchenItems,
          receiptWidthMm: settings.receiptWidthMm,
          receiptFontSize: settings.receiptFontSize,
          receiptPaddingMm: settings.receiptPaddingMm,
          deviceName: settings.kitchenPrinterName,
        }).then((ok) => {
          if (!ok) addToast('error', t('bar.kitchen_print_failed'));
        });
      }
    }
    cart.forEach((qty, itemId) => {
      const item = barMenu.find((i) => i.id === itemId);
      if (item) {
        addBarOrderToTable(tableId, item, qty);
      }
    });
    setCart(new Map());
    closeModal();
    // Снимаем замок после закрытия модалки (следующее открытие — чистое).
    setTimeout(() => { submittingRef.current = false; }, 0);
  };

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-bar">
          <h2 className="modal-title">
            <ShoppingCart size={20} className="text-amber-400" />
            {t('bar.title_bar')} — {table.name}
          </h2>
          <button onClick={closeModal} className="modal-close">
            <X size={20} />
          </button>
        </div>

        {/* Поиск по меню */}
        <div className="bar-search">
          <Search size={16} className="bar-search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('bar.search_placeholder')}
            className="bar-search-input"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="bar-search-clear" type="button">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Категории: первые быстрые фильтры (Все / Бар / Кухня) выделены */}
        <div className="bar-categories">
          <button
            onClick={() => setActiveCategory('all')}
            className={`bar-category-btn bar-category-btn--primary ${activeCategory === 'all' ? 'active' : ''}`}
          >
            <LayoutGrid size={14} />
            <span>{t('bar.filter_all')}</span>
          </button>
          {settings.kitchenSeparate && (
            <>
              <button
                onClick={() => setActiveCategory('dept:bar')}
                className={`bar-category-btn bar-category-btn--primary ${activeCategory === 'dept:bar' ? 'active' : ''}`}
              >
                <Beer size={14} />
                <span>{t('bar.filter_bar')}</span>
              </button>
              <button
                onClick={() => setActiveCategory('dept:kitchen')}
                className={`bar-category-btn bar-category-btn--primary ${activeCategory === 'dept:kitchen' ? 'active' : ''}`}
              >
                <UtensilsCrossed size={14} />
                <span>{t('bar.filter_kitchen')}</span>
              </button>
            </>
          )}
          <span className="bar-cat-divider" aria-hidden="true" />
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
        {filteredMenu.length === 0 ? (
          <div className="bar-menu-empty">
            <Search size={28} />
            <span>{t('bar.nothing_found')}</span>
          </div>
        ) : (
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
        )}

        {/* Корзина и подтверждение */}
        {cartCount > 0 && (
          <div className="bar-cart-footer">
            <div className="bar-cart-info">
              <span className="bar-cart-count">{t('bar.positions_count', { count: cartCount })}</span>
              <span className="bar-cart-total">
                {cartTotal} {settings.currency}
              </span>
            </div>
            <button onClick={handleSubmit} className="btn btn-amber">
              <ShoppingCart size={16} />
              {t('bar.add_to_bill')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TableModal;
