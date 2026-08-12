import * as http from 'http';
import httpProxy = require('http-proxy');

// 存储捕获到的 Cookie（全局变量，代理启动后一直有效）
let sessionCookie: string | null = null;

// 目标网站地址（请替换成你要代理的网站）
const TARGET = 'https://cppoj.kids123code.com';

// 创建代理实例
const proxy = httpProxy.createProxyServer({});

// 监听代理响应，捕获 Set-Cookie
proxy.on('proxyRes', (proxyRes) => {
    const setCookie = proxyRes.headers['set-cookie'];
    if (setCookie && Array.isArray(setCookie)) {
        // 查找包含 'sessionid' 的 Cookie（可根据实际 Cookie 名调整）
        const cookie = setCookie.find(c => c.startsWith('sessionid='));
        if (cookie) {
            sessionCookie = cookie;
            console.log('[Proxy] Captured sessionid:', cookie);
        }
    }
});

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
    // 如果请求是 WebSocket 升级，忽略（本代理不处理 WebSocket）
    if (req.headers.upgrade) {
        res.writeHead(426);
        res.end();
        return;
    }

    // 如果已经捕获到 Cookie，则添加到请求头中
    if (sessionCookie) {
        req.headers.cookie = sessionCookie;
    }

    // 转发请求到目标网站
    proxy.web(req, res, { 
        target: TARGET, 
        changeOrigin: true,
        // 如果目标网站是 HTTPS 且证书有问题，可开启 strictSSL: false（仅开发用）
        // secure: false
    }, (err) => {
        console.error('[Proxy] Error:', err.message);
        res.writeHead(502);
        res.end('Proxy error');
    });
});

// 启动代理服务器
const PORT = 3000;
export function startProxy() {
    return new Promise<void>((resolve) => {
        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[Proxy] Server running on http://127.0.0.1:${PORT}`);
            resolve();
        });
    });
}

// 停止代理服务器（扩展停用时调用）
export function stopProxy() {
    return new Promise<void>((resolve) => {
        server.close(() => {
            console.log('[Proxy] Server stopped');
            resolve();
        });
    });
}