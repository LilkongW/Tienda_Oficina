-- Stable IDs make queued client inserts safe to retry after a timeout.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS sync_uid UUID DEFAULT gen_random_uuid();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS sync_uid UUID DEFAULT gen_random_uuid();
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS sync_uid UUID DEFAULT gen_random_uuid();
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS sync_uid UUID DEFAULT gen_random_uuid();

UPDATE productos SET sync_uid = gen_random_uuid() WHERE sync_uid IS NULL;
UPDATE clientes SET sync_uid = gen_random_uuid() WHERE sync_uid IS NULL;
UPDATE ventas SET sync_uid = gen_random_uuid() WHERE sync_uid IS NULL;
UPDATE detalle_venta SET sync_uid = gen_random_uuid() WHERE sync_uid IS NULL;

ALTER TABLE productos ALTER COLUMN sync_uid SET NOT NULL;
ALTER TABLE clientes ALTER COLUMN sync_uid SET NOT NULL;
ALTER TABLE ventas ALTER COLUMN sync_uid SET NOT NULL;
ALTER TABLE detalle_venta ALTER COLUMN sync_uid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS productos_sync_uid_key ON productos(sync_uid);
CREATE UNIQUE INDEX IF NOT EXISTS clientes_sync_uid_key ON clientes(sync_uid);
CREATE UNIQUE INDEX IF NOT EXISTS ventas_sync_uid_key ON ventas(sync_uid);
CREATE UNIQUE INDEX IF NOT EXISTS detalle_venta_sync_uid_key ON detalle_venta(sync_uid);
