import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const itemIconsPath = path.join(root, 'constants/itemEmojis.ts');
const defaultItemsPath = path.join(root, 'constants/defaultItems.ts');

const normalize = (value) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const itemIcons = fs.readFileSync(itemIconsPath, 'utf8');
const defaultItems = fs.readFileSync(defaultItemsPath, 'utf8');

if (/levenshtein|similarity|vector/i.test(itemIcons)) {
  throw new Error('Item icon resolver must use deterministic aliases/keywords, not fuzzy scoring.');
}

const aliasMatches = itemIcons.matchAll(/key:\s*'([^']+)',\s*emoji:\s*'[^']+',\s*aliases:\s*\[([^\]]*)\]/g);
const aliasToType = new Map();
const duplicates = [];

for (const match of aliasMatches) {
  const type = match[1];
  const aliases = [...match[2].matchAll(/'([^']+)'/g)].map((aliasMatch) => normalize(aliasMatch[1]));
  for (const alias of aliases) {
    const existing = aliasToType.get(alias);
    if (existing && existing !== type) duplicates.push(`${alias}: ${existing}, ${type}`);
    aliasToType.set(alias, type);
  }
}

const defaultNames = [...defaultItems.matchAll(/\{\s*name:\s*'([^']+)'/g)].map((match) => normalize(match[1]));
const missing = defaultNames.filter((name) => !aliasToType.has(name));

if (missing.length > 0) {
  throw new Error(`Missing exact item icon aliases: ${missing.join(', ')}`);
}

if (duplicates.length > 0) {
  throw new Error(`Duplicate item icon aliases: ${duplicates.join('; ')}`);
}

if (aliasToType.size < 500) {
  throw new Error(`Expected at least 500 item icon aliases, found ${aliasToType.size}.`);
}

console.log(`Verified ${aliasToType.size} item icon aliases.`);
