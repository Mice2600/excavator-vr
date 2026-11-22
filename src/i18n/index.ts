import en from './en';
import ru from './ru';
import uz from './uz';
import type { Spec } from '../data/machines';

export const dictionaries = { uz, ru, en } as const;
export type Lang = keyof typeof dictionaries;
export type Dict = typeof en;
export const languages: Lang[] = ['uz', 'ru', 'en'];
export const defaultLang: Lang = 'uz';

export function t(lang: string): Dict {
  return dictionaries[(lang as Lang) in dictionaries ? (lang as Lang) : defaultLang];
}

/** A figure in the reader's own notation: 9.81 m, 9,81 м. */
export function num(d: Dict, value: number, digits = 0): string {
  return new Intl.NumberFormat(d.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function specValue(d: Dict, s: Spec): { value: string; unit: string } {
  return { value: num(d, s.value, s.digits ?? 0), unit: d.units[s.unit] };
}

export function specText(d: Dict, s: Spec): string {
  const v = specValue(d, s);
  if (!v.unit) return v.value;
  return s.unit === 'deg' ? `${v.value}${v.unit}` : `${v.value} ${v.unit}`;
}
