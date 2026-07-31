import { Entity, PrimaryColumn, Column } from 'typeorm';

// Overpass(OpenStreetMap)から事前取得した周辺施設データのキャッシュ。
// OSMのノードIDを主キーとして、重複取り込みしても upsert で綺麗に上書きされるようにする。
@Entity('cached_landmarks')
export class CachedLandmark {
  @PrimaryColumn('bigint') osm_id!: string;

  @Column('double precision') lat!: number;
  @Column('double precision') lng!: number;
  @Column('varchar') name!: string;
  @Column('jsonb') tags!: Record<string, string>;
}
