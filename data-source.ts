import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  GtfsStop,
  GtfsRoute,
  GtfsTrip,
  GtfsStopTime,
  GtfsCalendar,
  TempleStopLink,
} from './entities/gtfs.entities';

/**
 * ローカル開発時: PGHOST/PGUSER/PGPASSWORD/PGDATABASE の個別環境変数を使用
 * クラウド(Railway等)時: DATABASE_URL 1本の接続文字列を使用（プラットフォーム側が自動で払い出す）
 */
export const AppDataSource = process.env.DATABASE_URL
  ? new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Railway等のマネージドPostgresはSSL必須なことが多い
      entities: [GtfsStop, GtfsRoute, GtfsTrip, GtfsStopTime, GtfsCalendar, TempleStopLink],
      synchronize: true, // 開発用。本番ではmigrationに置き換える
    })
  : new DataSource({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: process.env.PGDATABASE ?? 'ohenro',
      entities: [GtfsStop, GtfsRoute, GtfsTrip, GtfsStopTime, GtfsCalendar, TempleStopLink],
      synchronize: true,
    });
