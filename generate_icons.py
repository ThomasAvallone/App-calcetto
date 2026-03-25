#!/usr/bin/env python3
"""Generate Calcetto PWA icons - Adidas Tango Durlast faithful recreation"""

import math
from PIL import Image, ImageDraw, ImageChops, ImageFilter
import os


def make_tango_svg(size=512):
    """
    Generate SVG closely matching the Adidas Tango Durlast design.
    Pattern: white ball, dark navy tango triads (3-blade propeller shapes),
    on royal blue background.
    """
    cx = size / 2
    cy = size / 2
    R = size * 0.40   # ball radius
    bg_corner = size * 0.22

    navy = "#131c3a"
    white = "#f5f5f8"
    blue_bg = "#1a4abf"
    outline = "#9098b0"

    # --- Tango triad paths ---
    # The Tango pattern has 6 triads arranged in 3-fold symmetry (pairs of triads).
    # Each triad is 3 "petals" - circular arc sectors - rotated 120° from each other.
    # We draw this as a single compound path.
    #
    # Visible from front: 3 large dark "fans" arranged at 120° intervals,
    # each fan = 3 curved lobes meeting at a central point near the ball edge.

    def polar(angle_deg, r, ox=0, oy=0):
        a = math.radians(angle_deg)
        return (ox + r * math.cos(a), oy + r * math.sin(a))

    # Build Tango triad shapes as SVG paths
    # Each "triad unit" = 3 circular arc lobes rotated 120° around an anchor point
    # Anchor points are at 60° intervals around the ball (6 triads)

    triad_anchors = []
    for i in range(6):
        angle = i * 60 + 30  # 30°, 90°, 150°, 210°, 270°, 330°
        dist = R * 0.60
        x = cx + dist * math.cos(math.radians(angle))
        y = cy + dist * math.sin(math.radians(angle))
        triad_anchors.append((x, y, angle))

    lobe_r = R * 0.32        # radius of each lobe circle
    lobe_offset = R * 0.22  # distance from anchor to lobe center

    all_triads_path = ""
    for ax, ay, base_angle in triad_anchors:
        for j in range(3):
            lobe_angle = base_angle + j * 120
            la = math.radians(lobe_angle)
            lx = ax + lobe_offset * math.cos(la)
            ly = ay + lobe_offset * math.sin(la)
            all_triads_path += f'<circle cx="{lx:.2f}" cy="{ly:.2f}" r="{lobe_r:.2f}" fill="{navy}"/>\n'

    # Panel seam lines (thin gray lines between sections)
    seam_lines = ""
    seam_color = "#c8ccd8"
    seam_w = max(1, size * 0.008)
    for i in range(6):
        angle = i * 60 + 30
        a = math.radians(angle)
        # Line from center to edge
        x2 = cx + R * 0.95 * math.cos(a)
        y2 = cy + R * 0.95 * math.sin(a)
        seam_lines += (
            f'<line x1="{cx:.1f}" y1="{cy:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{seam_color}" stroke-width="{seam_w:.1f}"/>\n'
        )

    # Ball gradient (radial, top-left highlight)
    ball_cx_pct = "40%"
    ball_cy_pct = "35%"

    shadow_r = R * 1.04
    shadow_cx = cx + R * 0.05
    shadow_cy = cy + R * 0.06

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 {size} {size}" width="{size}" height="{size}">
  <defs>
    <clipPath id="ball">
      <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}"/>
    </clipPath>
    <radialGradient id="bg-grad" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#2258d4"/>
      <stop offset="100%" stop-color="#0e2e8a"/>
    </radialGradient>
    <radialGradient id="ball-grad" cx="{ball_cx_pct}" cy="{ball_cy_pct}" r="70%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="60%" stop-color="#eeeef4"/>
      <stop offset="100%" stop-color="#d0d4e0"/>
    </radialGradient>
    <radialGradient id="shine-grad" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="white" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="{R*0.04:.1f}"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="{size}" height="{size}" rx="{bg_corner:.1f}" fill="url(#bg-grad)"/>

  <!-- Ball shadow -->
  <circle cx="{shadow_cx:.1f}" cy="{shadow_cy:.1f}" r="{shadow_r:.1f}"
          fill="rgba(0,0,0,0.35)" filter="url(#shadow)"/>

  <!-- Ball base -->
  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}" fill="url(#ball-grad)"/>

  <!-- Tango triads (clipped to ball) -->
  <g clip-path="url(#ball)">
    {all_triads_path}
  </g>

  <!-- Seam lines (clipped to ball) -->
  <g clip-path="url(#ball)">
    {seam_lines}
  </g>

  <!-- Ball outline -->
  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}"
          fill="none" stroke="{outline}" stroke-width="{size*0.007:.1f}"/>

  <!-- Shine highlight -->
  <circle cx="{cx:.1f}" cy="{cy:.1f}" r="{R:.1f}"
          fill="url(#shine-grad)" clip-path="url(#ball)"/>
