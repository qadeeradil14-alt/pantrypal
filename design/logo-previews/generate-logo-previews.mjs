import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });

const bg = `
  <defs>
    <radialGradient id="bg" cx="42%" cy="32%" r="78%">
      <stop offset="0%" stop-color="#2A2018"/>
      <stop offset="64%" stop-color="#17130F"/>
      <stop offset="100%" stop-color="#100D0A"/>
    </radialGradient>
    <linearGradient id="copper" x1="260" y1="180" x2="760" y2="850">
      <stop offset="0%" stop-color="#E7A25E"/>
      <stop offset="54%" stop-color="#D4874E"/>
      <stop offset="100%" stop-color="#B76531"/>
    </linearGradient>
    <linearGradient id="cream" x1="320" y1="300" x2="720" y2="720">
      <stop offset="0%" stop-color="#FFF8EE"/>
      <stop offset="100%" stop-color="#F4E3CD"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="536" r="340" fill="#F4E7D5" opacity="0.045"/>
`;

const options = [
  {
    name: '01-stocked-apple-check',
    svg: `
      <path d="M512 292c-9-58 13-105 67-140" fill="none" stroke="url(#cream)" stroke-width="34" stroke-linecap="round"/>
      <path d="M516 286c35-61 86-88 153-80 16 68-6 121-66 160-35 22-74 29-116 20 0-37 9-70 29-100Z" fill="url(#copper)"/>
      <path d="M294 459c0-103 75-180 176-180 45 0 81 15 111 39 30-24 66-39 111-39 101 0 176 77 176 180 0 164-126 330-287 330S294 623 294 459Z" fill="url(#copper)"/>
      <path d="M374 481c0-60 43-105 101-105 33 0 62 14 86 40 12 13 29 13 41 0 24-26 53-40 86-40 58 0 101 45 101 105 0 111-86 230-208 230S374 592 374 481Z" fill="#17130F" opacity="0.92"/>
      <path d="M431 537l92 94 171-205" fill="none" stroke="url(#cream)" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: '02-pantry-shelf-check',
    svg: `
      <rect x="250" y="284" width="524" height="470" rx="82" fill="url(#copper)"/>
      <rect x="308" y="344" width="408" height="342" rx="44" fill="#17130F" opacity="0.9"/>
      <path d="M344 452h336M344 574h336" stroke="url(#copper)" stroke-width="38" stroke-linecap="round"/>
      <path d="M414 520l78 78 148-174" fill="none" stroke="url(#cream)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="376" cy="661" r="24" fill="url(#cream)" opacity="0.9"/>
      <circle cx="512" cy="661" r="24" fill="url(#cream)" opacity="0.9"/>
      <circle cx="648" cy="661" r="24" fill="url(#cream)" opacity="0.9"/>
    `,
  },
  {
    name: '03-basket-heart-check',
    svg: `
      <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="url(#copper)" stroke-width="54" stroke-linecap="round"/>
      <path d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z" fill="url(#copper)"/>
      <path d="M348 485h328l-44 207c-5 24-22 36-47 36H439c-25 0-42-12-47-36l-44-207Z" fill="#17130F" opacity="0.92"/>
      <path d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z" fill="url(#cream)"/>
      <path d="M477 587l35 35 71-84" fill="none" stroke="#D4874E" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: '04-location-store-check',
    svg: `
      <path d="M512 174c126 0 228 96 228 214 0 169-228 462-228 462S284 557 284 388c0-118 102-214 228-214Z" fill="url(#copper)"/>
      <circle cx="512" cy="390" r="144" fill="#17130F" opacity="0.92"/>
      <path d="M402 373h220l-30-58H432l-30 58Z" fill="url(#cream)"/>
      <rect x="424" y="373" width="176" height="118" rx="18" fill="url(#cream)"/>
      <path d="M452 454l42 42 88-104" fill="none" stroke="#D4874E" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: '05-stokit-wordmark-s',
    svg: `
      <circle cx="512" cy="512" r="284" fill="url(#copper)"/>
      <circle cx="512" cy="512" r="214" fill="#17130F" opacity="0.94"/>
      <path d="M601 353c-34-32-82-48-144-48-81 0-139 42-139 102 0 68 59 92 151 112 69 15 100 28 100 62 0 32-33 54-82 54-55 0-101-20-142-60l-55 63c45 51 112 80 195 80 88 0 150-43 150-112 0-64-43-95-141-116-75-16-108-27-108-59 0-29 29-49 75-49 42 0 77 13 111 40l29-69Z" fill="url(#cream)"/>
      <path d="M428 534l61 61 126-148" fill="none" stroke="url(#copper)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
];

const index = [];

for (const option of options) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${bg}<g filter="url(#shadow)">${option.svg}</g></svg>`;
  await writeFile(`${outDir}${option.name}.svg`, svg);
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`${outDir}${option.name}.png`);
  index.push(`![${option.name}](./${option.name}.png)\n\n`);
}

await writeFile(`${outDir}README.md`, `# Stokit Logo Preview Options\n\n${index.join('')}`);
