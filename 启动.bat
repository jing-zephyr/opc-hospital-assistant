@echo off
chcp 65001 >nul
title AI医院资源查询助手 · 本地一键演示
cd /d "%~dp0"

echo ============================================================
echo   AI 医院资源查询与便民就医助手  ·  本地一键演示
echo   （第三届 OPC 接单吧实战能力大赛 · 软件与智能体赛道）
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Node.js
  echo.
  echo   请先安装 Node.js 18 或更高版本：  https://nodejs.org/
  echo   安装后重新双击本文件即可。
  echo.
  pause
  exit /b 1
)

echo   [1/3] Node 版本：
node --version
echo.

echo   [2/3] 检查检索密钥（只检查是否存在，不显示内容）
if defined BOCHA_API_KEY (echo         BOCHA_API_KEY  已设置) else (echo         BOCHA_API_KEY  未设置^(将尝试读取库外密钥文件^))
if defined TAVILY_API_KEY (echo         TAVILY_API_KEY 已设置) else (echo         TAVILY_API_KEY 未设置^(将尝试读取库外密钥文件^))
echo.

echo   [3/3] 启动本地服务（端口 8787）...
echo.
echo   网页版：        http://127.0.0.1:8787
echo   小程序模拟版：  http://127.0.0.1:8787/mini.html
echo   健康检查：      http://127.0.0.1:8787/api/health
echo.
echo   关闭本窗口即可停止服务。
echo ============================================================
echo.

start "" http://127.0.0.1:8787
node server.mjs
pause
