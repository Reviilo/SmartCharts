export class TickHistoryFormatter {
    static getUTCDate(epoch) {
        const UTCdate = new Date(epoch * 1000).toISOString();
        return UTCdate.substring(0, 19);
    }

    static formatHistory(response) {
        const { history, candles } = response;
        if (history) {
            const { times, prices } = history;
            const quotes = prices.map((p, idx) => ({
                Date: this.getUTCDate(+times[idx]),
                Close: +p,
            }));
            return quotes;
        } else if (candles) {
            const quotes = candles.map(c => ({
                Date: this.getUTCDate(+c.epoch),
                Open: +c.open,
                High: +c.high,
                Low: +c.low,
                Close: +c.close,
            }));
            return quotes;
        }
    }

    static formatTick(response) {
        const { tick, ohlc } = response;
        if (tick) {
            return {
                Date: this.getUTCDate(+tick.epoch),
                Close: +tick.quote,
            };
        } else if (ohlc) {
            return {
                Date: this.getUTCDate(+ohlc.open_time),
                Open: +ohlc.open,
                High: +ohlc.high,
                Low: +ohlc.low,
                Close: +ohlc.close,
            };
        }
    }
}
