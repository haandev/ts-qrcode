/**
 * This script is based on Kang Seonghoon's qr.js script.
 * I did some maintain. Modernized the code with typescript, let, const, enums.
 * Functions have been moved to object oriented structure. Added guarding
 * keywords to methods and variables. Some transactions have been abstracted.
 * The render methods have been removed from the script.
 *
 * Contrary to the original work, the generate method only returns us a 1-0 matrix.
 * By writing a separate class for rendering, I hope to give the developer
 * flexibility and freedom in matters such as shape, logo, colors and background.
 *
 * Written by Hakan Özoğlu - github.com/haandev <mhozoglu@yandex.com.tr>
 *
 * Still public domain :)
 */
export type QrCodeOptions = { ecclevel?: "L" | "M" | "Q" | "H"; version?: number; mode?: "numeric" | "alphanumeric" | "octet"; mask?: number };

export class QrCode {
  /* Quick overview: QR code composed of 2D array of modules (a rectangular
   * area that conveys one bit of information); some modules are fixed to help
   * the recognition of the code, and remaining data modules are further divided
   * into 8-bit code words which are augumented by Reed-Solomon error correcting
   * codes (ECC). There could be multiple ECCs, in the case the code is so large
   * that it is helpful to split the raw data into several chunks.
   *
   * The number of modules is determined by the code's "version", ranging from 1
   * (21x21) to 40 (177x177). How many ECC bits are used is determined by the
   * ECC level (L/M/Q/H). The number and size (and thus the order of generator
   * polynomial) of ECCs depend to the version and ECC level.
   */
  private mode: QrCode.MODE;
  private ecclevel: QrCode.ERROR_CORRECTION;
  private mask: number;
  private data: any;
  private ver: number;
  private matrix: number[][];
  private reserved: any[];

  // validation regexps
  static REGEXP = {
    NUMERIC: /^\d*$/,
    ALPHANUMERIC: /^[A-Za-z0-9 $%*+\-./:]*$/,
    ALPHANUMERIC_OUT: /^[A-Z0-9 $%*+\-./:]*$/,
  };

  // GF(2^8)-to-integer mapping with a reducing polynomial x^8+x^4+x^3+x^2+1
  // inconstiant: GF256_MAP[GF256_INVMAP[i]] == i for all i in [1,256)
  static GF256 = (() => {
    const MAP: number[] = [],
      INVMAP: number[] = [-1];
    for (let i = 0, v = 1; i < 255; ++i) {
      MAP.push(v);
      INVMAP[v] = i;
      v = (v * 2) ^ (v >= 128 ? 0x11d : 0);
    }

    // generator polynomials up to degree 30
    // (should match with polynomials in JIS X 0510:2004 Appendix A)
    //
    // generator polynomial of degree K is product of (x-\alpha^0), (x-\alpha^1),
    // ..., (x-\alpha^(K-1)). by convention, we omit the K-th coefficient (always 1)
    // from the result; also other coefficients are written in terms of the exponent
    // to \alpha to avoid the redundant calculation. (see also calculateecc below.)

    const GENPOLY = [[]];
    for (let i = 0; i < 30; ++i) {
      const prevpoly = GENPOLY[i],
        poly = [];
      for (let j = 0; j <= i; ++j) {
        const a = j < i ? MAP[prevpoly[j]] : 0;
        const b = MAP[(i + (prevpoly[j - 1] || 0)) % 255];
        poly.push(INVMAP[a ^ b]);
      }
      GENPOLY.push(poly);
    }
    return { MAP, INVMAP, GENPOLY };
  })();

  // per-version information (cf. JIS X 0510:2004 pp. 30--36, 71)
  //
  // [0]: the degree of generator polynomial by ECC levels
  // [1]: # of code blocks by ECC levels
  // [2]: left-top positions of alignment patterns
  //
  // the number in this table (in particular, [0]) does not exactly match with
  // the numbers in the specficiation. see augumenteccs below for the reason.

