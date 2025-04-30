import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(import.meta.dirname, '../.env') });
