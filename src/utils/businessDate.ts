import prisma from './prisma';

/**
 * Format a Date object as YYYY-MM-DD in Egypt timezone (Africa/Cairo).
 */
export function formatCairoDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date(date));
}

/**
 * Resolves the active operating business date for a restaurant.
 * Rule: As long as the day has NOT been closed (active shift has unclosed orders or expenses with closureId: null),
 * the day stays continuous and does NOT change after 12 midnight!
 */
export async function resolveActiveBusinessDate(restaurantId: string): Promise<string> {
  // 1. Look for the earliest unclosed order in the active shift
  const firstUnclosedOrder = await prisma.order.findFirst({
    where: {
      restaurantId,
      closureId: null,
      status: { not: 'CANCELLED' }
    },
    orderBy: { createdAt: 'asc' },
    select: { businessDate: true, createdAt: true }
  });

  if (firstUnclosedOrder) {
    if (firstUnclosedOrder.businessDate) {
      return firstUnclosedOrder.businessDate;
    }
    return formatCairoDate(firstUnclosedOrder.createdAt);
  }

  // 2. Look for the earliest unclosed expense in the active shift
  const firstUnclosedExpense = await prisma.expense.findFirst({
    where: {
      restaurantId,
      closureId: null
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true }
  });

  if (firstUnclosedExpense) {
    return formatCairoDate(firstUnclosedExpense.createdAt);
  }

  // 3. No unclosed transactions: the shift starts on current Cairo date
  return formatCairoDate(new Date());
}
