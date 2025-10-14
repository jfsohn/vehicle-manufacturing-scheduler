"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrisma = getPrisma;
const client_1 = require("@prisma/client");
let prismaSingleton = null;
function getPrisma() {
    if (!prismaSingleton) {
        prismaSingleton = new client_1.PrismaClient();
    }
    return prismaSingleton;
}
