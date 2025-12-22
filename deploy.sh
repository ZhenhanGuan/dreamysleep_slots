#!/bin/bash

# DreamySleep Slots 部署脚本
# 使用方法: ./deploy.sh [aliyun|tencent]

set -e

echo "🚀 DreamySleep Slots 部署脚本"
echo "================================"

# 检查参数
PLATFORM=${1:-aliyun}
if [ "$PLATFORM" != "aliyun" ] && [ "$PLATFORM" != "tencent" ]; then
    echo "❌ 错误: 平台参数必须是 'aliyun' 或 'tencent'"
    echo "使用方法: ./deploy.sh [aliyun|tencent]"
    exit 1
fi

# 检查环境变量文件
if [ ! -f ".env.local" ]; then
    echo "⚠️  警告: 未找到 .env.local 文件"
    echo "正在创建 .env.local 文件..."
    read -p "请输入你的 GEMINI_API_KEY: " API_KEY
    echo "GEMINI_API_KEY=$API_KEY" > .env.local
    echo "✅ 已创建 .env.local 文件"
fi

# 检查node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 构建项目
echo "🔨 构建项目..."
npm run build

# 检查dist目录
if [ ! -d "dist" ]; then
    echo "❌ 错误: 构建失败，未找到 dist 目录"
    exit 1
fi

echo "✅ 构建完成！"
echo ""
echo "📁 dist 目录内容:"
ls -la dist/

echo ""
echo "================================"
echo "📤 下一步操作："
echo ""

if [ "$PLATFORM" == "aliyun" ]; then
    echo "阿里云OSS部署步骤："
    echo "1. 登录阿里云控制台 → 对象存储OSS"
    echo "2. 创建存储桶（选择'公共读'权限）"
    echo "3. 开启静态网站托管（默认首页: index.html）"
    echo "4. 在文件管理中上传 dist 目录的所有文件"
    echo "5. 访问静态网站托管域名"
    echo ""
    echo "详细步骤请查看 DEPLOYMENT_GUIDE.md"
else
    echo "腾讯云COS部署步骤："
    echo "1. 登录腾讯云控制台 → 对象存储COS"
    echo "2. 创建存储桶（选择'公有读私有写'权限）"
    echo "3. 开启静态网站（索引文档: index.html）"
    echo "4. 在文件列表中上传 dist 目录的所有文件"
    echo "5. 访问静态网站域名"
    echo ""
    echo "详细步骤请查看 DEPLOYMENT_GUIDE.md"
fi

echo ""
echo "💡 提示: 可以使用以下命令上传文件："
if [ "$PLATFORM" == "aliyun" ]; then
    echo "   ossutil cp -r dist/ oss://your-bucket-name/"
else
    echo "   coscmd upload -rs dist/ /"
fi


