import * as vscode from 'vscode';
import { getProblemList } from './api';

interface Problem {
    id: number;
    contestid: number;
    problemid: string;
    problemtitle: string;
    rank: number;
    ishomework: number;
    ishidden: number;
}

export class ProblemItem extends vscode.TreeItem {
    public readonly contestId: string;
    public readonly problem: Problem;
    constructor(problem: Problem) {
        super(problem.problemtitle || `题目 ${problem.problemid}`, vscode.TreeItemCollapsibleState.None);
        this.problem = problem;
        this.contestId = String(problem.contestid);
        this.tooltip = `ID: ${problem.problemid} | 排名: ${problem.rank}`;
        this.description = `#${problem.problemid}`;
        this.iconPath = new vscode.ThemeIcon('symbol-number');
        this.contextValue = 'problem';
        this.command = {
            command: 'oj.openProblem',
            title: '打开题目',
            arguments: [problem.problemid, problem.problemtitle],
        };
    }
}

export class ProblemTreeProvider implements vscode.TreeDataProvider<ProblemItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProblemItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private problems: Problem[] = [];
    private total = 0;
    private currentPage = 1;
    private pageSize = 20;
    private contestId: string | null = null;

    setContestId(id: string | null) {
        this.contestId = id;
        this.currentPage = 1;
    }

    getCurrentContestId(): string | null {
        return this.contestId;
    }

    async refresh() {
        if (!this.contestId) {
            this.problems = [];
            this.total = 0;
            this._onDidChangeTreeData.fire(undefined);
            vscode.window.showInformationMessage('请先选择一个比赛');
            return;
        }

        try {
            const data = await getProblemList({
                contestid: this.contestId,
                limit: this.pageSize,
                offset: (this.currentPage - 1) * this.pageSize,
            }) as any;
            
            console.log('[DEBUG] 题目列表完整数据:', JSON.stringify(data, null, 2));
            
            let items: Problem[] = [];
            let totalCount = 0;
            if (data && typeof data === 'object') {
                if (Array.isArray(data)) {
                    items = data;
                    totalCount = items.length;
                } else if (data.results) {
                    items = data.results;
                    totalCount = data.count || data.total || items.length;
                } else if (data.data) {
                    items = data.data;
                    totalCount = data.count || data.total || items.length;
                } else {
                    const firstArray = Object.values(data).find(v => Array.isArray(v));
                    if (firstArray) {
                        items = firstArray;
                        totalCount = items.length;
                    }
                }
            }
            this.problems = items;
            this.total = totalCount;
            this._onDidChangeTreeData.fire(undefined);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage('加载题目列表失败：' + msg);
        }
    }

    getTreeItem(element: ProblemItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProblemItem): Thenable<ProblemItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.problems.map(p => new ProblemItem(p)));
    }

    async nextPage() {
        if (this.contestId && this.currentPage * this.pageSize < this.total) {
            this.currentPage++;
            await this.refresh();
        } else {
            vscode.window.showInformationMessage('已到最后一页');
        }
    }

    async prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.refresh();
        } else {
            vscode.window.showInformationMessage('已在第一页');
        }
    }
}
