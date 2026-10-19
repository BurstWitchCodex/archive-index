#!/usr/bin/env node
/* 扫描数据目录，按 sha256 归组去重，输出快照清单。
 * 用法：node scripts/build-manifest.js <数据目录> <输出清单.json> [--hashes-only]
 * --hashes-only 时清单不记录任何文件名，只记录哈希与大小。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

const argv = process.argv.slice(2);
const hashesOnly = argv.includes("--hashes-only");
const positional = argv.filter(function (arg) {
  return !arg.startsWith("--");
});

if (positional.length < 2) {
  console.error("用法：node scripts/build-manifest.js <数据目录> <输出清单.json> [--hashes-only]");
  process.exit(1);
}

const root = path.resolve(positional[0]);
const outFile = path.resolve(positional[1]);

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error("数据目录不存在或不是目录：" + root);
  process.exit(1);
}

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

async function main() {
  const files = collect(root);
  const groups = new Map();
  let totalBytes = 0;

  for (const full of files) {
    const digest = await sha256(full);
    const bytes = fs.statSync(full).size;
    const relative = path.relative(root, full).split(path.sep).join("/");

    if (!groups.has(digest)) {
      groups.set(digest, { bytes: bytes, paths: [] });
    }
    const group = groups.get(digest);
    group.paths.push(relative);
    totalBytes += bytes;
  }

  const entries = [];
  for (const digest of Array.from(groups.keys()).sort()) {
    const group = groups.get(digest);
    entries.push({
      sha256: digest,
      bytes: group.bytes,
      paths: hashesOnly ? [] : group.paths.sort()
    });
  }

  let duplicateGroups = 0;
  let redundantFiles = 0;
  for (const group of groups.values()) {
    if (group.paths.length > 1) {
      duplicateGroups += 1;
      redundantFiles += group.paths.length - 1;
    }
  }

  const manifest = {
    schema: 1,
    snapshot: path.basename(outFile).replace(/\.json$/i, ""),
    created: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    archive: "",
    mode: hashesOnly ? "hashes-only" : "full",
    totals: {
      files: files.length,
      unique: entries.length,
      duplicateGroups: duplicateGroups,
      redundantFiles: redundantFiles,
      bytes: totalBytes
    },
    entries: entries
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log("快照：" + manifest.snapshot);
  console.log("模式：" + manifest.mode);
  console.log("文件：" + manifest.totals.files + " 个，唯一：" + manifest.totals.unique + " 项，重复组：" + manifest.totals.duplicateGroups + " 组，可省文件：" + manifest.totals.redundantFiles + " 个");
  console.log("字节：" + manifest.totals.bytes);
  console.log("输出：" + outFile);
  console.log("提示：archive 字段留空，上传网盘后手工填压缩包文件名。");
}

main().catch(function (err) {
  console.error("生成失败：" + err.message);
  process.exit(1);
});