  static VERSIONS = [
    null,
    [[10, 7, 17, 13], [1, 1, 1, 1], []],
    [
      [16, 10, 28, 22],
      [1, 1, 1, 1],
      [4, 16],
    ],
    [
      [26, 15, 22, 18],
      [1, 1, 2, 2],
      [4, 20],
    ],
    [
      [18, 20, 16, 26],
      [2, 1, 4, 2],
      [4, 24],
    ],
    [
      [24, 26, 22, 18],
      [2, 1, 4, 4],
      [4, 28],
    ],
    [
      [16, 18, 28, 24],
      [4, 2, 4, 4],
      [4, 32],
    ],
    [
      [18, 20, 26, 18],
      [4, 2, 5, 6],
      [4, 20, 36],
    ],
    [
      [22, 24, 26, 22],
      [4, 2, 6, 6],
      [4, 22, 40],
    ],
    [
      [22, 30, 24, 20],
      [5, 2, 8, 8],
      [4, 24, 44],
    ],
    [
      [26, 18, 28, 24],
      [5, 4, 8, 8],
      [4, 26, 48],
    ],
    [
      [30, 20, 24, 28],
      [5, 4, 11, 8],
      [4, 28, 52],
    ],
    [
      [22, 24, 28, 26],
      [8, 4, 11, 10],
      [4, 30, 56],
    ],
    [
      [22, 26, 22, 24],
      [9, 4, 16, 12],
      [4, 32, 60],
    ],
    [
      [24, 30, 24, 20],
      [9, 4, 16, 16],
      [4, 24, 44, 64],
    ],
    [
      [24, 22, 24, 30],
      [10, 6, 18, 12],
      [4, 24, 46, 68],
    ],
    [
      [28, 24, 30, 24],
      [10, 6, 16, 17],
      [4, 24, 48, 72],
    ],
    [
      [28, 28, 28, 28],
      [11, 6, 19, 16],
      [4, 28, 52, 76],
    ],
    [
      [26, 30, 28, 28],
      [13, 6, 21, 18],
      [4, 28, 54, 80],
    ],
    [
      [26, 28, 26, 26],
      [14, 7, 25, 21],
      [4, 28, 56, 84],
    ],
    [
      [26, 28, 28, 30],
      [16, 8, 25, 20],
      [4, 32, 60, 88],
    ],
    [
      [26, 28, 30, 28],
      [17, 8, 25, 23],
      [4, 26, 48, 70, 92],
    ],
    [
      [28, 28, 24, 30],
      [17, 9, 34, 23],
      [4, 24, 48, 72, 96],
    ],
    [
      [28, 30, 30, 30],
      [18, 9, 30, 25],
      [4, 28, 52, 76, 100],
    ],
    [
      [28, 30, 30, 30],
      [20, 10, 32, 27],
      [4, 26, 52, 78, 104],
    ],
    [
      [28, 26, 30, 30],
      [21, 12, 35, 29],
      [4, 30, 56, 82, 108],
    ],
    [
      [28, 28, 30, 28],
      [23, 12, 37, 34],
      [4, 28, 56, 84, 112],
    ],
    [
      [28, 30, 30, 30],
      [25, 12, 40, 34],
      [4, 32, 60, 88, 116],
    ],
    [
      [28, 30, 30, 30],
      [26, 13, 42, 35],
      [4, 24, 48, 72, 96, 120],
    ],
    [
      [28, 30, 30, 30],
      [28, 14, 45, 38],
      [4, 28, 52, 76, 100, 124],
    ],
    [
      [28, 30, 30, 30],
      [29, 15, 48, 40],
      [4, 24, 50, 76, 102, 128],
    ],
    [
      [28, 30, 30, 30],
      [31, 16, 51, 43],
      [4, 28, 54, 80, 106, 132],
    ],
    [
      [28, 30, 30, 30],
      [33, 17, 54, 45],
      [4, 32, 58, 84, 110, 136],
    ],
    [
      [28, 30, 30, 30],
      [35, 18, 57, 48],
      [4, 28, 56, 84, 112, 140],
    ],
    [
      [28, 30, 30, 30],
      [37, 19, 60, 51],
      [4, 32, 60, 88, 116, 144],
    ],
    [
      [28, 30, 30, 30],
      [38, 19, 63, 53],
      [4, 28, 52, 76, 100, 124, 148],
    ],
    [
      [28, 30, 30, 30],
      [40, 20, 66, 56],
      [4, 22, 48, 74, 100, 126, 152],
    ],
    [
      [28, 30, 30, 30],
      [43, 21, 70, 59],
      [4, 26, 52, 78, 104, 130, 156],
    ],
    [
      [28, 30, 30, 30],
      [45, 22, 74, 62],
      [4, 30, 56, 82, 108, 134, 160],
    ],
    [
      [28, 30, 30, 30],
      [47, 24, 77, 65],
      [4, 24, 52, 80, 108, 136, 164],
    ],
    [
      [28, 30, 30, 30],
      [49, 25, 81, 68],
      [4, 28, 56, 84, 112, 140, 168],
    ],
  ];

