import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DiscordClient, LogEntry, SpamConfig } from './types';

const StatusBadge = ({ status }: { status: DiscordClient['status'] }) => {
    const colors = {
        idle: 'bg-slate-600 text-slate-100',
        running: 'bg-green-500 text-white animate-pulse',
        error: 'bg-red-500 text-white'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[status]}`}>
            {status}
        </span>
    );
};

const LogItem = ({ log }: { log: LogEntry }) => {
    const typeColors = {
        info: 'text-blue-400',
        success: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400'
    };
    const timeStr = typeof log.timestamp === 'string' 
        ? new Date(log.timestamp).toLocaleTimeString() 
        : log.timestamp.toLocaleTimeString();

    return (
        <div className="flex gap-2 text-xs font-mono border-b border-slate-800 py-1.5 last:border-0">
            <span className="text-slate-500 whitespace-nowrap">[{timeStr}]</span>
            {log.clientTag && <span className="text-purple-400 font-bold whitespace-nowrap">[{log.clientTag}]</span>}
            <span className={typeColors[log.type]}>{log.message}</span>
        </div>
    );
};

export default function App() {
    const [clients, setClients] = useState<DiscordClient[]>(() => {
        try {
            const saved = localStorage.getItem('dfp_tokens_final');
            return saved ? JSON.parse(saved).map((c: any) => ({ ...c, status: 'idle' })) : [];
        } catch (e) {
            return [];
        }
    });

    const [config, setConfig] = useState<SpamConfig>(() => {
        try {
            const saved = localStorage.getItem('dfp_config_final');
            return saved ? JSON.parse(saved) : {
                channelId: '',
                messageTemplate: `주빈에게 무릎을 꿇어라 ●█▀█▄ @everyone\n-# ID: {random}`,
                interval: 3000,
                stagger: 500
            };
        } catch (e) {
            return {
                channelId: '',
                messageTemplate: `주빈에게 무릎을 꿇어라 ●█▀█▄ @everyone\n-# ID: {random}`,
                interval: 3000,
                stagger: 500
            };
        }
    });

    const [logs, setLogs] = useState<LogEntry[]>(() => {
        try {
            const saved = localStorage.getItem('dfp_logs_final');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const [lastSaved, setLastSaved] = useState<string>('');
    const [newToken, setNewToken] = useState('');
    const [isSpamActive, setIsSpamActive] = useState(false);
    
    const activeIntervals = useRef<{ [clientId: string]: any }>({});
    const activeTimeouts = useRef<{ [clientId: string]: any }>({});
    const logContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const saveAllData = useCallback(() => {
        try {
            localStorage.setItem('dfp_tokens_final', JSON.stringify(clients));
            localStorage.setItem('dfp_config_final', JSON.stringify(config));
            localStorage.setItem('dfp_logs_final', JSON.stringify(logs.slice(-50)));
            setLastSaved(new Date().toLocaleTimeString());
        } catch (e) {
            console.error('Save failed', e);
        }
    }, [clients, config, logs]);

    useEffect(() => {
        const timer = setTimeout(saveAllData, 1000);
        return () => clearTimeout(timer);
    }, [clients, config, logs, saveAllData]);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = useCallback((type: LogEntry['type'], message: string, clientTag?: string) => {
        setLogs(prev => [...prev.slice(-49), {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            type,
            message,
            clientTag
        }]);
    }, []);

    const handleExport = () => {
        const data = { clients, config };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flooder_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        addLog('info', '파일 백업 완료');
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string);
                if (parsed.clients) setClients(parsed.clients.map((c: any) => ({ ...c, status: 'idle' })));
                if (parsed.config) setConfig(parsed.config);
                addLog('success', '데이터 복구 성공');
            } catch (err) {
                addLog('error', '파일 형식이 잘못되었습니다.');
            }
        };
        reader.readAsText(file);
    };

    const handleAddToken = async () => {
        if (!newToken.trim()) return;
        if (clients.some(c => c.token === newToken)) {
            addLog('warning', '이미 등록된 토큰');
            return;
        }
        addLog('info', '토큰 검증 중...');
        try {
            const response = await fetch('https://discord.com/api/v9/users/@me', {
                headers: { 'Authorization': newToken }
            });
            if (!response.ok) throw new Error();
            const data = await response.json();
            setClients(prev => [...prev, {
                id: data.id,
                token: newToken,
                username: data.username,
                tag: `${data.username}#${data.discriminator || '0'}`,
                avatar: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : 'https://www.gravatar.com/avatar/?d=mp',
                status: 'idle'
            }]);
            setNewToken('');
            addLog('success', `등록됨: ${data.username}`);
        } catch (err) {
            addLog('error', '유효하지 않은 토큰');
        }
    };

    const startFlooding = () => {
        if (isSpamActive || clients.length === 0 || !config.channelId) {
            if (!config.channelId) addLog('error', '채널 ID를 입력하세요.');
            if (clients.length === 0) addLog('error', '토큰을 먼저 등록하세요.');
            return;
        }
        setIsSpamActive(true);
        addLog('info', '엔진 가동 시작');

        clients.forEach((client, index) => {
            activeTimeouts.current[client.id] = setTimeout(() => {
                setClients(prev => prev.map(c => c.id === client.id ? { ...c, status: 'running' } : c));
                activeIntervals.current[client.id] = setInterval(async () => {
                    const random = Math.floor(Math.random() * 1000) + 9000;
                    const finalMessage = config.messageTemplate.replace(/{random}/g, random.toString());
                    try {
                        const res = await fetch(`https://discord.com/api/v9/channels/${config.channelId}/messages`, {
                            method: 'POST',
                            headers: { 'Authorization': client.token, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: finalMessage })
                        });
                        if (res.ok) addLog('success', '전송 완료', client.tag);
                        else if (res.status === 429) addLog('warning', '속도 제한(Rate Limit)', client.tag);
                        else addLog('error', `오류 발생: ${res.status}`, client.tag);
                    } catch (e) { addLog('error', '통신 오류', client.tag); }
                }, config.interval);
            }, index * config.stagger);
        });
    };

    const stopFlooding = () => {
        setIsSpamActive(false);
        Object.values(activeTimeouts.current).forEach(clearTimeout);
        Object.values(activeIntervals.current).forEach(clearInterval);
        activeTimeouts.current = {};
        activeIntervals.current = {};
        setClients(prev => prev.map(c => ({ ...c, status: 'idle' })));
        addLog('warning', '엔진 정지');
    };

    return (
        <div className="max-w-7xl mx-auto p-4 lg:p-10 flex flex-col gap-8 min-h-screen">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl relative overflow-hidden">
                <div className="flex items-center gap-5 z-10">
                    <div className="bg-orange-600 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-orange-900/40 text-white animate-pulse">
                        <i className="fa-solid fa-bolt"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-white uppercase">Flooder <span className="text-orange-500">Pro</span></h1>
                        <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                           Local Storage Protected
                        </p>
                    </div>
                </div>
                <button 
                    onClick={isSpamActive ? stopFlooding : startFlooding}
                    className={`w-full md:w-56 py-5 rounded-2xl font-black text-xl transition-all transform active:scale-95 shadow-2xl ${
                        isSpamActive ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                    }`}
                >
                    {isSpamActive ? 'STOP ENGINE' : 'START ENGINE'}
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
                <div className="lg:col-span-4 flex flex-col gap-8">
                    <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
                        <h2 className="text-base font-black mb-5 text-orange-400 uppercase flex items-center gap-3">
                            <i className="fa-solid fa-key"></i> Add Access Token
                        </h2>
                        <div className="flex gap-2">
                            <input 
                                type="text" value={newToken} onChange={(e) => setNewToken(e.target.value)}
                                placeholder="디스코드 토큰 입력"
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500"
                            />
                            <button onClick={handleAddToken} className="bg-orange-600 hover:bg-orange-500 text-white px-5 rounded-xl transition-colors">
                                <i className="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-base font-black text-orange-400 uppercase flex items-center gap-3">
                                <i className="fa-solid fa-sliders"></i> Configuration
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={saveAllData} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-white transition-all" title="수동 저장">
                                    <i className="fa-solid fa-floppy-disk"></i>
                                </button>
                                <button onClick={handleExport} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-white transition-all" title="백업 다운로드">
                                    <i className="fa-solid fa-download"></i>
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-white transition-all" title="백업 불러오기">
                                    <i className="fa-solid fa-upload"></i>
                                </button>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Target Channel ID</label>
                                <input type="text" value={config.channelId} onChange={(e) => setConfig({ ...config, channelId: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-orange-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Interval (ms)</label>
                                    <input type="number" value={config.interval} onChange={(e) => setConfig({ ...config, interval: parseInt(e.target.value) || 0 })} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-orange-500" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Stagger (ms)</label>
                                    <input type="number" value={config.stagger} onChange={(e) => setConfig({ ...config, stagger: parseInt(e.target.value) || 0 })} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-orange-500" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Message Payload</label>
                                <textarea rows={4} value={config.messageTemplate} onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white font-mono focus:outline-none focus:border-orange-500" />
                            </div>
                            <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                                <span className="text-[9px] text-slate-600 font-mono uppercase tracking-tighter">Auto-Saved: {lastSaved || 'Wait...'}</span>
                                <div className="text-[9px] text-green-600 font-bold uppercase">Ready</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl flex flex-col max-h-[700px]">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="text-base font-black text-orange-400 uppercase flex items-center gap-3">
                            <i className="fa-solid fa-network-wired"></i> Units
                        </h2>
                        <span className="text-xs bg-orange-500 text-white px-3 py-1 rounded-full font-black">
                            {clients.length} ONLINE
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                        {clients.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                                <i className="fa-solid fa-ghost text-4xl mb-3"></i>
                                <p className="text-sm">No units found.</p>
                            </div>
                        ) : (
                            clients.map(client => (
                                <div key={client.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-700 flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <img src={client.avatar} className="w-10 h-10 rounded-xl border border-slate-700" alt="" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-200">{client.username}</span>
                                            <span className="text-[9px] text-slate-500 font-mono">{client.token.substring(0, 10)}...</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <StatusBadge status={client.status} />
                                        <button onClick={() => setClients(prev => prev.filter(c => c.id !== client.id))} className="opacity-0 group-hover:opacity-100 text-red-500 hover:scale-110 transition-all">
                                            <i className="fa-solid fa-circle-xmark"></i>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-inner flex flex-col max-h-[700px]">
                    <div className="flex justify-between items-center mb-5">
                        <h2 className="text-base font-black text-green-500 uppercase flex items-center gap-3">
                            <i className="fa-solid fa-terminal"></i> Console
                        </h2>
                        <button onClick={() => setLogs([])} className="text-[10px] text-slate-700 hover:text-white uppercase font-bold tracking-widest underline">Reset</button>
                    </div>
                    <div ref={logContainerRef} className="flex-1 overflow-y-auto pr-2 space-y-1.5 custom-scrollbar font-mono">
                        {logs.length === 0 ? (
                            <div className="text-slate-800 text-xs italic">System monitoring active...</div>
                        ) : (
                            logs.map(log => <LogItem key={log.id} log={log} />)
                        )}
                    </div>
                </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            <footer className="text-center py-6 opacity-40">
                <p className="text-[9px] font-mono tracking-[0.4em] uppercase">Flooder Pro Persistence Manager // v2.3 Stable</p>
            </footer>
        </div>
    );
}
