import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(outDir, { recursive: true });

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="40%" cy="30%" r="84%">
      <stop offset="0%" stop-color="#292017"/>
      <stop offset="54%" stop-color="#17130F"/>
      <stop offset="100%" stop-color="#0F0C09"/>
    </radialGradient>
    <radialGradient id="halo" cx="46%" cy="48%" r="48%">
      <stop offset="0%" stop-color="#3B2E22" stop-opacity="0.78"/>
      <stop offset="100%" stop-color="#3B2E22" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="copper" x1="250" y1="220" x2="780" y2="820">
      <stop offset="0%" stop-color="#EAA760"/>
      <stop offset="55%" stop-color="#D4874E"/>
      <stop offset="100%" stop-color="#B76531"/>
    </linearGradient>
    <linearGradient id="cream" x1="610" y1="300" x2="760" y2="480">
      <stop offset="0%" stop-color="#FFF8EE"/>
      <stop offset="100%" stop-color="#F6E5D0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="210" fill="url(#bg)"/>
  <rect x="54" y="54" width="916" height="916" rx="84" fill="none" stroke="#F5E7D5" stroke-opacity="0.09" stroke-width="6"/>
  <circle cx="462" cy="505" r="270" fill="url(#halo)"/>
  <g filter="url(#softShadow)">
    <path
      d="M283 333h96c28 0 45 13 59 38l56 103h318c25 0 43 24 35 48l-72 226c-8 25-27 38-53 38H458c-27 0-47-14-54-40l-86-322h-35c-24 0-43-19-43-43v-5c0-24 19-43 43-43Z"
      fill="url(#copper)"
    />
    <path
      d="M446 541h315l-48 153H489l-43-153Z"
      fill="#15110D"
      opacity="0.94"
    />
    <path
      d="M426 782h323"
      fill="none"
      stroke="url(#copper)"
      stroke-width="52"
      stroke-linecap="round"
    />
    <circle cx="466" cy="858" r="44" fill="url(#copper)"/>
    <circle cx="715" cy="858" r="44" fill="url(#copper)"/>
    <circle cx="668" cy="331" r="111" fill="url(#copper)"/>
    <path
      d="M621 329l39 39 80-95"
      fill="none"
      stroke="url(#cream)"
      stroke-width="42"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>`;

await writeFile(`${outDir}selected-cart-refined.svg`, svg);
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`${outDir}selected-cart-refined.png`);

const lightThemeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="paper" cx="42%" cy="30%" r="82%">
      <stop offset="0%" stop-color="#FFF9F0"/>
      <stop offset="58%" stop-color="#F3EBDD"/>
      <stop offset="100%" stop-color="#E8DDCC"/>
    </radialGradient>
    <radialGradient id="halo" cx="43%" cy="48%" r="44%">
      <stop offset="0%" stop-color="#D4874E" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#D4874E" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="copper" x1="250" y1="220" x2="780" y2="820">
      <stop offset="0%" stop-color="#DD9658"/>
      <stop offset="58%" stop-color="#C87539"/>
      <stop offset="100%" stop-color="#9E542B"/>
    </linearGradient>
    <linearGradient id="cream" x1="600" y1="280" x2="750" y2="470">
      <stop offset="0%" stop-color="#FFFDF7"/>
      <stop offset="100%" stop-color="#F3EBDD"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#5A3B24" flood-opacity="0.18"/>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.032"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="210" fill="url(#paper)"/>
  <rect width="1024" height="1024" rx="210" filter="url(#grain)" opacity="0.4"/>
  <rect x="54" y="54" width="916" height="916" rx="86" fill="none" stroke="#34271D" stroke-opacity="0.14" stroke-width="6"/>
  <circle cx="430" cy="514" r="270" fill="url(#halo)"/>
  <g filter="url(#softShadow)">
    <path
      d="M248 336h106c28 0 47 14 60 38l61 113h342c26 0 44 25 36 50l-78 242c-8 26-28 39-55 39H441c-28 0-48-15-56-42l-93-351h-44c-23 0-42-19-42-42v-5c0-23 19-42 42-42Z"
      fill="url(#copper)"
    />
    <path
      d="M427 559h337l-50 165H472l-45-165Z"
      fill="#FFFDF7"
      opacity="0.92"
    />
    <circle cx="456" cy="875" r="45" fill="url(#copper)"/>
    <circle cx="708" cy="875" r="45" fill="url(#copper)"/>
    <circle cx="664" cy="332" r="112" fill="url(#copper)"/>
    <path
      d="M617 330l39 39 80-95"
      fill="none"
      stroke="url(#cream)"
      stroke-width="42"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>`;

await writeFile(`${outDir}selected-cart-light-theme.svg`, lightThemeSvg);
await sharp(Buffer.from(lightThemeSvg)).resize(1024, 1024).png().toFile(`${outDir}selected-cart-light-theme.png`);