  // alphanumeric character mapping (cf. Table 5 in JIS X 0510:2004 p. 19)
  static ALPHANUMERIC_MAP = (() => {
    const ALPHANUMERIC_MAP = {};
    for (let i = 0; i < 45; ++i) {
      ALPHANUMERIC_MAP["0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:".charAt(i)] = i;
    }
    return ALPHANUMERIC_MAP;
  })();

  // mask functions in terms of row # and column #
  // (cf. Table 20 in JIS X 0510:2004 p. 42)
  static MASKFUNCS: Array<(i: number, j: number) => boolean> = [
    (i, j) => (i + j) % 2 === 0,
    (i, j) => i % 2 === 0,
    (i, j) => j % 3 === 0,
    (i, j) => (i + j) % 3 === 0,
    (i, j) => (((i / 2) | 0) + ((j / 3) | 0)) % 2 === 0,
    (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
    (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
  ];

  constructor(data: any, options: QrCodeOptions = {}) {
    const MODES = { numeric: QrCode.MODE.NUMERIC, alphanumeric: QrCode.MODE.ALPHANUMERIC, octet: QrCode.MODE.OCTET };
    const ECCLEVELS = { L: QrCode.ERROR_CORRECTION.L, M: QrCode.ERROR_CORRECTION.M, Q: QrCode.ERROR_CORRECTION.Q, H: QrCode.ERROR_CORRECTION.H };

    this.data = data;
    this.ecclevel = ECCLEVELS[options.ecclevel?.toUpperCase() || "L"];
    this.ver = options.version || -1;
    this.mode = options.mode ? MODES[options.mode?.toLowerCase()] : -1;
    console.log("mode is", this.mode);
    this.mask = "mask" in options ? options.mask : -1;
    if (this.mode < 0) {
      if (typeof data === "string") {
        if (data.match(QrCode.REGEXP.NUMERIC)) {
          this.mode = QrCode.MODE.NUMERIC;
        } else if (data.match(QrCode.REGEXP.ALPHANUMERIC_OUT)) {
          this.mode = QrCode.MODE.ALPHANUMERIC;
        }
      }
      this.mode = this.mode || QrCode.MODE.OCTET;
    } else if (![QrCode.MODE.NUMERIC, QrCode.MODE.ALPHANUMERIC, QrCode.MODE.OCTET].includes(this.mode)) {
      throw "invalid or unsupported mode";
    }
    this.validateData();
    if (data === null) throw "invalid data format";

    if (this.ecclevel < 0 || this.ecclevel > 3) throw "invalid ECC level";

    if (this.ver < 0) {
      for (this.ver = 1; this.ver <= 40; ++this.ver) {
        if (data.length <= this.getMaxDataLen()) break;
      }
      if (this.ver > 40) throw "too large data";
    } else if (this.ver < 1 || this.ver > 40) {
      throw "invalid version";
    }

    if (this.mask != -1 && (this.mask < 0 || this.mask > 8)) throw "invalid mask";
  }

  // returns the fully encoded QR code matrix which contains given data.
  // it also chooses the best mask automatically when mask is -1.
  public generate() {
    const v = QrCode.VERSIONS[this.ver];
    let buf = this.encode(this.nDataBits() >> 3);
    buf = QrCode.augumentEccs(buf, v[1][this.ecclevel], QrCode.GF256.GENPOLY[v[0][this.ecclevel]]);

    this.makeBaseMatrix();
    this.putData(buf);

    this.findBestMask();

    this.maskData(this.mask);
    this.putFormatInfo(this.mask);
    return this.matrix;
  }

  // puts the format information.
  private putFormatInfo(mask: number) {
    const n = this.matrix.length;
    const code = QrCode.augumentbch((this.ecclevel << 3) | mask, 5, 0x537, 10) ^ 0x5412;
    for (let i = 0; i < 15; ++i) {
      const r = [0, 1, 2, 3, 4, 5, 7, 8, n - 7, n - 6, n - 5, n - 4, n - 3, n - 2, n - 1][i];
      const c = [n - 1, n - 2, n - 3, n - 4, n - 5, n - 6, n - 7, n - 8, 7, 5, 4, 3, 2, 1, 0][i];
      this.matrix[r][8] = this.matrix[8][c] = (code >> i) & 1;
      // we don't have to mark those bits reserved; always done
      // in makeBaseMatrix above.
    }
  }

  // XOR-masks the data portion of the matrix. repeating the call with the same
  // arguments will revert the prior call (convenient in the matrix evaluation).
  private maskData(mask: number) {
    const n = this.matrix.length;
    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) {
        if (!this.reserved[i][j]) this.matrix[i][j] ^= Number(QrCode.MASKFUNCS[mask](i, j));
      }
    }
  }

