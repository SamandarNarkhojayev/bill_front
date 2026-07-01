import type { AppLanguage } from '../types';

export interface ChangelogEntry {
  version: string;            // semver без 'v'
  date: string;              // YYYY-MM-DD
  highlights: Record<AppLanguage, string[]>; // короткие пункты «что нового» по языкам
}

// Новые записи добавляются СВЕРХУ. Можно генерировать автоматически из git-коммитов
// командой `npm run changelog` (scripts/gen-changelog.mjs) — тогда писать вручную не нужно.
// Если перевод для языка отсутствует — модалка покажет русский вариант.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '7.4.0',
    date: '2026-07-01',
    highlights: {
      ru: [
        'Улучшения стабильности и исправления.',
      ],
      kk: [],
      uz: [],
      en: [],
    },
  },
  {
    version: '7.3.0',
    date: '2026-06-26',
    highlights: {
      ru: [
        'Улучшения стабильности и исправления.',
      ],
      kk: [],
      uz: [],
      en: [],
    },
  },
  {
    version: '7.2.0',
    date: '2026-06-25',
    highlights: {
      ru: [
        'Улучшения стабильности и исправления.',
      ],
      kk: [],
      uz: [],
      en: [],
    },
  },
  {
    version: '7.1.0',
    date: '2026-06-15',
    highlights: {
      ru: [
        'Улучшения стабильности и исправления.',
      ],
      kk: [],
      uz: [],
      en: [],
    },
  },
  {
    version: '7.0.0',
    date: '2026-06-15',
    highlights: {
      ru: [
        'Улучшения стабильности и исправления.',
      ],
      kk: [],
      uz: [],
      en: [],
    },
  },
  {
    version: '6.0.0',
    date: '2026-06-14',
    highlights: {
      ru: [
        'Бар и Кухня теперь можно разделить: блюда — на отдельной странице «Кухня».',
        'Заказы на кухню печатаются на отдельном кухонном принтере в стиле iiko.',
        'Раздельные принтеры: один для чеков, другой для кухни — заказы не пересекаются.',
        'Кнопка «Пауза» на столе: можно приостановить игру, не закрывая стол.',
        'Бар заполнен популярными напитками и снэками с фото.',
        'Интерфейс на 4 языках: русский, казахский, узбекский, английский.',
        'Появилась База знаний — как пользоваться программой.',
      ],
      kk: [
        'Бар мен Асүйді енді бөлуге болады: тағамдар — бөлек «Асүй» бетінде.',
        'Асүйге берілген тапсырыстар iiko стиліндегі бөлек асүй принтерінде басылады.',
        'Бөлек принтерлер: біреуі чектерге, екіншісі асүйге — тапсырыстар араласпайды.',
        'Үстелдегі «Пауза» түймесі: үстелді жаппай-ақ ойынды уақытша тоқтатуға болады.',
        'Бар суреттері бар танымал сусындар мен снэктерге толы.',
        'Интерфейс 4 тілде: орысша, қазақша, өзбекше, ағылшынша.',
        'Білім қоры пайда болды — бағдарламаны қалай пайдалану керек.',
      ],
      uz: [
        'Bar va Oshxonani endi ajratish mumkin: taomlar alohida «Oshxona» sahifasida.',
        'Oshxonaga buyurtmalar iiko uslubidagi alohida oshxona printerida chop etiladi.',
        'Alohida printerlar: biri cheklar uchun, ikkinchisi oshxona uchun — buyurtmalar aralashmaydi.',
        'Stoldagi «Pauza» tugmasi: stolni yopmasdan oʻyinni vaqtincha toʻxtatish mumkin.',
        'Bar fotosuratli mashhur ichimliklar va gazaklar bilan toʻldirilgan.',
        'Interfeys 4 tilda: ruscha, qozoqcha, oʻzbekcha, inglizcha.',
        'Bilimlar bazasi paydo boʻldi — dasturdan qanday foydalanish kerakligi haqida.',
      ],
      en: [
        'Bar and Kitchen can now be separated: dishes are on a dedicated "Kitchen" page.',
        'Kitchen orders are printed on a separate kitchen printer in the iiko style.',
        'Separate printers: one for receipts, another for the kitchen — orders no longer overlap.',
        'A "Pause" button on the table: you can pause the game without closing the table.',
        'The bar is filled with popular drinks and snacks with photos.',
        'Interface in 4 languages: Russian, Kazakh, Uzbek, English.',
        'A Knowledge Base has appeared — how to use the program.',
      ],
    },
  },
];
