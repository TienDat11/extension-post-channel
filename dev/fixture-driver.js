(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed['fixture-driver']) return;

  /*
   * dev/fixture-driver.js — Huong dan su dung dev/fixture.html
   * Khong can Puppeteer, khong co dependency ngoai ngoai. File nay chi luu
   * tai lieu va xuat theo cung hinh dang module IBFE cac file con lai.
   *
   * Buoc 1: Tai extension vao Chrome
   *   - Mo chrome://extensions, bat "Developer mode", bam "Load unpacked",
   *     chon thu muc D:/extension.
   * Buoc 2: Mo fixture.html
   *   - Mo chrome-extension://<extension-id>/dev/fixture.html
   *   Hoac mo truc tiep file D:/extension/dev/fixture.html trong Chrome (cac
   *     duong dan script ../src/content/... duoc giai quyet dung so voi vi tri
   *     cua file).
   * Buoc 3: Chay adapter
   *   - Nhan nut co [aria-label="Viết gì đó"] de mo dialog composer (an luc
   *     khoi tao).
   *   - Nhan nut "Chay": trang goi window.FBQ["adapter-group"].prepare(
   *     mauText, []) va in ket qua vao div#result.
   *   - Ket qua mong muon: co thong tin chen van ban (paragraphs/ composerText),
   *     khong chua ma loi (draft_present, insert_rejected, ...).
   * Buoc 4: Kiem tra trinh huong draft co san
   *   - Nhap chu vao o soan thao (div contenteditable), tai lai trang, nhan
   *     "Chay" lai -> ket qua phai bao ma draft_present.
   */
  var instructions = {
    file: 'dev/fixture.html',
    steps: [
      'Mo chrome://extensions -> Developer mode -> Load unpacked -> chon D:/extension',
      'Mo chrome-extension://<extension-id>/dev/fixture.html (hoac mo file dev/fixture.html trong Chrome)',
      'Nhan nut co [aria-label="Viết gì đó"] de mo dialog composer',
      'Nhan nut "Chay" -> goi window.FBQ["adapter-group"].prepare(mauText, []) -> ket qua o div#result',
      'Kiem tra: ket qua khong chua ma loi; de sinh draft_present, nhap chu vao editor, tai lai, nhan "Chay" lai'
    ],
    noPuppeteer: true,
    noExternalDeps: true
  };

  root['fixture-driver'] = { version: 1, instructions: instructions };
  root.installed['fixture-driver'] = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ['fixture-driver'];
}
