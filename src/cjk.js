/**
 * Write Chinese, Japanese and Korean text into a PDF with pdf-lib, in the
 * browser, so that Chrome's own viewer actually draws it.
 *
 * pdf-lib's built-in StandardFonts are WinAnsi-only — passing CJK to them
 * throws `WinAnsiEncoding cannot encode "中"`. You must embed a real font,
 * and the font has to be the right *kind*. See tools/prepare_font.py.
 *
 * Usage:
 *   const { PDFDocument, rgb } = PDFLib;
 *   const doc  = await PDFDocument.create();
 *   const font = await embedCJK(doc, '/fonts/NotoSansTC-Static400.ttf');
 *   doc.addPage().drawText('中文字也畫得出來', { font, size: 24, x: 50, y: 700 });
 *   const bytes = await savePdf(doc);
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.assign(root, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Fetch a font and embed it, subsetted.
   *
   * `subset: true` is not an optimisation you can skip. A full CJK face is
   * 5–17 MB; embedded whole, every PDF you produce carries all of it. Subset,
   * a page of Chinese adds a few dozen KB — because only the glyphs you
   * actually drew get written.
   *
   * Requires fontkit to be registered. pdf-lib does not bundle it:
   *   <script src=".../pdf-lib.min.js"></script>
   *   <script src=".../fontkit.umd.min.js"></script>
   */
  async function embedCJK(pdfDoc, fontUrlOrBytes, options) {
    const opts = options || {};

    if (typeof pdfDoc.registerFontkit === 'function') {
      const fk = opts.fontkit || (typeof fontkit !== 'undefined' ? fontkit : null);
      if (!fk) {
        throw new Error(
          'fontkit is required to embed a custom font. Load @pdf-lib/fontkit ' +
          'and either expose it as a global or pass it as options.fontkit.');
      }
      pdfDoc.registerFontkit(fk);
    }

    let bytes = fontUrlOrBytes;
    if (typeof fontUrlOrBytes === 'string') {
      const res = await fetch(fontUrlOrBytes);
      if (!res.ok) throw new Error('font fetch failed: ' + res.status + ' ' + fontUrlOrBytes);
      bytes = await res.arrayBuffer();
    }

    assertTrueType(bytes);

    return pdfDoc.embedFont(bytes, {
      subset: opts.subset !== false,
      // A CJK face has no meaningful "custom name" collisions, but leaving this
      // default keeps the embedded name stable across saves.
      customName: opts.customName
    });
  }

  /**
   * Read the sfnt version and refuse CFF early, with the real reason.
   *
   * A CFF font embeds as CIDFontType0. Chrome's PDF viewer will not paint it —
   * no error, no warning, and the text is still selectable and searchable, so
   * every check except "look at it" passes. Failing here saves the afternoon.
   */
  function assertTrueType(bytes) {
    const view = new DataView(bytes instanceof ArrayBuffer ? bytes : bytes.buffer);
    const tag = view.getUint32(0, false);
    // 0x00010000 = TrueType, 'true' = legacy Mac TrueType, 'ttcf' = collection
    const ok = tag === 0x00010000 || tag === 0x74727565 || tag === 0x74746366;
    if (ok) return;
    if (tag === 0x4f54544f) {   // 'OTTO' = CFF outlines
      throw new Error(
        'This font has CFF (PostScript) outlines. pdf-lib embeds it as ' +
        'CIDFontType0, and Chrome\'s PDF viewer draws nothing — silently. ' +
        'Use the TrueType (.ttf) build; see tools/prepare_font.py.');
    }
    throw new Error('Not a recognisable font file (sfnt tag 0x' + tag.toString(16) + ')');
  }

  /**
   * Fill an AcroForm and make the values visible.
   *
   * Setting a field's text is not enough: a PDF form field renders from a
   * stored appearance stream, and pdf-lib regenerates those with whatever font
   * you hand it — the default of which cannot encode CJK.
   *
   * Two belts here, because viewers disagree about which they honour:
   *   - updateFieldAppearances(font) bakes appearances with your CJK font
   *   - NeedAppearances asks the viewer to regenerate them itself
   */
  function fillFormCJK(pdfDoc, font, values) {
    const form = pdfDoc.getForm();
    for (const name in values) {
      try {
        form.getTextField(name).setText(String(values[name]));
      } catch (e) {
        // Field missing or not a text field — skip rather than abort the
        // whole fill because one name was wrong.
      }
    }
    form.updateFieldAppearances(font);
    setNeedAppearances(pdfDoc);
    return form;
  }

  function setNeedAppearances(pdfDoc) {
    try {
      const { PDFName, PDFBool } = (typeof PDFLib !== 'undefined') ? PDFLib : {};
      if (!PDFName || !PDFBool) return;
      const acro = pdfDoc.catalog.lookup(PDFName.of('AcroForm'));
      if (acro && acro.set) acro.set(PDFName.of('NeedAppearances'), PDFBool.True);
    } catch (e) { /* not fatal — updateFieldAppearances already ran */ }
  }

  /**
   * Save with object streams off.
   *
   * Object streams make a smaller file, but some older viewers and a few
   * server-side parsers choke on them. For a form people will re-open in
   * whatever they happen to have, the compatibility is worth the bytes.
   */
  function savePdf(pdfDoc, options) {
    return pdfDoc.save(Object.assign({ useObjectStreams: false }, options || {}));
  }

  function download(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'output.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { embedCJK, fillFormCJK, savePdf, download, assertTrueType };
});
