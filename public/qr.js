/**
 * Compact zero-dependency QR Code SVG generator (Byte mode, Version 1-6, Error Correction M)
 * Supports URLs up to ~106 UTF-8 bytes cleanly for CleanDrop IL client QR cards.
 */
(function (global) {
  'use strict';

  const EC_M_TABLE = [
    null,
    { total: 26, data: 16, ecPerBlock: 10, blocks: 1 },
    { total: 44, data: 28, ecPerBlock: 16, blocks: 1 },
    { total: 70, data: 44, ecPerBlock: 26, blocks: 1 },
    { total: 100, data: 64, ecPerBlock: 18, blocks: 2 },
    { total: 134, data: 86, ecPerBlock: 24, blocks: 2 },
    { total: 172, data: 108, ecPerBlock: 16, blocks: 4 }
  ];

  const ALIGN_POS = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsComputeEC(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(data.length + ecCount);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 1; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  function encodeBytes(text) {
    const bytes = new TextEncoder().encode(text);
    let version = 1;
    while (version <= 6) {
      const maxChars = EC_M_TABLE[version].data - 2; // 4-bit mode + 8-bit len + 4-bit terminator
      if (bytes.length <= maxChars) break;
      version++;
    }
    if (version > 6) throw new Error('URL too long for compact QR');
    const spec = EC_M_TABLE[version];
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);

    const totalDataBits = spec.data * 8;
    const termLen = Math.min(4, totalDataBits - bits.length);
    for (let i = 0; i < termLen; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (bits.length < totalDataBits) {
      pushBits(padBytes[padIdx % 2], 8);
      padIdx++;
    }

    const dataCodewords = new Uint8Array(spec.data);
    for (let i = 0; i < spec.data; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataCodewords[i] = b;
    }

    const blockSize = Math.floor(spec.data / spec.blocks);
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let b = 0; b < spec.blocks; b++) {
      const slice = dataCodewords.slice(offset, offset + blockSize);
      offset += blockSize;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeEC(slice, spec.ecPerBlock));
    }

    const finalBytes = [];
    for (let i = 0; i < blockSize; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(dataBlocks[b][i]);
    }
    for (let i = 0; i < spec.ecPerBlock; i++) {
      for (let b = 0; b < spec.blocks; b++) finalBytes.push(ecBlocks[b][i]);
    }
    return { version, codewords: finalBytes };
  }

  function buildMatrix(text) {
    const { version, codewords } = encodeBytes(text);
    const size = version * 4 + 17;
    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const fixed = Array.from({ length: size }, () => new Uint8Array(size));

    const setFixed = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mat[r][c] = val ? 1 : 0;
        fixed[r][c] = 1;
      }
    };

    const drawFinder = (top, left) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = top + r;
          const cc = left + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const isDark =
            inBox &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setFixed(rr, cc, isDark ? 1 : 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment patterns
    const pos = ALIGN_POS[version];
    for (const r of pos) {
      for (const c of pos) {
        if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFixed(r + dr, c + dc, dark ? 1 : 0);
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!fixed[6][i]) setFixed(6, i, i % 2 === 0 ? 1 : 0);
      if (!fixed[i][6]) setFixed(i, 6, i % 2 === 0 ? 1 : 0);
    }

    // Dark module & reserve format info
    setFixed(size - 8, 8, 1);
    for (let i = 0; i < 9; i++) {
      if (!fixed[8][i]) setFixed(8, i, 0);
      if (!fixed[i][8]) setFixed(i, 8, 0);
    }
    for (let i = 0; i < 8; i++) {
      if (!fixed[8][size - 1 - i]) setFixed(8, size - 1 - i, 0);
      if (!fixed[size - 1 - i][8]) setFixed(size - 1 - i, 8, 0);
    }

    // Place data bits (mask 0: (r + c) % 2 === 0)
    const allBits = [];
    for (const byte of codewords) {
      for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
    }

    let bitIdx = 0;
    let dir = -1;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < size; step++) {
        const r = dir === -1 ? size - 1 - step : step;
        for (const dc of [0, -1]) {
          const c = col + dc;
          if (!fixed[r][c]) {
            const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
            mat[r][c] = bit ^ ((r + c) % 2 === 0 ? 1 : 0);
          }
        }
      }
      dir = -dir;
    }

    // Format info for EC Level M (00) + Mask 0 (000) -> 5-bit 00000 -> BCH 15-bit: 101010000010010 (0x5412)
    const formatBits = 0x5412;
    const fmt = [];
    for (let i = 14; i >= 0; i--) fmt.push((formatBits >> i) & 1);

    const coords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    const coords2 = [
      [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
      [size - 5, 8], [size - 6, 8], [size - 7, 8],
      [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
      [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];

    for (let i = 0; i < 15; i++) {
      mat[coords1[i][0]][coords1[i][1]] = fmt[i];
      mat[coords2[i][0]][coords2[i][1]] = fmt[i];
    }

    return mat;
  }

  function renderQRCodeSVG(text, sizePx) {
    const px = sizePx || 220;
    const mat = buildMatrix(text);
    const n = mat.length;
    const quiet = 2;
    const total = n + quiet * 2;
    let paths = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c] === 1) {
          paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${total}" height="${total}" fill="#ffffff" rx="2"/><path d="${paths}" fill="#0F766E"/></svg>`;
  }

  global.CleanDropQR = { renderSVG: renderQRCodeSVG };
})(window);