  private findBestMask() {
    if (this.mask < 0) {
      // find the best mask
      this.maskData(0);
      this.putFormatInfo(0);
      let bestmask = 0;
      let bestscore = this.evaluateMatrix();
      this.maskData(0);
      for (let mask = 1; mask < 8; ++mask) {
        this.maskData(mask);
        this.putFormatInfo(mask);
        const score = this.evaluateMatrix();
        if (bestscore > score) {
          bestscore = score;
          bestmask = mask;
        }
        this.maskData(mask);
      }
      this.mask = bestmask;
    }
  }

  // fills the data portion (i.e. unmarked in reserved) of the matrix with given
  // code words. the size of code words should be no more than available bits,
  // and remaining bits are padded to 0 (cf. JIS X 0510:2004 sec 8.7.3).
  private putData(buf: number[]) {
    const n = this.matrix.length;
    let k = 0,
      dir = -1;
    for (let i = n - 1; i >= 0; i -= 2) {
      if (i == 6) --i; // skip the entire timing pattern column
      let jj = dir < 0 ? n - 1 : 0;
      for (let j = 0; j < n; ++j) {
        for (let ii = i; ii > i - 2; --ii) {
          if (!this.reserved[jj][ii]) {
            // may overflow, but (undefined >> x)
            // is 0 so it will auto-pad to zero.
            this.matrix[jj][ii] = (buf[k >> 3] >> (~k & 7)) & 1;
            ++k;
          }
        }
        jj += dir;
      }
      dir = -dir;
    }
  }

