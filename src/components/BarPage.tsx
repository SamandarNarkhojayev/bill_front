import React, { useState, useRef } from 'react';
import {
  Wine,
  Plus,
  Minus,
  ShoppingCart,
  Trash2,
  Search,
  Edit3,
  Check,
  X,
  Package,
  ClipboardList,
  Image as ImageIcon,
  Layers,
  AlertTriangle,
  BarChart3,
  Coffee,
  Sandwich,
  Wind,
  Beer,
  CircleDot,
  GripVertical,
  PackageOpen,
  Archive,
  Tag,
  Printer,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import type { BarMenuItem, BarCategoryConfig, InventoryRevisionItem } from '../types';
import { generateBarSaleReceiptHTML } from '../utils/receipt';

// Маппинг иконок
const iconMap: Record<string, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  Coffee, Wine, Sandwich, Wind, Beer, Package, Tag, CircleDot,
};

const getIconComponent = (iconName: string) => iconMap[iconName] || Package;

const colorPresets = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a855f7',
  '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
];

type BarTab = 'quick-order' | 'menu' | 'categories';

const BarPage: React.FC = () => {
  const {
    barMenu, barCategories, addMenuItem, updateMenuItem, removeMenuItem,
    addBarCategory, updateBarCategory, removeBarCategory,
    tables, addBarOrderToTable, settings, updateStock,
    createRevision, inventoryRevisions, sellFromBar,
  } = useStore();

  const [activeTab, setActiveTab] = useState<BarTab>('quick-order');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  // Меню
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<BarMenuItem>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '', price: 0, costPrice: 0, categoryId: '',
    image: '', stock: -1 as number, unit: 'шт',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Заказ
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [quickCart, setQuickCart] = useState<Map<string, number>>(new Map());
  const [shopMode, setShopMode] = useState(false);

  // Категории
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: 'Coffee', color: '#3b82f6', sortOrder: 0 });
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState<Partial<BarCategoryConfig>>({});

  // Ревизия
  const [revisionItems, setRevisionItems] = useState<Map<string, number>>(new Map());
  const [revisionNotes, setRevisionNotes] = useState('');
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);

  // Модальное окно подтверждения печати чека
  const [showPrintModal, setShowPrintModal] = useState(false);

  const occupiedTables = tables.filter((t) => t.status === 'occupied');
  const sortedCategories = [...barCategories].sort((a, b) => a.sortOrder - b.sortOrder);

  const filteredMenu = barMenu.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = activeCategory === 'all' || item.categoryId === activeCategory;
    return matchSearch && matchCategory;
  });

  const getCategoryById = (id: string) => barCategories.find((c) => c.id === id);

  // Быстрый заказ
  const addToQuickCart = (item: BarMenuItem) => {
    if (item.stock === 0) return;
    setQuickCart((prev) => {
      const next = new Map(prev);
      const current = next.get(item.id) || 0;
      if (item.stock > 0 && current >= item.stock) return prev;
      next.set(item.id, current + 1);
      return next;
    });
  };

  const removeFromQuickCart = (itemId: string) => {
    setQuickCart((prev) => {
      const next = new Map(prev);
      const qty = next.get(itemId) || 0;
      if (qty <= 1) next.delete(itemId);
      else next.set(itemId, qty - 1);
      return next;
    });
  };

  const quickCartTotal = Array.from(quickCart.entries()).reduce((sum, [id, qty]) => {
    const item = barMenu.find((i) => i.id === id);
    return sum + (item ? item.price * qty : 0);
  }, 0);

  const quickCartCount = Array.from(quickCart.values()).reduce((s, q) => s + q, 0);

  const executeQuickOrder = () => {
    if (shopMode) {
      const items: { menuItem: BarMenuItem; quantity: number }[] = [];
      quickCart.forEach((qty, itemId) => {
        const item = barMenu.find((i) => i.id === itemId);
        if (item) items.push({ menuItem: item, quantity: qty });
      });
      if (items.length === 0) return;
      sellFromBar(items);
    } else {
      if (!selectedTable) return;
      quickCart.forEach((qty, itemId) => {
        const item = barMenu.find((i) => i.id === itemId);
        if (item) addBarOrderToTable(selectedTable, item, qty);
      });
    }
    setQuickCart(new Map());
  };

  const handlePrintAndSell = async () => {
    // Собираем позиции для чека
    const receiptItems: { name: string; quantity: number; price: number }[] = [];
    quickCart.forEach((qty, itemId) => {
      const item = barMenu.find((i) => i.id === itemId);
      if (item) receiptItems.push({ name: item.name, quantity: qty, price: item.price });
    });
    const tableName = !shopMode && selectedTable
      ? tables.find((t) => t.id === selectedTable)?.name
      : undefined;
    try {
      const html = generateBarSaleReceiptHTML({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        items: receiptItems,
        totalCost: quickCartTotal,
        currency: settings.currency,
        tableName,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
      });
      await window.electronAPI?.printer?.printReceipt(html, settings.receiptWidthMm, settings.silentPrint);
    } catch (err) {
      console.error('Bar receipt print error:', err);
    }
    setShowPrintModal(false);
    executeQuickOrder();
  };

  const handleSellWithoutPrint = () => {
    setShowPrintModal(false);
    executeQuickOrder();
  };

  const handleQuickOrder = () => {
    if (quickCart.size === 0) return;
    if (!shopMode && !selectedTable) return;
    setShowPrintModal(true);
  };

  // Картинки
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'new' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (target === 'new') setNewItem((p) => ({ ...p, image: dataUrl }));
      else setEditForm((p) => ({ ...p, image: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const startEdit = (item: BarMenuItem) => {
    setEditingItem(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = (id: string) => {
    updateMenuItem(id, editForm);
    setEditingItem(null);
  };

  const handleAddItem = () => {
    if (!newItem.name || !newItem.price) return;
    addMenuItem({
      name: newItem.name,
      price: newItem.price,
      costPrice: newItem.costPrice,
      categoryId: newItem.categoryId || sortedCategories[0]?.id || '',
      available: true,
      image: newItem.image,
      stock: newItem.stock,
      unit: newItem.unit,
    });
    setNewItem({ name: '', price: 0, costPrice: 0, categoryId: '', image: '', stock: -1, unit: 'шт' });
    setShowAddForm(false);
  };

  // Ревизия
  const trackableItems = barMenu.filter((i) => i.stock >= 0);

  const startRevision = () => {
    const map = new Map<string, number>();
    trackableItems.forEach((item) => map.set(item.id, item.stock));
    setRevisionItems(map);
    setRevisionNotes('');
  };

  const handleSaveRevision = () => {
    const items: Omit<InventoryRevisionItem, 'difference'>[] = trackableItems.map((item) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      expectedStock: item.stock,
      actualStock: revisionItems.get(item.id) ?? item.stock,
      costPrice: item.costPrice,
    }));
    createRevision(items, revisionNotes);
    setRevisionItems(new Map());
  };

  // Рендер
  const renderItemImage = (item: BarMenuItem, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClass = `bar-item-img bar-item-img-${size}`;
    const cat = getCategoryById(item.categoryId);
    if (item.image) {
      return <div className={sizeClass}><img src={item.image} alt={item.name} /></div>;
    }
    const IconComp = cat ? getIconComponent(cat.icon) : Package;
    return (
      <div className={sizeClass} style={{ background: cat ? `${cat.color}20` : 'rgba(255,255,255,0.05)' }}>
        <IconComp size={size === 'lg' ? 28 : size === 'md' ? 22 : 16} style={{ color: cat?.color || '#94a3b8' }} />
      </div>
    );
  };

  const renderStockBadge = (item: BarMenuItem) => {
    if (item.stock === -1) return null;
    const isLow = item.stock <= 3 && item.stock > 0;
    const isOut = item.stock === 0;
    return (
      <span className={`stock-badge ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>
        {isOut ? 'Нет' : `${item.stock} ${item.unit}`}
      </span>
    );
  };

  return (
    <div className="page-content">
      {/* Модальное окно: Распечатать чек? */}
      {showPrintModal && (
        <div className="modal-overlay" onClick={() => setShowPrintModal(false)}>
          <div className="modal bar-print-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Printer size={22} style={{ color: '#f59e0b' }} />
                Распечатать пречек?
              </div>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '16px 24px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                {shopMode ? 'Продажа бара' : 'Добавление к счёту стола'}:
              </p>
              <p style={{ fontWeight: 600, fontSize: 18, marginTop: 6 }}>
                {quickCartTotal.toLocaleString()} {settings.currency}
              </p>
            </div>
            <div className="modal-actions">
              <button onClick={handleSellWithoutPrint} className="btn btn-ghost">
                Закрыть заказ
              </button>
              <button onClick={handlePrintAndSell} className="btn btn-primary">
                <Printer size={16} />
                Печать пречека
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <Wine size={28} className="text-amber-400" />
          <h2 className="page-title">Бар</h2>
        </div>
        <div className="bar-tabs">
          {([
            { id: 'quick-order' as BarTab, icon: ShoppingCart, label: 'Заказ' },
            { id: 'menu' as BarTab, icon: Edit3, label: 'Меню' },
            { id: 'categories' as BarTab, icon: Layers, label: 'Категории' },
          ]).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`bar-tab ${activeTab === tab.id ? 'active' : ''}`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Фильтры */}
      {(activeTab === 'quick-order' || activeTab === 'menu') && (
        <div className="bar-filters-v2">
          <div className="search-box-v2">
            <Search size={18} className="search-icon-v2" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..." className="search-input-v2" />
          </div>
          <div className="bar-cat-chips">
            <button onClick={() => setActiveCategory('all')}
              className={`bar-cat-chip ${activeCategory === 'all' ? 'active' : ''}`}>Все</button>
            {sortedCategories.map((cat) => {
              const IconComp = getIconComponent(cat.icon);
              return (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                  className={`bar-cat-chip ${activeCategory === cat.id ? 'active' : ''}`}
                  style={activeCategory === cat.id ? { background: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` } : {}}>
                  <IconComp size={14} />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* === БЫСТРЫЙ ЗАКАЗ === */}
      {activeTab === 'quick-order' && (
        <div className="bar-order-layout">
          <div className="bar-menu-grid-v2">
            {filteredMenu.filter((i) => i.available).map((item) => {
              const qty = quickCart.get(item.id) || 0;
              const isOutOfStock = item.stock === 0;
              return (
                <div key={item.id}
                  className={`bar-product-card ${qty > 0 ? 'in-cart' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                  onClick={() => !isOutOfStock && addToQuickCart(item)}>
                  {renderItemImage(item, 'lg')}
                  <div className="bar-product-info">
                    <span className="bar-product-name">{item.name}</span>
                    <span className="bar-product-price">{item.price.toLocaleString()} {settings.currency}</span>
                  </div>
                  {renderStockBadge(item)}
                  {qty > 0 && (
                    <div className="bar-product-qty-badge" onClick={(e) => e.stopPropagation()}>
                      <button className="bar-qty-btn-v2 minus" onClick={() => removeFromQuickCart(item.id)}><Minus size={14} /></button>
                      <span className="bar-qty-v2">{qty}</span>
                      <button className="bar-qty-btn-v2 plus" onClick={() => addToQuickCart(item)}><Plus size={14} /></button>
                    </div>
                  )}
                  {isOutOfStock && (
                    <div className="bar-product-overlay">
                      <AlertTriangle size={20} />
                      <span>Нет в наличии</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bar-order-sidebar">
            <div className="bar-sidebar-section">
              <h3 className="bar-sidebar-title"><GripVertical size={16} /> Режим продажи</h3>
              <div className="bar-table-list" style={{ marginBottom: 8 }}>
                <button
                  onClick={() => { setShopMode(false); }}
                  className={`bar-table-btn ${!shopMode ? 'selected' : ''}`}
                >
                  <span className="bar-table-btn-name">К столу</span>
                  <span className="bar-table-btn-mode">Добавить к счёту</span>
                </button>
                <button
                  onClick={() => { setShopMode(true); setSelectedTable(null); }}
                  className={`bar-table-btn ${shopMode ? 'selected' : ''}`}
                  style={shopMode ? { borderColor: '#f59e0b40', background: '#f59e0b10' } : {}}
                >
                  <span className="bar-table-btn-name">🛒 Без стола</span>
                  <span className="bar-table-btn-mode">Быстрая продажа</span>
                </button>
              </div>
              {!shopMode && (
                <>
                  {occupiedTables.length === 0 ? (
                    <p className="bar-sidebar-empty">Нет активных столов</p>
                  ) : (
                    <div className="bar-table-list">
                      {occupiedTables.map((table) => (
                        <button key={table.id} onClick={() => setSelectedTable(table.id)}
                          className={`bar-table-btn ${selectedTable === table.id ? 'selected' : ''}`}>
                          <span className="bar-table-btn-name">{table.name}</span>
                          <span className="bar-table-btn-mode">
                            {table.currentSession?.mode === 'time' ? 'По времени' : table.currentSession?.mode === 'amount' ? 'На сумму' : 'Бессрочно'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="bar-sidebar-section bar-cart-section">
              <h3 className="bar-sidebar-title">
                <ShoppingCart size={16} /> Корзина
                {quickCartCount > 0 && <span className="bar-cart-badge">{quickCartCount}</span>}
              </h3>
              {quickCart.size === 0 ? (
                <p className="bar-sidebar-empty">Корзина пуста</p>
              ) : (
                <>
                  <div className="bar-cart-items">
                    {Array.from(quickCart.entries()).map(([id, qty]) => {
                      const item = barMenu.find((i) => i.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="bar-cart-row">
                          {renderItemImage(item, 'sm')}
                          <div className="bar-cart-row-info">
                            <span className="bar-cart-row-name">{item.name}</span>
                            <span className="bar-cart-row-price">{(item.price * qty).toLocaleString()} {settings.currency}</span>
                          </div>
                          <div className="bar-cart-row-qty">
                            <button className="bar-qty-btn-v2 minus sm" onClick={() => removeFromQuickCart(id)}><Minus size={12} /></button>
                            <span>{qty}</span>
                            <button className="bar-qty-btn-v2 plus sm" onClick={() => addToQuickCart(item)}><Plus size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bar-cart-total-row">
                    <span>Итого</span>
                    <span className="bar-cart-total-value">{quickCartTotal.toLocaleString()} {settings.currency}</span>
                  </div>
                  <button onClick={handleQuickOrder} disabled={!shopMode && !selectedTable}
                    className={`btn ${shopMode ? 'btn-amber' : 'btn-amber'} btn-full bar-cart-submit`}>
                    <ShoppingCart size={18} /> {shopMode ? 'Создать заказ' : 'Добавить к счёту'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === УПРАВЛЕНИЕ МЕНЮ === */}
      {activeTab === 'menu' && (
        <div className="bar-menu-manage">
          <div className="bar-menu-manage-header">
            <button onClick={() => setShowAddForm(true)} className="btn btn-primary btn-lg">
              <Plus size={18} /> Добавить позицию
            </button>
          </div>

          {showAddForm && (
            <div className="bar-add-form">
              <div className="bar-add-form-row">
                <div className="bar-add-img-upload" onClick={() => fileInputRef.current?.click()}>
                  {newItem.image ? <img src={newItem.image} alt="" /> : <><ImageIcon size={24} /><span>Фото</span></>}
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => handleImageUpload(e, 'new')} />
                </div>
                <div className="bar-add-form-fields">
                  <input type="text" placeholder="Название" value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))} className="form-input" />
                  <div className="bar-add-form-row-inline">
                    <div className="bar-add-field"><label>Цена</label>
                      <input type="number" value={newItem.price || ''} onChange={(e) => setNewItem((p) => ({ ...p, price: Number(e.target.value) }))} className="form-input" /></div>
                    <div className="bar-add-field"><label>Себестоимость</label>
                      <input type="number" value={newItem.costPrice || ''} onChange={(e) => setNewItem((p) => ({ ...p, costPrice: Number(e.target.value) }))} className="form-input" /></div>
                  </div>
                  <div className="bar-add-form-row-inline">
                    <div className="bar-add-field"><label>Категория</label>
                      <select value={newItem.categoryId || sortedCategories[0]?.id} onChange={(e) => setNewItem((p) => ({ ...p, categoryId: e.target.value }))} className="form-select">
                        {sortedCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select></div>
                    <div className="bar-add-field"><label>Остаток</label>
                      <input type="number" value={newItem.stock} onChange={(e) => setNewItem((p) => ({ ...p, stock: Number(e.target.value) }))} className="form-input" /></div>
                    <div className="bar-add-field"><label>Ед.</label>
                      <select value={newItem.unit} onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))} className="form-select">
                        <option value="шт">шт</option><option value="мл">мл</option><option value="г">г</option><option value="л">л</option><option value="порц">порц</option>
                      </select></div>
                  </div>
                </div>
              </div>
              <div className="bar-add-form-actions">
                <button onClick={() => setShowAddForm(false)} className="btn btn-ghost">Отмена</button>
                <button onClick={handleAddItem} className="btn btn-primary"><Check size={16} /> Добавить</button>
              </div>
            </div>
          )}

          <div className="bar-menu-list-v2">
            {filteredMenu.map((item) => {
              const cat = getCategoryById(item.categoryId);
              if (editingItem === item.id) {
                return (
                  <div key={item.id} className="bar-menu-edit-card">
                    <div className="bar-add-form-row">
                      <div className="bar-add-img-upload sm" onClick={() => editFileInputRef.current?.click()}>
                        {editForm.image ? <img src={editForm.image} alt="" /> : <ImageIcon size={20} />}
                        <input ref={editFileInputRef} type="file" accept="image/*" hidden onChange={(e) => handleImageUpload(e, 'edit')} />
                      </div>
                      <div className="bar-add-form-fields">
                        <div className="bar-add-field">
                          <label>Название</label>
                          <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="form-input" />
                        </div>
                        <div className="bar-add-form-row-inline">
                          <div className="bar-add-field">
                            <label>Цена</label>
                            <input type="number" value={editForm.price || ''} onChange={(e) => setEditForm((p) => ({ ...p, price: Number(e.target.value) }))} className="form-input" placeholder="Цена" />
                          </div>
                          <div className="bar-add-field">
                            <label>Себестоимость</label>
                            <input type="number" value={editForm.costPrice || ''} onChange={(e) => setEditForm((p) => ({ ...p, costPrice: Number(e.target.value) }))} className="form-input" placeholder="Себест." />
                          </div>
                          <div className="bar-add-field">
                            <label>Категория</label>
                            <select value={editForm.categoryId || ''} onChange={(e) => setEditForm((p) => ({ ...p, categoryId: e.target.value }))} className="form-select">
                              {sortedCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="bar-add-field">
                            <label>Остаток</label>
                            <input type="number" value={editForm.stock ?? item.stock} onChange={(e) => setEditForm((p) => ({ ...p, stock: Number(e.target.value) }))} className="form-input" placeholder="Кол-во" />
                          </div>
                          <div className="bar-add-field">
                            <label>Ед.</label>
                            <select value={editForm.unit || item.unit || 'шт'} onChange={(e) => setEditForm((p) => ({ ...p, unit: e.target.value }))} className="form-select">
                              <option value="шт">шт</option>
                              <option value="мл">мл</option>
                              <option value="г">г</option>
                              <option value="л">л</option>
                              <option value="порц">порц</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bar-add-form-actions">
                      <button onClick={() => setEditingItem(null)} className="btn btn-ghost btn-sm"><X size={14} /> Отмена</button>
                      <button onClick={() => saveEdit(item.id)} className="btn btn-primary btn-sm"><Check size={14} /> Сохранить</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={item.id} className="bar-menu-row-v2">
                  {renderItemImage(item, 'md')}
                  <div className="bar-menu-row-info">
                    <span className="bar-menu-row-name">{item.name}</span>
                    <div className="bar-menu-row-meta">
                      {cat && <span className="bar-menu-row-cat" style={{ color: cat.color, background: `${cat.color}15` }}>{cat.name}</span>}
                      {renderStockBadge(item)}
                    </div>
                  </div>
                  <div className="bar-menu-row-prices">
                    <span className="bar-menu-row-price">{item.price.toLocaleString()} {settings.currency}</span>
                    {item.costPrice > 0 && <span className="bar-menu-row-cost">Себест. {item.costPrice.toLocaleString()}</span>}
                  </div>
                  <div className="bar-menu-row-actions">
                    <button onClick={() => updateMenuItem(item.id, { available: !item.available })}
                      className={`bar-toggle-avail ${item.available ? 'on' : 'off'}`}>
                      {item.available ? 'В наличии' : 'Скрыт'}
                    </button>
                    <button onClick={() => startEdit(item)} className="btn btn-ghost btn-icon"><Edit3 size={15} /></button>
                    <button onClick={() => removeMenuItem(item.id)} className="btn btn-ghost btn-icon text-red-400"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === КАТЕГОРИИ === (убран раздел Склад) */}
      {false && (
        <div className="bar-inventory">
          <div className="bar-inventory-header">
            <div className="bar-inventory-stats">
              <div className="bar-inv-stat">
                <PackageOpen size={18} />
                <div><span className="bar-inv-stat-val">{trackableItems.length}</span><span className="bar-inv-stat-label">С учётом</span></div>
              </div>
              <div className="bar-inv-stat warning">
                <AlertTriangle size={18} />
                <div><span className="bar-inv-stat-val">{trackableItems.filter((i) => i.stock <= 3 && i.stock > 0).length}</span><span className="bar-inv-stat-label">Мало</span></div>
              </div>
              <div className="bar-inv-stat danger">
                <Archive size={18} />
                <div><span className="bar-inv-stat-val">{trackableItems.filter((i) => i.stock === 0).length}</span><span className="bar-inv-stat-label">Закончилось</span></div>
              </div>
            </div>
            <div className="bar-inventory-actions">
              <button onClick={() => setShowRevisionHistory(!showRevisionHistory)} className="btn btn-ghost">
                <BarChart3 size={16} /> История ({inventoryRevisions.length})
              </button>
              {revisionItems.size === 0 ? (
                <button onClick={startRevision} className="btn btn-primary btn-lg"><ClipboardList size={18} /> Начать ревизию</button>
              ) : (
                <button onClick={handleSaveRevision} className="btn btn-emerald btn-lg"><Check size={18} /> Сохранить ревизию</button>
              )}
            </div>
          </div>

          {showRevisionHistory && inventoryRevisions.length > 0 && (
            <div className="bar-revision-history">
              <h3 className="bar-sidebar-title"><BarChart3 size={16} /> История ревизий</h3>
              {inventoryRevisions.slice().reverse().slice(0, 5).map((rev) => {
                const totalDiff = rev.items.reduce((s, i) => s + (i.difference < 0 ? Math.abs(i.difference) * i.costPrice : 0), 0);
                const negCount = rev.items.filter((i) => i.difference < 0).length;
                return (
                  <div key={rev.id} className="bar-revision-card">
                    <div className="bar-revision-card-header">
                      <span className="bar-revision-date">{new Date(rev.timestamp).toLocaleDateString('ru-RU')}</span>
                      {negCount > 0 && <span className="bar-revision-diff">−{totalDiff.toLocaleString()} {settings.currency} недостача</span>}
                    </div>
                    {rev.notes && <p className="bar-revision-notes">{rev.notes}</p>}
                    <div className="bar-revision-items">
                      {rev.items.filter((i) => i.difference !== 0).map((i, idx) => (
                        <span key={idx} className={`bar-revision-item ${i.difference < 0 ? 'neg' : 'pos'}`}>
                          {i.menuItemName}: {i.difference > 0 ? '+' : ''}{i.difference}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bar-stock-table">
            <div className="bar-stock-header">
              <span>Товар</span><span>Категория</span><span>Себест.</span><span>Остаток</span>
              {revisionItems.size > 0 && <span>Факт</span>}
              <span>Действия</span>
            </div>
            {trackableItems.map((item) => {
              const cat = getCategoryById(item.categoryId);
              const isLow = item.stock <= 3 && item.stock > 0;
              const isOut = item.stock === 0;
              return (
                <div key={item.id} className={`bar-stock-row ${isOut ? 'out' : isLow ? 'low' : ''}`}>
                  <div className="bar-stock-cell-product">{renderItemImage(item, 'sm')}<span>{item.name}</span></div>
                  <span className="bar-stock-cell-cat" style={{ color: cat?.color }}>{cat?.name || '—'}</span>
                  <span className="bar-stock-cell-cost">{item.costPrice.toLocaleString()} {settings.currency}</span>
                  <div className="bar-stock-cell-qty">
                    <span className={`stock-qty ${isOut ? 'out' : isLow ? 'low' : ''}`}>{item.stock} {item.unit}</span>
                  </div>
                  {revisionItems.size > 0 && (
                    <div className="bar-stock-cell-fact">
                      <input type="number" value={revisionItems.get(item.id) ?? item.stock}
                        onChange={(e) => { const val = Number(e.target.value); setRevisionItems((prev) => { const next = new Map(prev); next.set(item.id, val); return next; }); }}
                        className="form-input form-input-xs" min={0} />
                    </div>
                  )}
                  <div className="bar-stock-cell-actions">
                    <button className="bar-qty-btn-v2 plus sm" onClick={() => updateStock(item.id, 1)}><Plus size={12} /></button>
                    <button className="bar-qty-btn-v2 minus sm" onClick={() => updateStock(item.id, -1)}><Minus size={12} /></button>
                  </div>
                </div>
              );
            })}
            {trackableItems.length === 0 && (
              <p className="bar-sidebar-empty" style={{ padding: 24 }}>Нет товаров с учётом остатков</p>
            )}
          </div>
          {revisionItems.size > 0 && (
            <div className="bar-revision-footer">
              <input type="text" placeholder="Заметки к ревизии..." value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)} className="form-input" style={{ flex: 1 }} />
              <button onClick={() => setRevisionItems(new Map())} className="btn btn-ghost">Отмена</button>
              <button onClick={handleSaveRevision} className="btn btn-emerald"><Check size={16} /> Сохранить</button>
            </div>
          )}
        </div>
      )}

      {/* === КАТЕГОРИИ === */}
      {activeTab === 'categories' && (
        <div className="bar-categories-manage">
          <div className="bar-menu-manage-header">
            <button onClick={() => setShowAddCategory(true)} className="btn btn-primary btn-lg"><Plus size={18} /> Новая категория</button>
          </div>

          {showAddCategory && (
            <div className="bar-add-form">
              <div className="bar-cat-form-row">
                <div className="bar-add-field"><label>Название</label>
                  <input type="text" value={newCat.name} onChange={(e) => setNewCat((p) => ({ ...p, name: e.target.value }))} className="form-input" /></div>
                <div className="bar-add-field"><label>Иконка</label>
                  <select value={newCat.icon} onChange={(e) => setNewCat((p) => ({ ...p, icon: e.target.value }))} className="form-select">
                    {Object.keys(iconMap).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select></div>
                <div className="bar-add-field"><label>Цвет</label>
                  <div className="color-presets">
                    {colorPresets.map((c) => (
                      <button key={c} onClick={() => setNewCat((p) => ({ ...p, color: c }))}
                        className={`color-dot ${newCat.color === c ? 'active' : ''}`} style={{ background: c }} />
                    ))}
                  </div></div>
              </div>
              <div className="bar-add-form-actions">
                <button onClick={() => setShowAddCategory(false)} className="btn btn-ghost">Отмена</button>
                <button onClick={() => {
                  if (!newCat.name) return;
                  addBarCategory({ name: newCat.name, icon: newCat.icon, color: newCat.color, sortOrder: barCategories.length });
                  setNewCat({ name: '', icon: 'Coffee', color: '#3b82f6', sortOrder: 0 });
                  setShowAddCategory(false);
                }} className="btn btn-primary"><Check size={16} /> Создать</button>
              </div>
            </div>
          )}

          <div className="bar-cat-list">
            {sortedCategories.map((cat) => {
              const IconComp = getIconComponent(cat.icon);
              const itemCount = barMenu.filter((i) => i.categoryId === cat.id).length;
              if (editingCat === cat.id) {
                return (
                  <div key={cat.id} className="bar-cat-card editing">
                    <input type="text" value={editCatForm.name || ''} onChange={(e) => setEditCatForm((p) => ({ ...p, name: e.target.value }))} className="form-input" />
                    <select value={editCatForm.icon || ''} onChange={(e) => setEditCatForm((p) => ({ ...p, icon: e.target.value }))} className="form-select">
                      {Object.keys(iconMap).map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <div className="color-presets">
                      {colorPresets.map((c) => (
                        <button key={c} onClick={() => setEditCatForm((p) => ({ ...p, color: c }))}
                          className={`color-dot ${editCatForm.color === c ? 'active' : ''}`} style={{ background: c }} />
                      ))}
                    </div>
                    <div className="bar-cat-card-actions">
                      <button onClick={() => setEditingCat(null)} className="btn btn-ghost btn-sm"><X size={14} /></button>
                      <button onClick={() => { updateBarCategory(cat.id, editCatForm); setEditingCat(null); }} className="btn btn-primary btn-sm"><Check size={14} /></button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={cat.id} className="bar-cat-card" style={{ borderColor: `${cat.color}30` }}>
                  <div className="bar-cat-card-icon" style={{ background: `${cat.color}20`, color: cat.color }}><IconComp size={24} /></div>
                  <div className="bar-cat-card-info">
                    <span className="bar-cat-card-name">{cat.name}</span>
                    <span className="bar-cat-card-count">{itemCount} позиций</span>
                  </div>
                  <div className="bar-cat-card-actions">
                    <button onClick={() => { setEditingCat(cat.id); setEditCatForm({ ...cat }); }} className="btn btn-ghost btn-icon"><Edit3 size={15} /></button>
                    <button onClick={() => removeBarCategory(cat.id)} className="btn btn-ghost btn-icon text-red-400"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BarPage;
