#!/usr/bin/env python3
"""Generate Calcetto PWA icons - Adidas Tango Durlast style ball on blue background"""

import math
from PIL import Image, ImageDraw
import os


def draw_tango_icon(size):
    """Draw an Adidas Tango-style ball icon on blue background."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Blue background
    radius = int(size * 0.22)
    bg_color = (15, 55, 145, 255)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg_color)

    # Ball parameters
    cx = size / 2
    cy = size / 2
    ball_r = size * 0.38

    # White ball base
    draw.ellipse(
        [cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r],
        fill=(248, 248, 252, 255)
    )

    # Tango pattern: dark navy patches near the edge of the ball
    # The Tango ball is MOSTLY WHITE with dark patches only near seams
    tango_color = (18, 24, 58, 255)

    # Each "triad" is 3 small curved shapes near the ball edge.
    # We draw them on a separate layer clipped to the ball.
    patch_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(patch_layer)

    # Lobe size: small, just patches near the edge
    lobe_r = ball_r * 0.155   # ~8% of ball diameter
    # Distance from center to the center of each triad group
    triad_dist = ball_r * 0.72

    # 6 triads at 60-degree intervals
    for i in range(6):
        base_angle = math.radians(i * 60 + 30)
        ax = cx + triad_dist * math.cos(base_angle)
        ay = cy + triad_dist * math.sin(base_angle)

        # 3 lobes per triad arranged around the anchor, pointing outward
        for j in range(3):
            lobe_angle = base_angle + math.radians(j * 120)
            lx = ax + lobe_r * 0.9 * math.cos(lobe_angle)
            ly = ay + lobe_r * 0.9 * math.sin(lobe_angle)
            pd.ellipse(
                [lx - lobe_r, ly - lobe_r, lx + lobe_r, ly + lobe_r],
                fill=tango_color
            )

    # Clip to ball circle by multiplying existing alpha with ball mask
    ball_mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(ball_mask)
    mask_draw.ellipse(
        [cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r],
        fill=255
    )
    from PIL import ImageChops
    r_ch, g_ch, b_ch, a_ch = patch_layer.split()
    clipped_a = ImageChops.multiply(a_ch, ball_mask)
    patch_layer = Image.merge('RGBA', (r_ch, g_ch, b_ch, clipped_a))
    img = Image.alpha_composite(img, patch_layer)

    # Ball outline
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        [cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r],
        fill=None,
        outline=(140, 145, 165, 200),
        width=max(1, int(size * 0.007))
    )

    # Shine highlight
    shine_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shine_draw = ImageDraw.Draw(shine_layer)
    shine_x = cx - ball_r * 0.20
    shine_y = cy - ball_r * 0.28
    shine_rx = ball_r * 0.20
    shine_ry = ball_r * 0.11
    shine_draw.ellipse(
        [shine_x - shine_rx, shine_y - shine_ry,
         shine_x + shine_rx, shine_y + shine_ry],
        fill=(255, 255, 255, 70)
    )
    shine_layer = shine_layer.rotate(-35, center=(shine_x, shine_y), expand=False)
    r_ch, g_ch, b_ch, a_ch = shine_layer.split()
    clipped_a = ImageChops.multiply(a_ch, ball_mask)
    shine_layer = Image.merge('RGBA', (r_ch, g_ch, b_ch, clipped_a))
    img = Image.alpha_composite(img, shine_layer)

    return img


def make_favicon_svg(size=512):
    cx = size // 2
    cy = size // 2
    r = int(size * 0.38)
    bg_r = int(size * 0.22)
    ball_r = size * 0.38
    lobe_r = int(ball_r * 0.155)
    triad_dist = ball_r * 0.72

    triads_svg = ""
    for i in range(6):
        base_angle = math.radians(i * 60 + 30)
        ax = cx + triad_dist * math.cos(base_angle)
        ay = cy + triad_dist * math.sin(base_angle)
        for j in range(3):
            lobe_angle = base_angle + math.radians(j * 120)
            lx = ax + lobe_r * 0.9 * math.cos(lobe_angle)
            ly = ay + lobe_r * 0.9 * math.sin(lobe_angle)
            triads_svg += f'  <circle cx="{lx:.1f}" cy="{ly:.1f}" r="{lobe_r}" fill="#12183a"/>\n'

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <defs>
    <clipPath id="ball-clip">
      <circle cx="{cx}" cy="{cy}" r="{r}"/>
    </clipPath>
    <radialGradient id="ball-grad" cx="38%" cy="36%" r="65%">
      <stop offset="0%" stop-color="#f8f8fc"/>
      <stop offset="100%" stop-color="#dcdee8"/>
    </radialGradient>
  </defs>
  <rect width="{size}" height="{size}" rx="{bg_r}" fill="#0f3791"/>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#ball-grad)" stroke="#8c90a8" stroke-width="{max(1,int(size*0.007))}"/>
  <g clip-path="url(#ball-clip)">
{triads_svg}  </g>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#8c90a8" stroke-width="{max(1,int(size*0.007))}"/>
  <ellipse cx="{int(cx-r*0.20)}" cy="{int(cy-r*0.28)}"
           rx="{int(r*0.20)}" ry="{int(r*0.11)}"
           fill="white" opacity="0.15"
           transform="rotate(-35 {int(cx-r*0.20)} {int(cy-r*0.28)})"/>
</svg>"""


# Sizes to generate
sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512]

output_dir = os.path.join(os.path.dirname(__file__), 'public', 'icons')
os.makedirs(output_dir, exist_ok=True)

for size in sizes:
    icon = draw_tango_icon(size)
    if size == 180:
        path = os.path.join(os.path.dirname(__file__), 'public', 'apple-touch-icon.png')
    else:
        path = os.path.join(output_dir, f'icon-{size}x{size}.png')
    icon.save(path, 'PNG', optimize=True)
    print(f"Generated {path}")

# Generate SVG favicon
svg_path = os.path.join(os.path.dirname(__file__), 'public', 'favicon.svg')
with open(svg_path, 'w') as f:
    f.write(make_favicon_svg(512))
print(f"Generated {svg_path}")

print("Done!")
