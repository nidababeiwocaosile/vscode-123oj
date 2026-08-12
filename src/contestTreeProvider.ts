import * as vscode from 'vscode';
import { getContestList } from './api';

interface Contest {
    id: string;
    title: string;
    start_time?: string;
    end_time?: string;
}

class ContestItem extends vscode.TreeItem {
    constructor(public readonly contest: Contest) {
        super(contest.title, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `ID: ${contest.id}`;
        this.iconPath = new vscode.ThemeIcon('calendar');
        this.contextValue = 'contest';
        this.command = {
            command: 'oj.selectContest',
            title: '选择比赛',
            arguments: [contest.id],
        };
    }
}

export class ContestTreeProvider implements vscode.TreeDataProvider<ContestItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ContestItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private contests: Contest[] = [];
    private total = 0;                     // ← 新增：总记录数
    private currentPage = 1;
    private pageSize = 20;

    async refresh() {
        try {
            const data = await getContestList({
                limit: this.pageSize,
                offset: (this.currentPage - 1) * this.pageSize,
                isproblemlist: 0,
            });
            this.contests = data.results || [];
            this.total = data.count || 0;  // ← 记录总数
            this._onDidChangeTreeData.fire(undefined);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage('加载比赛列表失败：' + msg);
        }
    }

    async nextPage() {                     // ← 新增
        if (this.currentPage * this.pageSize < this.total) {
            this.currentPage++;
            await this.refresh();
        } else {
            vscode.window.showInformationMessage('已到最后一页');
        }
    }

    async prevPage() {                     // ← 新增
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.refresh();
        } else {
            vscode.window.showInformationMessage('已在第一页');
        }
    }

    getTreeItem(element: ContestItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ContestItem): Thenable<ContestItem[]> {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.contests.map(c => new ContestItem(c)));
    }
}