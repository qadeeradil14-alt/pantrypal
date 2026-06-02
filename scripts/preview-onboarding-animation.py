from PIL import Image, ImageDraw, ImageFont
import math

OUT = "/Users/hewadadil/Documents/PantryPal/onboarding-animation-preview.gif"
W, H = 720, 720
BG = "#fbf7f0"
CARD = "#fffdf8"
BORDER = "#ded1bf"
INK = "#2a2119"
MUTED = "#9b806c"
COPPER = "#c87335"
SOFT = "#f3e7d6"
GREEN = "#5f8a69"
BLUE = "#89b9d7"


def font(size, bold=False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


F_TITLE = font(34, True)
F_LABEL = font(18, True)
F_BODY = font(16, False)
F_EMOJI = font(42, False)
F_EMOJI_BIG = font(54, False)


def ease(t):
    return 1 - (1 - t) ** 3


def rounded(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def center_text(draw, xy, text, fnt, fill):
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text((xy[0] - (box[2] - box[0]) / 2, xy[1] - (box[3] - box[1]) / 2), text, font=fnt, fill=fill)


zones = {
    "Fridge": ((82, 102, 302, 244), "🥛", BLUE),
    "Freezer": ((418, 102, 638, 244), "❄️", "#b9d7e8"),
    "Pantry": ((82, 476, 302, 618), "🥫", "#e8c49f"),
}

items = [
    ("🥛", (520, 430), (192, 170), 0.00),
    ("❄️", (190, 420), (528, 170), 0.18),
    ("🥫", (524, 320), (192, 544), 0.36),
]

frames = []
for i in range(54):
    t = i / 53
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)

    rounded(d, (34, 34, W - 34, H - 34), 42, CARD, BORDER, 2)

    d.ellipse((125, 125, 595, 595), outline="#f0e5d8", width=8)

    for name, (box, icon, color) in zones.items():
        rounded(d, box, 24, "#fffaf2", BORDER, 2)
        center_text(d, ((box[0] + box[2]) / 2, box[1] + 44), icon, F_EMOJI, color)
        center_text(d, ((box[0] + box[2]) / 2, box[3] - 34), name, F_LABEL, INK)

    rounded(d, (232, 258, 488, 430), 36, SOFT, BORDER, 2)
    center_text(d, (360, 312), "Stokit", F_TITLE, INK)
    center_text(d, (360, 352), "auto-sorts", F_BODY, MUTED)

    for emoji, start, end, delay in items:
        local = max(0, min(1, (t - delay) / 0.44))
        p = ease(local)
        x = start[0] + (end[0] - start[0]) * p
        y = start[1] + (end[1] - start[1]) * p
        pulse = 1 + 0.06 * math.sin(t * math.pi * 4)
        size = int(46 * (1 - 0.18 * p) * pulse)
        f = font(size, False)
        rounded(d, (x - 34, y - 34, x + 34, y + 34), 22, "#ffffff", "#ead9c5", 2)
        center_text(d, (x, y), emoji, f, INK)

    scan_x = 150 + 420 * ((t * 1.15) % 1)
    d.rounded_rectangle((scan_x, 270, scan_x + 4, 416), radius=2, fill=COPPER)
    d.rounded_rectangle((310, 386, 410, 398), radius=6, fill=GREEN)
    center_text(d, (360, 474), "Quiet motion. Clear zones. No orbit.", F_BODY, MUTED)

    frames.append(im)

frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=55, loop=0)
print(OUT)