</svg>"""
    return svg


def rasterize_svg_to_png(svg_string, size):
    """Rasterize SVG using cairosvg if available, else fallback to PIL drawing."""
    try:
        import cairosvg
        png_bytes = cairosvg.svg2png(
            bytestring=svg_string.encode(),
            output_width=size,
            output_height=size
        )
        import io
        return Image.open(io.BytesIO(png_bytes)).convert('RGBA')
    except ImportError:
        return draw_tango_pil(size)


def draw_tango_pil(size):
    """PIL fallback: draw Tango-style ball."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = size / 2
    cy = size / 2
    R = size * 0.40
    bg_corner = int(size * 0.22)

    # Blue gradient background (approximate with two-step)
    for i in range(size):
        t = i / size
        r_c = int(34 + (14 - 34) * t)
        g_c = int(88 + (46 - 88) * t)
        b_c = int(212 + (138 - 212) * t)
        draw.line([(0, i), (size, i)], fill=(r_c, g_c, b_c, 255))

    # Mask to rounded rect
    bg_mask = Image.new('L', (size, size), 0)
    bmask_draw = ImageDraw.Draw(bg_mask)
    bmask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=bg_corner, fill=255)
    r_ch, g_ch, b_ch, a_ch = img.split()
    new_a = ImageChops.multiply(a_ch, bg_mask)
    img = Image.merge('RGBA', (r_ch, g_ch, b_ch, new_a))
    draw = ImageDraw.Draw(img)

    # Shadow
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    so = R * 0.06
    sd.ellipse([cx - R + so, cy - R + so, cx + R + so, cy + R + so],
               fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(R * 0.04)))
    img = Image.alpha_composite(img, shadow)
    draw = ImageDraw.Draw(img)

    # Ball base with gradient feel
    for layer in range(20, 0, -1):
        t = (20 - layer) / 20
        rc = int(layer / 20 * 255 + (1 - layer / 20) * 210)
        gc = int(layer / 20 * 255 + (1 - layer / 20) * 212)
        bc = int(layer / 20 * 252 + (1 - layer / 20) * 225)
        lr = R * (layer / 20)
        lx = cx - R * 0.1 * (1 - t)
        ly = cy - R * 0.1 * (1 - t)
        draw.ellipse([lx - lr, ly - lr, lx + lr, ly + lr],
                     fill=(rc, gc, bc, 255))

    # Final white ball base
    draw.ellipse([cx - R, cy - R, cx + R, cy + R],
                 fill=(248, 248, 252, 255))

    # Tango triads
    navy = (19, 28, 58, 255)
    lobe_r = R * 0.32
    lobe_offset = R * 0.22
    triad_dist = R * 0.60

    patch_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(patch_layer)

    for i in range(6):
        base_angle = i * 60 + 30
        ba = math.radians(base_angle)
        ax = cx + triad_dist * math.cos(ba)
        ay = cy + triad_dist * math.sin(ba)
        for j in range(3):
            lobe_angle = math.radians(base_angle + j * 120)
            lx = ax + lobe_offset * math.cos(lobe_angle)
            ly = ay + lobe_offset * math.sin(lobe_angle)
            pd.ellipse([lx - lobe_r, ly - lobe_r, lx + lobe_r, ly + lobe_r],
                       fill=navy)

    # Clip to ball
    ball_mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(ball_mask).ellipse(
        [cx - R, cy - R, cx + R, cy + R], fill=255)
    r_ch, g_ch, b_ch, a_ch = patch_layer.split()
    patch_layer = Image.merge('RGBA', (r_ch, g_ch, b_ch,
                                       ImageChops.multiply(a_ch, ball_mask)))
    img = Image.alpha_composite(img, patch_layer)
    draw = ImageDraw.Draw(img)

    # Seam lines
    seam_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sd2 = ImageDraw.Draw(seam_layer)
    sw = max(1, int(size * 0.007))
    for i in range(6):
        a = math.radians(i * 60 + 30)
        x2 = cx + R * 0.95 * math.cos(a)
        y2 = cy + R * 0.95 * math.sin(a)
        sd2.line([(cx, cy), (x2, y2)], fill=(190, 195, 210, 180), width=sw)
    r_ch, g_ch, b_ch, a_ch = seam_layer.split()
    seam_layer = Image.merge('RGBA', (r_ch, g_ch, b_ch,
                                      ImageChops.multiply(a_ch, ball_mask)))
    img = Image.alpha_composite(img, seam_layer)
    draw = ImageDraw.Draw(img)

    # Ball outline
    draw.ellipse([cx - R, cy - R, cx + R, cy + R],
                 fill=None, outline=(140, 148, 168, 200),
                 width=max(1, int(size * 0.007)))

    # Shine
    shine = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shine)
    sh_cx = cx - R * 0.18
    sh_cy = cy - R * 0.25
    sh_rx = R * 0.28
    sh_ry = R * 0.16
    sh_draw.ellipse([sh_cx - sh_rx, sh_cy - sh_ry,
                     sh_cx + sh_rx, sh_cy + sh_ry],
                    fill=(255, 255, 255, 65))
    shine = shine.rotate(-30, center=(sh_cx, sh_cy), expand=False)
    r_ch, g_ch, b_ch, a_ch = shine.split()
    shine = Image.merge('RGBA', (r_ch, g_ch, b_ch,
                                  ImageChops.multiply(a_ch, ball_mask)))
    img = Image.alpha_composite(img, shine)

    return img


# Check if cairosvg is available
try:
    import cairosvg
    HAS_CAIRO = True
    print("Using cairosvg for high-quality SVG rasterization")
except ImportError:
    HAS_CAIRO = False
    print("cairosvg not available, using PIL fallback")

sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512]

output_dir = os.path.join(os.path.dirname(__file__), 'public', 'icons')
os.makedirs(output_dir, exist_ok=True)

for size in sizes:
    if HAS_CAIRO:
        svg = make_tango_svg(size)
        icon = rasterize_svg_to_png(svg, size)
    else:
        icon = draw_tango_pil(size)

    if size == 180:
        path = os.path.join(os.path.dirname(__file__), 'public', 'apple-touch-icon.png')
    else:
        path = os.path.join(output_dir, f'icon-{size}x{size}.png')
    icon.save(path, 'PNG', optimize=True)
    print(f"Generated {path}")

# SVG favicon
svg_path = os.path.join(os.path.dirname(__file__), 'public', 'favicon.svg')
with open(svg_path, 'w') as f:
    f.write(make_tango_svg(512))
print(f"Generated {svg_path}")

print("Done!")
