
export interface DiscordClient {
    id: string;
    token: string;
    username: string;
    avatar?: string;
    tag?: string;
    status: 'idle' | 'running' | 'error';
}

export interface LogEntry {
    id: string;
    timestamp: Date;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    clientTag?: string;
}

export interface SpamConfig {
    channelId: string;
    messageTemplate: string;
    interval: number;
    stagger: number;
}
