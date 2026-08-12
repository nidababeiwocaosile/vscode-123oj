import * as crypto from 'crypto';

function md5Hash(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

let sessionCookie: string | null = null;

async function request(url: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'referer': 'https://cppoj.kids123code.com/contest',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    };

    if (options.headers) {
        const userHeaders = options.headers as Record<string, string>;
        for (const key in userHeaders) {
            headers[key] = userHeaders[key];
        }
    }

    if (sessionCookie) {
        headers['cookie'] = sessionCookie;
        console.log('[Request] 携带 Cookie:', sessionCookie);
    } else {
        console.warn('[Request] sessionCookie 为空');
    }

    const resp = await fetch(url, {
        ...options,
        headers,
        credentials: 'omit',
    });

    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) {
        const match = setCookie.split(';').find(c => c.trim().startsWith('sessionid='));
        if (match) {
            sessionCookie = match.trim();
            console.log('[Request] 捕获 sessionid:', sessionCookie);
        }
    }

    const contentType = resp.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await resp.json();
    } else {
        const text = await resp.text();
        if (text.trim().startsWith('<!DOCTYPE')) {
            console.warn('[Request] 响应为 HTML，状态码:', resp.status);
        }
        return text;
    }
}

export async function login(username: string, password: string): Promise<boolean> {
    try {
        const hashed = md5Hash(password);
        console.log('[Login] 尝试登录，用户名:', username);
        const data = await request('https://cppoj.kids123code.com/api/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: hashed }),
        });
        if (data && data.username) {
            console.log('[Login] 登录成功，用户:', data.username);
            return true;
        } else {
            console.error('[Login] 登录失败，响应:', data);
            return false;
        }
    } catch (error: any) {
        console.error('[Login] 请求异常:', error.message);
        return false;
    }
}

export async function getContestList(params: {
    limit?: number;
    offset?: number;
    isproblemlist?: number;
}) {
    const base = 'https://cppoj.kids123code.com/api/contestinfo/';
    const query = `?limit=${params.limit || 30}&offset=${params.offset || 0}&isproblemlist=${params.isproblemlist || 0}`;
    const url = base + query;
    console.log('[API] 请求比赛列表，URL:', url);
    const data = await request(url, {
        headers: { 'referer': 'https://cppoj.kids123code.com/contest' }
    });
    console.log('[API] 比赛列表响应类型:', typeof data);
    if (typeof data === 'string') {
        console.log('[API] 响应预览:', data.substring(0, 200));
    } else {
        console.log('[API] 响应数据:', data);
    }
    return data;
}

export async function getProblemList(params: {
    contestid: string;
    limit?: number;
    offset?: number;
}) {
    const base = 'https://cppoj.kids123code.com/api/contestproblem/';
    let query = `?contestid=${params.contestid}`;
    if (params.limit !== undefined) query += `&limit=${params.limit}`;
    if (params.offset !== undefined) query += `&offset=${params.offset}`;
    const url = base + query;
    console.log('[API] 请求题目列表，URL:', url);
    const data = await request(url, {
        headers: { 'referer': `https://cppoj.kids123code.com/contest/${params.contestid}` }
    });
    console.log('[API] 题目列表响应类型:', typeof data);
    if (typeof data === 'string') {
        console.log('[API] 响应预览:', data.substring(0, 200));
    } else {
        console.log('[API] 响应数据:', data);
    }
    return data;
}

export async function getProblemDetail(problemId: string, contestId?: string) {
    const url = `https://cppoj.kids123code.com/api/problem/${problemId}/`;
    console.log('[API] 请求题目详情，URL:', url);
    const data = await request(url, {
        headers: {
            'referer': contestId ? `https://cppoj.kids123code.com/contest/${contestId}` : 'https://cppoj.kids123code.com/contest/',
        }
    });
    console.log('[API] 题目详情响应类型:', typeof data);
    if (typeof data === 'string') {
        console.log('[API] 响应预览:', data.substring(0, 200));
    } else {
        console.log('[API] 响应数据:', data);
    }
    return data;
}

// ---------- 提交代码 ----------
export async function submitCode(params: {
    problem: string;
    contest: string;
    language: string;
    code: string;
}) {
    const url = `https://cppoj.kids123code.com/api/judgestatusput/`;
    console.log('[API] 提交代码，URL:', url);
    const data = await request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Referer': `https://cppoj.kids123code.com/contest/${params.contest}`,
        },
        body: JSON.stringify({
            problem: params.problem,
            contest: params.contest,
            language: params.language,
            code: params.code,
        }),
    });
    console.log('[API] 提交响应:', data);
    return data;
}

// ---------- 查询提交状态（修正：解析数组） ----------
export async function getJudgeStatus(submissionId: number) {
    const url = `https://cppoj.kids123code.com/api/judgestatus/?id=${submissionId}`;
    console.log('[API] 查询评测状态，URL:', url);
    const data = await request(url);
    console.log('[API] 评测状态原始数据:', data);
    let result = data;
    if (Array.isArray(data) && data.length > 0) {
        result = data[0];
    }
    console.log('[API] 评测状态解析后:', JSON.stringify(result, null, 2));
    return result;
}

// ---------- 查询测试点详情（修正：解析数组） ----------
export async function getCaseStatus(submissionId: number) {
    const url = `https://cppoj.kids123code.com/api/casestatus/?statusid=${submissionId}`;
    console.log('[API] 查询测试点详情，URL:', url);
    const data = await request(url);
    console.log('[API] 测试点详情原始数据:', data);
    let result = data;
    if (Array.isArray(data) && data.length > 0) {
        result = data[0];
    }
    console.log('[API] 测试点详情解析后:', JSON.stringify(result, null, 2));
    return result;
}