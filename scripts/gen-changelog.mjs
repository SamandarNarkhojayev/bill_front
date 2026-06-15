#!/usr/bin/env node
/**
 * Авто-генерация записи «Что нового» из git-коммитов.
 * Берёт коммиты с последнего тега и формирует понятные пользователю пункты,
 * добавляя новую запись в начало src/i18n/changelog.ts.
 *
 * Запуск: node scripts/gen-changelog.mjs   (вызывается из scripts/release.sh)
 *
 * Так не нужно писать «что нового» вручную каждый раз — пункты собираются из
 * conventional-commit сообщений (feat/fix/perf). Перевод kk/uz/en остаётся
 * пустым (модалка покажет русский вариант) — при желании его можно дополнить.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const clPath = path.join(root, 'src/i18n/changelog.ts');
let cl = readFileSync(clPath, 'utf8');

if (cl.includes(`version: '${version}'`)) {
  console.log(`[changelog] запись для ${version} уже есть — пропускаю`);
  process.exit(0);
}

let range = '';
try {
  const lastTag = execSync('git describe --tags --abbrev=0', { cwd: root }).toString().trim();
  range = `${lastTag}..HEAD`;
} catch {
  range = ''; // тегов ещё нет — берём всю историю
}

const subjects = execSync(`git log ${range} --pretty=%s`, { cwd: root })
  .toString().trim().split('\n').filter(Boolean);

const ICONS = { feat: '✨ ', fix: '🛠 ', perf: '⚡ ' };
const bullets = [];
for (const s of subjects) {
  const m = s.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
  if (!m) continue;
  const [, type, descRaw] = m;
  if (!ICONS[type]) continue; // показываем только feat/fix/perf
  const desc = descRaw.charAt(0).toUpperCase() + descRaw.slice(1);
  bullets.push(ICONS[type] + desc);
}
if (bullets.length === 0) bullets.push('Улучшения стабильности и исправления.');

const date = new Date().toISOString().slice(0, 10);
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const entry =
  `  {\n` +
  `    version: '${version}',\n` +
  `    date: '${date}',\n` +
  `    highlights: {\n` +
  `      ru: [\n${bullets.map((b) => `        '${esc(b)}',`).join('\n')}\n      ],\n` +
  `      kk: [],\n      uz: [],\n      en: [],\n` +
  `    },\n` +
  `  },\n`;

const marker = 'export const CHANGELOG: ChangelogEntry[] = [\n';
if (!cl.includes(marker)) {
  console.error('[changelog] не найден маркер массива CHANGELOG — пропускаю');
  process.exit(0);
}
cl = cl.replace(marker, marker + entry);
writeFileSync(clPath, cl, 'utf8');
console.log(`[changelog] добавлена версия ${version} (${bullets.length} пунктов)`);
