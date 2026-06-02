import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });

const base = `
  <defs>
    <radialGradient id="paper" cx="38%" cy="26%" r="82%">
      <stop offset="0%" stop-color="#FFF9F0"/>
      <stop offset="58%" stop-color="#F3EBDD"/>
      <stop offset="100%" stop-color="#E8DDCC"/>
    </radialGradient>
    <linearGradient id="copper" x1="280" y1="190" x2="760" y2="850">
      <stop offset="0%" stop-color="#DD9658"/>
      <stop offset="60%" stop-color="#C87539"/>
      <stop offset="100%" stop-color="#9E542B"/>
    </linearGradient>
    <linearGradient id="ink" x1="280" y1="180" x2="760" y2="840">
      <stop offset="0%" stop-color="#34271D"/>
      <stop offset="100%" stop-color="#1D1712"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#5A3B24" flood-opacity="0.16"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.035"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#paper)"/>
  <rect width="1024" height="1024" filter="url(#grain)" opacity="0.42"/>
`;

const options = [
  {
    name: 'soft-01-paper-basket-check',
    svg: `
      <rect x="206" y="206" width="612" height="612" rx="172" fill="#FFFDF7" opacity="0.66"/>
      <path d="M338 398c31-86 84-130 174-130s143 44 174 130" fill="none" stroke="url(#copper)" stroke-width="42" stroke-linecap="round"/>
      <path d="M296 418h432l-57 261c-9 42-39 64-85 64H438c-46 0-76-22-85-64l-57-261Z" fill="none" stroke="url(#ink)" stroke-width="38" stroke-linejoin="round"/>
      <path d="M394 512h236M418 604h188" stroke="url(#copper)" stroke-width="32" stroke-linecap="round"/>
      <path d="M452 594l58 59 122-144" fill="none" stroke="url(#copper)" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'soft-02-grocery-list-apple',
    svg: `
      <rect x="288" y="222" width="448" height="580" rx="82" fill="#FFFDF7" stroke="#DECAB3" stroke-width="24"/>
      <path d="M384 374h184M384 496h256M384 618h214" stroke="url(#ink)" stroke-width="34" stroke-linecap="round" opacity="0.9"/>
      <circle cx="354" cy="374" r="15" fill="url(#copper)"/>
      <circle cx="354" cy="496" r="15" fill="url(#copper)"/>
      <circle cx="354" cy="618" r="15" fill="url(#copper)"/>
      <path d="M568 626c0-54 39-94 92-94 24 0 43 8 59 23 16-15 35-23 59-23 53 0 92 40 92 94 0 86-67 164-151 214-84-50-151-128-151-214Z" fill="url(#copper)"/>
      <path d="M654 670l42 42 92-109" fill="none" stroke="#FFF8EE" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'soft-03-pantry-jar',
    svg: `
      <rect x="344" y="242" width="336" height="92" rx="34" fill="url(#copper)"/>
      <rect x="304" y="318" width="416" height="486" rx="88" fill="#FFFDF7" stroke="url(#ink)" stroke-width="34"/>
      <path d="M386 474h252M386 592h252" stroke="#DECAB3" stroke-width="30" stroke-linecap="round"/>
      <path d="M422 586l62 63 130-154" fill="none" stroke="url(#copper)" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M406 334h212" stroke="#FFF8EE" stroke-width="22" stroke-linecap="round" opacity="0.8"/>
    `,
  },
  {
    name: 'soft-04-store-pin-basket',
    svg: `
      <path d="M512 174c125 0 226 95 226 212 0 168-226 456-226 456S286 554 286 386c0-117 101-212 226-212Z" fill="#FFFDF7" stroke="url(#ink)" stroke-width="34"/>
      <circle cx="512" cy="392" r="142" fill="#F5E9D9"/>
      <path d="M428 374h168l-20-54H448l-20 54Z" fill="url(#copper)"/>
      <path d="M420 374h184l-26 116c-6 27-24 40-54 40h-24c-30 0-48-13-54-40l-26-116Z" fill="none" stroke="url(#copper)" stroke-width="28" stroke-linejoin="round"/>
      <path d="M458 456l36 36 78-92" fill="none" stroke="url(#ink)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  {
    name: 'soft-05-elegant-s-list',
    svg: `
      <rect x="208" y="208" width="608" height="608" rx="176" fill="#FFFDF7" opacity="0.68"/>
      <path d="M644 342c-35-35-85-53-149-53-85 0-145 44-145 108 0 70 62 96 158 116 72 16 104 30 104 65 0 34-35 57-86 57-58 0-106-22-149-64l-59 66c48 54 118 84 206 84 92 0 157-46 157-118 0-67-45-99-148-121-78-17-112-28-112-62 0-31 31-52 79-52 44 0 81 14 117 43l27-69Z" fill="url(#ink)"/>
      <path d="M416 528h206M416 620h148" stroke="url(#copper)" stroke-width="32" stroke-linecap="round"/>
      <path d="M453 586l52 52 112-132" fill="none" stroke="url(#copper)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
];

for (const option of options) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${base}<g filter="url(#shadow)">${option.svg}</g></svg>`;
  await writeFile(`${outDir}${option.name}.svg`, svg);
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`${outDir}${option.name}.png`);
}
