import type { BarCategoryConfig, BarMenuItem, Department } from '../types';

// Отдел категории. undefined / неизвестно → 'bar' (обратная совместимость со старыми данными)
export const getCategoryDepartment = (cat?: BarCategoryConfig | null): Department =>
  cat?.department === 'kitchen' ? 'kitchen' : 'bar';

// Отдел позиции меню — определяется по её категории
export const getItemDepartment = (
  item: BarMenuItem,
  categories: BarCategoryConfig[]
): Department => getCategoryDepartment(categories.find((c) => c.id === item.categoryId));

export const isKitchenItem = (item: BarMenuItem, categories: BarCategoryConfig[]): boolean =>
  getItemDepartment(item, categories) === 'kitchen';

// Категории нужного отдела (для combined — все)
export const filterCategoriesByDepartment = (
  categories: BarCategoryConfig[],
  department: Department | 'combined'
): BarCategoryConfig[] =>
  department === 'combined'
    ? categories
    : categories.filter((c) => getCategoryDepartment(c) === department);

// Позиции меню нужного отдела (для combined — все)
export const filterMenuByDepartment = (
  menu: BarMenuItem[],
  categories: BarCategoryConfig[],
  department: Department | 'combined'
): BarMenuItem[] =>
  department === 'combined'
    ? menu
    : menu.filter((i) => getItemDepartment(i, categories) === department);
