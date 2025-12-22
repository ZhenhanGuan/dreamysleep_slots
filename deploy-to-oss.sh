#!/bin/bash

# 阿里云OSS自动部署脚本
# 使用方法: ./deploy-to-oss.sh <bucket-name> [endpoint]
# 示例: ./deploy-to-oss.sh dreamysleep-slots oss-cn-hangzhou.aliyuncs.com

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 阿里云OSS自动部署脚本${NC}"
echo "=================================="
echo ""

# 检查参数
BUCKET_NAME=$1
if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}❌ 错误: 请提供存储桶名称${NC}"
    echo "使用方法: ./deploy-to-oss.sh <bucket-name> [endpoint]"
    echo "示例: ./deploy-to-oss.sh dreamysleep-slots oss-cn-hangzhou.aliyuncs.com"
    exit 1
fi

ENDPOINT=$2

# 检查ossutil是否安装
if ! command -v ossutil &> /dev/null; then
    echo -e "${YELLOW}⚠️  ossutil 未安装${NC}"
    echo ""
    echo "请先安装 ossutil："
    echo "  macOS:"
    echo "    wget https://gosspublic.alicdn.com/ossutil/1.7.14/ossutilmac64"
    echo "    chmod 755 ossutilmac64"
    echo "    sudo mv ossutilmac64 /usr/local/bin/ossutil"
    echo ""
    echo "或者使用控制台上传方式（见 ALIYUN_OSS_QUICK_DEPLOY.md）"
    exit 1
fi

# 检查环境变量文件
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  警告: 未找到 .env.local 文件${NC}"
    echo "正在创建 .env.local 文件..."
    read -p "请输入你的 GEMINI_API_KEY: " API_KEY
    echo "GEMINI_API_KEY=$API_KEY" > .env.local
    echo -e "${GREEN}✅ 已创建 .env.local 文件${NC}"
fi

# 检查node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 安装依赖...${NC}"
    npm install
fi

# 构建项目
echo -e "${GREEN}🔨 构建项目...${NC}"
npm run build

# 检查dist目录
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ 错误: 构建失败，未找到 dist 目录${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 构建完成！${NC}"
echo ""

# 检查ossutil配置
echo -e "${YELLOW}🔍 检查 ossutil 配置...${NC}"
if ! ossutil stat oss://$BUCKET_NAME/ &> /dev/null; then
    echo -e "${RED}❌ 无法访问存储桶: $BUCKET_NAME${NC}"
    echo ""
    echo "可能的原因："
    echo "1. 存储桶不存在或名称错误"
    echo "2. ossutil 未配置或配置错误"
    echo ""
    echo "请运行以下命令配置 ossutil："
    echo "  ossutil config"
    echo ""
    if [ -n "$ENDPOINT" ]; then
        echo "或者使用指定端点："
        echo "  ossutil config --endpoint $ENDPOINT"
    fi
    exit 1
fi

echo -e "${GREEN}✅ 存储桶访问正常${NC}"
echo ""

# 上传文件
echo -e "${GREEN}📤 上传文件到 OSS...${NC}"
echo "存储桶: oss://$BUCKET_NAME/"
echo ""

# 进入dist目录
cd dist

# 上传所有文件
ossutil cp -r . oss://$BUCKET_NAME/ --update --force

echo ""
echo -e "${GREEN}✅ 上传完成！${NC}"
echo ""

# 返回项目根目录
cd ..

# 显示访问信息
echo "=================================="
echo -e "${GREEN}🎉 部署成功！${NC}"
echo ""
echo "📋 下一步操作："
echo ""
echo "1. 确保在OSS控制台开启了静态网站托管"
echo "   - 存储桶 → 基础设置 → 静态网站托管 → 开启"
echo "   - 默认首页: index.html"
echo ""
echo "2. 确保文件权限为'公共读'"
echo "   - 文件管理 → 选中所有文件 → 更多 → 修改文件元信息 → 公共读"
echo ""
echo "3. 访问你的网站："
echo "   - 在静态网站托管页面查看访问域名"
echo "   - 格式: http://$BUCKET_NAME.oss-<region>.aliyuncs.com"
echo ""
echo "4. 验证部署："
echo "   ./check-deployment.sh"
echo ""


