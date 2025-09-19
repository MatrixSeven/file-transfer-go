#!/bin/bash

# 静态导出构建脚本
# 该脚本会临时移动 API 路由到项目外部，然后进行静态导出

echo "开始静态导出构建..."

# 备份 API 路由到临时目录
if [ -d "src/app/api" ]; then
    echo "备份 API 路由..."
    mkdir -p /tmp/next-api-backup
    mv src/app/api /tmp/next-api-backup/
fi

# 清理之前的构建
rm -rf .next out

# 设置环境变量并构建
echo "执行静态导出..."
NEXT_EXPORT=true yarn build

# 恢复 API 路由
if [ -d "/tmp/next-api-backup/api" ]; then
    echo "恢复 API 路由..."
    mv /tmp/next-api-backup/api src/app/
    rmdir /tmp/next-api-backup
fi

echo "静态导出构建完成！"
echo "输出目录: out/"
