# BurstWitchCodex/cache

《爆裂魔女》解包数据的去重归档索引仓库。本仓库只保存清单和核对脚本，数据实体压缩后存外部网盘。
对应 Wiki 仓库的 issue #2「关于游戏其他数据的未来归档方案」。

## 放什么

- index 目录下的快照清单，一次归档一个 JSON
- scripts 目录下的两个脚本：生成清单、核对清单
- 本文档约定的命名规范

## 不放什么（红线）

以下任何内容不得进入本仓库的任何提交，也不得写进清单字段：

- 解密密钥、偏移量、轮数一类的参数
- 解密或改包工具本身（Wiki 仓库里 tools/.encoder/ 那种目录）
- 网盘提取码
- 游戏原始安装包、可反推出密钥的中间产物
- 未公开的资源内部命名

清单默认会写原始相对路径。若这批路径名本身属于上一条，生成清单时加 --hashes-only，
此时清单只记录哈希与字节数，不记录任何文件名。

## 目录结构

    cache/
      README.md
      .gitignore
      manifest.bat                  双击可用的封装，new / check / list 三个动作
      index/                        入库，快照清单
      scripts/build-manifest.js     入库
      scripts/verify-manifest.js    入库
      templates/register.md         入库，网盘登记用的评论模板
      raw/                          不入库，本地解包数据临时放这里

## 快照命名

    <日期>-<来源>-<序号>

日期用 2026-10-19 这种形式，来源写渠道或版本，序号从 01 起，用于同一天多次归档。
网盘里的压缩包与之对应，分卷时补 .partNN：

    bw-2026-10-19-android0427-01.part01.7z
    bw-2026-10-19-android0427-01.part02.7z

一个快照对应一个清单文件，文件名相同、后缀换成 .json，放在 index 目录下。

## 清单字段

| 字段 | 含义 |
|---|---|
| schema | 清单格式版本，当前为 1 |
| snapshot | 快照名，与网盘压缩包对应 |
| created | 生成时间，UTC，ISO 8601 |
| archive | 网盘里的压缩包文件名，不含提取码 |
| mode | full 或 hashes-only |
| totals | files、unique、duplicateGroups、redundantFiles、bytes 五项统计 |
| entries | 按 sha256 归组后的条目数组 |

entries 每一项形如：

    {
      "sha256": "…",
      "bytes": 12345,
      "paths": ["lua/xxx.bytes", "lua/yyy.bytes"]
    }

paths 长度大于 1 即为组内重复文件；hashes-only 模式下 paths 是空数组，只能核对数量与总字节。
duplicateGroups 和 redundantFiles 在两种模式下都按实际重复情况统计，隐藏文件名不会隐藏去重效果。

## 用法

Windows 下在仓库根目录执行，只用 Node 内置模块，无需 npm install。

生成清单：

    node scripts/build-manifest.js raw index/2026-10-19-android0427-01.json

同一批但只留哈希：

    node scripts/build-manifest.js raw index/2026-10-19-android0427-01.json --hashes-only

核对本地数据与清单是否一致：

    node scripts/verify-manifest.js index/2026-10-19-android0427-01.json raw

核对允许本地多出临时文件：

    node scripts/verify-manifest.js index/2026-10-19-android0427-01.json raw --allow-extra

verify 全部一致时退出码 0 并打印统计，任何不一致都会列出条目并返回 1，可以直接接到批处理里。

## 批处理封装

manifest.bat 沿用 Wiki 仓库 update.bat 的写法，可以直接双击，它只做参数转发和前后检查，逻辑仍在两个 js 里：

    manifest.bat new 2026-10-19-android0427-01         生成清单并立刻核对一次
    manifest.bat new 2026-10-19-android0427-01 hashes  同上，但清单不写文件名
    manifest.bat check 2026-10-19-android0427-01       事后核对
    manifest.bat check 2026-10-19-android0427-01 extra 忽略本地多出的临时文件
    manifest.bat list                                  列出 index 下已有的快照名

快照文件已存在时 new 直接报错退出，不会覆盖已经登记过的清单。
从别的脚本调用它时先 set MANIFEST_NO_PAUSE=1，否则会停在 pause 等按键。
文件本身是 ASCII，控制台中文由 chcp 65001 和 js 输出负责，别在 bat 里写中文注释。

## 一次归档的完整动作

1. 把解包数据放进 raw 目录，确认没有混入密钥或工具文件
2. 执行 manifest.bat new 加快照名，需要隐藏路径时再补 hashes；它会生成清单并立刻核对一次
3. 压缩并分卷，上传网盘
4. 把清单文件提交进 index 目录，记下这次提交的短 sha
5. 按 templates/register.md 填一条登记评论，贴到 Wiki 仓库 issue #2 下面；提取码不进任何公开页面
6. 以后要确认网盘那份数据是否还完整，跑 manifest.bat check 加快照名

## 与 Wiki 仓库的关系

Wiki 站点不读取本仓库的任何文件。data 目录下的 assets.js、meta.js、voices.js 等由 Wiki 自己的
tools 脚本生成，本仓库只服务归档与恢复时的核对。
