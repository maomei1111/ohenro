import { MigrationInterface, QueryRunner } from 'typeorm';

// 有料公開時のlegacy_paid購入者・将来の買い切りPro購入者の権利を保持するテーブル。
// docs/PAID_LAUNCH_AND_GOSHUIN_LIST_SPEC.md 3章。ログイン機能が無いアプリのため、
// recovery_code(引継ぎコード)をアプリ側からの検索キーとして使う。
// このアプリの既存テーブルはUUID拡張(pgcrypto等)を使っていないため、他テーブルと合わせて
// 素朴なSERIAL主キーにする(拡張の有効化状況に依存させないため)。
export class AddEntitlements1787979119172 implements MigrationInterface {
  name = 'AddEntitlements1787979119172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "entitlements" (
        "id" SERIAL NOT NULL,
        "recovery_code" character varying NOT NULL,
        "entitlement_type" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "purchase_token" character varying,
        "product_id" character varying,
        "note" character varying,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_verified_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz,
        CONSTRAINT "PK_entitlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_entitlements_recovery_code" UNIQUE ("recovery_code"),
        CONSTRAINT "UQ_entitlements_purchase_token" UNIQUE ("purchase_token")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "entitlements"`);
  }
}
