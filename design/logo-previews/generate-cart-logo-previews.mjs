import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });

const base = `
  <defs>
    <radialGradient id="bg" cx="42%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#2A2018"/>
      <stop offset="62%" stop-color="#17130F"/>
      <stop offset="100%" stop-color="#100D0A"/>
    </radialGradient>
    <linearGradient id="copper" x1="250" y1="180" x2="780" y2="850">
      <stop offset="0%" stop-color="#E7A25E"/>
      <stop offset="55%" stop-color="#D4874E"/>
      <stop offset="100%" stop-color="#B76531"/>
    </linearGradient>
    <linearGradient id="cream" x1="320" y1="300" x2="740" y2="720">
      <stop offset="0%" stop-color="#FFF8EE"/>
      <stop offset="100%" stop-color="#F4E3CD"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="536" r="340" fill="#F4E7D5" opacity="0.045"/>
`;

const options = [
  {
    name: 'cart-01-classic-check',
    svg: `
      <path d="M276 304h100l76 336h286l76-238H430" fill="none" stroke="url(#copper)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M459 741h284" fill="none" stroke="url(#copper)" stroke-width="54" stroke-linecap="round"/>
      <circle cx="482" cy="822" r="45" fill="url(#copper)"/>
      <circle cx="719" cy="822" r="45" fill="url(#copper)"/>
      <circle cx="675" cy="339" r="118" fill="url(#copper)"/>
      <path d="M622 338l39 40 78-93" fill="none" stroke="url(#cream)" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'cart-02-rounded-basket',
    svg: `
      <path d="M268 332h116l58 318c9 48 39 72 89 72h197" fill="none" stroke="url(#copper)" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M430 424h376l-48 194c-10 40-37 60-80 60H490c-43 0-70-20-80-60l-34-136c-8-32 10-58 54-58Z" fill="url(#copper)"/>
      <path d="M484 487h248l-28 108c-5 19-19 29-40 29H529c-21 0-35-10-40-29l-20-78c-4-18 5-30 15-30Z" fill="#17130F" opacity="0.92"/>
      <path d="M532 553l43 43 92-109" fill="none" stroke="url(#cream)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="505" cy="797" r="44" fill="url(#copper)"/>
      <circle cx="724" cy="797" r="44" fill="url(#copper)"/>
    `,
  },
  {
    name: 'cart-03-apple-cart',
    svg: `
      <path d="M258 330h100l76 314h318l58-224H416" fill="none" stroke="url(#copper)" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M462 724h274" fill="none" stroke="url(#copper)" stroke-width="50" stroke-linecap="round"/>
      <circle cx="490" cy="804" r="43" fill="url(#copper)"/>
      <circle cx="716" cy="804" r="43" fill="url(#copper)"/>
      <path d="M598 408c0-48 35-84 82-84 21 0 38 7 52 20 14-13 31-20 52-20 47 0 82 36 82 84 0 75-58 146-134 190-76-44-134-115-134-190Z" fill="url(#cream)"/>
      <path d="M688 454l37 37 82-98" fill="none" stroke="#D4874E" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'cart-04-storefront-cart',
    svg: `
      <path d="M268 322h102l70 326h306l64-222H426" fill="none" stroke="url(#copper)" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M469 733h268" fill="none" stroke="url(#copper)" stroke-width="52" stroke-linecap="round"/>
      <circle cx="496" cy="814" r="43" fill="url(#copper)"/>
      <circle cx="718" cy="814" r="43" fill="url(#copper)"/>
      <path d="M507 446h236l-34-70H541l-34 70Z" fill="url(#cream)"/>
      <rect x="535" y="446" width="180" height="112" rx="20" fill="url(#cream)"/>
      <path d="M572 522l40 40 88-104" fill="none" stroke="#D4874E" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'cart-05-minimal-stokit',
    svg: `
      <path d="M286 320h94l62 308h326" fill="none" stroke="url(#copper)" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M442 432h356l-54 196H442" fill="none" stroke="url(#copper)" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="505" cy="770" r="46" fill="url(#copper)"/>
      <circle cx="722" cy="770" r="46" fill="url(#copper)"/>
      <path d="M532 535c24-46 59-68 107-61 10 49-8 86-55 111-25 13-53 17-83 10 1-23 11-43 31-60Z" fill="url(#cream)"/>
      <path d="M454 529l63 63 132-156" fill="none" stroke="url(#cream)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
];

for (const option of options) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${base}<g filter="url(#shadow)">${option.svg}</g></svg>`;
  await writeFile(`${outDir}${option.name}.svg`, svg);
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`${outDir}${option.name}.png`);
}
