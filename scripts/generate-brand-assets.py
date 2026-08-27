#!/usr/bin/env python3
"""
Regenerate the app icon set from the real Black Dog Store mark.

    python3 scripts/generate-brand-assets.py      (requires Pillow)

INPUT is `assets/brand/blackdog-mark.png`, copied unmodified from the Web
repository (`frontend/public/assets/branding/logo-icon.png`).

Only the INK COLOUR is ever changed; the alpha channel — the shape of the mark —
is copied through untouched. That respects the brand rule "No modificar la forma
del logo" while producing the "versiones cromáticas aprobadas del logo para
fondo claro y oscuro" the same document asks for.

Re-run this after replacing the source mark. Do not hand-edit assets/icon/.
"""
from PIL import Image
import os

INK_DARK = (10, 10, 10)      # brand black  #0A0A0A
INK_LIGHT = (255, 255, 255)  # brand white  #FFFFFF

SOURCE = "assets/brand/blackdog-mark.png"
OUT_DIR = "assets/icon"


def recolor(src_path, rgb):
    """Replace the ink colour, keeping the alpha channel exactly as it was."""
    src = Image.open(src_path).convert("RGBA")
    out = Image.new("RGBA", src.size, rgb + (0,))
    out.putalpha(src.getchannel("A"))
    return out


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def fit_center(mark, canvas_size, coverage, bg=None):
    """Centre `mark` on a square canvas, occupying `coverage` of its width."""
    canvas = Image.new("RGBA", (canvas_size, canvas_size),
                       (bg + (255,)) if bg else (0, 0, 0, 0))
    target = int(canvas_size * coverage)
    w, h = mark.size
    scale = min(target / w, target / h)
    resized = mark.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((canvas_size - resized.width) // 2,
                                    (canvas_size - resized.height) // 2))
    return canvas


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    mark_dark = trim(recolor(SOURCE, INK_DARK))
    mark_light = trim(recolor(SOURCE, INK_LIGHT))

    # iOS app icon: opaque, no alpha (the App Store rejects alpha in an icon).
    # 0.68 coverage keeps the mark clear of the rounded-rect mask iOS applies.
    fit_center(mark_light, 1024, 0.68, bg=INK_DARK).convert("RGB").save(f"{OUT_DIR}/icon.png")

    # Android adaptive icon. The foreground must sit inside the 66% safe zone or
    # the system's circular/squircle mask clips the dog's ears.
    fit_center(mark_light, 1024, 0.52).save(f"{OUT_DIR}/adaptive-foreground.png")
    Image.new("RGB", (1024, 1024), INK_DARK).save(f"{OUT_DIR}/adaptive-background.png")
    # Monochrome layer for Android 13+ themed icons.
    fit_center(mark_light, 1024, 0.52).save(f"{OUT_DIR}/adaptive-monochrome.png")

    # Splash marks, one per scheme, transparent so the plugin background shows.
    fit_center(mark_dark, 512, 0.9).save(f"{OUT_DIR}/splash-mark.png")
    fit_center(mark_light, 512, 0.9).save(f"{OUT_DIR}/splash-mark-dark.png")

    fit_center(mark_light, 96, 0.72, bg=INK_DARK).convert("RGB").save(f"{OUT_DIR}/favicon.png")

    for name in sorted(os.listdir(OUT_DIR)):
        image = Image.open(os.path.join(OUT_DIR, name))
        print(f"{name:32} {image.mode:5} {image.size}")


if __name__ == "__main__":
    main()
