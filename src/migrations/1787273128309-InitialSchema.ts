import { MigrationInterface, QueryRunner } from 'typeorm';

// これまで synchronize: true が自動生成していたスキーマを、初回のベースラインmigrationとして
// 明示的に定義したもの(src/entities/gtfs.entities.ts, src/entities/landmark.entities.tsの
// 現行定義と一致させている)。
//
// 本番DBはこのmigration導入時点で既に synchronize によりテーブルが存在しているため、
// CREATE TABLE / CREATE INDEX はすべて IF NOT EXISTS を付け、既存環境では実質no-opになる
// ようにしてある。新規の空DBに対してはこのmigrationだけで全テーブルを作成できる
// (docs/PRODUCTION_RELEASE_CHECKLIST.md 5.1)。
//
// 注意: gtfs_trips / gtfs_stop_times の複合indexは、synchronizeが自動生成した既存の
// indexとは別名(IDX_gtfs_trips_agency_route / IDX_gtfs_stop_times_agency_stop)で
// 作成される。TypeORMの自動命名(ハッシュ生成)を確実に再現する手段がないための妥協で、
// 既存DBには重複したindexが残る可能性がある。実害はない(冗長なindexが増えるだけ)が、
// 気になる場合は `\d gtfs_trips` 等で重複を確認し、片方を手動でDROPしてよい。
//
// down()はテーブルを完全に削除する破壊的操作。本番での実行前には必ずバックアップを取ること。
export class InitialSchema1787273128309 implements MigrationInterface {
  name = 'InitialSchema1787273128309';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_stops" (
        "agency_key" character varying NOT NULL,
        "stop_id" character varying NOT NULL,
        "stop_name" character varying NOT NULL,
        "stop_lat" double precision NOT NULL,
        "stop_lon" double precision NOT NULL,
        CONSTRAINT "PK_gtfs_stops" PRIMARY KEY ("agency_key", "stop_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_routes" (
        "agency_key" character varying NOT NULL,
        "route_id" character varying NOT NULL,
        "route_short_name" character varying,
        "route_long_name" character varying,
        CONSTRAINT "PK_gtfs_routes" PRIMARY KEY ("agency_key", "route_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_trips" (
        "agency_key" character varying NOT NULL,
        "trip_id" character varying NOT NULL,
        "route_id" character varying NOT NULL,
        "service_id" character varying NOT NULL,
        "shape_id" character varying,
        CONSTRAINT "PK_gtfs_trips" PRIMARY KEY ("agency_key", "trip_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gtfs_trips_agency_route"
        ON "gtfs_trips" ("agency_key", "route_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_shapes" (
        "agency_key" character varying NOT NULL,
        "shape_id" character varying NOT NULL,
        "shape_pt_sequence" integer NOT NULL,
        "shape_pt_lat" double precision NOT NULL,
        "shape_pt_lon" double precision NOT NULL,
        CONSTRAINT "PK_gtfs_shapes" PRIMARY KEY ("agency_key", "shape_id", "shape_pt_sequence")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_stop_times" (
        "agency_key" character varying NOT NULL,
        "trip_id" character varying NOT NULL,
        "stop_sequence" integer NOT NULL,
        "stop_id" character varying NOT NULL,
        "departure_time" character varying NOT NULL,
        "arrival_time" character varying NOT NULL,
        CONSTRAINT "PK_gtfs_stop_times" PRIMARY KEY ("agency_key", "trip_id", "stop_sequence")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gtfs_stop_times_agency_stop"
        ON "gtfs_stop_times" ("agency_key", "stop_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_calendar" (
        "agency_key" character varying NOT NULL,
        "service_id" character varying NOT NULL,
        "monday" boolean NOT NULL,
        "tuesday" boolean NOT NULL,
        "wednesday" boolean NOT NULL,
        "thursday" boolean NOT NULL,
        "friday" boolean NOT NULL,
        "saturday" boolean NOT NULL,
        "sunday" boolean NOT NULL,
        "start_date" character varying NOT NULL,
        "end_date" character varying NOT NULL,
        CONSTRAINT "PK_gtfs_calendar" PRIMARY KEY ("agency_key", "service_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_calendar_dates" (
        "agency_key" character varying NOT NULL,
        "service_id" character varying NOT NULL,
        "date" character varying NOT NULL,
        "exception_type" integer NOT NULL,
        CONSTRAINT "PK_gtfs_calendar_dates" PRIMARY KEY ("agency_key", "service_id", "date")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_fare_attributes" (
        "agency_key" character varying NOT NULL,
        "fare_id" character varying NOT NULL,
        "price" double precision NOT NULL,
        "currency_type" character varying NOT NULL,
        CONSTRAINT "PK_gtfs_fare_attributes" PRIMARY KEY ("agency_key", "fare_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gtfs_fare_rules" (
        "agency_key" character varying NOT NULL,
        "fare_id" character varying NOT NULL,
        "route_id" character varying NOT NULL DEFAULT '',
        CONSTRAINT "PK_gtfs_fare_rules" PRIMARY KEY ("agency_key", "fare_id", "route_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "temple_stop_links" (
        "temple_no" integer NOT NULL,
        "agency_key" character varying NOT NULL,
        "stop_id" character varying NOT NULL,
        "distance_m" double precision NOT NULL,
        "walk_route" jsonb,
        CONSTRAINT "PK_temple_stop_links" PRIMARY KEY ("temple_no", "agency_key", "stop_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cached_landmarks" (
        "osm_id" bigint NOT NULL,
        "lat" double precision NOT NULL,
        "lng" double precision NOT NULL,
        "name" character varying NOT NULL,
        "tags" jsonb NOT NULL,
        CONSTRAINT "PK_cached_landmarks" PRIMARY KEY ("osm_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cached_landmarks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "temple_stop_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_fare_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_fare_attributes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_calendar_dates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_calendar"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gtfs_stop_times_agency_stop"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_stop_times"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_shapes"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_gtfs_trips_agency_route"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_trips"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_routes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gtfs_stops"`);
  }
}
