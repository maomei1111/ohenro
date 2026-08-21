import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import {
  GtfsStop,
  GtfsRoute,
  GtfsTrip,
  GtfsStopTime,
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsFareAttribute,
  GtfsFareRule,
  GtfsShapePoint,
  TempleStopLink,
} from './entities/gtfs.entities';
import { CachedLandmark } from './entities/landmark.entities';

const ENTITIES = [
  GtfsStop,
  GtfsRoute,
  GtfsTrip,
  GtfsStopTime,
  GtfsCalendar,
  GtfsCalendarDate,
  GtfsFareAttribute,
  GtfsFareRule,
  GtfsShapePoint,
  TempleStopLink,
  CachedLandmark,
];

// マイグレーションファイル本体はsrc/migrationsに置く。このプロジェクトはビルドせず
// tsx(ランタイムでのTypeScript実行)でsrc配下を直接動かすため、distではなくsrc基準の
// グロブでよい(CLIから使う場合もnode -r tsx/cjsで読み込む。package.jsonのスクリプト参照)。
const MIGRATIONS = [path.join(__dirname, 'migrations', '*.{ts,js}')];

/**
 * ローカル開発時: PGHOST/PGUSER/PGPASSWORD/PGDATABASE の個別環境変数を使用
 * クラウド(Railway等)時: DATABASE_URL 1本の接続文字列を使用（プラットフォーム側が自動で払い出す）
 *
 * synchronizeは本番・開発とも常にfalse。DB構造の変更は必ずmigrationファイルを介して行う
 * (docs/PRODUCTION_RELEASE_CHECKLIST.md 5.1)。起動時のmigration実行はsrc/server.ts側で
 * 明示的に行い、失敗時はアプリを起動しない。
 */
export const AppDataSource = process.env.DATABASE_URL
  ? new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Railway等のマネージドPostgresはSSL必須なことが多い
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: false,
    })
  : new DataSource({
      type: 'postgres',
      host: process.env.PGHOST ?? 'localhost',
      port: Number(process.env.PGPORT ?? 5432),
      username: process.env.PGUSER ?? 'postgres',
      password: process.env.PGPASSWORD ?? 'postgres',
      database: process.env.PGDATABASE ?? 'ohenro',
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: false,
    });