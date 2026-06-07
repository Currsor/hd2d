#!/usr/bin/env python3
"""
Sprite Sheet 逐帧水平翻转工具

Usage:
    python flip_sprite.py <image> <rows> <cols> [--output <path>]

Example:
    python flip_sprite.py idle.png 3 4
    → 输出 idle_flipped.png (3行4列, 每帧左右镜像)
"""

import argparse
import sys
from pathlib import Path
from typing import Optional

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow 库: pip install Pillow --break-system-packages", file=sys.stderr)
    sys.exit(1)


def flip_sprite_sheet(path: str, rows: int, cols: int, output: Optional[str] = None) -> str:
    img = Image.open(path)

    if img.width % cols != 0 or img.height % rows != 0:
        print(f"⚠ 图片尺寸 {img.width}x{img.height} 不能被 {rows}行×{cols}列 整除")
        print(f"  帧宽: {img.width / cols:.1f}  帧高: {img.height / rows:.1f}")
        print(f"  如果非整像素, 部分帧边界可能有偏移")
        return ""

    frame_w = img.width // cols
    frame_h = img.height // rows

    out = Image.new(img.mode, (img.width, img.height))

    for r in range(rows):
        for c in range(cols):
            left = c * frame_w
            top = r * frame_h
            frame = img.crop((left, top, left + frame_w, top + frame_h))
            flipped = frame.transpose(Image.FLIP_LEFT_RIGHT)
            out.paste(flipped, (left, top))

    if output is None:
        p = Path(path)
        output = str(p.parent / f"{p.stem}_flipped{p.suffix}")

    out.save(output)
    return output


def main():
    parser = argparse.ArgumentParser(description="Sprite Sheet 逐帧水平翻转")
    parser.add_argument("image", help="输入图片路径")
    parser.add_argument("rows", type=int, help="行数")
    parser.add_argument("cols", type=int, help="列数")
    parser.add_argument("-o", "--output", help="输出路径 (默认: 原名_flipped.后缀)")
    args = parser.parse_args()

    result = flip_sprite_sheet(args.image, args.rows, args.cols, args.output)
    if result:
        print(f"✓ 输出: {result}")


if __name__ == "__main__":
    main()
