# pdf-lib + CJK — write Chinese, Japanese and Korean into a PDF that Chrome will actually draw

`WinAnsiEncoding cannot encode "中"` is the easy error. The hard one comes
after you fix it: the text is in the PDF, you can select it, search it, copy it
— and Chrome's viewer draws **nothing at all**. No error, no warning. The same
file opens correctly in Acrobat, which is how this costs an afternoon instead
of a minute.

This repo is the font pipeline and the pdf-lib helper that get past both.

```bash
pip install fonttools
python tools/prepare_font.py NotoSansTC[wght].ttf --weight 400
```

```js
const doc  = await PDFLib.PDFDocument.create();
const font = await embedCJK(doc, '/fonts/NotoSansTC-Static400.ttf');
doc.addPage().drawText('中文字也畫得出來', { font, size: 24, x: 50, y: 700 });
const bytes = await savePdf(doc);
```

---

## The three things that go wrong

### 1. CFF outlines embed as CIDFontType0, and Chrome won't paint them

An `.otf` has PostScript (CFF) outlines. pdf-lib embeds it as **CIDFontType0**.
The glyphs are there. Chrome's built-in PDF viewer renders none of them, and
tells you nothing — text extraction still works, so every check except *looking
at it* passes.

You need TrueType (`glyf`) outlines, which embed as **CIDFontType2** with a
`FontFile2` stream. Same font family, different build.

`prepare_font.py` refuses a CFF font with that explanation instead of producing
a broken PDF, and `assertTrueType()` in `src/cjk.js` catches it in the browser
by reading the sfnt tag — `OTTO` means CFF.

### 2. A variable font's default instance is often Thin

Embed `NotoSansTC[wght].ttf` as it comes and you get weight 100. Hairline
strokes at body size look like a rendering bug, not a font choice, and you will
go looking in the wrong place.

Pin an instance first — that is what `--weight 400` does:

```python
instancer.instantiateVariableFont(font, {"wght": 400}, updateFontNames=True)
```

### 3. Not subsetting makes every PDF megabytes

This is measured, on Noto Sans TC (20,950 glyphs), writing one line of Chinese:

| | Size |
|---|---|
| The font file on disk | 6,982 KB |
| Embedded, `subset: false` | **4,370 KB** |
| Embedded, `subset: true` | **4.7 KB** |

Roughly 930× smaller, because only the glyphs you actually drew are written.
`embedCJK` passes `subset: true` by default — you have to opt out.

Subsetting needs `@pdf-lib/fontkit` registered; pdf-lib does not bundle it.

---

## Form fields need one extra step

Setting a field's text is not enough. A form field renders from a stored
*appearance stream*, and pdf-lib regenerates those with a default font that
cannot encode CJK — so the value is in the file and invisible on the page.

```js
fillFormCJK(doc, font, { name: '王小明', address: '台北市…' });
```

That sets the fields, calls `updateFieldAppearances(font)` so appearances are
baked with your font, **and** sets `NeedAppearances` so viewers that prefer to
regenerate them do so with the right font. Viewers disagree about which they
honour; doing both costs nothing.

---

## What's here

```
tools/prepare_font.py   variable → pinned static TTF, and a hard stop on CFF
src/cjk.js              embedCJK / fillFormCJK / savePdf — no dependencies of its own
example/index.html      runnable: type CJK, get a PDF
```

`src/cjk.js` is one file with no build step. Copy it in.

## Running the example

```bash
cp your-prepared-font.ttf example/font.ttf
python -m http.server 8000
# open http://127.0.0.1:8000/example/index.html
```

It must be served over HTTP — `fetch` cannot read the font from `file://`.

## Fonts

Noto Sans TC / JP / KR are under the SIL Open Font License and can be shipped
inside your own product. Take the **`.ttf`** build:
Google Fonts' `Noto_Sans_TC.zip`, or the `notofonts` GitHub releases. If the
file you have is `.otf`, `prepare_font.py` will tell you so.

One face covers Traditional Chinese, Japanese kana and kanji together. Simplified
Chinese is partial, and Korean needs its own face.

---

## 繁體中文

`WinAnsiEncoding cannot encode "中"` 是簡單的那個錯。難的在後面:**文字進了 PDF、
選得到也搜得到,但 Chrome 就是一個字都不畫**,而且不報任何錯。同一個檔在 Acrobat 打開是正常的
—— 所以你會往完全錯誤的方向找一下午。

原因是 `.otf` 是 CFF 輪廓,會被嵌成 **CIDFontType0**,Chrome 的內建檢視器不畫它。
要用 TrueType(`glyf`)的版本,嵌出來才是 **CIDFontType2**。

另外兩個坑:**可變字型的預設實例常常是 Thin**(細到像壞掉),要先固定成 wght=400;
以及**沒有子集化,每份 PDF 都會多幾 MB** —— 實測 6,982 KB 的字型,
不子集化嵌進去是 4,370 KB,子集化後是 4.7 KB。

`tools/prepare_font.py` 處理字型,`src/cjk.js` 一個檔、沒有相依,複製進去就能用。

---

MIT
