import React, { useState } from 'react';
import { Tag, Plus, Clock, Trash2, Edit, Package, ShoppingBag, Hash, Cpu } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useT } from '../i18n';
import { parseTimeToMinutes } from '../utils/pricing';
import NumberInput from './NumberInput';
import type { Tariff, TariffMenuProduct, BarMenuItem, TablePriceRule } from '../types';

const DAY_MINUTES = 24 * 60;

const formatMinutes = (value: number) => {
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getRuleSegments = (rule: Pick<TablePriceRule, 'startTime' | 'endTime'>): Array<{ start: number; end: number }> => {
  const start = parseTimeToMinutes(rule.startTime);
  const end = parseTimeToMinutes(rule.endTime);

  if (start === end) {
    return [{ start: 0, end: DAY_MINUTES }];
  }

  if (start < end) {
    return [{ start, end }];
  }

  return [
    { start, end: DAY_MINUTES },
    { start: 0, end },
  ];
};

const rulesOverlap = (left: Pick<TablePriceRule, 'startTime' | 'endTime'>, right: Pick<TablePriceRule, 'startTime' | 'endTime'>): boolean => {
  const leftSegments = getRuleSegments(left);
  const rightSegments = getRuleSegments(right);

  return leftSegments.some((leftSegment) => (
    rightSegments.some((rightSegment) => (
      leftSegment.start < rightSegment.end && rightSegment.start < leftSegment.end
    ))
  ));
};

const findPriceScheduleConflict = (rules: TablePriceRule[]): { firstRule: TablePriceRule; secondRule: TablePriceRule } | null => {
  for (let i = 0; i < rules.length; i += 1) {
    const currentRule = rules[i];
    const currentStart = parseTimeToMinutes(currentRule.startTime);
    const currentEnd = parseTimeToMinutes(currentRule.endTime);

    if (currentStart === currentEnd) {
      return { firstRule: currentRule, secondRule: currentRule };
    }

    for (let j = i + 1; j < rules.length; j += 1) {
      const compareRule = rules[j];
      if (rulesOverlap(currentRule, compareRule)) {
        return { firstRule: currentRule, secondRule: compareRule };
      }
    }
  }

  return null;
};

type PriceScheduleConflict =
  | { type: 'sameRule' }
  | { type: 'overlap'; firstStart: string; firstEnd: string; secondStart: string; secondEnd: string };

const getPriceScheduleConflict = (rules: TablePriceRule[]): PriceScheduleConflict | null => {
  const conflict = findPriceScheduleConflict(rules);
  if (!conflict) {
    return null;
  }

  const isSameRuleConflict = conflict.firstRule.id === conflict.secondRule.id;
  if (isSameRuleConflict) {
    return { type: 'sameRule' };
  }

  return {
    type: 'overlap',
    firstStart: conflict.firstRule.startTime,
    firstEnd: conflict.firstRule.endTime,
    secondStart: conflict.secondRule.startTime,
    secondEnd: conflict.secondRule.endTime,
  };
};

const TariffsPage: React.FC = () => {
  const { settings, updateSettings, currentUser, barMenu, addToast, tariffs, addTariff, updateTariff, removeTariff } = useStore();
  const { t } = useT();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null);
  const canAccessAllSettings = currentUser?.role !== 'user';

  // Форма создания/редактирования тарифа
  const [tariffName, setTariffName] = useState('');
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [durationHours, setDurationHours] = useState(2);
  const [price, setPrice] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState<TariffMenuProduct[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [showBulkPriceEditor, setShowBulkPriceEditor] = useState(false);
  const [bulkSelectedTableIds, setBulkSelectedTableIds] = useState<number[]>([]);
  const [bulkStartTime, setBulkStartTime] = useState('09:00');
  const [bulkEndTime, setBulkEndTime] = useState('19:00');
  const [bulkPricePerHour, setBulkPricePerHour] = useState(2000);

  const activeTables = settings.tables.filter(t => t.isActive);

  const sortPriceRules = (rules: TablePriceRule[]) => (
    rules.slice().sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime))
  );

  const getPriceScheduleConflictMessage = (rules: TablePriceRule[]): string | null => {
    const conflict = getPriceScheduleConflict(rules);
    if (!conflict) {
      return null;
    }
    if (conflict.type === 'sameRule') {
      return t('tariffs.sameIntervalError');
    }
    return t('tariffs.intervalsOverlap', {
      firstStart: conflict.firstStart,
      firstEnd: conflict.firstEnd,
      secondStart: conflict.secondStart,
      secondEnd: conflict.secondEnd,
    });
  };

  const updateTableSetting = (index: number, field: string, value: string | number | boolean) => {
    const newTables = [...settings.tables];
    newTables[index] = { ...newTables[index], [field]: value };
    updateSettings({ tables: newTables });
  };

  const updateTablePriceSchedule = (tableIndex: number, rules: TablePriceRule[]) => {
    const conflictMessage = getPriceScheduleConflictMessage(rules);
    if (conflictMessage) {
      addToast('error', conflictMessage);
      return false;
    }

    const newTables = [...settings.tables];
    newTables[tableIndex] = {
      ...newTables[tableIndex],
      priceSchedule: sortPriceRules(rules),
    };
    updateSettings({ tables: newTables });
    return true;
  };

  const addPriceRule = (tableIndex: number) => {
    const table = settings.tables[tableIndex];
    const rules = table.priceSchedule || [];
    const lastRule = sortPriceRules(rules)[rules.length - 1];
    const fallbackStart = lastRule ? parseTimeToMinutes(lastRule.endTime) : 9 * 60;
    const nextStartMinutes = Math.max(0, Math.min(DAY_MINUTES - 60, fallbackStart));
    const nextEndMinutes = (nextStartMinutes + 60) % DAY_MINUTES;

    updateTablePriceSchedule(tableIndex, [
      ...rules,
      {
        id: `${table.id}-${Date.now()}`,
        startTime: formatMinutes(nextStartMinutes),
        endTime: formatMinutes(nextEndMinutes),
        pricePerHour: table.pricePerHour,
      },
    ]);
  };

  const updatePriceRuleField = (
    tableIndex: number,
    ruleId: string,
    field: keyof Pick<TablePriceRule, 'startTime' | 'endTime' | 'pricePerHour'>,
    value: string | number
  ) => {
    const table = settings.tables[tableIndex];
    const nextRules = (table.priceSchedule || []).map((rule) => (
      rule.id === ruleId ? { ...rule, [field]: value } : rule
    ));
    updateTablePriceSchedule(tableIndex, nextRules);
  };

  const removePriceRule = (tableIndex: number, ruleId: string) => {
    const table = settings.tables[tableIndex];
    updateTablePriceSchedule(
      tableIndex,
      (table.priceSchedule || []).filter((rule) => rule.id !== ruleId)
    );
  };

  const toggleBulkTableSelection = (tableId: number) => {
    setBulkSelectedTableIds((prev) => (
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    ));
  };

  const handleApplyBulkPriceRule = () => {
    if (bulkSelectedTableIds.length === 0) {
      addToast('error', t('tariffs.bulkSelectTableError'));
      return;
    }

    if (bulkPricePerHour <= 0) {
      addToast('error', t('tariffs.bulkPriceError'));
      return;
    }

    if (bulkStartTime === bulkEndTime) {
      addToast('error', t('tariffs.sameIntervalError'));
      return;
    }

    const timestamp = Date.now();
    const skippedTables: string[] = [];
    let updatedCount = 0;

    const nextTables = settings.tables.map((table) => {
      if (!bulkSelectedTableIds.includes(table.id)) {
        return table;
      }

      const nextRule: TablePriceRule = {
        id: `${table.id}-${timestamp}-${updatedCount}`,
        startTime: bulkStartTime,
        endTime: bulkEndTime,
        pricePerHour: bulkPricePerHour,
      };
      const nextRules = [...(table.priceSchedule || []), nextRule];
      const conflictMessage = getPriceScheduleConflictMessage(nextRules);

      if (conflictMessage) {
        skippedTables.push(table.name);
        return table;
      }

      updatedCount += 1;
      return {
        ...table,
        priceSchedule: sortPriceRules(nextRules),
      };
    });

    if (updatedCount === 0) {
      addToast('error', skippedTables.length > 0
        ? t('tariffs.bulkConflictError', { tables: skippedTables.join(', ') })
        : t('tariffs.bulkApplyFailed'));
      return;
    }

    updateSettings({ tables: nextTables });
    addToast('success', t('tariffs.bulkApplied', { count: updatedCount }));

    if (skippedTables.length > 0) {
      addToast('warning', t('tariffs.bulkSkipped', { tables: skippedTables.join(', ') }));
    }
  };

  const handleCreateOrUpdateTariff = () => {
    if (!tariffName.trim()) {
      addToast('error', t('tariffs.nameRequired'));
      return;
    }

    if (selectedTableIds.length === 0) {
      addToast('error', t('tariffs.selectTableError'));
      return;
    }

    if (price <= 0) {
      addToast('error', t('tariffs.priceRequired'));
      return;
    }

    const tariffData: Tariff = {
      id: editingTariff?.id || Date.now().toString(),
      name: tariffName,
      tableIds: selectedTableIds,
      startTime,
      endTime,
      durationHours,
      price,
      menuProducts: selectedProducts,
      isActive,
      createdAt: editingTariff?.createdAt || Date.now(),
    };

    if (editingTariff) {
      updateTariff(editingTariff.id, tariffData);
      addToast('success', t('tariffs.tariffUpdated'));
    } else {
      addTariff(tariffData);
      addToast('success', t('tariffs.tariffCreated', { name: tariffName }));
    }

    setShowCreateModal(false);
    setEditingTariff(null);
    resetForm();
  };

  const resetForm = () => {
    setTariffName('');
    setSelectedTableIds([]);
    setStartTime('12:00');
    setEndTime('14:00');
    setDurationHours(2);
    setPrice(0);
    setSelectedProducts([]);
    setIsActive(true);
  };

  const handleToggleTable = (tableId: number) => {
    setSelectedTableIds(prev =>
      prev.includes(tableId)
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    );
  };

  const handleAddProduct = (productId: string) => {
    const product = barMenu.find((item: BarMenuItem) => item.id === productId);
    if (!product) return;

    const existing = selectedProducts.find(p => p.productId === productId);
    if (existing) {
      setSelectedProducts(
        selectedProducts.map(p =>
          p.productId === productId ? { ...p, quantity: p.quantity + 1 } : p
        )
      );
    } else {
      setSelectedProducts([
        ...selectedProducts,
        { productId, productName: product.name, quantity: 1 }
      ]);
    }
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.productId !== productId));
  };

  const handleUpdateProductQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveProduct(productId);
    } else {
      setSelectedProducts(
        selectedProducts.map(p =>
          p.productId === productId ? { ...p, quantity } : p
        )
      );
    }
  };

  const handleEditTariff = (tariff: Tariff) => {
    setEditingTariff(tariff);
    setTariffName(tariff.name);
    setSelectedTableIds(tariff.tableIds);
    setStartTime(tariff.startTime);
    setEndTime(tariff.endTime);
    setDurationHours(tariff.durationHours);
    setPrice(tariff.price);
    setSelectedProducts(tariff.menuProducts);
    setIsActive(tariff.isActive);
    setShowCreateModal(true);
  };

  const handleDeleteTariff = (tariffId: string) => {
    if (confirm(t('tariffs.deleteConfirm'))) {
      removeTariff(tariffId);
      addToast('success', t('tariffs.tariffDeleted'));
    }
  };

  const handleToggleTariffStatus = (tariffId: string) => {
    const tariff = tariffs.find(t => t.id === tariffId);
    if (tariff) {
      updateTariff(tariffId, { isActive: !tariff.isActive });
    }
  };

  const getTotalProductsCost = (products: TariffMenuProduct[]) => {
    return products.reduce((sum, product) => {
      const menuItem = barMenu.find((item: BarMenuItem) => item.id === product.productId);
      return sum + (menuItem?.price || 0) * product.quantity;
    }, 0);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-left">
          <Tag size={28} className="text-purple-500" />
          <div>
            <h1 className="page-title">{t('tariffs.pageTitle')}</h1>
            <p className="page-subtitle">{t('tariffs.pageSubtitle')}</p>
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="btn btn-primary">
          <Plus size={18} />
          {t('tariffs.createTariff')}
        </button>
      </div>

      {canAccessAllSettings && (
        <div className="settings-section settings-section-full" style={{ marginBottom: 20 }}>
          <div className="settings-section-header">
            <h3 className="settings-section-title">
              <Hash size={18} />
              {t('tariffs.tablesTitle')}
            </h3>
            <span className="settings-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} />
              {t('tariffs.tablesAutoDetected', { count: settings.tables.length })}
            </span>
          </div>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setShowBulkPriceEditor((prev) => !prev)}
              className="btn btn-ghost"
              style={{ padding: '8px 12px', fontSize: 12, minHeight: 34 }}
            >
              <Plus size={14} />
              {showBulkPriceEditor ? t('tariffs.hideBulkAdd') : t('tariffs.bulkAdd')}
            </button>
          </div>
          {showBulkPriceEditor && (
            <div style={{
              marginBottom: 12,
              padding: '12px',
              borderRadius: 12,
              border: '1px solid rgba(139, 92, 246, 0.16)',
              background: 'rgba(139, 92, 246, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd6fe' }}>{t('tariffs.bulkAddInterval')}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{t('tariffs.bulkAddHint')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedTableIds(activeTables.map((table) => table.id))}
                    className="btn btn-ghost"
                    style={{ padding: '6px 10px', fontSize: 12, minHeight: 32 }}
                  >
                    {t('tariffs.selectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedTableIds([])}
                    className="btn btn-ghost"
                    style={{ padding: '6px 10px', fontSize: 12, minHeight: 32 }}
                  >
                    {t('tariffs.clear')}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeTables.map((table) => {
                  const selected = bulkSelectedTableIds.includes(table.id);
                  return (
                    <button
                      key={`bulk-${table.id}`}
                      type="button"
                      onClick={() => toggleBulkTableSelection(table.id)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 999,
                        border: `1px solid ${selected ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                        background: selected ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        color: selected ? '#ddd6fe' : '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {table.name}
                    </button>
                  );
                })}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '110px 110px 140px auto',
                gap: 8,
                alignItems: 'center',
              }}>
                <input
                  type="time"
                  value={bulkStartTime}
                  onChange={(e) => setBulkStartTime(e.target.value)}
                  className="form-input"
                />
                <input
                  type="time"
                  value={bulkEndTime}
                  onChange={(e) => setBulkEndTime(e.target.value)}
                  className="form-input"
                />
                <NumberInput
                  value={bulkPricePerHour}
                  onChange={setBulkPricePerHour}
                  className="form-input"
                  placeholder={t('tariffs.pricePerHour')}
                />
                <button
                  type="button"
                  onClick={handleApplyBulkPriceRule}
                  className="btn btn-primary"
                  style={{ minHeight: 36 }}
                >
                  <Plus size={14} />
                  {t('tariffs.applyToSelected')}
                </button>
              </div>
            </div>
          )}
          <div className="settings-tables">
            <div className="settings-table-header">
              <span>{t('tariffs.colName')}</span>
              <span>{t('tariffs.colRelay')}</span>
              <span>{t('tariffs.colBasePrice')}</span>
            </div>
            {settings.tables.map((table, index) => (
              <div
                key={table.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  background: 'rgba(255, 255, 255, 0.012)',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 60px 120px',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    value={table.name}
                    onChange={(e) => updateTableSetting(index, 'name', e.target.value)}
                    className="form-input"
                  />
                  <span className="settings-relay-badge" style={{ justifySelf: 'center' }}>
                    {table.relayNumber}
                  </span>
                  <NumberInput
                    value={table.pricePerHour}
                    onChange={(n) => updateTableSetting(index, 'pricePerHour', n)}
                    className="form-input form-input-sm"
                    style={{ width: '100%', maxWidth: '100%' }}
                  />
                </div>

                <div style={{
                  paddingTop: 8,
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>{t('tariffs.timeBasedPrices')}</span>
                      <span style={{
                        fontSize: 10,
                        color: '#94a3b8',
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'rgba(148, 163, 184, 0.08)',
                        border: '1px solid rgba(148, 163, 184, 0.12)',
                      }}>
                        {t('tariffs.intervalsCount', { count: (table.priceSchedule || []).length })}
                      </span>
                    </div>
                    <button type="button" onClick={() => addPriceRule(index)} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, minHeight: 32 }}>
                      <Plus size={14} />
                      {t('tariffs.interval')}
                    </button>
                  </div>

                  {(table.priceSchedule || []).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(table.priceSchedule || []).map((rule) => (
                        <div
                          key={rule.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 110px auto',
                            gap: 8,
                            alignItems: 'center',
                            padding: '8px',
                            borderRadius: 10,
                            background: 'rgba(255, 255, 255, 0.02)',
                          }}
                        >
                          <input
                            type="time"
                            value={rule.startTime}
                            onChange={(e) => updatePriceRuleField(index, rule.id, 'startTime', e.target.value)}
                            className="form-input"
                            style={{ width: '100%' }}
                          />
                          <input
                            type="time"
                            value={rule.endTime}
                            onChange={(e) => updatePriceRuleField(index, rule.id, 'endTime', e.target.value)}
                            className="form-input"
                            style={{ width: '100%' }}
                          />
                          <NumberInput
                            value={rule.pricePerHour}
                            onChange={(n) => updatePriceRuleField(index, rule.id, 'pricePerHour', n)}
                            className="form-input form-input-sm"
                            style={{ width: '100%', maxWidth: '100%' }}
                          />
                          <button
                            type="button"
                            onClick={() => removePriceRule(index, rule.id)}
                            className="btn btn-ghost"
                            style={{ padding: '6px', color: '#ef4444' }}
                            title={t('tariffs.deleteInterval')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tariffs.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          color: '#64748b',
          textAlign: 'center'
        }}>
          <Tag size={64} style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ fontSize: 16, marginBottom: 8 }}>{t('tariffs.noTariffs')}</p>
          <p style={{ fontSize: 14 }}>{t('tariffs.noTariffsHint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
          {tariffs.map(tariff => {
            const productsCost = getTotalProductsCost(tariff.menuProducts);

            return (
              <div
                key={tariff.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${tariff.isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  opacity: tariff.isActive ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{tariff.name}</h3>
                    <div style={{
                      fontSize: 12,
                      color: tariff.isActive ? '#10b981' : '#ef4444',
                      fontWeight: 500
                    }}>
                      ● {tariff.isActive ? t('tariffs.statusActive') : t('tariffs.statusInactive')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleEditTariff(tariff)}
                      className="btn btn-ghost"
                      style={{ padding: '6px' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteTariff(tariff.id)}
                      className="btn btn-ghost"
                      style={{ padding: '6px', color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                    <Clock size={14} />
                    <span>{t('tariffs.timeLabel')}: {tariff.startTime} - {tariff.endTime}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                    <Package size={14} />
                    <span>{t('tariffs.packageLabel')}: {tariff.durationHours} {t('tariffs.hoursShort')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981' }}>
                    <Tag size={14} />
                    <span>{t('tariffs.priceLabel')}: {tariff.price} {settings.currency}</span>
                  </div>
                </div>

                {tariff.menuProducts.length > 0 && (
                  <div style={{
                    padding: 10,
                    background: 'rgba(139, 92, 246, 0.05)',
                    borderRadius: 8,
                    border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: '#a78bfa', fontWeight: 500 }}>
                      <ShoppingBag size={14} />
                      <span>{t('tariffs.includedProducts')}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {tariff.menuProducts.map(product => (
                        <div key={product.productId} style={{ fontSize: 12, color: '#cbd5e1' }}>
                          • {product.productName} × {product.quantity}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#8b5cf6', marginTop: 6 }}>
                      {t('tariffs.extraValue')}: +{productsCost} {settings.currency}
                    </div>
                  </div>
                )}

                <div style={{ 
                  marginTop: 4,
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    {t('tariffs.tablesLabel')}: {tariff.tableIds.map(id =>
                      activeTables.find(tb => tb.id === id)?.name || `#${id}`
                    ).join(', ')}
                  </div>
                  <button
                    onClick={() => handleToggleTariffStatus(tariff.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    {tariff.isActive ? t('tariffs.deactivate') : t('tariffs.activate')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно создания/редактирования тарифа */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setEditingTariff(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{editingTariff ? t('tariffs.editTariff') : t('tariffs.createTariff')}</h3>
              <button onClick={() => { setShowCreateModal(false); setEditingTariff(null); }} className="modal-close-btn">×</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="settings-field">
                <label className="settings-label">{t('tariffs.tariffName')}</label>
                <input
                  type="text"
                  value={tariffName}
                  onChange={(e) => setTariffName(e.target.value)}
                  className="form-input"
                  placeholder={t('tariffs.tariffNamePlaceholder')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="settings-field">
                  <label className="settings-label">{t('tariffs.startTime')}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-label">{t('tariffs.endTime')}</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="settings-field">
                  <label className="settings-label">{t('tariffs.durationHours')}</label>
                  <input
                    type="number"
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                    className="form-input"
                    min="0.5"
                    step="0.5"
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-label">{t('tariffs.tariffPrice')} ({settings.currency})</label>
                  <NumberInput
                    value={price}
                    onChange={setPrice}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="settings-field">
                <label className="settings-label">{t('tariffs.tablesForTariff')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {activeTables.map(table => (
                    <button
                      key={table.id}
                      onClick={() => handleToggleTable(table.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: `2px solid ${selectedTableIds.includes(table.id) ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)'}`,
                        background: selectedTableIds.includes(table.id) ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        color: selectedTableIds.includes(table.id) ? '#a78bfa' : '#94a3b8',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {table.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-field">
                <label className="settings-label">{t('tariffs.addMenuProducts')}</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddProduct(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="form-input"
                  defaultValue=""
                >
                  <option value="">{t('tariffs.selectProduct')}</option>
                  {barMenu.map((item: BarMenuItem) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.price} {settings.currency}
                    </option>
                  ))}
                </select>

                {selectedProducts.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedProducts.map(product => (
                      <div
                        key={product.productId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'rgba(139, 92, 246, 0.05)',
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                          borderRadius: 8,
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: '#cbd5e1' }}>{product.productName}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => handleUpdateProductQuantity(product.productId, product.quantity - 1)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              background: 'rgba(139, 92, 246, 0.1)',
                              color: '#a78bfa',
                              fontSize: 16,
                              cursor: 'pointer',
                            }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: 30, textAlign: 'center', color: '#a78bfa' }}>
                            {product.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateProductQuantity(product.productId, product.quantity + 1)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              background: 'rgba(139, 92, 246, 0.1)',
                              color: '#a78bfa',
                              fontSize: 16,
                              cursor: 'pointer',
                            }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => handleRemoveProduct(product.productId)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 4,
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              fontSize: 16,
                              cursor: 'pointer',
                              marginLeft: 4,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span className="settings-label" style={{ marginBottom: 0 }}>{t('tariffs.tariffActive')}</span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => { setShowCreateModal(false); setEditingTariff(null); }} className="btn btn-ghost">
                {t('tariffs.cancel')}
              </button>
              <button onClick={handleCreateOrUpdateTariff} className="btn btn-primary">
                <Plus size={16} />
                {editingTariff ? t('tariffs.save') : t('tariffs.createTariff')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TariffsPage;
