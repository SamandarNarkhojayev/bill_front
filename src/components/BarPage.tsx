import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
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
  Image as ImageIcon,
  Layers,
  AlertTriangle,
  Coffee,
  Sandwich,
  Wind,
  Beer,
  CircleDot,
  GripVertical,
  Tag,
  Printer,
  ChefHat,
  Banknote,
  CreditCard,
  Smartphone,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store/useStore";
import { useT } from "../i18n";
import { requestCancelAuth } from "./cancelAuthController";
import type {
  BarMenuItem,
  BarCategoryConfig,
  Department,
  PaymentDetails,
  PaymentMethod,
} from "../types";
import {
  generateBarSaleReceiptHTML,
  printKitchenTicket,
} from "../utils/receipt";
import { playStopSound } from "../utils/sounds";
import { getCategoryDepartment, getItemDepartment } from "../utils/department";
import NumberInput from "./NumberInput";
import ModalCloseX from "./ModalCloseX";
import PaymentBreakdownPicker from "./PaymentBreakdownPicker";

// Маппинг иконок
const iconMap: Record<
  string,
  React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>
> = {
  Coffee,
  Wine,
  Sandwich,
  Wind,
  Beer,
  Package,
  Tag,
  CircleDot,
};

const getIconComponent = (iconName: string) => iconMap[iconName] || Package;

const colorPresets = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
];

type BarTab = "quick-order" | "menu" | "categories";

