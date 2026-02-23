-- CreateTable
CREATE TABLE "SyncTable" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "dbNombreTabla" TEXT NOT NULL,
    "urlTablaSISPRO" TEXT NOT NULL,
    "fechaActualizacion" TEXT NOT NULL,
    "lastSyncedAt" DATETIME,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "estadoEntidad" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReferenceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tableName" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "creationDateTime" TEXT,
    "lastUpdateDateTime" TEXT,
    "extraI" TEXT,
    "extraII" TEXT,
    "extraIII" TEXT,
    "extraIV" TEXT,
    "extraV" TEXT,
    "extraVI" TEXT,
    "extraVII" TEXT,
    "extraVIII" TEXT,
    "extraIX" TEXT,
    "extraX" TEXT,
    "valor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncTable_nombre_key" ON "SyncTable"("nombre");

-- CreateIndex
CREATE INDEX "ReferenceRecord_tableName_idx" ON "ReferenceRecord"("tableName");

-- CreateIndex
CREATE INDEX "ReferenceRecord_codigo_idx" ON "ReferenceRecord"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceRecord_tableName_externalId_key" ON "ReferenceRecord"("tableName", "externalId");
