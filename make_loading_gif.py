"""
Generate EA Sports-style loading.gif
- Black letterbox bars top/bottom
- White center background
- Dark red EA "E" logo sliding/zooming in
- Classic scanline overlay
"""
from PIL import Image, ImageDraw
import math, os

W, H = 480, 360
BAR_H = 40          # black letterbox bar height
INNER_H = H - 2 * BAR_H   # 280px white area

RED    = (170, 10, 10)
RED2   = (140, 8,  8)
BLACK  = (0,   0,  0)
WHITE  = (255, 255, 255)

SCANLINE_ALPHA = 30  # darkness of scanlines (0=none, 255=full black)


def draw_bg(img):
    draw = ImageDraw.Draw(img)
    # White center
    draw.rectangle([0, BAR_H, W, H - BAR_H], fill=WHITE)
    # Black bars
    draw.rectangle([0, 0,       W, BAR_H],      fill=BLACK)
    draw.rectangle([0, H-BAR_H, W, H],          fill=BLACK)
    return draw


def apply_scanlines(img):
    """Overlay subtle horizontal scanlines on the white area."""
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for y in range(BAR_H, H - BAR_H, 2):
        d.line([(0, y), (W, y)], fill=(0, 0, 0, SCANLINE_ALPHA))
    base = img.convert('RGBA')
    combined = Image.alpha_composite(base, overlay)
    return combined.convert('RGB')


def draw_ea_logo(draw, cx, cy, scale):
    """
    Draw the EA Sports stylised 'E' logo centred at (cx, cy).
    The shape is a bold italic E: 3 horizontal arms + left spine,
    skewed ~12 degrees right, with angled right-end cuts.
    """
    s = scale

    # ── geometry (all values at scale=1.0, logo ~160×170 px) ──────────────
    spine_w   = int(30  * s)   # thickness of left vertical spine
    arm_thick = int(38  * s)   # thickness of each arm
    arm_mid   = int(28  * s)   # middle arm is slightly thinner
    gap       = int(18  * s)   # gap between arms
    logo_w    = int(160 * s)   # total width
    logo_h    = int(arm_thick * 3 + arm_mid + gap * 2)  # total height

    skew = int(14 * s)         # italic horizontal skew per logo_h

    lx = cx - logo_w // 2     # top-left reference
    ly = cy - logo_h // 2

    def skewed_rect(x0, y0, w, h, extra_cut=0):
        """
        Return polygon points for a skewed (italic) rectangle.
        extra_cut trims the right end diagonally (arm tip style).
        """
        # skew offset per row: positive = shift right as y increases
        sk_top = int(skew * (logo_h - (y0 - ly)) / logo_h)
        sk_bot = int(skew * (logo_h - (y0 + h - ly)) / logo_h)

        rx = x0 + w            # right edge x
        cut = extra_cut        # extra diagonal at right tip

        return [
            (x0  + sk_top,        y0),
            (rx  + sk_top - cut,  y0),
            (rx  + sk_bot,        y0 + h),
            (x0  + sk_bot,        y0 + h),
        ]

    # ── top stripe (thin bar above the E, like EA logo detail) ────────────
    stripe_h = int(18 * s)
    stripe_y = ly - stripe_h - int(6 * s)
    stripe_w = int(logo_w * 0.75)
    stripe_pts = skewed_rect(lx + int(logo_w * 0.2), stripe_y, stripe_w, stripe_h, cut=int(20*s))
    draw.polygon(stripe_pts, fill=RED)

    # ── top arm ────────────────────────────────────────────────────────────
    top_arm_y = ly
    top_arm_pts = skewed_rect(lx, top_arm_y, logo_w, arm_thick, cut=int(22*s))
    draw.polygon(top_arm_pts, fill=RED)

    # ── spine (connects all arms on the left) ─────────────────────────────
    spine_y = ly + arm_thick
    spine_h = gap * 2 + arm_mid + arm_thick   # from below top arm to bottom arm start
    spine_pts = skewed_rect(lx, spine_y, spine_w, spine_h + arm_thick, cut=0)
    draw.polygon(spine_pts, fill=RED)

    # ── middle arm ────────────────────────────────────────────────────────
    mid_y = ly + arm_thick + gap
    mid_w = int(logo_w * 0.72)
    mid_pts = skewed_rect(lx, mid_y, mid_w, arm_mid, cut=int(18*s))
    draw.polygon(mid_pts, fill=RED)

    # ── bottom arm ────────────────────────────────────────────────────────
    bot_y = ly + arm_thick + gap + arm_mid + gap
    bot_pts = skewed_rect(lx, bot_y, logo_w, arm_thick, cut=int(22*s))
    draw.polygon(bot_pts, fill=RED)


def make_frame(progress):
    """
    progress: 0.0 → 1.0 (animation state)
    Phase 0.0–0.4 : logo slides in from left + scales up
    Phase 0.4–1.0 : holds
    """
    img = Image.new('RGB', (W, H), WHITE)
    draw = draw_bg(img)

    # Ease-in-out curve
    if progress < 0.45:
        t = progress / 0.45
        ease = t * t * (3 - 2 * t)           # smoothstep
        scale  = 0.55 + ease * 0.45          # 0.55 → 1.0
        offset_x = int((1 - ease) * (-W * 0.35))  # slide from left
    else:
        scale  = 1.0
        offset_x = 0

    center_x = W // 2 - 20 + offset_x
    center_y = BAR_H + INNER_H // 2

    draw_ea_logo(draw, center_x, center_y, scale)

    return apply_scanlines(img)


# ── build frames ──────────────────────────────────────────────────────────
TOTAL_FRAMES = 28
frames    = []
durations = []

for i in range(TOTAL_FRAMES):
    p = i / (TOTAL_FRAMES - 1)
    frames.append(make_frame(p))
    # slower at start, hold at end
    if p < 0.45:
        durations.append(45)
    else:
        durations.append(80)

# ── save ──────────────────────────────────────────────────────────────────
out = os.path.join(os.path.dirname(__file__), 'public', 'loading.gif')
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    loop=0,
    duration=durations,
    optimize=False,
)
print(f"Saved {out}  ({TOTAL_FRAMES} frames)")
