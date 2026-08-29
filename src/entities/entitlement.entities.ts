import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

// 有料版購入者(legacy_paid)・将来の買い切りPro購入者(pro_one_time)の権利を保持する。
// ログイン機能が無いアプリのため、recovery_code(引継ぎコード)を主要な検索キーとして使う
// (docs/PAID_LAUNCH_AND_GOSHUIN_LIST_SPEC.md 3章)。
@Entity('entitlements')
export class Entitlement {
  @PrimaryGeneratedColumn() id!: number;

  @Column('varchar') recovery_code!: string;
  @Column('varchar') entitlement_type!: 'legacy_paid' | 'pro_one_time';
  @Column('varchar', { default: 'active' }) status!: 'active' | 'revoked';

  // pro_one_timeのみ使用。Google Playの購入トークン/商品ID。
  @Column('varchar', { nullable: true }) purchase_token!: string | null;
  @Column('varchar', { nullable: true }) product_id!: string | null;

  // 管理者登録時のメモ(問い合わせ番号など)。
  @Column('varchar', { nullable: true }) note!: string | null;

  @Column('timestamptz') created_at!: Date;
  @Column('timestamptz') last_verified_at!: Date;
  @Column('timestamptz', { nullable: true }) revoked_at!: Date | null;
}
