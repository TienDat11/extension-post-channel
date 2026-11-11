(function () {
  var root = globalThis.FBQ = globalThis.FBQ || { installed: {} };
  if (root.installed.spintax) return;
  if (!root.hash) return;

  function SpintaxError(pos, msg) {
    this.pos = pos;
    this.msg = msg;
    this.message = "Spintax error at position " + pos + ": " + msg;
  }

  function isEscapable(ch) {
    return ch === '{' || ch === '}' || ch === '|' || ch === '\\';
  }

  function parse(text) {
    var nodes = [];
    var i = 0;

    function readUntil(stopChars) {
      var out = [];
      var buf = "";
      while (i < text.length) {
        var ch = text.charAt(i);
        if (ch === '\\' && i + 1 < text.length && isEscapable(text.charAt(i + 1))) {
          buf += text.charAt(i + 1);
          i += 2;
          continue;
        }
        if (stopChars.indexOf(ch) !== -1) {
          break;
        }
        if (ch === '{') {
          if (buf) {
            out.push({ t: 'text', v: buf });
            buf = "";
          }
          i += 1;
          out.push(readBranch());
          continue;
        }
        buf += ch;
        i += 1;
      }
      if (buf) {
        out.push({ t: 'text', v: buf });
      }
      return out;
    }

    function readBranch() {
      var children = [];
      var current = [];
      var buf = "";
      while (i < text.length) {
        var ch = text.charAt(i);
        if (ch === '\\' && i + 1 < text.length && isEscapable(text.charAt(i + 1))) {
          buf += text.charAt(i + 1);
          i += 2;
          continue;
        }
        if (ch === '{') {
          if (buf) {
            current.push({ t: 'text', v: buf });
            buf = "";
          }
          i += 1;
          current.push(readBranch());
          continue;
        }
        if (ch === '|') {
          if (buf) {
            current.push({ t: 'text', v: buf });
            buf = "";
          }
          i += 1;
          children.push(current);
          current = [];
          continue;
        }
        if (ch === '}') {
          if (buf) {
            current.push({ t: 'text', v: buf });
            buf = "";
          }
          i += 1;
          children.push(current);
          return { t: 'branch', children: children };
        }
        buf += ch;
        i += 1;
      }
      throw new SpintaxError(i, "unclosed '{'");
    }

    var buf = "";
    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch === '\\' && i + 1 < text.length && isEscapable(text.charAt(i + 1))) {
        buf += text.charAt(i + 1);
        i += 2;
        continue;
      }
      if (ch === '{') {
        if (buf) {
          nodes.push({ t: 'text', v: buf });
          buf = "";
        }
        i += 1;
        nodes.push(readBranch());
        continue;
      }
      if (ch === '}') {
        throw new SpintaxError(i, "unmatched '}'");
      }
      buf += ch;
      i += 1;
    }
    if (buf) {
      nodes.push({ t: 'text', v: buf });
    }
    return nodes;
  }

  function size(ast) {
    var total = 1;
    var k;
    for (k = 0; k < ast.length; k++) {
      var node = ast[k];
      if (node.t === 'branch') {
        var sum = 0;
        var c;
        for (c = 0; c < node.children.length; c++) {
          sum += size(node.children[c]);
        }
        total *= sum;
      }
    }
    return total;
  }

  function render(ast, seed) {
    var rng = root.hash.mulberry32(seed);
    var out = "";
    var k;
    for (k = 0; k < ast.length; k++) {
      var node = ast[k];
      if (node.t === 'branch') {
        var chosen = Math.floor(rng() * node.children.length);
        out += render(node.children[chosen], seed);
      } else {
        out += node.v;
      }
    }
    return out;
  }

  function validate(text) {
    try {
      parse(text);
      return { ok: true };
    } catch (e) {
      return { ok: false, pos: e.pos, msg: e.msg };
    }
  }

  root.spintax = { parse: parse, validate: validate, render: render, size: size };
  root.installed.spintax = 1;
})();
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  module.exports = globalThis.FBQ.spintax;
}
