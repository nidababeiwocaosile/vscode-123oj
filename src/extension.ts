import * as vscode from 'vscode';
import { ProblemTreeProvider } from './problemTreeProvider';
import { ContestTreeProvider } from './contestTreeProvider';
import { login, getProblemDetail, submitCode, getJudgeStatus, getCaseStatus } from './api';

let problemProvider: ProblemTreeProvider;
let contestProvider: ContestTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('miaomiaomiao 扩展已激活');

    (async () => {
        try {
            console.log('[Test] 正在测试网络连通性...');
            const res = await fetch('https://cppoj.kids123code.com');
            console.log('[Test] ✅ 首页访问成功，状态码：', res.status);
        } catch (err: any) {
            console.error('[Test] ❌ 首页访问失败：', err.message);
        }
    })();

    contestProvider = new ContestTreeProvider();
    const contestTreeView = vscode.window.createTreeView('contestList', {
        treeDataProvider: contestProvider,
    });
    context.subscriptions.push(contestTreeView);
    await contestProvider.refresh();

    problemProvider = new ProblemTreeProvider();
    const problemTreeView = vscode.window.createTreeView('problemList', {
        treeDataProvider: problemProvider,
    });
    context.subscriptions.push(problemTreeView);

    const helloCmd = vscode.commands.registerCommand('miaomiaomiao.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from miaomiaomiao!');
    });
    context.subscriptions.push(helloCmd);

    const openExternalCmd = vscode.commands.registerCommand('my-webview-extension.openExternal', () => {
        vscode.env.openExternal(vscode.Uri.parse('https://example.com'));
    });
    context.subscriptions.push(openExternalCmd);

    const openWebviewCmd = vscode.commands.registerCommand('my-webview-extension.openWebview', () => {
        const panel = vscode.window.createWebviewPanel(
            'websiteProxy', '网站（代理模式）', vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;overflow:hidden;background:#1e1e2e;}iframe{width:100vw;height:100vh;border:none;}</style></head><body><iframe src="http://127.0.0.1:3000/"></iframe></body></html>`;
    });
    context.subscriptions.push(openWebviewCmd);

    const loginCmd = vscode.commands.registerCommand('oj.login', async () => {
        const username = await vscode.window.showInputBox({ prompt: '输入用户名', placeHolder: '请输入你的 OJ 用户名' });
        if (!username) return;
        const password = await vscode.window.showInputBox({ prompt: '输入密码', password: true, placeHolder: '请输入你的密码' });
        if (!password) return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在登录...', cancellable: false }, async () => {
            const success = await login(username, password);
            if (success) {
                vscode.window.showInformationMessage('✅ 登录成功！');
                await context.secrets.store('oj-username', username);
                await context.secrets.store('oj-password', password);
                await contestProvider.refresh();
            } else {
                vscode.window.showErrorMessage('❌ 登录失败，请检查用户名密码');
            }
        });
    });
    context.subscriptions.push(loginCmd);

    // ========== 新增登出命令 ==========
    const logoutCmd = vscode.commands.registerCommand('oj.logout', async () => {
        await context.secrets.delete('oj-username');
        await context.secrets.delete('oj-password');
        vscode.window.showInformationMessage('👋 已登出，下次请手动登录');
        await contestProvider.refresh();
    });
    context.subscriptions.push(logoutCmd);

    const selectContestCmd = vscode.commands.registerCommand('oj.selectContest', async (contestId: string) => {
        vscode.window.showInformationMessage(`已选择比赛: ${contestId}`);
        problemProvider.setContestId(contestId);
        await problemProvider.refresh();
    });
    context.subscriptions.push(selectContestCmd);

    const refreshContestCmd = vscode.commands.registerCommand('oj.refreshContests', () => contestProvider.refresh());
    context.subscriptions.push(refreshContestCmd);
    const refreshProblemsCmd = vscode.commands.registerCommand('oj.refreshProblems', () => problemProvider.refresh());
    context.subscriptions.push(refreshProblemsCmd);
    const nextPageCmd = vscode.commands.registerCommand('oj.nextPage', () => problemProvider.nextPage());
    context.subscriptions.push(nextPageCmd);
    const prevPageCmd = vscode.commands.registerCommand('oj.prevPage', () => problemProvider.prevPage());
    context.subscriptions.push(prevPageCmd);

    const contestNextCmd = vscode.commands.registerCommand('oj.contestNextPage', () => contestProvider.nextPage());
    const contestPrevCmd = vscode.commands.registerCommand('oj.contestPrevPage', () => contestProvider.prevPage());
    context.subscriptions.push(contestNextCmd, contestPrevCmd);

    const openProblemCmd = vscode.commands.registerCommand('oj.openProblem', async (problemId: string, problemTitle?: string) => {
        try {
            const contestId = problemProvider.getCurrentContestId();
            if (!contestId) { vscode.window.showErrorMessage('未选择比赛，请先选择一场比赛'); return; }
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在加载题目...', cancellable: false }, async () => {
                const data = await getProblemDetail(problemId, contestId);
                const panel = vscode.window.createWebviewPanel('problemDetail', `题目: ${problemTitle || problemId}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
                const title = problemTitle || data.title || data.problemtitle || `题目 ${problemId}`;
                const description = data.des || data.description || data.content || '';
                const input = data.input || '';
                const output = data.output || '';
                const hint = data.hint || '';
                const timeLimit = data.time || data.time_limit || '';
                const memoryLimit = data.memory || data.memory_limit || '';
                let samples: { input: string; output: string }[] = [];
                const rawInput = data.sinput || '';
                const rawOutput = data.soutput || '';
                if (rawInput && rawOutput) {
                    const inputParts = rawInput.split('|#)');
                    const outputParts = rawOutput.split('|#)');
                    for (let i = 0; i < Math.min(inputParts.length, outputParts.length); i++) {
                        const inp = inputParts[i]?.trim() || '';
                        const outp = outputParts[i]?.trim() || '';
                        if (inp || outp) samples.push({ input: inp, output: outp });
                    }
                } else if (data.samples && Array.isArray(data.samples)) {
                    samples = data.samples.map((s: any) => ({ input: s.input || s.in || '', output: s.output || s.out || '' }));
                } else if (data.sample && Array.isArray(data.sample)) {
                    samples = data.sample.map((s: any) => ({ input: s.input || s.in || '', output: s.output || s.out || '' }));
                }
                const contentHtml = buildProblemContentHtml({ title, description, input, output, hint, timeLimit, memoryLimit, samples, rawInput, rawOutput, problemId, contestId });
                panel.webview.html = getWebviewTemplate(title, contentHtml);
                panel.webview.onDidReceiveMessage(async msg => {
                    if (msg.command === 'openSubmit') vscode.commands.executeCommand('oj.submit', msg.problemId, msg.contestId);
                });
            });
        } catch (err) {
            vscode.window.showErrorMessage('加载题目失败：' + (err instanceof Error ? err.message : String(err)));
        }
    });
    context.subscriptions.push(openProblemCmd);

    const submitCmd = vscode.commands.registerCommand('oj.submit', async (problemId: string, contestId: string) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showErrorMessage('请先打开一个代码文件'); return; }
        const code = editor.document.getText();
        if (!code.trim()) { vscode.window.showErrorMessage('代码内容为空，无法提交'); return; }

        const selected = await vscode.window.showQuickPick(
            ['C++', 'Python3'].map(l => ({ label: l, value: l })),
            { placeHolder: '选择编程语言' }
        );
        if (!selected) return;

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在提交代码...', cancellable: false }, async () => {
            try {
                const submitResult = await submitCode({ problem: problemId, contest: contestId, language: selected.value, code });
                const submissionId = submitResult.submission_id || submitResult.id || submitResult.statusid;
                if (!submissionId) throw new Error('提交成功但未返回 ID：' + JSON.stringify(submitResult));
                vscode.window.showInformationMessage(`✅ 提交成功！提交 ID: ${submissionId}，正在评测...`);

                let judgeDone = false;
                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const raw = await getJudgeStatus(submissionId);
                    const item = Array.isArray(raw) ? raw[0] : raw;
                    if (!item) continue;
                    const res = item.result;
                    const done = (typeof res === 'string' && !/^-\d+$/.test(res)) ||
                                 (typeof res === 'number' && res >= 0);
                    if (done) {
                        judgeDone = true;
                        break;
                    }
                }

                if (!judgeDone) {
                    vscode.window.showWarningMessage('⏰ 评测超时，请稍后在 OJ 网站上查看结果。');
                    return;
                }

                let detail: any = null;
                for (let retry = 0; retry < 30; retry++) {
                    const caseData = await getCaseStatus(submissionId);
                    const items = Array.isArray(caseData) ? caseData : [caseData];
                    detail = items.find((item: any) => {
                        const timeStr = String(item.cputimelist ?? '');
                        return timeStr.includes('|');
                    });
                    if (detail) break;
                    await new Promise(r => setTimeout(r, 2000));
                }
                if (!detail) {
                    const caseData = await getCaseStatus(submissionId);
                    detail = Array.isArray(caseData) ? caseData[0] : caseData;
                }

                if (!detail) throw new Error('无法获取评测详情');
                showJudgeResultPanel(submissionId, detail, problemId, contestId);

            } catch (err) {
                vscode.window.showErrorMessage('提交失败：' + (err instanceof Error ? err.message : String(err)));
            }
        });
    });
    context.subscriptions.push(submitCmd);

    const savedUsername = await context.secrets.get('oj-username');
    const savedPassword = await context.secrets.get('oj-password');
    if (savedUsername && savedPassword) {
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: '正在自动登录...', cancellable: false }, async () => {
            const ok = await login(savedUsername, savedPassword);
            if (ok) { vscode.window.showInformationMessage('✅ 自动登录成功'); await contestProvider.refresh(); }
            else vscode.window.showWarningMessage('⚠️ 自动登录失败，请手动登录');
        });
    } else {
        vscode.window.showInformationMessage('💡 请先登录 123OJ（命令：登录 123OJ）');
    }

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    statusBar.text = '$(book) OJ Ready';
    statusBar.command = 'oj.login';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

export async function deactivate() {
    console.log('miaomiaomiao 扩展已停用');
}

// ============= 辅助函数 =============

function buildProblemContentHtml(p: any): string {
    const { title, description, input, output, hint, timeLimit, memoryLimit, samples, rawInput, rawOutput, problemId, contestId } = p;

    function nl2br(text: string): string {
        return text.replace(/\n/g, '<br>');
    }

    let h = `<div style="display:flex;align-items:baseline;gap:1.5rem;flex-wrap:wrap;border-bottom:2px solid var(--vscode-panel-border);padding-bottom:0.5rem;margin-bottom:1rem;">
        <h1 style="margin:0;">${title}</h1>
        ${timeLimit ? `<span><strong>⏱️ 时间限制：</strong>${timeLimit}ms</span>` : ''}
        ${memoryLimit ? `<span><strong>💾 内存限制：</strong>${memoryLimit}MB</span>` : ''}
        <button onclick="vscode.postMessage({command:'openSubmit',problemId:'${problemId}',contestId:'${contestId}'})" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:0.4rem 1rem;border-radius:4px;cursor:pointer;margin-left:auto;">📤 提交代码</button>
    </div>`;

    if (description) h += `<h2>📝 题目描述</h2><div>${nl2br(description)}</div>`;
    if (input) h += `<h2>📥 输入格式</h2><div>${nl2br(input)}</div>`;
    if (output) h += `<h2>📤 输出格式</h2><div>${nl2br(output)}</div>`;

    if (samples.length > 0) {
        h += `<h2>📋 样例</h2>`;
        samples.forEach((s: any, i: number) => {
            const sampleId = `sample-${i}`;
            h += `
                <div style="margin-bottom:1.5rem;border:1px solid var(--vscode-panel-border);border-radius:4px;padding:0.5rem;">
                    <h3 style="margin-top:0;">样例 ${i+1}</h3>
                    <div style="display:flex;gap:1rem;flex-wrap:wrap;">
                        <div style="flex:1;min-width:200px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <strong>输入</strong>
                                <button class="copy-btn" data-target="${sampleId}-input">复制</button>
                            </div>
                            <pre id="${sampleId}-input" style="white-space:pre-wrap;word-wrap:break-word;">${s.input}</pre>
                        </div>
                        <div style="flex:1;min-width:200px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <strong>输出</strong>
                                <button class="copy-btn" data-target="${sampleId}-output">复制</button>
                            </div>
                            <pre id="${sampleId}-output" style="white-space:pre-wrap;word-wrap:break-word;">${s.output}</pre>
                        </div>
                    </div>
                </div>
            `;
        });
    } else if (rawInput && rawOutput) {
        h += `<h2>📋 样例</h2>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;border:1px solid var(--vscode-panel-border);padding:0.5rem;border-radius:4px;">
            <div style="flex:1;min-width:200px;">
                <div style="display:flex;justify-content:space-between;">
                    <strong>输入</strong>
                    <button class="copy-btn" data-target="raw-input">复制</button>
                </div>
                <pre id="raw-input" style="white-space:pre-wrap;word-wrap:break-word;">${rawInput}</pre>
            </div>
            <div style="flex:1;min-width:200px;">
                <div style="display:flex;justify-content:space-between;">
                    <strong>输出</strong>
                    <button class="copy-btn" data-target="raw-output">复制</button>
                </div>
                <pre id="raw-output" style="white-space:pre-wrap;word-wrap:break-word;">${rawOutput}</pre>
            </div>
        </div>`;
    }

    // 提示部分改为 Markdown 容器，不再使用 nl2br
    if (hint) h += `<h2>💡 提示</h2><div class="markdown-content">${hint}</div>`;
    return h;
}

function getWebviewTemplate(title: string, body: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 1rem 2rem;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            line-height: 1.6;
        }
        h2 { color: var(--vscode-editor-foreground); margin-top: 1.5rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3rem; }
        h3 { color: var(--vscode-editor-foreground); margin-top: 0.5rem; margin-bottom: 0.3rem; }
        pre {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 0.8rem;
            border-radius: 4px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0.2rem 0;
        }
        p, div { margin: 0.5rem 0; }
        .copy-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 0.8rem;
        }
        .copy-btn:hover { opacity: 0.8; }
        .copy-btn:active { transform: scale(0.95); }

        /* Markdown 表格样式 */
        .markdown-content table {
            border-collapse: collapse;
            margin: 1rem 0;
            width: auto;
        }
        .markdown-content th,
        .markdown-content td {
            border: 1px solid var(--vscode-panel-border);
            padding: 0.4rem 0.8rem;
            text-align: left;
        }
        .markdown-content th {
            background: var(--vscode-editor-background);
            font-weight: bold;
        }
    </style>
</head>
<body>
    ${body}

    <!-- 同步加载 Markdown 解析库 -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <!-- 同步加载 KaTeX 核心库 -->
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <!-- 同步加载自动渲染扩展 -->
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();

        function renderMath() {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(document.body, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\\\(', right: '\\\\)', display: false},
                        {left: '\\\\[', right: '\\\\]', display: true}
                    ],
                    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
                });
            } else {
                setTimeout(renderMath, 100);
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            // 复制按钮功能
            document.querySelectorAll('.copy-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const targetId = this.getAttribute('data-target');
                    const pre = document.getElementById(targetId);
                    if (pre) {
                        navigator.clipboard.writeText(pre.textContent).then(() => {
                            const orig = this.textContent;
                            this.textContent = '✅ 已复制';
                            setTimeout(() => { this.textContent = orig; }, 1500);
                        }).catch(err => console.error('复制失败:', err));
                    }
                });
            });

            // 渲染所有 Markdown 内容
            if (typeof marked !== 'undefined') {
                document.querySelectorAll('.markdown-content').forEach(el => {
                    el.innerHTML = marked.parse(el.textContent || '');
                });
            }

            // 启动数学公式渲染
            renderMath();
        });
    </script>
</body>
</html>`;
}

function showJudgeResultPanel(submissionId: string, detail: any, problemId: string, contestId: string) {
    const resultRaw = detail.result;
    const resultStr = String(resultRaw ?? '');
    const timeStr = String(detail.cputimelist ?? '');
    const memStr = String(detail.memorylist ?? '');

    let results: string[];
    if (/^\d+$/.test(resultStr) && !resultStr.includes('|')) {
        results = [resultStr];
    } else {
        results = resultStr.split('|').filter(s => s !== '');
    }

    const times = timeStr.split('|').filter(s => s !== '');
    const memories = memStr.split('|').filter(s => s !== '');

    const totalTests = Math.max(results.length, times.length, memories.length, 1);
    const passCount = results.filter(r => r === '0').length;
    const totalCount = detail.sumcount || totalTests;
    const score = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    const statusMap: Record<string, string> = {
        '0': 'Accepted',
        '1': 'Wrong Answer',
        '2': 'Time Limit Exceeded',
        '3': 'Memory Limit Exceeded',
        '4': 'Runtime Error',
        '5': 'Output Limit Exceeded',
    };

    let rows = '';
    for (let i = 0; i < totalTests; i++) {
        const res = results[i] ?? '?';
        const time = times[i] ?? '-';
        const mem = memories[i] ?? '-';
        const status = statusMap[res] || (res === '?' ? 'Unknown' : `状态码 ${res}`);
        let colorStyle = '';
        let icon = '';
        switch (res) {
            case '0': icon = '✅'; colorStyle = 'color:green;'; break;
            case '1': icon = '❌'; colorStyle = 'color:red;'; break;
            case '2': icon = '⏰'; colorStyle = 'color:orange;'; break;
            case '3': icon = '💾'; colorStyle = 'color:purple;'; break;
            case '4': icon = '💥'; colorStyle = 'color:darkred;'; break;
            default: icon = '❓'; break;
        }
        rows += `<tr><td>${i+1}</td><td style="${colorStyle}">${icon} ${status}</td><td>${time} ms</td><td>${mem} MB</td></tr>`;
    }

    const overallAccepted = results.length > 0 && results.every(r => r === '0');
    const overallResult = overallAccepted ? 'Accepted' : 'Wrong Answer';
    const overallColor = overallAccepted ? 'green' : 'red';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>评测结果 #${submissionId}</title>
        <style>body{font-family:var(--vscode-font-family);padding:1rem 2rem;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);}
        table{width:100%;border-collapse:collapse;margin-top:1rem;}th,td{border:1px solid var(--vscode-panel-border);padding:0.5rem;text-align:center;}
        th{background:var(--vscode-editor-background);}.summary{font-size:1.2rem;margin-bottom:1rem;}</style></head><body>
        <h2>提交 #${submissionId} 评测结果</h2>
        <div class="summary"><strong>题目：</strong> ${problemId} &nbsp;&nbsp;<strong>比赛：</strong> ${contestId} &nbsp;&nbsp;<strong>总分：</strong> ${score} / 100 &nbsp;&nbsp;<strong>状态：</strong> <span style="color:${overallColor}">${overallResult}</span></div>
        <table><thead><tr><th>测试点</th><th>状态</th><th>时间</th><th>内存</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;

    const panel = vscode.window.createWebviewPanel('judgeResult', `评测结果 #${submissionId}`, vscode.ViewColumn.Two, { enableScripts: false, retainContextWhenHidden: true });
    panel.webview.html = html;
}