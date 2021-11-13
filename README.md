# chart render service

EDA 的 chart 渲染服务。

## 工作原理：

1. 使用 puppeteer 在服务端加载前端页面
2. 使用 parentId, elementId, chartId 拼成 URL，即可访问特定的 chart
3. 使用 puppeteer 操作页面，触发逻辑运行，生成新的图形
4. 得到新生成的图形的 base64 码，返回给调用者

该服务作为一个 nodejs 进程运行在服务端，服务器上需要安装 nodejs 环境，下载本应用的依赖

## 可能遇到的问题

### Q:下载 puppeteer 时未主动下载 chromium

A: 
```sh
cd ./node_modules/puppeteer
npm run install
```