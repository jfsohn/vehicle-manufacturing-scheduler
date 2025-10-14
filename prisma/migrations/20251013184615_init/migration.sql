-- CreateTable
CREATE TABLE "Workcenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "leadTimeMins" INTEGER NOT NULL,
    "workcenterId" TEXT NOT NULL,
    CONSTRAINT "Part_workcenterId_fkey" FOREIGN KEY ("workcenterId") REFERENCES "Workcenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "BomItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BomItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "unitIndex" INTEGER NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "workcenterId" TEXT NOT NULL,
    CONSTRAINT "Schedule_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_workcenterId_fkey" FOREIGN KEY ("workcenterId") REFERENCES "Workcenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workcenter_name_key" ON "Workcenter"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Part_name_workcenterId_key" ON "Part"("name", "workcenterId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_sku_key" ON "Vehicle"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_vehicleId_partId_key" ON "BomItem"("vehicleId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_orderId_partId_unitIndex_key" ON "Schedule"("orderId", "partId", "unitIndex");
