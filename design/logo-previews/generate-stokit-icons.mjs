import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outDir = '/Users/hewadadil/.gemini/antigravity/brain/6af61c34-d5eb-45ff-9160-e2701c2a0f13/';
await mkdir(outDir, { recursive: true });

const versions = [
  {
    name: 'stokit-logo-v1-dark-navy',
    title: 'Version 1: Classic Dark Navy (Stokit Theme)',
    description: 'A premium dark mode app icon. Uses a deep navy/charcoal gradient background, a silver-white metallic basket, and a glowing coral-red heart matching Stokit V2 primary branding.',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <defs>
          <radialGradient id="bg" cx="42%" cy="32%" r="78%">
            <stop offset="0%" stop-color="#1E2235"/>
            <stop offset="64%" stop-color="#0F1117"/>
            <stop offset="100%" stop-color="#07080A"/>
          </radialGradient>
          <linearGradient id="basket" x1="260" y1="180" x2="760" y2="850">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="60%" stop-color="#E2E8F0"/>
            <stop offset="100%" stop-color="#CBD5E1"/>
          </linearGradient>
          <linearGradient id="heart" x1="414" y1="494" x2="656" y2="711">
            <stop offset="0%" stop-color="#FF8B72"/>
            <stop offset="40%" stop-color="#FF6B52"/>
            <stop offset="100%" stop-color="#E8432D"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.45"/>
          </filter>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)"/>
        <circle cx="512" cy="536" r="340" fill="#FF6B52" opacity="0.035"/>
        <g filter="url(#shadow)">
          <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="url(#basket)" stroke-width="54" stroke-linecap="round"/>
          <path d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z" fill="url(#basket)"/>
          <path d="M348 485h328l-44 207c-5 24-22 36-47 36H439c-25 0-42-12-47-36l-44-207Z" fill="#0F1117" opacity="0.95"/>
          <path d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z" fill="url(#heart)"/>
          <path d="M477 587l35 35 71-84" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `
  },
  {
    name: 'stokit-logo-v2-pure-black',
    title: 'Version 2: Minimalist Pure Black (OLED Style)',
    description: 'An ultra-high-contrast, minimal layout. Uses a pitch-black background to blend into dark mode home screens, a crisp solid white basket, and a striking flat red heart.',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.6"/>
          </filter>
        </defs>
        <rect width="1024" height="1024" fill="#000000"/>
        <g filter="url(#shadow)">
          <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="#FFFFFF" stroke-width="54" stroke-linecap="round"/>
          <path d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z" fill="#FFFFFF"/>
          <path d="M348 485h328l-44 207c-5 24-22 36-47 36H439c-25 0-42-12-47-36l-44-207Z" fill="#000000"/>
          <path d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z" fill="#E8432D"/>
          <path d="M477 587l35 35 71-84" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `
  },
  {
    name: 'stokit-logo-v3-vibrant-red',
    title: 'Version 3: Vibrant Coral Red (Standout Style)',
    description: 'A loud, energetic design that makes the app stand out on the home screen. A warm red gradient background, a bright silver basket, and a contrasting deep navy heart containing a white check.',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <defs>
          <radialGradient id="bg" cx="42%" cy="32%" r="78%">
            <stop offset="0%" stop-color="#FF8B72"/>
            <stop offset="70%" stop-color="#E8432D"/>
            <stop offset="100%" stop-color="#C02D1A"/>
          </radialGradient>
          <linearGradient id="basket" x1="260" y1="180" x2="760" y2="850">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="60%" stop-color="#E2E8F0"/>
            <stop offset="100%" stop-color="#CBD5E1"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#5B0F05" flood-opacity="0.35"/>
          </filter>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)"/>
        <g filter="url(#shadow)">
          <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="url(#basket)" stroke-width="54" stroke-linecap="round"/>
          <path d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z" fill="url(#basket)"/>
          <path d="M348 485h328l-44 207c-5 24-22 36-47 36H439c-25 0-42-12-47-36l-44-207Z" fill="#E8432D" opacity="0.95"/>
          <path d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z" fill="#0F1117"/>
          <path d="M477 587l35 35 71-84" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `
  },
  {
    name: 'stokit-logo-v4-glassmorphism',
    title: 'Version 4: Translucent Frosted Glass',
    description: 'A cutting-edge glassmorphic design. A dark navy background with a semi-transparent, glossy glass shopping basket, highlighted by a glowing neon coral-red heart.',
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
        <defs>
          <radialGradient id="bg" cx="42%" cy="32%" r="78%">
            <stop offset="0%" stop-color="#1E2235"/>
            <stop offset="64%" stop-color="#0F1117"/>
            <stop offset="100%" stop-color="#07080A"/>
          </radialGradient>
          <linearGradient id="glass-grad" x1="0" y1="0" x2="1024" y2="1024">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.06"/>
          </linearGradient>
          <linearGradient id="border-grad" x1="0" y1="0" x2="1024" y2="1024">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.5"/>
            <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          </linearGradient>
          <linearGradient id="heart" x1="414" y1="494" x2="656" y2="711">
            <stop offset="0%" stop-color="#FF9B85"/>
            <stop offset="100%" stop-color="#FF4B2B"/>
          </linearGradient>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.45"/>
          </filter>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="150%">
            <feGaussianBlur stdDeviation="15" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)"/>
        <g filter="url(#shadow)">
          <!-- Glass Handle -->
          <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="url(#glass-grad)" stroke-width="54" stroke-linecap="round"/>
          <path d="M336 392c38-102 90-154 176-154s138 52 176 154" fill="none" stroke="url(#border-grad)" stroke-width="6" stroke-linecap="round"/>
          
          <!-- Glass Basket Body -->
          <path d="M262 410h500l-72 316c-10 45-42 69-88 69H422c-46 0-78-24-88-69l-72-316Z" fill="url(#glass-grad)" stroke="url(#border-grad)" stroke-width="6"/>
          
          <!-- Glowing Heart inside -->
          <path d="M414 558c0-37 27-64 64-64 17 0 30 6 42 18 12-12 25-18 42-18 37 0 64 27 64 64 0 61-47 117-106 153-59-36-106-92-106-153Z" fill="url(#heart)" filter="url(#glow)"/>
          <path d="M477 587l35 35 71-84" fill="none" stroke="#FFFFFF" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `
  }
];

const markdown = [];

for (const ver of versions) {
  // Save SVGs
  await writeFile(`${outDir}${ver.name}.svg`, ver.svg.trim());
  // Render PNGs at high res (1024x1024)
  await sharp(Buffer.from(ver.svg.trim()))
    .resize(1024, 1024)
    .png()
    .toFile(`${outDir}${ver.name}.png`);
    
  markdown.push(`### ${ver.title}\n\n${ver.description}\n\n![${ver.title}](./${ver.name}.png)\n\n`);
}

await writeFile(`${outDir}stokit_logo_variations.md`, `# Stokit App Icon Variations\n\nHere are four custom versions of the "Basket with Heart" logo, specifically tuned to match the modern, premium dark aesthetic of Stokit V2:\n\n${markdown.join('---\n\n')}`);
console.log('Successfully generated Stokit app icon versions!');
