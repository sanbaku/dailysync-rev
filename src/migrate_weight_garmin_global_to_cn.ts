import { migrateGarminWeightByDateRange } from './utils/garmin_weight';
import { getGaminCNClient } from './utils/garmin_cn';
import { getGaminGlobalClient } from './utils/garmin_global';

(async () => {
    await migrateGarminWeightByDateRange(await getGaminGlobalClient(), await getGaminCNClient());
})().catch(error => { console.error(error); process.exitCode = 1; });
