import { observable, action, computed } from 'mobx';

export default class LastDigitsStore {
    constructor(mainStore) {
        this.mainStore = mainStore;
    }

    get context() { return this.mainStore.chart.context; }
    get stx() { return this.context.stx; }

    count = 1000;
    minHeight = 40;
    maxHeight = 100;
    gradiantLine = this.maxHeight / 2;
    digits = [];
    latestData = [];
    @observable bars = [];

    get api() {
        return this.mainStore.chart.api;
    }

    @computed get decimalPlaces() {
        return this.mainStore.chart.currentActiveSymbol.decimal_places;
    }

    @computed get isVisible() {
        return this.mainStore.state.showLastDigitStats;
    }

    @computed get marketDisplayName() {
        return this.mainStore.chart.currentActiveSymbol ? this.mainStore.chart.currentActiveSymbol.name : '';
    }

    @action.bound async showLastDigitStats() {
        this.digits = [];
        this.bars = [];
        this.latestData = [];
        this.mainStore.chart.feed.offMasterDataUpdate(this.onMasterDataUpdate);

        if (this.mainStore.state.showLastDigitStats) {
            for (let i = 0; i < 10; i++) {
                this.digits.push(0);
                this.bars.push({ height:0, cName:'' });
            }

            if (this.stx.masterData && this.stx.masterData.length >= this.count) {
                this.latestData  = this.stx.masterData.slice(-this.count).map(x => x.Close.toString());
            } else {
                const tickHistory = await this.api.getTickHistory({ symbol :this.mainStore.chart.currentActiveSymbol.symbol, count:this.count });
                this.latestData = tickHistory && tickHistory.history ? tickHistory.history.prices : [];
            }

            this.latestData.forEach((price) => {
                const lastDigit = price.slice(-1);
                this.digits[lastDigit]++;
            });
            this.updateBars();
            this.mainStore.chart.feed.onMasterDataUpdate(this.onMasterDataUpdate);
        }
    }

    @action.bound onMasterDataUpdate({ Close }) {
        const firstDigit = this.latestData.shift().slice(-1);
        const price =  Close.toFixed(this.decimalPlaces);
        const lastDigit = price.slice(-1);
        this.latestData.push(price);
        this.digits[lastDigit]++;
        this.digits[firstDigit]--;
        this.updateBars();
    }

    @action.bound updateBars() {
        const min = Math.min(...this.digits);
        const max = Math.max(...this.digits);
        this.digits.forEach((digit, idx) => {
            this.bars[idx].height = Math.round(((this.maxHeight - this.minHeight) * (digit - min) / (max - min)) + this.minHeight);
            this.bars[idx].gradiantLine = this.bars[idx].height > this.gradiantLine ? ((this.bars[idx].height * this.gradiantLine) / this.maxHeight) : 0;
            if (digit === min) this.bars[idx].cName = 'min';
            else if (digit === max) this.bars[idx].cName = 'max';
            else this.bars[idx].cName = '';
        });
        this.bars = this.bars.slice(0); // force array update
    }
}
