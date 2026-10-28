/**
 * Generates REAL (not mocked) media fixtures for the live-mode E2E suite into e2e/live/.fixtures/ (gitignored).
 * Needs ffmpeg: set FFMPEG_PATH, or it falls back to the backend's ffmpeg-static binary.
 * Run: node e2e/live/make-fixtures.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".fixtures");
mkdirSync(out, { recursive: true });

const ffmpeg =
  process.env.FFMPEG_PATH ||
  resolve(here, "../../../streamverse-api/node_modules/ffmpeg-static/ffmpeg.exe");
if (!existsSync(ffmpeg)) throw new Error(`ffmpeg not found at ${ffmpeg} — set FFMPEG_PATH`);

const run = (args) => execFileSync(ffmpeg, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

// Images meet the backend's minimum dimensions: POSTER 500x750, EBOOK_FRONT_COVER 400x600, AUDIOBOOK_COVER 500x500.
const still = (name, w, h, text) =>
  run(["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=1:duration=1`, "-frames:v", "1", "-q:v", "3", join(out, name)]);
still("poster.jpg", 600, 900);
still("ebook-cover.jpg", 500, 750);
still("audiobook-cover.jpg", 600, 600);
still("poster-2.jpg", 640, 960); // used to test "replace poster"
still("backdrop.jpg", 1280, 720);
still("thumb.jpg", 320, 180);

// 4-second 854x480 H.264 + AAC MP4 (480p is the smallest rendition the backend will produce; it never upscales)
run(["-f", "lavfi", "-i", "testsrc2=size=854x480:rate=24:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(out, "movie.mp4")]);

// 6-second MP3
run(["-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:a", "libmp3lame", "-q:a", "6", join(out, "audiobook.mp3")]);

// Minimal but valid EPUB 3
const epub = new JSZip();
epub.file("mimetype", "application/epub+zip", { compression: "STORE" });
epub.file(
  "META-INF/container.xml",
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
);
const chapter = (n) =>
  `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${n}</title></head><body><h1>Chapter ${n}</h1>${Array.from({ length: 30 }, (_, i) => `<p>E2E fixture paragraph ${i + 1} of chapter ${n}. The quick brown fox jumps over the lazy dog.</p>`).join("")}</body></html>`;
epub.file(
  "OEBPS/content.opf",
  `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:e2e-fixture-0001</dc:identifier><dc:title>E2E Fixture Book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
);
epub.file("OEBPS/nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li><li><a href="c2.xhtml">Chapter 2</a></li></ol></nav></body></html>`);
epub.file("OEBPS/c1.xhtml", chapter(1));
epub.file("OEBPS/c2.xhtml", chapter(2));
writeFileSync(join(out, "book.epub"), await epub.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" }));

// Minimal valid 3-page PDF, built with correct xref offsets
function makePdf(pages) {
  const objs = [];
  const add = (body) => (objs.push(body), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, i) => {
    const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((b, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
writeFileSync(join(out, "book.pdf"), makePdf(["E2E PDF page one", "E2E PDF page two", "E2E PDF page three"]));

console.log("fixtures written to", out);
