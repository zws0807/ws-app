#!/bin/zsh
set -e

# Resolve from this launcher so double-clicking works from any directory.
cd -- "${0:A:h}/.."

if ! command -v npm >/dev/null 2>&1; then
  print "未找到 npm。请先安装 Node.js，再重新打开本文件。"
  read -r "?按回车关闭窗口。"
  exit 1
fi

print "心流显化本机预览：http://127.0.0.1:5173/"
print "请保留此终端窗口。关闭窗口或按 Ctrl+C 将停止预览。"
print ""
exec npm run dev -- --force --clearScreen false
