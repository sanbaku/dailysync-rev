import axios from 'axios';

import { BARK_KEY_DEFAULT } from './constant';
import { syncAllGarminGlobal2GarminCN } from './utils/garmin_global';

const intervalHours = Math.max(1, Number(process.env.GARMIN_SYNC_INTERVAL_HOURS ?? '2'));
const intervalMs = intervalHours * 60 * 60 * 1000;
const barkKey = process.env.BARK_KEY ?? BARK_KEY_DEFAULT;
let stopping = false;

const notifyFailure = async (error: any): Promise<void> => {
    if (!barkKey) return;
    const message = encodeURIComponent(error?.message ?? String(error));
    await axios.get(`https://api.day.app/${barkKey}/Garmin同步失败/${message}`).catch(() => {});
};

const runOnce = async (): Promise<void> => {
    const startedAt = new Date().toISOString();
    console.log(`Garmin daemon: sync started at ${startedAt}`);
    try {
        await syncAllGarminGlobal2GarminCN();
        console.log(`Garmin daemon: sync finished; next run in ${intervalHours} hour(s)`);
    } catch (error) {
        console.error('Garmin daemon: sync failed; will retry on the next interval', error);
        await notifyFailure(error);
    }
};

const main = async (): Promise<void> => {
    console.log(`Garmin daemon started; interval=${intervalHours} hour(s)`);
    while (!stopping) {
        await runOnce();
        if (stopping) break;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    console.log('Garmin daemon stopped');
};

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

main().catch(async error => {
    console.error('Garmin daemon: fatal error', error);
    await notifyFailure(error);
    process.exitCode = 1;
});