  // evaluates the resulting matrix and returns the score (lower is better).
  // (cf. JIS X 0510:2004 sec 8.8.2)
  //
  // the evaluation procedure tries to avoid the problematic patterns naturally
  // occuring from the original matrix. for example, it penaltizes the patterns
  // which just look like the finder pattern which will confuse the decoder.
  // we choose the mask which results in the lowest score among 8 possible ones.
  //
  // note: zxing seems to use the same procedure and in many cases its choice
  // agrees to ours, but sometimes it does not. practically it doesn't matter.
  private evaluateMatrix() {
    const PENALTY_CONSECUTIVE = 3;
    const PENALTY_TWOBYTWO = 3;
    const PENALTY_FINDERLIKE = 40;
    const PENALTY_DENSITY = 10;

    const evaluategroup = function (groups) {
      let score = 0;
      for (let i = 0; i < groups.length; ++i) {
        if (groups[i] >= 5) score += PENALTY_CONSECUTIVE + (groups[i] - 5);
      }
      for (let i = 5; i < groups.length; i += 2) {
        const p = groups[i];
        if (groups[i - 1] == p && groups[i - 2] == 3 * p && groups[i - 3] == p && groups[i - 4] == p && (groups[i - 5] >= 4 * p || groups[i + 1] >= 4 * p)) {
          // this part differs from zxing...
          score += PENALTY_FINDERLIKE;
        }
      }
      return score;
    };

    const n = this.matrix.length;
    let score = 0,
      nblacks = 0;
    for (let i = 0; i < n; ++i) {
      const row = this.matrix[i];
      let groups;

      // evaluate the current row
      groups = [0]; // the first empty group of white
      for (let j = 0; j < n;) {
        let k;
        for (let k = 0; j < n && row[j]; ++k) ++j;
        groups.push(k);
        for (k = 0; j < n && !row[j]; ++k) ++j;
        groups.push(k);
      }
      score += evaluategroup(groups);

      // evaluate the current column
      groups = [0];
      for (let j = 0; j < n;) {
        let k;
        for (k = 0; j < n && this.matrix[j][i]; ++k) ++j;
        groups.push(k);
        for (k = 0; j < n && !this.matrix[j][i]; ++k) ++j;
        groups.push(k);
      }
      score += evaluategroup(groups);

      // check the 2x2 box and calculate the density
      const nextrow = this.matrix[i + 1] || [];
      nblacks += row[0];
      for (let j = 1; j < n; ++j) {
        const p = row[j];
        nblacks += p;
        // at least comparison with next row should be strict...
        if (row[j - 1] == p && nextrow[j] === p && nextrow[j - 1] === p) {
          score += PENALTY_TWOBYTWO;
        }
      }
    }

    score += PENALTY_DENSITY * ((Math.abs(nblacks / n / n - 0.5) / 0.05) | 0);
    return score;
  }

  // returns true when the version information has to be embeded.
  private needsVerInfo() {
    return this.ver > 6;
  }

  // returns the size of entire QR code for given version.
  private getSizeByVer() {
    return 4 * this.ver + 17;
  }

  // returns the number of bits available for code words in this version.
  private nFullBits() {
    /*
     * |<--------------- n --------------->|
     * |        |<----- n-17 ---->|        |
     * +-------+                ///+-------+ ----
     * |       |                ///|       |    ^
     * |  9x9  |       @@@@@    ///|  9x8  |    |
     * |       | # # # @5x5@ # # # |       |    |
     * +-------+       @@@@@       +-------+    |
     *       #                               ---|
     *                                        ^ |
     *       #                                |
     *     @@@@@       @@@@@       @@@@@      | n
     *     @5x5@       @5x5@       @5x5@   n-17
     *     @@@@@       @@@@@       @@@@@      | |
     *       #                                | |
     * //////                                 v |
     * //////#                               ---|
     * +-------+       @@@@@       @@@@@        |
     * |       |       @5x5@       @5x5@        |
     * |  8x9  |       @@@@@       @@@@@        |
     * |       |                                v
     * +-------+                             ----
     *
     * when the entire code has n^2 modules and there are m^2-3 alignment
     * patterns, we have:
     * - 225 (= 9x9 + 9x8 + 8x9) modules for finder patterns and
     *   format information;
     * - 2n-34 (= 2(n-17)) modules for timing patterns;
     * - 36 (= 3x6 + 6x3) modules for version information, if any;
     * - 25m^2-75 (= (m^2-3)(5x5)) modules for alignment patterns
     *   if any, but 10m-20 (= 2(m-2)x5) of them overlaps with
     *   timing patterns.
     */
    const v = QrCode.VERSIONS[this.ver];
    let nbits = 16 * this.ver * this.ver + 128 * this.ver + 64; // finder, timing and format info.
    if (this.needsVerInfo()) nbits -= 36; // version information
    if (v[2].length) {
      // alignment patterns
      nbits -= 25 * v[2].length * v[2].length - 10 * v[2].length - 55;
    }
    return nbits;
  }

