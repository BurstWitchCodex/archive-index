#!/usr/bin/env node
/* 用快照清单核对本地数据目录是否完好。
 * 用法：node scripts/verify-manifest.js <清单.json> <数据目录> [--allow-extra]
 * 一致返回 0，任何不一致打印明细并返回 1。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

const argv = process.argv.slice(2);
const allowExtra = argv.includes("--allow-extra");
const positional = argv.filter(function (arg) {
  return !arg.startsWith("--");
});

if (positional.length < 2) {
  console.error("用法：node scripts/verify-manifest.js <清单.json> <数据目录> [--allow-extra]");
  process.exit(1);
}

const manifestFile = path.resolve(positional[0]);
const root = path.resolve(positional[1]);

function collect(dir) {
  const found = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      found.push.apply(found, collect(full));
    } else if (item.isFile()) {
      found.push(full);
    }
  }
  return found;
}

async function sha256(full) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(full), async function (source) {
    for await (const chunk of source) {
      hash.update(chunk);
    }
  });
  return hash.digest("hex");
}

function show(limit, title, lines) {
  if (lines.length === 0) {
    return;
  }
  console.log(title + "：" + lines.length + " 项");
  for (const line of lines.slice(0, limit)) {
    console.log("  " + line);
  }
  if (lines.length > limit) {
    console.log("  …另有 " + (lines.length - limit) + " 项");
  }
}

async function main() {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error("数据目录不存在或不是目录：" + root);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.schema !== 1) {
    console.error("不支持的清单 schema：" + manifest.schema);
    process.exit(1);
  }

  const local = new Map();
  let localBytes = 0;
  let localFiles = 0;

  for (const full of collect(root)) {
    const digest = await sha256(full);
    const bytes = fs.statSync(full).size;
    const relative = path.relative(root, full).split(path.sep).join("/");

    if (!local.has(digest)) {
      local.set(digest, { bytes: bytes, paths: [] });
    }
    local.get(digest).paths.push(relative);
    localBytes += bytes;
    localFiles += 1;
  }

  const missing = [];
  const sizeMismatch = [];
  const pathProblems = [];

  for (const entry of manifest.entries) {
    const found = local.get(entry.sha256);
    if (!found) {
      missing.push(entry.sha256.slice(0, 12) + "  " + (entry.paths[0] || "（无路径记录）"));
      continue;
    }
    if (found.bytes !== entry.bytes) {
      sizeMismatch.push(entry.sha256.slice(0, 12) + "  清单 " + entry.bytes + " 实际 " + found.bytes);
    }
    if (manifest.mode === "full") {
      const expected = entry.paths.slice().sort().join("|");
      const actual = found.paths.sort().join("|");
      if (expected !== actual) {
        pathProblems.push(entry.sha256.slice(0, 12) + "  清单 " + expected + "  实际 " + actual);
      }
    }
  }

  const listed = new Set(manifest.entries.map(function (entry) {
    return entry.sha256;
  }));
  const extra = [];
  for (const digest of local.keys()) {
    if (!listed.has(digest)) {
      extra.push(digest.slice(0, 12) + "  " + local.get(digest).paths.join(", "));
    }
  }

  console.log("快照：" + manifest.snapshot + "  模式：" + manifest.mode);
  console.log("清单：" + manifest.totals.files + " 个文件 / " + manifest.entries.length + " 项 / " + manifest.totals.bytes + " 字节");
  console.log("实际：" + localFiles + " 个文件 / " + local.size + " 项 / " + localBytes + " 字节");

  show(20, "缺失", missing);
  show(20, "大小不符", sizeMismatch);
  show(20, "路径不符", pathProblems);

  if (extra.length > 0 && !allowExtra) {
    show(20, "清单外的文件", extra);
  } else if (extra.length > 0) {
    console.log("清单外的文件：" + extra.length + " 项，已按 --allow-extra 忽略");
  }

  const failed = missing.length + sizeMismatch.length + pathProblems.length > 0 || (extra.length > 0 && !allowExtra);
  if (failed) {
    console.log("结果：不一致");
    process.exit(1);
  }
  console.log("结果：一致");
}

main().catch(function (err) {
  console.error("核对失败：" + err.message);
  process.exit(1);
});