const getWalkInAccountNumber = (label: string): number | null => {
  const match = label.match(/(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

// Картинка позиции (загруженное фото или иконка категории). memo — не пересобираем при
// перерисовке родителя, если сам товар/категория не менялись. Фото декодируется лениво.
const ItemImage = memo<{
  item: BarMenuItem;
  category?: BarCategoryConfig;
  size?: "sm" | "md" | "lg";
}>(({ item, category, size = "md" }) => {
  const sizeClass = `bar-item-img bar-item-img-${size}`;
  if (item.image) {
    return (
      <div className={sizeClass}>
        <img src={item.image} alt={item.name} loading="lazy" decoding="async" />
      </div>
    );
  }
  const IconComp = category ? getIconComponent(category.icon) : Package;
  return (
    <div
      className={sizeClass}
      style={{
        background: category ? `${category.color}20` : "rgba(255,255,255,0.05)",
      }}
    >
      <IconComp
        size={size === "lg" ? 28 : size === "md" ? 22 : 16}
        style={{ color: category?.color || "#94a3b8" }}
      />
    </div>
  );
});
ItemImage.displayName = "ItemImage";

// Бейдж остатка. memo по товару.
const StockBadge = memo<{ item: BarMenuItem }>(({ item }) => {
  if (item.stock === -1) return null;
  const isLow = item.stock <= 3 && item.stock > 0;
  const isOut = item.stock === 0;
  return (
    <span className={`stock-badge ${isOut ? "out" : isLow ? "low" : "ok"}`}>
      {isOut ? "Нет" : `${item.stock} ${item.unit}`}
    </span>
  );
});
StockBadge.displayName = "StockBadge";

// Карточка товара в сетке быстрого заказа. memo + примитивные/стабильные пропсы: при
// добавлении одной позиции в корзину перерисовывается ТОЛЬКО затронутая карточка (её qty),
// а не вся сетка — критично при сотнях позиций бара/кухни.
interface ProductCardProps {
  item: BarMenuItem;
  qty: number;
  category?: BarCategoryConfig;
  currency: string;
  onAdd: (item: BarMenuItem) => void;
  onRemove: (id: string) => void;
}

const ProductCard = memo<ProductCardProps>(
  ({ item, qty, category, currency, onAdd, onRemove }) => {
    const isOutOfStock = item.stock === 0;
    return (
      <div
        className={`bar-product-card ${qty > 0 ? "in-cart" : ""} ${isOutOfStock ? "out-of-stock" : ""}`}
        onClick={() => !isOutOfStock && onAdd(item)}
      >
        <ItemImage item={item} category={category} size="lg" />
        <div className="bar-product-info">
          <span className="bar-product-name">{item.name}</span>
          <span className="bar-product-price">
            {item.price.toLocaleString()} {currency}
          </span>
        </div>
        <StockBadge item={item} />
        {qty > 0 && (
          <div
            className="bar-product-qty-badge"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="bar-qty-btn-v2 minus"
              onClick={() => onRemove(item.id)}
            >
              <Minus size={14} />
            </button>
            <span className="bar-qty-v2">{qty}</span>
            <button className="bar-qty-btn-v2 plus" onClick={() => onAdd(item)}>
              <Plus size={14} />
            </button>
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
  },
);
ProductCard.displayName = "ProductCard";

// 'bar' — только напитки/снэки, 'kitchen' — только блюда, 'combined' — всё на одной странице
interface BarPageProps {
  department?: Department | "combined";
}

const BarPage: React.FC<BarPageProps> = ({ department = "combined" }) => {
  // Узкая подписка: перерисовываемся только при изменении используемых срезов, а не на
  // КАЖДУЮ мутацию стора (тосты, тики столов и т.п.). Экшены — стабильные ссылки, поэтому
  // их наличие в объекте не добавляет перерисовок.
  const {
    barMenu,
    barCategories,
    addMenuItem,
    updateMenuItem,
    removeMenuItem,
    addBarCategory,
    updateBarCategory,
    removeBarCategory,
    tables,
    barOrders,
    addBarOrderToTable,
    createBarOrder,
    finalizeBarOrder,
    walkInAccountIntent,
    clearWalkInAccountIntent,
    cancelOpenWalkInItem,
    settings,
    currentUser,
    addToast,
  } = useStore(
    useShallow((s) => ({
      barMenu: s.barMenu,
      barCategories: s.barCategories,
      addMenuItem: s.addMenuItem,
      updateMenuItem: s.updateMenuItem,
      removeMenuItem: s.removeMenuItem,
      addBarCategory: s.addBarCategory,
      updateBarCategory: s.updateBarCategory,
      removeBarCategory: s.removeBarCategory,
      tables: s.tables,
      barOrders: s.barOrders,
      addBarOrderToTable: s.addBarOrderToTable,
      createBarOrder: s.createBarOrder,
      finalizeBarOrder: s.finalizeBarOrder,
      walkInAccountIntent: s.walkInAccountIntent,
      clearWalkInAccountIntent: s.clearWalkInAccountIntent,
      cancelOpenWalkInItem: s.cancelOpenWalkInItem,
      settings: s.settings,
      currentUser: s.currentUser,
      addToast: s.addToast,
    })),
  );
  const { t } = useT();

  const isKitchen = department === "kitchen";
  const isCombined = department === "combined";
  // Отдел для новых позиций/категорий: combined по умолчанию создаёт в баре
  const newItemDepartment: Department = isKitchen ? "kitchen" : "bar";
  const pageTitle = isKitchen ? t("bar.title_kitchen") : t("bar.title_bar");
  const PageIcon = isKitchen ? ChefHat : Wine;

  const [activeTab, setActiveTab] = useState<BarTab>("quick-order");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const canManageCatalog =
    currentUser?.role === "admin" || currentUser?.role === "developer";
  const allTabs = [
    {
      id: "quick-order" as BarTab,
      icon: ShoppingCart,
      label: t("bar.tab_order"),
    },
    { id: "menu" as BarTab, icon: Edit3, label: t("bar.tab_menu") },
    {
      id: "categories" as BarTab,
      icon: Layers,
      label: t("bar.tab_categories"),
    },
  ];
  const visibleTabs = canManageCatalog
    ? allTabs
    : allTabs.filter((tab) => tab.id === "quick-order");

  // Если пользователь обычный и была открыта недоступная вкладка, переключи на доступную
  if (!canManageCatalog && activeTab !== "quick-order") {
    setActiveTab("quick-order");
  }

  // Меню
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<BarMenuItem>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    price: 0,
    costPrice: 0,
    categoryId: "",
    image: "",
    stock: -1 as number,
    unit: isKitchen ? "порц" : "шт",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Заказ
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [quickCart, setQuickCart] = useState<Map<string, number>>(new Map());
  const [shopMode, setShopMode] = useState(false);
  const [selectedWalkInAccount, setSelectedWalkInAccount] = useState(""); // Changed to empty string for initial state

  // Категории
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCat, setNewCat] = useState({
    name: "",
    icon: "Coffee",
    color: "#3b82f6",
    sortOrder: 0,
  });
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState<Partial<BarCategoryConfig>>(
    {},
  );

  // Модальное окно подтверждения печати чека
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showWalkInCloseModal, setShowWalkInCloseModal] = useState(false);
  // Защита от двойного клика по продаже (печать/без печати) — синхронный замок.
  const sellingRef = useRef(false);
  // Способ оплаты для прямой продажи (shopMode)
  const [quickPayment, setQuickPayment] = useState<PaymentMethod>("cash");
  const [walkInPayment, setWalkInPayment] = useState<PaymentDetails>({
    paymentMethod: "cash",
  });
  const [isWalkInPaymentValid, setIsWalkInPaymentValid] = useState(true);

  const occupiedTables = useMemo(
    () => tables.filter((t) => t.status === "occupied"),
    [tables],
  );
  const walkInAccountBaseLabel = t("bar.walk_in_account");
  const walkInAccounts = useMemo(() => {
    const labels = barOrders
      .filter((order) => order.tableId == null && !order.isPaid && order.label)
      .map((order) => order.label as string)
      .sort((left, right) => {
        const leftNum = getWalkInAccountNumber(left) ?? Number.MAX_SAFE_INTEGER;
        const rightNum =
          getWalkInAccountNumber(right) ?? Number.MAX_SAFE_INTEGER;
        if (leftNum !== rightNum) return leftNum - rightNum;
        return left.localeCompare(right, "ru");
      });

    if (selectedWalkInAccount && !labels.includes(selectedWalkInAccount)) {
      labels.push(selectedWalkInAccount);
    }

    if (labels.length === 0) {
      labels.push(`${walkInAccountBaseLabel} 1`);
    }

    return labels;
  }, [barOrders, selectedWalkInAccount, walkInAccountBaseLabel]);
  const walkInOrdersByLabel = useMemo(() => {
    const map = new Map<string, (typeof barOrders)[number]>();
    barOrders.forEach((order) => {
      if (order.tableId == null && !order.isPaid && order.label) {
        map.set(order.label, order);
      }
    });
    return map;
  }, [barOrders]);
  const selectedWalkInOrder =
    walkInOrdersByLabel.get(selectedWalkInAccount) ?? null;

  useEffect(() => {
    if (!selectedWalkInAccount && walkInAccounts.length > 0) {
      setSelectedWalkInAccount(walkInAccounts[0]);
      return;
    }
    if (
      selectedWalkInAccount &&
      !walkInAccounts.includes(selectedWalkInAccount) &&
      walkInAccounts.length > 0
    ) {
      setSelectedWalkInAccount(walkInAccounts[0]);
    }
  }, [selectedWalkInAccount, walkInAccounts]);

  useEffect(() => {
    if (!walkInAccountIntent) return;
    setShopMode(true);
    setSelectedTable(null);
    setSelectedWalkInAccount(walkInAccountIntent.label);
    if (
      walkInAccountIntent.action === "close" &&
      walkInOrdersByLabel.has(walkInAccountIntent.label)
    ) {
      setShowWalkInCloseModal(true);
    }
    clearWalkInAccountIntent();
  }, [walkInAccountIntent, walkInOrdersByLabel, clearWalkInAccountIntent]);

  const createWalkInAccount = () => {
    const nextNumber =
      Array.from(walkInOrdersByLabel.keys()).reduce((maxNumber, label) => {
        const currentNumber = getWalkInAccountNumber(label);
        return currentNumber != null && currentNumber > maxNumber
          ? currentNumber
          : maxNumber;
      }, 0) + 1;
    setSelectedWalkInAccount(`${walkInAccountBaseLabel} ${nextNumber}`);
  };

  // O(1)-справочники: категории и позиции по id. Заменяют .find() в горячих путях
  // (рендер сетки, корзина, подсчёт итога) — было O(n·m), стало O(1) на обращение.
  const categoryById = useMemo(() => {
    const m = new Map<string, BarCategoryConfig>();
    barCategories.forEach((c) => m.set(c.id, c));
    return m;
  }, [barCategories]);

  const barMenuById = useMemo(() => {
    const m = new Map<string, BarMenuItem>();
    barMenu.forEach((i) => m.set(i.id, i));
    return m;
  }, [barMenu]);

  // Категории текущего отдела (combined — все)
  const sortedCategories = useMemo(
    () =>
      barCategories
        .filter((c) => isCombined || getCategoryDepartment(c) === department)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [barCategories, isCombined, department],
  );

  // Позиции меню текущего отдела (отдел позиции — через O(1)-справочник категорий)
  const departmentMenu = useMemo(
    () =>
      isCombined
        ? barMenu
        : barMenu.filter(
            (item) =>
              getCategoryDepartment(categoryById.get(item.categoryId)) ===
              department,
          ),
    [barMenu, categoryById, isCombined, department],
  );

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departmentMenu.filter((item) => {
      const matchSearch = !q || item.name.toLowerCase().includes(q);
      const matchCategory =
        activeCategory === "all" || item.categoryId === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [departmentMenu, search, activeCategory]);

  // Только доступные позиции — то, что реально рисуется в сетке быстрого заказа.
  const availableMenu = useMemo(
    () => filteredMenu.filter((i) => i.available),
    [filteredMenu],
  );

  // Если выбранная категория исчезла из текущего отдела (удалена или сменился отдел) — сброс на «Все»,
  // иначе сетка покажет пустоту без подсвеченного чипа.
  useEffect(() => {
    if (
      activeCategory !== "all" &&
      !sortedCategories.some((c) => c.id === activeCategory)
    ) {
      setActiveCategory("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, department, barCategories]);

  // Быстрый заказ. Колбэки стабильны (deps=[]) — иначе memo на ProductCard не держится.
  const addToQuickCart = useCallback((item: BarMenuItem) => {
    if (item.stock === 0) return;
    setQuickCart((prev) => {
      const next = new Map(prev);
      const current = next.get(item.id) || 0;
      if (item.stock > 0 && current >= item.stock) return prev;
      next.set(item.id, current + 1);
      return next;
    });
  }, []);

  const removeFromQuickCart = useCallback((itemId: string) => {
    setQuickCart((prev) => {
      const next = new Map(prev);
      const qty = next.get(itemId) || 0;
      if (qty <= 1) next.delete(itemId);
      else next.set(itemId, qty - 1);
      return next;
    });
  }, []);

  const quickCartTotal = useMemo(() => {
    let sum = 0;
    quickCart.forEach((qty, id) => {
      const item = barMenuById.get(id);
      if (item) sum += item.price * qty;
    });
    return sum;
  }, [quickCart, barMenuById]);

  const quickCartCount = useMemo(() => {
    let n = 0;
    quickCart.forEach((qty) => {
      n += qty;
    });
    return n;
  }, [quickCart]);

  // Обслуживание для продажи без стола (walk-in) — начисляется на чек, как у столов.
  const quickServiceCharge =
    shopMode && settings.serviceChargeEnabled
      ? Math.round((quickCartTotal * settings.serviceChargePercent) / 100)
      : 0;

  // Отправить заказ блюд на кухонный принтер (xprinter). Срабатывает при пробитии,
  // независимо от того, разделены ли бар и кухня — маршрутизация по отделу позиции.
  const emitKitchenTicket = (
    cart: Map<string, number>,
    tableNameOverride?: string,
  ) => {
    if (!settings.autoPrintKitchenTicket) return;
    const kitchenItems: { name: string; quantity: number }[] = [];
    cart.forEach((qty, itemId) => {
      const item = barMenuById.get(itemId);
      if (item && getItemDepartment(item, barCategories) === "kitchen") {
        kitchenItems.push({ name: item.name, quantity: qty });
      }
    });
    if (kitchenItems.length === 0) return;
    const tableName =
      tableNameOverride ??
      (!shopMode && selectedTable
        ? tables.find((t) => t.id === selectedTable)?.name
        : undefined);
    void printKitchenTicket({
      clubName: settings.clubName,
      tableName,
      cashierName: settings.receiptCashierName,
      items: kitchenItems,
      receiptWidthMm: settings.receiptWidthMm,
      receiptFontSize: settings.receiptFontSize,
      receiptPaddingMm: settings.receiptPaddingMm,
      deviceName: settings.kitchenPrinterName,
    }).then((ok) => {
      if (!ok) addToast("error", "Не удалось распечатать заказ на кухню");
    });
  };

  const executeQuickOrder = () => {
    if (!selectedTable) return;
    emitKitchenTicket(quickCart);
    quickCart.forEach((qty, itemId) => {
      const item = barMenuById.get(itemId);
      if (item) addBarOrderToTable(selectedTable, item, qty);
    });
    setQuickCart(new Map());
  };

  const handleAddToWalkInAccount = () => {
    if (quickCart.size === 0) return;
    const items: { menuItem: BarMenuItem; quantity: number }[] = [];
    quickCart.forEach((qty, itemId) => {
      const item = barMenuById.get(itemId);
      if (item) items.push({ menuItem: item, quantity: qty });
    });
    if (items.length === 0) return;
    emitKitchenTicket(quickCart, selectedWalkInAccount);
    createBarOrder(null, items, { label: selectedWalkInAccount });
    addToast(
      "success",
      t("bar.account_added_toast", { name: selectedWalkInAccount }),
    );
    setQuickCart(new Map());
  };

  const handlePrintAndSell = async () => {
    if (sellingRef.current) return;
    sellingRef.current = true;
    // Собираем позиции для чека
    const receiptItems: { name: string; quantity: number; price: number }[] =
      [];
    quickCart.forEach((qty, itemId) => {
      const item = barMenuById.get(itemId);
      if (item)
        receiptItems.push({
          name: item.name,
          quantity: qty,
          price: item.price,
        });
    });
    const tableName =
      !shopMode && selectedTable
        ? tables.find((t) => t.id === selectedTable)?.name
        : undefined;
    // Обслуживание для продажи БЕЗ СТОЛА (walk-in) — quickServiceCharge > 0 только когда
    // shopMode && serviceChargeEnabled. Для заказа НА СТОЛ обслуживание добавится при закрытии стола.
    try {
      const html = generateBarSaleReceiptHTML({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        items: receiptItems,
        totalCost: quickCartTotal,
        serviceCharge: quickServiceCharge,
        serviceChargePercent: settings.serviceChargePercent,
        currency: settings.currency,
        tableName,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
      });
      await window.electronAPI?.printer?.printReceipt(
        html,
        settings.receiptWidthMm,
        settings.silentPrint,
        settings.receiptPrinterName,
      );
    } catch (err) {
      console.error("Bar receipt print error:", err);
    }
    setShowPrintModal(false);
    executeQuickOrder();
    setTimeout(() => {
      sellingRef.current = false;
    }, 0);
  };

  const handleSellWithoutPrint = () => {
    if (sellingRef.current) return;
    sellingRef.current = true;
    setShowPrintModal(false);
    executeQuickOrder();
    setTimeout(() => {
      sellingRef.current = false;
    }, 0);
  };

  const handleQuickOrder = () => {
    if (quickCart.size === 0) return;
    if (shopMode) {
      handleAddToWalkInAccount();
      return;
    }
    if (!shopMode && !selectedTable) return;
    setShowPrintModal(true);
  };

  const handlePrintAndCloseWalkInAccount = async () => {
    if (sellingRef.current || !selectedWalkInOrder) return;
    sellingRef.current = true;
    const serviceCharge = settings.serviceChargeEnabled
      ? Math.round(
          (selectedWalkInOrder.totalCost * settings.serviceChargePercent) / 100,
        )
      : 0;

    try {
      const html = generateBarSaleReceiptHTML({
        clubName: settings.clubName,
        receiptCompanyName: settings.receiptCompanyName,
        receiptCity: settings.receiptCity,
        receiptPhone: settings.receiptPhone,
        receiptCashierName: settings.receiptCashierName,
        items: selectedWalkInOrder.items.map((item) => ({
          name: item.menuItemName,
          quantity: item.quantity,
          price: item.price,
        })),
        totalCost: selectedWalkInOrder.totalCost,
        serviceCharge,
        serviceChargePercent: settings.serviceChargePercent,
        currency: settings.currency,
        tableName: selectedWalkInAccount,
        receiptWidthMm: settings.receiptWidthMm,
        receiptFontSize: settings.receiptFontSize,
        receiptPaddingMm: settings.receiptPaddingMm,
      });
      await window.electronAPI?.printer?.printReceipt(
        html,
        settings.receiptWidthMm,
        settings.silentPrint,
        settings.receiptPrinterName,
      );
    } catch (err) {
      console.error("Walk-in receipt print error:", err);
    }

    if (!isWalkInPaymentValid) {
      sellingRef.current = false;
      return;
    }

    finalizeBarOrder(selectedWalkInOrder.id, walkInPayment);
    if (settings.soundEnabled) playStopSound();
    setShowWalkInCloseModal(false);
    setTimeout(() => {
      sellingRef.current = false;
    }, 0);
  };

  const handleCloseWalkInAccountWithoutPrint = () => {
    if (sellingRef.current || !selectedWalkInOrder) return;
    sellingRef.current = true;
    if (!isWalkInPaymentValid) {
      sellingRef.current = false;
      return;
    }

    finalizeBarOrder(selectedWalkInOrder.id, walkInPayment);
    if (settings.soundEnabled) playStopSound();
    setShowWalkInCloseModal(false);
    setTimeout(() => {
      sellingRef.current = false;
    }, 0);
  };

  const handleCancelWalkInOrderItem = async (itemId: string) => {
    if (!selectedWalkInOrder) return;
    const item = selectedWalkInOrder.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const auth = await requestCancelAuth({
      itemLabel: `${item.menuItemName} × ${item.quantity}`,
    });
    if (!auth) return;

    const cancelled = cancelOpenWalkInItem(
      selectedWalkInOrder.id,
      item.id,
      auth,
    );
    if (cancelled && selectedWalkInOrder.items.length === 1) {
      setShowWalkInCloseModal(false);
    }
  };

  // Картинки
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "new" | "edit",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (target === "new") setNewItem((p) => ({ ...p, image: dataUrl }));
      else setEditForm((p) => ({ ...p, image: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const startEdit = (item: BarMenuItem) => {
    if (!canManageCatalog) return;
    setEditingItem(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = (id: string) => {
    if (!canManageCatalog) return;
    updateMenuItem(id, editForm);
    setEditingItem(null);
  };

  const handleAddItem = () => {
    if (!canManageCatalog) return;
    if (!newItem.name || !newItem.price) return;
    const targetCategoryId = newItem.categoryId || sortedCategories[0]?.id;
    // Нельзя добавить позицию без категории — иначе не попадёт в нужный отдел
    if (!targetCategoryId) return;
    addMenuItem({
      name: newItem.name,
      price: newItem.price,
      costPrice: newItem.costPrice,
      categoryId: targetCategoryId,
      available: true,
      image: newItem.image,
      stock: newItem.stock,
      unit: newItem.unit,
    });
    setNewItem({
      name: "",
      price: 0,
      costPrice: 0,
      categoryId: "",
      image: "",
      stock: -1,
      unit: isKitchen ? "порц" : "шт",
    });
    setShowAddForm(false);
  };

  return (
    <div className="page-content bar-page-content">
      {/* Модальное окно: Распечатать чек? */}
      {showPrintModal && (
        <div className="modal-overlay" onClick={() => setShowPrintModal(false)}>
          <div
            className="modal bar-print-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalCloseX onClose={() => setShowPrintModal(false)} />
            <div className="modal-header">
              <div
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Printer size={22} style={{ color: "#f59e0b" }} />
                {t("bar.print_precheck_title")}
              </div>
            </div>
            <div
              className="modal-body"
              style={{ textAlign: "center", padding: "16px 24px" }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                {shopMode ? t("bar.sale_of_bar") : t("bar.add_to_table_bill")}:
              </p>
              <p style={{ fontWeight: 600, fontSize: 18, marginTop: 6 }}>
                {quickCartTotal.toLocaleString()} {settings.currency}
              </p>
              {shopMode && (
                <div
                  className="payment-method-picker"
                  style={{
                    justifyContent: "center",
                    borderTop: "none",
                    marginTop: 14,
                  }}
                >
                  <span className="payment-method-label">
                    {t("payment.label")}:
                  </span>
                  <div
                    className="payment-method-options"
                    style={{ flex: "unset" }}
                  >
                    {[
                      {
                        id: "cash" as PaymentMethod,
                        icon: <Banknote size={16} />,
                      },
                      {
                        id: "card" as PaymentMethod,
                        icon: <CreditCard size={16} />,
                      },
                      {
                        id: "transfer" as PaymentMethod,
                        icon: <Smartphone size={16} />,
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setQuickPayment(opt.id)}
                        className={`payment-method-btn ${quickPayment === opt.id ? "active" : ""}`}
                      >
                        {opt.icon}
                        <span>{t(`payment.${opt.id}`)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                onClick={handleSellWithoutPrint}
                className="btn btn-ghost"
              >
                {t("dashboard.end_close")}
              </button>
              <button onClick={handlePrintAndSell} className="btn btn-primary">
                <Printer size={16} />
                {t("bar.print_precheck")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalkInCloseModal && selectedWalkInOrder && (
        <div
          className="modal-overlay"
          onClick={() => setShowWalkInCloseModal(false)}
        >
          <div
            className="modal bar-print-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalCloseX onClose={() => setShowWalkInCloseModal(false)} />
            <div className="modal-header">
              <div
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Printer size={22} style={{ color: "#f59e0b" }} />
                {t("bar.close_account")}: {selectedWalkInAccount}
              </div>
            </div>
            <div
              className="modal-body"
              style={{ textAlign: "center", padding: "16px 24px" }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
                {t("bar.sale_of_bar")}:
              </p>
              <p style={{ fontWeight: 600, fontSize: 18, marginTop: 6 }}>
                {(
                  selectedWalkInOrder.totalCost +
                  (settings.serviceChargeEnabled
                    ? Math.round(
                        (selectedWalkInOrder.totalCost *
                          settings.serviceChargePercent) /
                          100,
                      )
                    : 0)
                ).toLocaleString()}{" "}
                {settings.currency}
              </p>
              <div
                className="end-session-orders"
                style={{ marginTop: 14, textAlign: "left" }}
              >
                <h4 className="end-session-orders-title">
                  {t("dashboard.walkin_positions_title")} ·{" "}
                  {selectedWalkInOrder.items.length}
                </h4>
                {selectedWalkInOrder.items.map((item) => (
                  <div key={item.id} className="end-session-order-item">
                    <span>
                      {item.menuItemName} × {item.quantity}
                    </span>
                    <span className="end-session-order-right">
                      <span>
                        {(item.price * item.quantity).toLocaleString()}{" "}
                        {settings.currency}
                      </span>
                      <button
                        type="button"
                        className="order-cancel-btn"
                        title={t("cancel.cancel_position")}
                        onClick={() =>
                          void handleCancelWalkInOrderItem(item.id)
                        }
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <PaymentBreakdownPicker
                total={
                  selectedWalkInOrder.totalCost +
                  (settings.serviceChargeEnabled
                    ? Math.round(
                        (selectedWalkInOrder.totalCost *
                          settings.serviceChargePercent) /
                          100,
                      )
                    : 0)
                }
                currency={settings.currency}
                onChange={(details, valid) => {
                  setWalkInPayment(details);
                  setIsWalkInPaymentValid(valid);
                }}
              />
            </div>
            <div className="modal-actions">
              <button
                onClick={handleCloseWalkInAccountWithoutPrint}
                className="btn btn-ghost"
                disabled={!isWalkInPaymentValid}
              >
                {t("dashboard.end_close")}
              </button>
              <button
                onClick={handlePrintAndCloseWalkInAccount}
                className="btn btn-primary"
                disabled={!isWalkInPaymentValid}
              >
                <Printer size={16} />
                {t("bar.print_precheck")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <PageIcon size={28} className="text-amber-400" />
          <h2 className="page-title">{pageTitle}</h2>
        </div>
        <div className="bar-tabs">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`bar-tab ${activeTab === tab.id ? "active" : ""}`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Фильтры */}
      {(activeTab === "quick-order" || activeTab === "menu") && (
        <div className="bar-filters-v2">
          <div className="search-box-v2">
            <Search size={18} className="search-icon-v2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="search-input-v2"
            />
          </div>
          <div className="bar-cat-chips">
            <button
              onClick={() => setActiveCategory("all")}
              className={`bar-cat-chip ${activeCategory === "all" ? "active" : ""}`}
            >
              Все
            </button>
            {sortedCategories.map((cat) => {
              const IconComp = getIconComponent(cat.icon);
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`bar-cat-chip ${activeCategory === cat.id ? "active" : ""}`}
                  style={
                    activeCategory === cat.id
                      ? {
                          background: `${cat.color}20`,
                          color: cat.color,
                          borderColor: `${cat.color}40`,
                        }
                      : {}
                  }
                >
                  <IconComp size={14} />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* === БЫСТРЫЙ ЗАКАЗ === */}
      {activeTab === "quick-order" && (
        <div className="bar-order-layout">
          <div className="bar-menu-grid-v2">
            {availableMenu.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                qty={quickCart.get(item.id) || 0}
                category={categoryById.get(item.categoryId)}
                currency={settings.currency}
                onAdd={addToQuickCart}
                onRemove={removeFromQuickCart}
              />
            ))}
          </div>

          <div className="bar-order-sidebar">
            <div className="bar-sidebar-section">
              <h3 className="bar-sidebar-title">
                <GripVertical size={16} /> {t("bar.sell_mode")}
              </h3>
              <div className="bar-table-list" style={{ marginBottom: 8 }}>
                <button
                  onClick={() => {
                    setShopMode(false);
                  }}
                  className={`bar-table-btn ${!shopMode ? "selected" : ""}`}
                >
                  <span className="bar-table-btn-name">
                    {t("bar.to_table")}
                  </span>
                  <span className="bar-table-btn-mode">
                    {t("bar.to_table_hint")}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setShopMode(true);
                    setSelectedTable(null);
                  }}
                  className={`bar-table-btn ${shopMode ? "selected" : ""}`}
                  style={
                    shopMode
                      ? { borderColor: "#f59e0b40", background: "#f59e0b10" }
                      : {}
                  }
                >
                  <span className="bar-table-btn-name">
                    {t("bar.no_table")}
                  </span>
                  <span className="bar-table-btn-mode">
                    {t("bar.quick_sale")}
                  </span>
                </button>
              </div>
              {!shopMode && (
                <>
                  {occupiedTables.length === 0 ? (
                    <p className="bar-sidebar-empty">
                      {t("bar.no_active_tables")}
                    </p>
                  ) : (
                    <div className="bar-table-list">
                      {occupiedTables.map((table) => (
                        <button
                          key={table.id}
                          onClick={() => setSelectedTable(table.id)}
                          className={`bar-table-btn ${selectedTable === table.id ? "selected" : ""}`}
                        >
                          <span className="bar-table-btn-name">
                            {table.name}
                          </span>
                          <span className="bar-table-btn-mode">
                            {table.currentSession?.mode === "time"
                              ? t("dashboard.mode_time")
                              : table.currentSession?.mode === "amount"
                                ? t("dashboard.mode_amount")
                                : t("dashboard.mode_unlimited")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {shopMode && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, color: "var(--text-secondary)" }}
                    >
                      {t("bar.walk_in_accounts")}
                    </div>
                    <button
                      type="button"
                      onClick={createWalkInAccount}
                      className="btn btn-ghost"
                      style={{
                        padding: "6px 10px",
                        minHeight: 30,
                        fontSize: 12,
                      }}
                    >
                      <Plus size={14} /> {t("common.add")}
                    </button>
                  </div>
                  <div className="bar-table-list">
                    {walkInAccounts.map((accountLabel) => {
                      const accountOrder =
                        walkInOrdersByLabel.get(accountLabel);
                      return (
                        <button
                          key={accountLabel}
                          onClick={() => setSelectedWalkInAccount(accountLabel)}
                          className={`bar-table-btn ${selectedWalkInAccount === accountLabel ? "selected" : ""}`}
                          style={
                            selectedWalkInAccount === accountLabel
                              ? {
                                  borderColor: "#f59e0b40",
                                  background: "#f59e0b10",
                                }
                              : undefined
                          }
                        >
                          <span className="bar-table-btn-name">
                            {accountLabel}
                          </span>
                          <span className="bar-table-btn-mode">
                            {accountOrder
                              ? `${accountOrder.items.length} поз. • ${accountOrder.totalCost.toLocaleString()} ${settings.currency}`
                              : t("bar.account_empty")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="bar-sidebar-section bar-cart-section">
              <h3 className="bar-sidebar-title">
                <ShoppingCart size={16} /> {t("bar.cart")}
                {quickCartCount > 0 && (
                  <span className="bar-cart-badge">{quickCartCount}</span>
                )}
              </h3>
              {quickCart.size === 0 ? (
                <>
                  <p className="bar-sidebar-empty">{t("bar.cart_empty")}</p>
                  {shopMode && selectedWalkInOrder && (
                    <>
                      <div
                        className="bar-cart-total-row"
                        style={{ marginTop: 8 }}
                      >
                        <span>{selectedWalkInAccount}</span>
                        <span className="bar-cart-total-value">
                          {selectedWalkInOrder.totalCost.toLocaleString()}{" "}
                          {settings.currency}
                        </span>
                      </div>
                      <div
                        className="bar-cart-items"
                        style={{ maxHeight: 180 }}
                      >
                        {selectedWalkInOrder.items.map((item) => (
                          <div key={item.id} className="bar-cart-row">
                            <div className="bar-cart-row-info">
                              <span className="bar-cart-row-name">
                                {item.menuItemName}
                              </span>
                              <span className="bar-cart-row-price">
                                {(item.price * item.quantity).toLocaleString()}{" "}
                                {settings.currency}
                              </span>
                            </div>
                            <div className="bar-cart-row-qty">
                              <span>{item.quantity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowWalkInCloseModal(true)}
                        className="btn btn-primary btn-full"
                      >
                        <Printer size={18} /> {t("bar.close_account")}
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="bar-cart-items">
                    {Array.from(quickCart.entries()).map(([id, qty]) => {
                      const item = barMenuById.get(id);
                      if (!item) return null;
                      return (
                        <div key={id} className="bar-cart-row">
                          <ItemImage
                            item={item}
                            category={categoryById.get(item.categoryId)}
                            size="sm"
                          />
                          <div className="bar-cart-row-info">
                            <span className="bar-cart-row-name">
                              {item.name}
                            </span>
                            <span className="bar-cart-row-price">
                              {(item.price * qty).toLocaleString()}{" "}
                              {settings.currency}
                            </span>
                          </div>
                          <div className="bar-cart-row-qty">
                            <button
                              className="bar-qty-btn-v2 minus sm"
                              onClick={() => removeFromQuickCart(id)}
                            >
                              <Minus size={12} />
                            </button>
                            <span>{qty}</span>
                            <button
                              className="bar-qty-btn-v2 plus sm"
                              onClick={() => addToQuickCart(item)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {quickServiceCharge > 0 && (
                    <div
                      className="bar-cart-total-row"
                      style={{ fontWeight: 500, opacity: 0.85 }}
                    >
                      <span>
                        Обслуживание ({settings.serviceChargePercent}%)
                      </span>
                      <span>
                        {quickServiceCharge.toLocaleString()}{" "}
                        {settings.currency}
                      </span>
                    </div>
                  )}
                  <div className="bar-cart-total-row">
                    <span>{t("common.total")}</span>
                    <span className="bar-cart-total-value">
                      {(quickCartTotal + quickServiceCharge).toLocaleString()}{" "}
                      {settings.currency}
                    </span>
                  </div>
                  <button
                    onClick={handleQuickOrder}
                    disabled={!shopMode && !selectedTable}
                    className={`btn ${shopMode ? "btn-amber" : "btn-amber"} btn-full bar-cart-submit`}
                  >
                    <ShoppingCart size={18} />{" "}
                    {shopMode ? t("bar.add_to_account") : t("bar.add_to_bill")}
                  </button>
                  {shopMode && selectedWalkInOrder && (
                    <>
                      <div
                        className="bar-cart-total-row"
                        style={{ marginTop: 8 }}
                      >
                        <span>{selectedWalkInAccount}</span>
                        <span className="bar-cart-total-value">
                          {selectedWalkInOrder.totalCost.toLocaleString()}{" "}
                          {settings.currency}
                        </span>
                      </div>
                      <div
                        className="bar-cart-items"
                        style={{ maxHeight: 180 }}
                      >
                        {selectedWalkInOrder.items.map((item) => (
                          <div key={item.id} className="bar-cart-row">
                            <div className="bar-cart-row-info">
                              <span className="bar-cart-row-name">
                                {item.menuItemName}
                              </span>
                              <span className="bar-cart-row-price">
                                {(item.price * item.quantity).toLocaleString()}{" "}
                                {settings.currency}
                              </span>
                            </div>
                            <div className="bar-cart-row-qty">
                              <span>{item.quantity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setShowWalkInCloseModal(true)}
                        className="btn btn-primary btn-full"
                      >
                        <Printer size={18} /> {t("bar.close_account")}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === УПРАВЛЕНИЕ МЕНЮ === */}
      {activeTab === "menu" && canManageCatalog && (
        <div className="bar-menu-manage">
          <div className="bar-menu-manage-header">
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary btn-lg"
            >
              <Plus size={18} /> {t("bar.add_item")}
            </button>
          </div>

          {showAddForm && (
            <div className="bar-add-form">
              <div className="bar-add-form-row">
                <div
                  className="bar-add-img-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {newItem.image ? (
                    <img src={newItem.image} alt="" />
                  ) : (
                    <>
                      <ImageIcon size={24} />
                      <span>Фото</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => handleImageUpload(e, "new")}
                  />
                </div>
                <div className="bar-add-form-fields">
                  <input
                    type="text"
                    placeholder="Название"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem((p) => ({ ...p, name: e.target.value }))
                    }
                    className="form-input"
                  />
                  <div className="bar-add-form-row-inline">
                    <div className="bar-add-field">
                      <label>Цена</label>
                      <NumberInput
                        value={newItem.price}
                        onChange={(n) =>
                          setNewItem((p) => ({ ...p, price: n }))
                        }
                        className="form-input"
                      />
                    </div>
                    <div className="bar-add-field">
                      <label>Себестоимость</label>
                      <NumberInput
                        value={newItem.costPrice}
                        onChange={(n) =>
                          setNewItem((p) => ({ ...p, costPrice: n }))
                        }
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="bar-add-form-row-inline">
                    <div className="bar-add-field">
                      <label>Категория</label>
                      <select
                        value={newItem.categoryId || sortedCategories[0]?.id}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            categoryId: e.target.value,
                          }))
                        }
                        className="form-select"
                      >
                        {sortedCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="bar-add-field">
                      <label>Остаток</label>
                      <input
                        type="number"
                        value={newItem.stock}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            stock: Number(e.target.value),
                          }))
                        }
                        className="form-input"
                      />
                    </div>
                    <div className="bar-add-field">
                      <label>Ед.</label>
                      <select
                        value={newItem.unit}
                        onChange={(e) =>
                          setNewItem((p) => ({ ...p, unit: e.target.value }))
                        }
                        className="form-select"
                      >
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
                <button
                  onClick={() => setShowAddForm(false)}
                  className="btn btn-ghost"
                >
                  Отмена
                </button>
                <button onClick={handleAddItem} className="btn btn-primary">
                  <Check size={16} /> Добавить
                </button>
              </div>
            </div>
          )}

          <div className="bar-menu-list-v2">
            {filteredMenu.map((item) => {
              const cat = categoryById.get(item.categoryId);
              if (editingItem === item.id) {
                return (
                  <div key={item.id} className="bar-menu-edit-card">
                    <div className="bar-add-form-row">
                      <div
                        className="bar-add-img-upload sm"
                        onClick={() => editFileInputRef.current?.click()}
                      >
                        {editForm.image ? (
                          <img src={editForm.image} alt="" />
                        ) : (
                          <ImageIcon size={20} />
                        )}
                        <input
                          ref={editFileInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => handleImageUpload(e, "edit")}
                        />
                      </div>
                      <div className="bar-add-form-fields">
                        <div className="bar-add-field">
                          <label>Название</label>
                          <input
                            type="text"
                            value={editForm.name || ""}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                name: e.target.value,
                              }))
                            }
                            className="form-input"
                          />
                        </div>
                        <div className="bar-add-form-row-inline">
                          <div className="bar-add-field">
                            <label>Цена</label>
                            <NumberInput
                              value={editForm.price || 0}
                              onChange={(n) =>
                                setEditForm((p) => ({ ...p, price: n }))
                              }
                              className="form-input"
                              placeholder="Цена"
                            />
                          </div>
                          <div className="bar-add-field">
                            <label>Себестоимость</label>
                            <NumberInput
                              value={editForm.costPrice || 0}
                              onChange={(n) =>
                                setEditForm((p) => ({ ...p, costPrice: n }))
                              }
                              className="form-input"
                              placeholder="Себест."
                            />
                          </div>
                          <div className="bar-add-field">
                            <label>Категория</label>
                            <select
                              value={editForm.categoryId || ""}
                              onChange={(e) =>
                                setEditForm((p) => ({
                                  ...p,
                                  categoryId: e.target.value,
                                }))
                              }
                              className="form-select"
                            >
                              {sortedCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="bar-add-field">
                            <label>Остаток</label>
                            <input
                              type="number"
                              value={editForm.stock ?? item.stock}
                              onChange={(e) =>
                                setEditForm((p) => ({
                                  ...p,
                                  stock: Number(e.target.value),
                                }))
                              }
                              className="form-input"
                              placeholder="Кол-во"
                            />
                          </div>
                          <div className="bar-add-field">
                            <label>Ед.</label>
                            <select
                              value={editForm.unit || item.unit || "шт"}
                              onChange={(e) =>
                                setEditForm((p) => ({
                                  ...p,
                                  unit: e.target.value,
                                }))
                              }
                              className="form-select"
                            >
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
                      <button
                        onClick={() => setEditingItem(null)}
                        className="btn btn-ghost btn-sm"
                      >
                        <X size={14} /> Отмена
                      </button>
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="btn btn-primary btn-sm"
                      >
                        <Check size={14} /> Сохранить
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={item.id} className="bar-menu-row-v2">
                  <ItemImage item={item} category={cat} size="md" />
                  <div className="bar-menu-row-info">
                    <span className="bar-menu-row-name">{item.name}</span>
                    <div className="bar-menu-row-meta">
                      {cat && (
                        <span
                          className="bar-menu-row-cat"
                          style={{
                            color: cat.color,
                            background: `${cat.color}15`,
                          }}
                        >
                          {cat.name}
                        </span>
                      )}
                      <StockBadge item={item} />
                    </div>
                  </div>
                  <div className="bar-menu-row-prices">
                    <span className="bar-menu-row-price">
                      {item.price.toLocaleString()} {settings.currency}
                    </span>
                    {item.costPrice > 0 && (
                      <span className="bar-menu-row-cost">
                        Себест. {item.costPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="bar-menu-row-actions">
                    <button
                      onClick={() =>
                        updateMenuItem(item.id, { available: !item.available })
                      }
                      className={`bar-toggle-avail ${item.available ? "on" : "off"}`}
                    >
                      {item.available ? "В наличии" : "Скрыт"}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="btn btn-ghost btn-icon"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => removeMenuItem(item.id)}
                      className="btn btn-ghost btn-icon text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === КАТЕГОРИИ === */}
      {activeTab === "categories" && canManageCatalog && (
        <div className="bar-categories-manage">
          <div className="bar-menu-manage-header">
            <button
              onClick={() => setShowAddCategory(true)}
              className="btn btn-primary btn-lg"
            >
              <Plus size={18} /> {t("bar.add_category")}
            </button>
          </div>

          {showAddCategory && (
            <div className="bar-add-form">
              <div className="bar-cat-form-row">
                <div className="bar-add-field">
                  <label>Название</label>
                  <input
                    type="text"
                    value={newCat.name}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, name: e.target.value }))
                    }
                    className="form-input"
                  />
                </div>
                <div className="bar-add-field">
                  <label>Иконка</label>
                  <select
                    value={newCat.icon}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, icon: e.target.value }))
                    }
                    className="form-select"
                  >
                    {Object.keys(iconMap).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bar-add-field">
                  <label>Цвет</label>
                  <div className="color-presets">
                    {colorPresets.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewCat((p) => ({ ...p, color: c }))}
                        className={`color-dot ${newCat.color === c ? "active" : ""}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="bar-add-form-actions">
                <button
                  onClick={() => setShowAddCategory(false)}
                  className="btn btn-ghost"
                >
                  Отмена
                </button>
                <button
                  onClick={() => {
                    if (!newCat.name) return;
                    addBarCategory({
                      name: newCat.name,
                      icon: newCat.icon,
                      color: newCat.color,
                      sortOrder: barCategories.length,
                      department: newItemDepartment,
                    });
                    setNewCat({
                      name: "",
                      icon: "Coffee",
                      color: "#3b82f6",
                      sortOrder: 0,
                    });
                    setShowAddCategory(false);
                  }}
                  className="btn btn-primary"
                >
                  <Check size={16} /> Создать
                </button>
              </div>
            </div>
          )}

          <div className="bar-cat-list">
            {sortedCategories.map((cat) => {
              const IconComp = getIconComponent(cat.icon);
              const itemCount = barMenu.filter(
                (i) => i.categoryId === cat.id,
              ).length;
              if (editingCat === cat.id) {
                return (
                  <div key={cat.id} className="bar-cat-card editing">
                    <input
                      type="text"
                      value={editCatForm.name || ""}
                      onChange={(e) =>
                        setEditCatForm((p) => ({ ...p, name: e.target.value }))
                      }
                      className="form-input"
                    />
                    <select
                      value={editCatForm.icon || ""}
                      onChange={(e) =>
                        setEditCatForm((p) => ({ ...p, icon: e.target.value }))
                      }
                      className="form-select"
                    >
                      {Object.keys(iconMap).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <div className="color-presets">
                      {colorPresets.map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            setEditCatForm((p) => ({ ...p, color: c }))
                          }
                          className={`color-dot ${editCatForm.color === c ? "active" : ""}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <div className="bar-cat-card-actions">
                      <button
                        onClick={() => setEditingCat(null)}
                        className="btn btn-ghost btn-sm"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => {
                          updateBarCategory(cat.id, editCatForm);
                          setEditingCat(null);
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={cat.id}
                  className="bar-cat-card"
                  style={{ borderColor: `${cat.color}30` }}
                >
                  <div
                    className="bar-cat-card-icon"
                    style={{ background: `${cat.color}20`, color: cat.color }}
                  >
                    <IconComp size={24} />
                  </div>
                  <div className="bar-cat-card-info">
                    <span className="bar-cat-card-name">{cat.name}</span>
                    <span className="bar-cat-card-count">
                      {itemCount} позиций
                    </span>
                  </div>
                  <div className="bar-cat-card-actions">
                    <button
                      onClick={() => {
                        setEditingCat(cat.id);
                        setEditCatForm({ ...cat });
                      }}
                      className="btn btn-ghost btn-icon"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => removeBarCategory(cat.id)}
                      className="btn btn-ghost btn-icon text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
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