  // returns the number of bits available for data portions (i.e. excludes ECC
  // bits but includes mode and length bits) in this version and ECC level.
  private nDataBits() {
    return (this.nFullBits() & ~7) - 8 * QrCode.VERSIONS[this.ver][0][this.ecclevel] * QrCode.VERSIONS[this.ver][1][this.ecclevel];
  }

  // returns the number of bits required for the length of data.
  // (cf. Table 3 in JIS X 0510:2004 p. 16)
  private nDataLenBits(): number {
    return {
      [QrCode.MODE.NUMERIC]: this.ver < 10 ? 10 : this.ver < 27 ? 12 : 14,
      [QrCode.MODE.ALPHANUMERIC]: this.ver < 10 ? 9 : this.ver < 27 ? 11 : 13,
      [QrCode.MODE.OCTET]: this.ver < 10 ? 8 : 16,
      [QrCode.MODE.KANJI]: this.ver < 10 ? 8 : this.ver < 27 ? 10 : 12,
    }[this.mode];
  }

  // returns the maximum length of data possible in given configuration.
  private getMaxDataLen(): number {
    const nbits = this.nDataBits() - 4 - this.nDataLenBits(); // 4 for mode bits
    return {
      [QrCode.MODE.NUMERIC]: ((nbits / 10) | 0) * 3 + (nbits % 10 < 4 ? 0 : nbits % 10 < 7 ? 1 : 2),
      [QrCode.MODE.ALPHANUMERIC]: ((nbits / 11) | 0) * 2 + (nbits % 11 < 6 ? 0 : 1),
      [QrCode.MODE.OCTET]: (nbits / 8) | 0,
      [QrCode.MODE.KANJI]: (nbits / 13) | 0,
    }[this.mode];
  }

  // checks if the given data can be encoded in given mode, and returns
  // the converted data for the further processing if possible. otherwise
  // returns null.
  //
  // this function does not check the length of data; it is a duty of
  // encode function below (as it depends on the version and ECC level too).
  private validateData() {
    return (
      {
        [QrCode.MODE.NUMERIC]: (() => (!this.data.match(QrCode.REGEXP.NUMERIC) ? null : this.data))(),
        [QrCode.MODE.ALPHANUMERIC]: (() => (!this.data.match(QrCode.REGEXP.ALPHANUMERIC) ? null : this.data.toUpperCase))(),
        [QrCode.MODE.OCTET]: (() => {
          if (typeof this.data === "string") {
            // encode as utf-8 string
            const newdata = [];
            for (let i = 0; i < this.data.length; ++i) {
              const ch = this.data.charCodeAt(i);
              if (ch < 0x80) {
                newdata.push(ch);
              } else if (ch < 0x800) {
                newdata.push(0xc0 | (ch >> 6), 0x80 | (ch & 0x3f));
              } else if (ch < 0x10000) {
                newdata.push(0xe0 | (ch >> 12), 0x80 | ((ch >> 6) & 0x3f), 0x80 | (ch & 0x3f));
              } else {
                newdata.push(0xf0 | (ch >> 18), 0x80 | ((ch >> 12) & 0x3f), 0x80 | ((ch >> 6) & 0x3f), 0x80 | (ch & 0x3f));
              }
            }
            return newdata;
          }
        })(),
      }[this.mode] || this.data
    );
  }

