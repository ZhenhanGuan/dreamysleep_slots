#!/bin/bash

# 部署检查脚本
# 用于诊断部署后页面无法显示的问题

echo "🔍 DreamySleep Slots 部署诊断工具"
echo "=================================="
echo ""

# 检查1: dist目录是否存在
echo "1️⃣ 检查构建文件..."
if [ ! -d "dist" ]; then
    echo "   ❌ dist 目录不存在"
    echo "   💡 运行: npm run build"
    exit 1
else
    echo "   ✅ dist 目录存在"
fi

# 检查2: index.html是否存在
if [ ! -f "dist/index.html" ]; then
    echo "   ❌ dist/index.html 不存在"
    exit 1
else
    echo "   ✅ index.html 存在"
fi

# 检查3: assets目录是否存在
if [ ! -d "dist/assets" ]; then
    echo "   ⚠️  dist/assets 目录不存在（可能正常，取决于构建配置）"
else
    echo "   ✅ assets 目录存在"
    ASSET_COUNT=$(find dist/assets -type f | wc -l)
    echo "   📦 assets 目录包含 $ASSET_COUNT 个文件"
fi

# 检查4: 检查vite.config.ts中的base配置
echo ""
echo "2️⃣ 检查 Vite 配置..."
if grep -q "base:" vite.config.ts; then
    BASE_VALUE=$(grep "base:" vite.config.ts | head -1 | sed 's/.*base: *\(.*\),.*/\1/' | tr -d "'\"")
    if [ "$BASE_VALUE" == "./" ] || [ "$BASE_VALUE" == "'.'" ]; then
        echo "   ✅ base 配置正确: $BASE_VALUE"
    else
        echo "   ⚠️  base 配置: $BASE_VALUE"
        echo "   💡 建议设置为: base: './'"
    fi
else
    echo "   ⚠️  未找到 base 配置"
    echo "   💡 建议在 vite.config.ts 中添加: base: './'"
fi

# 检查5: 检查index.html中的资源路径
echo ""
echo "3️⃣ 检查 index.html 中的资源路径..."
if [ -f "dist/index.html" ]; then
    # 检查是否有绝对路径
    ABSOLUTE_PATHS=$(grep -E '(href|src)="\/' dist/index.html | grep -v "http" | wc -l)
    if [ "$ABSOLUTE_PATHS" -gt 0 ]; then
        echo "   ⚠️  发现绝对路径（可能有问题）:"
        grep -E '(href|src)="\/' dist/index.html | grep -v "http" | head -3 | sed 's/^/      /'
        echo "   💡 建议使用相对路径（./assets/...）"
    else
        echo "   ✅ 未发现绝对路径问题"
    fi
    
    # 检查相对路径
    RELATIVE_PATHS=$(grep -E '(href|src)="\.\/' dist/index.html | wc -l)
    if [ "$RELATIVE_PATHS" -gt 0 ]; then
        echo "   ✅ 发现相对路径（正确）:"
        grep -E '(href|src)="\.\/' dist/index.html | head -2 | sed 's/^/      /'
    fi
fi

# 检查6: 检查环境变量文件
echo ""
echo "4️⃣ 检查环境变量配置..."
if [ -f ".env.local" ]; then
    if grep -q "GEMINI_API_KEY" .env.local; then
        API_KEY_LENGTH=$(grep "GEMINI_API_KEY" .env.local | cut -d'=' -f2 | tr -d ' ' | wc -c)
        if [ "$API_KEY_LENGTH" -gt 10 ]; then
            echo "   ✅ .env.local 文件存在且包含 API 密钥"
        else
            echo "   ⚠️  API 密钥可能为空或格式错误"
        fi
    else
        echo "   ⚠️  .env.local 存在但未找到 GEMINI_API_KEY"
    fi
else
    echo "   ⚠️  .env.local 文件不存在"
    echo "   💡 创建文件: echo 'GEMINI_API_KEY=你的密钥' > .env.local"
fi

# 检查7: 显示文件结构
echo ""
echo "5️⃣ dist 目录结构:"
echo "   📁 dist/"
if [ -f "dist/index.html" ]; then
    echo "   ├── index.html ✅"
fi
if [ -d "dist/assets" ]; then
    echo "   └── assets/"
    find dist/assets -type f | head -5 | sed 's|dist/|      |' | sed 's|^|   |'
    ASSET_TOTAL=$(find dist/assets -type f | wc -l)
    if [ "$ASSET_TOTAL" -gt 5 ]; then
        echo "      ... 还有 $((ASSET_TOTAL - 5)) 个文件"
    fi
fi

# 总结和建议
echo ""
echo "=================================="
echo "📋 部署检查清单:"
echo ""
echo "在 OSS/COS 控制台检查："
echo "  [ ] 静态网站托管已开启"
echo "  [ ] 默认首页设置为 index.html"
echo "  [ ] 文件权限设置为'公共读'"
echo "  [ ] index.html 在存储桶根目录（不在 dist/ 子目录）"
echo "  [ ] assets 文件夹在存储桶根目录"
echo "  [ ] 使用静态网站托管域名访问（不是 API 域名）"
echo ""
echo "浏览器检查："
echo "  [ ] 打开开发者工具（F12）"
echo "  [ ] 查看 Console 标签的错误信息"
echo "  [ ] 查看 Network 标签的资源加载情况"
echo ""
echo "💡 如果问题仍然存在，请查看 TROUBLESHOOTING.md"
echo ""


