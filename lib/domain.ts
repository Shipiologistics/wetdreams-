export const FREE_MESSAGE_LIMIT = 10;

export function shouldChargeMessage(messageCount: number, receiverAllowsFreeChat: boolean, rate: number) {
  return messageCount >= FREE_MESSAGE_LIMIT && !receiverAllowsFreeChat && rate > 0;
}

export function beanCredit(coinsCharged: number, payoutRatio = 0.8) {
  return Math.round(coinsCharged * payoutRatio * 100) / 100;
}

export function billedCallMinutes(durationSeconds: number) {
  if (durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 60);
}
