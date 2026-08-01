import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

// GTFSは事業者ごとにデータを分けて管理できるよう、全テーブルに agency_key を持たせる。
// 同じstop_idが事業者間で衝突するのを避けるための実務上の工夫。
//
// 注意: tsx(esbuild)はTypeORMのデコレータメタデータ推測(reflect-metadata経由の
// 自動型推測)を完全にはサポートしないため、すべてのカラムで型を明示指定している。

@Entity('gtfs_stops')
export class GtfsStop {
  @PrimaryColumn('varchar') agency_key!: string; // 例: 'tokushima_city', 'yonkoh'
  @PrimaryColumn('varchar') stop_id!: string;

  @Column('varchar') stop_name!: string;
  @Column('double precision') stop_lat!: number;
  @Column('double precision') stop_lon!: number;
}

@Entity('gtfs_routes')
export class GtfsRoute {
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') route_id!: string;

  @Column('varchar', { nullable: true }) route_short_name?: string;
  @Column('varchar', { nullable: true }) route_long_name?: string;
}

@Entity('gtfs_trips')
@Index(['agency_key', 'route_id'])
export class GtfsTrip {
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') trip_id!: string;

  @Column('varchar') route_id!: string;
  @Column('varchar') service_id!: string;
}

@Entity('gtfs_stop_times')
@Index(['agency_key', 'stop_id'])
export class GtfsStopTime {
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') trip_id!: string;
  @PrimaryColumn('int') stop_sequence!: number;

  @Column('varchar') stop_id!: string;
  @Column('varchar') departure_time!: string; // GTFSは "25:30:00" のような24時超え表記があるので文字列のまま保持
  @Column('varchar') arrival_time!: string;
}

@Entity('gtfs_calendar')
export class GtfsCalendar {
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') service_id!: string;

  @Column('boolean') monday!: boolean;
  @Column('boolean') tuesday!: boolean;
  @Column('boolean') wednesday!: boolean;
  @Column('boolean') thursday!: boolean;
  @Column('boolean') friday!: boolean;
  @Column('boolean') saturday!: boolean;
  @Column('boolean') sunday!: boolean;
  @Column('varchar') start_date!: string; // YYYYMMDD
  @Column('varchar') end_date!: string;
}

// calendar_dates.txt: 祝日・年末年始など「その日だけ特別な運行」を表す例外データ。
// exception_type: 1=その日だけ追加で運行, 2=その日だけ運休（通常の曜日パターンを上書きする）
@Entity('gtfs_calendar_dates')
export class GtfsCalendarDate {
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') service_id!: string;
  @PrimaryColumn('varchar') date!: string; // YYYYMMDD

  @Column('int') exception_type!: number;
}

// 札所⇔最寄り停留所のマッピングは、GTFS由来ではなく自前で管理するテーブル
@Entity('temple_stop_links')
export class TempleStopLink {
  @PrimaryColumn('int') temple_no!: number;
  @PrimaryColumn('varchar') agency_key!: string;
  @PrimaryColumn('varchar') stop_id!: string;

  @Column('double precision') distance_m!: number; // 札所から停留所までの徒歩距離(概算)
}
