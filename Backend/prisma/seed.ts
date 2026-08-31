import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_THRESHOLDS = {
  minAmountEnabled: true,
  minAmount: 10000,
  reviewThreshold: 60,
  blockThreshold: 85,
};

interface SeedUser {
  userId: string;
  country: string;
  categories: string[];
  merchants: string[];
  channel: string;
  device: string;
  avgAmount: number;
  hourRange: [number, number];
  historyCount: number;
  // Si esta presente, se generan tambien campos estilo PaySim (operation_type
  // + saldos origen/destino consistentes) para simular una billetera/cuenta con saldo.
  wallet?: { startingBalance: number };
}

// Mismos user_id que usa el prototipo de dashboard (Frontend/src/App.jsx),
// para que la demo se sienta continua entre historial sembrado y UI existente.
const USERS: SeedUser[] = [
  {
    userId: 'usr_01H8M2',
    country: 'Argentina',
    categories: ['Electronica'],
    merchants: ['TechStore Argentina'],
    channel: 'E-commerce',
    device: 'iPhone-Safari-A1',
    avgAmount: 42000,
    hourRange: [10, 21],
    historyCount: 28,
  },
  {
    userId: 'usr_01G4P9',
    country: 'Argentina',
    categories: ['Viajes'],
    merchants: ['Viajes Mundo'],
    channel: 'Web',
    device: 'Chrome-Windows-B2',
    avgAmount: 95000,
    hourRange: [9, 19],
    historyCount: 16,
  },
  {
    userId: 'usr_01J7B3',
    country: 'Argentina',
    categories: ['Kiosco'],
    merchants: ['Kiosco 24'],
    channel: 'POS',
    device: 'POS-Terminal-1',
    avgAmount: 8500,
    hourRange: [7, 23],
    historyCount: 34,
  },
  {
    userId: 'usr_01C2L8',
    country: 'Argentina',
    categories: ['Supermercado'],
    merchants: ['Supermercados DIA'],
    channel: 'POS',
    device: 'Android-App-C3',
    avgAmount: 68000,
    hourRange: [9, 20],
    historyCount: 30,
  },
  {
    userId: 'usr_01K5T1',
    country: 'Argentina',
    categories: ['Electrodomesticos'],
    merchants: ['ElectroHome'],
    channel: 'E-commerce',
    device: 'Chrome-macOS-D4',
    avgAmount: 150000,
    hourRange: [11, 22],
    historyCount: 2, // historial insuficiente a proposito, para demostrar ese caso
  },
  {
    userId: 'usr_01E9R4',
    country: 'Argentina',
    categories: ['Farmacia'],
    merchants: ['Farmacity'],
    channel: 'POS',
    device: 'Android-App-E5',
    avgAmount: 21000,
    hourRange: [8, 21],
    historyCount: 25,
  },
  {
    // Cuenta de billetera virtual: historial con campos estilo PaySim
    // (operation_type=TRANSFER + saldos consistentes) para probar esas senales.
    userId: 'usr_01W3F7',
    country: 'Argentina',
    categories: ['Billetera virtual'],
    merchants: ['Wallet P2P'],
    channel: 'App',
    device: 'Android-App-W7',
    avgAmount: 30000,
    hourRange: [8, 22],
    historyCount: 20,
    wallet: { startingBalance: 500000 },
  },
];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log('Sembrando configuracion de umbrales por defecto...');
  await prisma.thresholdConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULT_THRESHOLDS, updatedBy: 'seed' },
  });

  console.log('Sembrando transacciones historicas...');
  let created = 0;

  for (const user of USERS) {
    let walletBalance = user.wallet?.startingBalance ?? 0;

    for (let i = 0; i < user.historyCount; i++) {
      const daysAgo = randomBetween(1, 60);
      const hour = Math.floor(randomBetween(user.hourRange[0], user.hourRange[1]));
      const timestamp = new Date();
      timestamp.setDate(timestamp.getDate() - Math.floor(daysAgo));
      timestamp.setHours(hour, Math.floor(randomBetween(0, 59)), 0, 0);

      const amount = Math.round(user.avgAmount * randomBetween(0.75, 1.25));
      const score = Math.round(randomBetween(5, 25));

      // Para la cuenta billetera generamos saldos consistentes (oldBalance - amount = newBalance),
      // igual que una operacion TRANSFER legitima en PaySim.
      let walletFields = {};
      if (user.wallet) {
        const oldBalanceOrig = walletBalance;
        const newBalanceOrig = Math.max(0, oldBalanceOrig - amount);
        walletBalance = newBalanceOrig;
        const oldBalanceDest = Math.round(randomBetween(10000, 200000));
        walletFields = {
          operationType: 'TRANSFER',
          nameOrig: user.userId,
          oldBalanceOrig,
          newBalanceOrig,
          nameDest: `dest-${Math.floor(randomBetween(1000, 9999))}`,
          oldBalanceDest,
          newBalanceDest: oldBalanceDest + amount,
        };
      }

      await prisma.transaction.create({
        data: {
          externalId: `seed-${user.userId}-${i}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          userId: user.userId,
          timestamp,
          amount,
          currency: 'ARS',
          category: pick(user.categories),
          merchant: pick(user.merchants),
          country: user.country,
          channel: user.channel,
          deviceId: user.device,
          ...walletFields,
          riskScore: score,
          riskLevel: 'bajo',
          decision: 'aprobar',
          analyzedByModel: true,
          status: 'analizada',
          ruleApplied: 'riesgo_bajo',
          factors: JSON.stringify([{ code: 'habitual_pattern', label: 'Patron habitual del usuario', points: score }]),
          historySummary: null,
          thresholdSnapshot: JSON.stringify(DEFAULT_THRESHOLDS),
        },
      });
      created++;
    }
  }

  console.log(`Listo: ${created} transacciones historicas creadas para ${USERS.length} usuarios.`);
  console.log('Usuarios disponibles para probar la API:', USERS.map((u) => u.userId).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
