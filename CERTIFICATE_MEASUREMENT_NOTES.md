# Certificate Reproduction — Technical Notes

## Source file analysis (PyMuPDF structural inspection)

The uploaded PDF (`Gas_Certificate_Ref61386642__138_Sixth_Avenue_.pdf`) was inspected directly, not eyeballed:

```
Page count: 2
Text blocks (real text objects): 0
Embedded fonts: 0
Vector drawing objects (paths/lines/rects): 0
Images: 1 per page — a single flat PNG covering the entire page (4216x3096, RGB, 8bpc)
Producer: iOS Version 26.5.2 Quartz PDFContext
```

**What this means:** the PDF is a screenshot flattened to a picture and saved as a PDF. It contains
no font names, no glyph metrics, no kerning/letter-spacing data, no vector paths for borders, and no
text coordinates — none of that data exists in the file to extract. This isn't a tooling limitation;
it's the nature of the source file. A "measure the embedded font" or "extract the vector logo"
instruction cannot be fulfilled against this specific file because there is nothing of that kind
inside it.

## What was done instead

Rather than reconstructing the design from scratch with CSS (which would always be an approximation,
however carefully measured), the actual embedded image was extracted **losslessly** from the PDF
using `doc.extract_image()` — this is your real, unmodified pixel data, not a re-screenshot or a redraw.

The only editing done to that image: the regions that hold *dynamic* data (customer name, dates,
appliance rows, signatures, etc.) were filled with their own exact background color, sampled from the
image itself using a statistical mode over each region (robust against the text pixels being averaged
in). Every border, label, checkbox, section heading, and static pixel is untouched — it is your file.

`cert-bg-page1.png` / `cert-bg-page2.png` are used as the exact background of each printed page
(297mm × 210mm, no rescaling distortion). Live certificate data is then positioned on top using
absolute-positioned HTML elements, at coordinates measured directly from the same source image
(percentages of page width/height, cross-checked against the exact pixel rectangles used to erase
each region — see `blank()` calls preserved in this note's history / the git-style comments in
`compileAndShowPDFPreview()` in script.js).

## Known, disclosed approximation

The **font** used for the overlaid live text is Arial/Helvetica (a close visual match to the
original), because no font is embedded in the source to match against — there is nothing to extract.
If you have access to the original software (iCertifi/Gas Cert) and it can export a true vector PDF
(with embedded fonts), that file would let this be matched exactly rather than approximated. Everything
else — borders, colors, checkbox styling, section layout, spacing, the logo, the disclaimer text,
labels — is your real source image, unaltered.

## Verification performed

- Confirmed both background images load and render (pixel-sampled the rendered output: header black
  `(0,0,0)`, page background `(255,250,196)`, disclaimer yellow band, grey table header — all match
  the source image's own sampled colors).
- Confirmed no HTML overlay text overflows its erased region or spills onto a border/label.
- Confirmed every erased region has zero leftover dark (text) pixels, and every region *outside* the
  erased areas (headings, static labels) still has its original pixels intact.
- Re-ran the full certificate wizard end-to-end and inspected the generated overlay text for all
  fields (topbar, details boxes, defects, pipework, remedial notes, signatures, appliance table,
  CO alarm sub-blocks) — all present and correctly positioned.
