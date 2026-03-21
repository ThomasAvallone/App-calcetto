#!/usr/bin/env python3
"""Generate Calcetto PWA icons - soccer ball on green background"""

import math
from PIL import Image, ImageDraw
import os

def draw_soccer_ball_icon(size):
    """Draw a soccer ball icon at the given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background - green like a pitch
    radius = int(size * 0.22)
    bg_color = (26, 107, 58, 255)  # Dark green

    # Draw rounded rectangle background
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=bg_color)

    # Ball parameters
    cx = size / 2
    cy = size / 2
    ball_r = size * 0.32

    # Draw white ball base
    draw.ellipse(
        [cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r],
        fill=(255, 255, 255, 255),
        outline=(200, 200, 200, 255),
        width=max(1, int(size * 0.008))
    )

    # Draw soccer ball pentagon pattern
    def polar_to_cart(center_x, center_y, angle_deg, r):
        angle_rad = math.radians(angle_deg - 90)  # -90 to start from top
        return (center_x + r * math.cos(angle_rad),
                center_y + r * math.sin(angle_rad))

    # Pentagon patch positions (centers of each black patch as angle from center)
    # Classic soccer ball has 1 center pentagon surrounded by 5 pentagons
    # then another ring of 5

    patch_color = (20, 20, 20, 255)

    # Scale factors
    s = ball_r

    # Center pentagon (top)
    center_pent_r = s * 0.32
    top_cx = cx
    top_cy = cy - s * 0.52

    def make_pentagon(px, py, r, rotation=0):
        pts = []
        for i in range(5):
            angle = math.radians(rotation + i * 72 - 90)
            pts.append((px + r * math.cos(angle), py + r * math.sin(angle)))
        return pts

    pentagon_r = s * 0.22

    # Top center
    draw.polygon(make_pentagon(cx, cy - s * 0.52, pentagon_r, 0), fill=patch_color)

    # Bottom center
    draw.polygon(make_pentagon(cx, cy + s * 0.52, pentagon_r, 36), fill=patch_color)

    # Left
    draw.polygon(make_pentagon(cx - s * 0.52, cy, pentagon_r, 18), fill=patch_color)

    # Right
    draw.polygon(make_pentagon(cx + s * 0.52, cy, pentagon_r, 18), fill=patch_color)

    # Top-left
    draw.polygon(make_pentagon(cx - s * 0.40, cy - s * 0.35, pentagon_r, 0), fill=patch_color)

    # Top-right
    draw.polygon(make_pentagon(cx + s * 0.40, cy - s * 0.35, pentagon_r, 0), fill=patch_color)

    # Bottom-left
    draw.polygon(make_pentagon(cx - s * 0.40, cy + s * 0.35, pentagon_r, 36), fill=patch_color)

    # Bottom-right
    draw.polygon(make_pentagon(cx + s * 0.40, cy + s * 0.35, pentagon_r, 36), fill=patch_color)

    # Redraw ball outline on top of patches
    draw.ellipse(
        [cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r],
        fill=None,
        outline=(180, 180, 180, 200),
        width=max(1, int(size * 0.008))
    )

    # Subtle shine
    shine_x = cx - s * 0.18
    shine_y = cy - s * 0.30
    shine_rx = s * 0.18
    shine_ry = s * 0.10

    # Rotated ellipse for shine - approximate with a standard ellipse
    shine_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shine_draw = ImageDraw.Draw(shine_img)
    shine_draw.ellipse(
        [shine_x - shine_rx, shine_y - shine_ry,
         shine_x + shine_rx, shine_y + shine_ry],
        fill=(255, 255, 255, 70)
    )
    # Rotate the shine
    shine_img = shine_img.rotate(-30, center=(shine_x, shine_y), expand=False)
    img = Image.alpha_composite(img, shine_img)

    return img

# Sizes to generate
sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512]

output_dir = os.path.join(os.path.dirname(__file__), 'public', 'icons')
os.makedirs(output_dir, exist_ok=True)

for size in sizes:
    icon = draw_soccer_ball_icon(size)
    if size == 180:
        # apple-touch-icon
        path = os.path.join(os.path.dirname(__file__), 'public', 'apple-touch-icon.png')
    else:
        path = os.path.join(output_dir, f'icon-{size}x{size}.png')
    icon.save(path, 'PNG', optimize=True)
    print(f"Generated {path}")

print("Done!")
