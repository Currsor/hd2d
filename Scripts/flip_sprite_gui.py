#!/usr/bin/env python3
"""
Sprite Flip — 浏览器版
运行后打开 http://localhost:8765，拖入图片即可翻转

用法: python3 Scripts/flip_sprite_gui.py
"""

import http.server
import os
import webbrowser
import sys
from pathlib import Path

HTML = r"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sprite Flip</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,sans-serif; background:#1a1a2e; color:#eee; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:20px; }
h1 { font-size:20px; margin-bottom:8px; }
.sub { color:#888; font-size:13px; margin-bottom:20px; }
.drop-zone { width:480px; height:180px; border:2px dashed #555; border-radius:12px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:.2s; margin-bottom:16px; overflow:hidden; }
.drop-zone:hover,.drop-zone.drag { border-color:#4a90d9; background:#22223f; }
.drop-zone p { color:#777; font-size:15px; }
.drop-zone img { max-width:100%; max-height:100%; object-fit:contain; }
.controls { display:flex; gap:16px; align-items:center; margin-bottom:16px; }
.controls label { font-size:14px; }
.controls input { width:60px; padding:6px 8px; border:1px solid #444; border-radius:6px; background:#282845; color:#eee; font-size:14px; text-align:center; }
.btn { padding:10px 32px; border:none; border-radius:8px; font-size:15px; font-weight:bold; cursor:pointer; transition:.2s; }
.btn-flip { background:#4a90d9; color:#fff; }
.btn-flip:hover { background:#5aa0e9; }
.btn-flip:disabled { background:#334; color:#666; cursor:not-allowed; }
.btn-save { background:#2a5; color:#fff; margin-top:8px; }
.btn-save:hover { background:#3b6; }
.btn-save:disabled { background:#334; color:#666; cursor:not-allowed; }
.result { margin-top:12px; }
.result img { max-width:480px; border-radius:8px; border:1px solid #333; }
.status { font-size:13px; color:#888; margin-top:8px; }
canvas { display:none; }
</style>
</head>
<body>

<h1>Sprite Flip</h1>
<p class="sub">拖入精灵表 → 设行列数 → 翻转 → 保存</p>

<div class="drop-zone" id="dropZone">
    <p>点击选择图片 或 拖放图片到此处</p>
    <input type="file" id="fileInput" accept="image/png,image/jpeg,image/gif,image/bmp" hidden>
</div>

<div class="controls">
    <label>行 <input type="number" id="rows" value="1" min="1" max="20"></label>
    <label>列 <input type="number" id="cols" value="5" min="1" max="20"></label>
</div>

<button class="btn btn-flip" id="btnFlip" disabled>水平翻转</button>

<div class="result" id="result"></div>
<p class="status" id="status"></p>

<canvas id="canvas"></canvas>
<button class="btn btn-save" id="btnSave" disabled>保存翻转图</button>

<script>
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const btnFlip = document.getElementById('btnFlip');
const btnSave = document.getElementById('btnSave');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const resultDiv = document.getElementById('result');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('canvas');
let originalImage = null;
let flippedDataUrl = '';

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) loadImage(file);
});

function loadImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            dropZone.innerHTML = '';
            dropZone.appendChild(img);
            btnFlip.disabled = false;
            btnSave.disabled = true;
            resultDiv.innerHTML = '';
            statusEl.textContent = `已加载: ${img.naturalWidth}x${img.naturalHeight} | ${file.name}`;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

btnFlip.addEventListener('click', () => {
    if (!originalImage) return;
    const rows = parseInt(rowsInput.value) || 1;
    const cols = parseInt(colsInput.value) || 1;
    const w = originalImage.naturalWidth;
    const h = originalImage.naturalHeight;
    const fw = w / cols;
    const fh = h / rows;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const sx = c * fw, sy = r * fh;
            const dx = sx + fw, dy = sy;
            // 镜像: 从右往左画
            ctx.save();
            ctx.translate(sx + fw, sy);
            ctx.scale(-1, 1);
            ctx.drawImage(originalImage, sx, sy, fw, fh, 0, 0, fw, fh);
            ctx.restore();
        }
    }

    flippedDataUrl = canvas.toDataURL('image/png');
    const outImg = document.createElement('img');
    outImg.src = flippedDataUrl;
    resultDiv.innerHTML = '';
    resultDiv.appendChild(outImg);
    btnSave.disabled = false;
    statusEl.textContent = `翻转完成 (${rows}行 x ${cols}列, ${w}x${h})`;
});

btnSave.addEventListener('click', () => {
    if (!flippedDataUrl) return;
    const a = document.createElement('a');
    a.href = flippedDataUrl;
    a.download = 'flipped.png';
    a.click();
});
</script>
</body>
</html>"""

PORT = 8765

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默

def main():
    os.chdir(Path(__file__).parent)
    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"\n  Sprite Flip → {url}\n")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  已关闭")
        server.shutdown()

if __name__ == "__main__":
    main()