  // returns the code words (sans ECC bits) for given data and configurations.
  // requires data to be preprocessed by validatedata. no length check is
  // performed, and everything has to be checked before calling this function.
  private encode(maxbuflen) {
    const buf = [];
    let bits = 0,
      remaining = 8;

    // this function is intentionally no-op when n=0.
    const pack = function (x, n) {
      if (n >= remaining) {
        buf.push(bits | (x >> (n -= remaining)));
        while (n >= 8) buf.push((x >> (n -= 8)) & 255);
        bits = 0;
        remaining = 8;
      }
      if (n > 0) bits |= (x & ((1 << n) - 1)) << (remaining -= n);
    };

    const nlenbits = this.nDataLenBits();
    pack(this.mode, 4);
    pack(this.data.length, nlenbits);
    const _packer = {
      [QrCode.MODE.NUMERIC]: () => {
        let i: number;
        for (i = 2; i < this.data.length; i += 3) {
          pack(parseInt(this.data.substring(i - 2, i + 1), 10), 10);
        }
        pack(parseInt(this.data.substring(i - 2), 10), [0, 4, 7][this.data.length % 3]);
      },
      [QrCode.MODE.ALPHANUMERIC]: () => {
        let i: number;
        for (i = 1; i < this.data.length; i += 2) {
          pack(QrCode.ALPHANUMERIC_MAP[this.data.charAt(i - 1)] * 45 + QrCode.ALPHANUMERIC_MAP[this.data.charAt(i)], 11);
        }
        if (this.data.length % 2 == 1) {
          pack(QrCode.ALPHANUMERIC_MAP[this.data.charAt(i - 1)], 6);
        }
      },
      [QrCode.MODE.OCTET]: () => {
        let i: number;
        for (i = 0; i < this.data.length; ++i) {
          pack(this.data[i], 8);
        }
      },
    }[this.mode]();
    pack(QrCode.MODE.TERMINATOR, 4);
    if (remaining < 8) buf.push(bits);
    while (buf.length + 1 < maxbuflen) buf.push(0xec, 0x11);
    if (buf.length < maxbuflen) buf.push(0xec);
    return buf;
  }

  // calculates ECC code words for given code words and generator polynomial.
  //
  // this is quite similar to CRC calculation as both Reed-Solomon and CRC use
  // the certain kind of cyclic codes, which is effectively the division of
  // zero-augumented polynomial by the generator polynomial. the only difference
  // is that Reed-Solomon uses GF(2^8), instead of CRC's GF(2), and Reed-Solomon
  // uses the different generator polynomial than CRC's.
  static calculateEcc(poly: any[], genpoly: any[]) {
    const modulus = poly.slice();

    modulus.push(new Array(genpoly.length).fill(0));
    for (let i = 0; i < poly.length;) {
      const quotient = QrCode.GF256.INVMAP[modulus[i++]];
      if (quotient >= 0) {
        for (let j = 0; j < genpoly.length; ++j) {
          modulus[i + j] ^= QrCode.GF256.MAP[(quotient + genpoly[j]) % 255];
        }
      }
    }
    return modulus.slice(poly.length);
  }

  // auguments ECC code words to given code words. the resulting words are
  // ready to be encoded in the matrix.
  //
  // the much of actual augumenting procedure follows JIS X 0510:2004 sec 8.7.
  // the code is simplified using the fact that the size of each code & ECC
  // blocks is almost same; for example, when we have 4 blocks and 46 data words
  // the number of code words in those blocks are 11, 11, 12, 12 respectively.
  static augumentEccs(poly: any[], nblocks: number, genpoly: any[]) {
    const subsizes = [];
    const subsize = (poly.length / nblocks) | 0;
    let subsize0 = 0;
    const pivot = nblocks - (poly.length % nblocks);
    for (let i = 0; i < pivot; ++i) {
      subsizes.push(subsize0);
      subsize0 += subsize;
    }
    for (let i = pivot; i < nblocks; ++i) {
      subsizes.push(subsize0);
      subsize0 += subsize + 1;
    }
    subsizes.push(subsize0);

    const eccs = [];
    for (let i = 0; i < nblocks; ++i) {
      eccs.push(QrCode.calculateEcc(poly.slice(subsizes[i], subsizes[i + 1]), genpoly));
    }

    const result = [];
    const nitemsperblock = (poly.length / nblocks) | 0;
    for (let i = 0; i < nitemsperblock; ++i) {
      for (let j = 0; j < nblocks; ++j) {
        result.push(poly[subsizes[j] + i]);
      }
    }
    for (let j = pivot; j < nblocks; ++j) {
      result.push(poly[subsizes[j + 1] - 1]);
    }
    for (let i = 0; i < genpoly.length; ++i) {
      for (let j = 0; j < nblocks; ++j) {
        result.push(eccs[j][i]);
      }
    }
    return result;
  }

