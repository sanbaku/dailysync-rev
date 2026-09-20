import { GARMIN_WEIGHT_MIGRATE_DAYS_DEFAULT, GARMIN_WEIGHT_MIGRATE_START_DAYS_DEFAULT, GARMIN_WEIGHT_SYNC_DAYS_DEFAULT, GARMIN_SYNC_WEIGHT_DEFAULT } from '../constant';
import { GarminClientType } from './type';

type WeightRecord = { calendarDate?: string; date?: number; timestampGMT?: number; weight?: number };
const envOrDefault = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;
const enabled = ['true', '1', 'yes'].includes(envOrDefault('GARMIN_SYNC_WEIGHT', GARMIN_SYNC_WEIGHT_DEFAULT).toLowerCase());
const syncDays = Math.max(1, Number(envOrDefault('GARMIN_WEIGHT_SYNC_DAYS', GARMIN_WEIGHT_SYNC_DAYS_DEFAULT)) || 1);
const migrateDays = Math.max(0, Number(envOrDefault('GARMIN_WEIGHT_MIGRATE_DAYS', GARMIN_WEIGHT_MIGRATE_DAYS_DEFAULT)) || 0);
const migrateStart = Math.max(0, Number(envOrDefault('GARMIN_WEIGHT_MIGRATE_START_DAYS', GARMIN_WEIGHT_MIGRATE_START_DAYS_DEFAULT)) || 0);
const GRAMS_PER_POUND = 453.59237;

const datesByOffset = (startDaysAgo: number, days: number): string[] => {
    const dates: string[] = [];
    for (let i = 0; i < Math.max(1, days); i++) {
        const date = new Date();
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() - startDaysAgo - i);
        dates.push(date.toISOString().slice(0, 10));
    }
    return dates;
};

const getRange = async (client: GarminClientType, dates: string[]): Promise<WeightRecord[]> => {
    if (!dates.length) return [];
    const url = `${client.url.GC_API}/weight-service/weight/dateRange`;
    const data = await client.client.get(url, { params: { startDate: dates[dates.length - 1], endDate: dates[0] } });
    return Array.isArray(data?.dateWeightList) ? data.dateWeightList : [];
};

const key = (record: WeightRecord): string => `${record.calendarDate ?? ''}|${Math.round(Number(record.weight ?? 0))}`;

const upload = async (client: GarminClientType, record: WeightRecord): Promise<void> => {
    const grams = Number(record.weight);
    if (!Number.isFinite(grams) || grams <= 0) return;
    const timestampGMT = Number(record.timestampGMT ?? record.date ?? Date.now());
    const url = `${client.url.GC_API}/weight-service/user-weight`;
    const local = new Date(timestampGMT + 8 * 60 * 60 * 1000).toISOString().slice(0, 23);
    await client.client.post(url, {
        dateTimestamp: local,
        gmtTimestamp: new Date(timestampGMT).toISOString().slice(0, 23),
        unitKey: 'lbs',
        value: grams / GRAMS_PER_POUND,
    });
};

export const syncGarminWeightByDates = async (source: GarminClientType, target: GarminClientType, dates: string[]): Promise<void> => {
    if (!enabled) { console.log('Garmin weight: disabled by GARMIN_SYNC_WEIGHT'); return; }
    const sourceRecords = await getRange(source, dates);
    const targetKeys = new Set((await getRange(target, dates)).map(key));
    let uploaded = 0;
    let duplicate = 0;
    for (const record of sourceRecords) {
        const recordKey = key(record);
        if (targetKeys.has(recordKey)) { duplicate++; continue; }
        try {
            await upload(target, record);
            uploaded++;
            targetKeys.add(recordKey);
            console.log(`Garmin weight: uploaded ${record.calendarDate ?? 'unknown'} ${Math.round(Number(record.weight) / 10) / 100}kg`);
        } catch (error: any) {
            if (String(error?.message ?? error).includes('409')) { duplicate++; continue; }
            throw error;
        }
    }
    console.log(`Garmin weight: dates=${dates.length}, source=${sourceRecords.length}, uploaded=${uploaded}, duplicate=${duplicate}`);
};

export const syncGarminWeightRecentDays = async (source: GarminClientType, target: GarminClientType): Promise<void> => {
    await syncGarminWeightByDates(source, target, datesByOffset(0, syncDays));
};

export const migrateGarminWeightByDateRange = async (source: GarminClientType, target: GarminClientType): Promise<void> => {
    if (migrateDays <= 0) { console.log('Garmin weight migrate: skipped, set GARMIN_WEIGHT_MIGRATE_DAYS to enable'); return; }
    const dates = datesByOffset(migrateStart, migrateDays);
    console.log(`Garmin weight migrate: start, days=${migrateDays}, startDaysAgo=${migrateStart}, first=${dates[0]}, last=${dates[dates.length - 1]}`);
    await syncGarminWeightByDates(source, target, dates);
};