  // auguments BCH(p+q,q) code to the polynomial over GF(2), given the proper
  // genpoly. the both input and output are in binary numbers, and unlike
  // calculateecc genpoly should include the 1 bit for the highest degree.
  //
  // actual polynomials used for this procedure are as follows:
  // - p=10, q=5, genpoly=x^10+x^8+x^5+x^4+x^2+x+1 (JIS X 0510:2004 Appendix C)
  // - p=18, q=6, genpoly=x^12+x^11+x^10+x^9+x^8+x^5+x^2+1 (ibid. Appendix D)
  static augumentbch = function (poly, p, genpoly, q) {
    let modulus = poly << q;
    for (let i = p - 1; i >= 0; --i) {
      if ((modulus >> (q + i)) & 1) modulus ^= genpoly << i;
    }
    return (poly << q) | modulus;
  };

  // creates the base matrix for given version. it returns two matrices, one of
  // them is the actual one and the another represents the "reserved" portion
  // (e.g. finder and timing patterns) of the matrix.
  //
  // some entries in the matrix may be undefined, rather than 0 or 1. this is
  // intentional (no initialization needed!), and putdata below will fill
  // the remaining ones.
  private makeBaseMatrix() {
    const v = QrCode.VERSIONS[this.ver],
      n = this.getSizeByVer();
    const matrix = [],
      reserved = [];
    for (let i = 0; i < n; ++i) {
      matrix.push([]);
      reserved.push([]);
    }

    const blit = function (y, x, h, w, bits) {
      for (let i = 0; i < h; ++i) {
        for (let j = 0; j < w; ++j) {
          matrix[y + i][x + j] = (bits[i] >> j) & 1;
          reserved[y + i][x + j] = 1;
        }
      }
    };

    // finder patterns and a part of timing patterns
    // will also mark the format information area (not yet written) as reserved.
    blit(0, 0, 9, 9, [0x7f, 0x41, 0x5d, 0x5d, 0x5d, 0x41, 0x17f, 0x00, 0x40]);
    blit(n - 8, 0, 8, 9, [0x100, 0x7f, 0x41, 0x5d, 0x5d, 0x5d, 0x41, 0x7f]);
    blit(0, n - 8, 9, 8, [0xfe, 0x82, 0xba, 0xba, 0xba, 0x82, 0xfe, 0x00, 0x00]);

    // the rest of timing patterns
    for (let i = 9; i < n - 8; ++i) {
      matrix[6][i] = matrix[i][6] = ~i & 1;
      reserved[6][i] = reserved[i][6] = 1;
    }

    // alignment patterns
    const aligns = v[2],
      m = aligns.length;
    for (let i = 0; i < m; ++i) {
      const minj = i == 0 || i == m - 1 ? 1 : 0,
        maxj = i == 0 ? m - 1 : m;
      for (let j = minj; j < maxj; ++j) {
        blit(aligns[i], aligns[j], 5, 5, [0x1f, 0x11, 0x15, 0x11, 0x1f]);
      }
    }

    // version information
    if (this.needsVerInfo()) {
      const code = QrCode.augumentbch(this.ver, 6, 0x1f25, 12);
      let k = 0;
      for (let i = 0; i < 6; ++i) {
        for (let j = 0; j < 3; ++j) {
          matrix[i][n - 11 + j] = matrix[n - 11 + j][i] = (code >> k++) & 1;
          reserved[i][n - 11 + j] = reserved[n - 11 + j][i] = 1;
        }
      }
    }
    this.matrix = matrix;
    this.reserved = reserved;
  }
}
export namespace QrCode {
  // mode constants (cf. Table 2 in JIS X 0510:2004 p. 16)
  export enum MODE {
    TERMINATOR = 0,
    NUMERIC = 1,
    ALPHANUMERIC = 2,
    OCTET = 4,
    KANJI = 8,
  }

  // ECC levels (cf. Table 22 in JIS X 0510:2004 p. 45)
  export enum ERROR_CORRECTION {
    L = 1,
    M = 0,
    Q = 3,
    H = 2,
  }
}
